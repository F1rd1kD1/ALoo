// --- CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyAmKHf1fbcmXrCTKcZ_b-1EVv7JsN6y9C0",
    authDomain: "aloo-9633b.firebaseapp.com",
    databaseURL: "https://aloo-9633b-default-rtdb.firebaseio.com",
    projectId: "aloo-9633b",
    storageBucket: "aloo-9633b.firebasestorage.app",
    messagingSenderId: "865795470742",
    appId: "1:865795470742:web:69cb9fe49a3fb69ce6999b7"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- ВЕРСИЯ ДАННЫХ (СБРОС) ---
// Меняем пути на v2, чтобы "удалить" старые данные для пользователей этого кода
const DB_USERS = 'users_v2';
const DB_CHATS = 'chats_v2';
const DB_USERNAMES = 'usernames_v2';
const DB_STATUS = 'status_v2';
const DB_TYPING = 'typing_v2';

// --- STATE ---
let user = null;
let currentChatID = null;
let partnerUser = null;
let isReg = false;
let mediaRecorder, audioChunks = [];
let typingTimeout;
let lastRenderedDate = null;
let contactsListener = null;

// Context Action States
let selectedMsgID = null;
let selectedMsgData = null;
let replyToID = null;

// --- INIT ---
window.onload = function() {
    const saved = localStorage.getItem('pro_messenger_user_v2'); // New local storage key
    if (saved) {
        try {
            user = JSON.parse(saved);
            initApp();
        } catch(e) {
            localStorage.removeItem('pro_messenger_user_v2');
        }
    }
    
    // Listeners
    document.getElementById('msg-input').onkeydown = (e) => {
        if(e.key === 'Enter') sendMsg();
        handleTyping();
    };
    
    document.getElementById('search-inp').onchange = searchGlobal;
    document.getElementById('media-input').onchange = handleImage;
    document.getElementById('video-input').onchange = handleVideo;
    document.getElementById('ava-upload').onchange = handleAva;
    
    // Mic listeners
    const mic = document.getElementById('mic-btn');
    // Mouse
    mic.onmousedown = startRec; 
    mic.onmouseup = stopRec;
    mic.onmouseleave = stopRec; // Stop if mouse leaves button
    // Touch
    mic.ontouchstart = (e) => { e.preventDefault(); startRec(); };
    mic.ontouchend = (e) => { e.preventDefault(); stopRec(); };

    // Close menus on click outside
    document.onclick = (e) => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.message')) {
            document.getElementById('ctx-menu').style.display = 'none';
        }
    };
};

// --- AUTH ---
function toggleAuth() {
    isReg = !isReg;
    document.getElementById('reg-fields').style.display = isReg ? 'block' : 'none';
    document.getElementById('auth-btn').innerText = isReg ? 'РЕГИСТРАЦИЯ' : 'ВОЙТИ';
    document.getElementById('auth-toggle').innerText = isReg ? 'Войти' : 'Создать аккаунт';
}

async function handleAuth() {
    const ph = document.getElementById('auth-phone').value.trim();
    const ps = document.getElementById('auth-pass').value.trim();
    if(!ph || !ps) return alert("Введите телефон и пароль");

    if (isReg) {
        // REGISTRATION
        const nickRaw = document.getElementById('reg-username').value.trim();
        const name = document.getElementById('reg-name').value.trim();
        
        if (!nickRaw || !name) return alert("Заполните все поля");
        
        const nick = nickRaw.toLowerCase().replace('@','');
        
        // Check uniqueness
        const check = await db.ref(DB_USERNAMES+'/'+nick).once('value');
        if(check.exists()) return alert('Этот Username уже занят!');

        const newUser = { 
            phone: ph, 
            pass: ps, 
            username: '@'+nick, 
            firstName: name, 
            lastName: '',
            avatar: 'https://cdn-icons-png.flaticon.com/512/149/149071.png', 
            bio: '',
            birthdate: ''
        };

        await db.ref(DB_USERS+'/'+ph).set(newUser);
        await db.ref(DB_USERNAMES+'/'+nick).set(ph);
        
        user = newUser;
    } else {
        // LOGIN
        const s = await db.ref(DB_USERS+'/'+ph).once('value');
        if(!s.exists()) return alert('Аккаунт не найден. Зарегистрируйтесь.');
        
        const data = s.val();
        if(data.pass !== ps) return alert('Неверный пароль!');
        user = data;
    }
    
    localStorage.setItem('pro_messenger_user_v2', JSON.stringify(user));
    initApp();
}

function logout() {
    if(confirm("Выйти из аккаунта?")) {
        localStorage.removeItem('pro_messenger_user_v2');
        location.reload();
    }
}

// --- APP START ---
function initApp() {
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    updateMyUI();
    
    // Online tracking
    const statusRef = db.ref(DB_STATUS+'/' + user.phone);
    statusRef.onDisconnect().set(Date.now());
    statusRef.set('online');
    setInterval(() => statusRef.set('online'), 10000); // Heartbeat
    
    loadContacts();
}

function updateMyUI() {
    document.getElementById('my-name-display').innerText = user.firstName + (user.lastName ? ' ' + user.lastName : '');
    document.getElementById('my-ava').src = user.avatar;
}

// --- PROFILE ---
function openProfile() {
    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('edit-username').value = user.username || '';
    document.getElementById('edit-name').value = user.firstName || '';
    document.getElementById('edit-lastname').value = user.lastName || '';
    document.getElementById('edit-birth').value = user.birthdate || '';
    document.getElementById('edit-bio').value = user.bio || '';
    document.getElementById('edit-ava-preview').src = user.avatar;
}

async function saveProfile() {
    const newNick = document.getElementById('edit-username').value.trim().toLowerCase().replace('@','');
    const newName = document.getElementById('edit-name').value.trim();
    const newAva = document.getElementById('edit-ava-preview').src;

    if(!newNick || !newName) return alert("Имя и Username обязательны!");

    // Username change check
    const oldNick = user.username.replace('@','');
    if (newNick !== oldNick) {
        const check = await db.ref(DB_USERNAMES+'/'+newNick).once('value');
        if(check.exists()) return alert("Username занят!");
        await db.ref(DB_USERNAMES+'/'+oldNick).remove();
        await db.ref(DB_USERNAMES+'/'+newNick).set(user.phone);
    }

    const updates = {
        username: '@'+newNick,
        firstName: newName,
        lastName: document.getElementById('edit-lastname').value.trim(),
        birthdate: document.getElementById('edit-birth').value,
        bio: document.getElementById('edit-bio').value,
        avatar: newAva
    };

    await db.ref(DB_USERS+'/'+user.phone).update(updates);
    
    Object.assign(user, updates);
    localStorage.setItem('pro_messenger_user_v2', JSON.stringify(user));
    
    updateMyUI();
    document.getElementById('profile-modal').style.display = 'none';
    alert("Профиль обновлен!");
}

// --- CONTACTS & SYNC ---
function loadContacts() {
    // Listen for my contact list changes
    db.ref(DB_USERS+'/'+user.phone+'/contacts').on('value', snap => {
        const list = document.getElementById('contacts-list');
        list.innerHTML = '';
        
        // For each contact ID
        snap.forEach(c => {
            const pid = c.key;
            // Listen to EACH contact's profile changes in real-time
            // We use 'on' instead of 'once' so if they change photo, we see it
            db.ref(DB_USERS+'/'+pid).on('value', s => {
                const u = s.val();
                if(!u) return;
                
                // Check if element exists to update or create
                let el = document.getElementById('contact-'+pid);
                if(!el) {
                    el = document.createElement('div');
                    el.id = 'contact-'+pid;
                    el.className = 'contact-item';
                    el.onclick = () => openChat(u);
                    list.appendChild(el);
                }
                
                el.innerHTML = `
                    <img src="${u.avatar}" class="avatar">
                    <div>
                        <b>${u.firstName} ${u.lastName||''}</b>
                        <div style="font-size:12px;opacity:0.6;">${u.username}</div>
                    </div>
                `;
                
                // If we are currently chatting with this person, update header
                if (partnerUser && partnerUser.phone === u.phone) {
                    partnerUser = u; // Update local obj
                    document.getElementById('partner-name').innerText = u.firstName + (u.lastName ? ' '+u.lastName : '');
                    document.getElementById('partner-ava').src = u.avatar;
                }
            });
        });
    });
}

async function searchGlobal() {
    const val = document.getElementById('search-inp').value.toLowerCase().replace('@','');
    if(!val) return;

    const s = await db.ref(DB_USERNAMES+'/'+val).once('value');
    if(s.exists()) {
        const pid = s.val();
        if(pid === user.phone) return alert("Это ваш профиль!");
        
        // Add to my contacts locally
        await db.ref(DB_USERS+'/'+user.phone+'/contacts/'+pid).set(true);
        const uSnap = await db.ref(DB_USERS+'/'+pid).once('value');
        openChat(uSnap.val());
        document.getElementById('search-inp').value = '';
    } else alert('Пользователь не найден');
}

// --- CHAT ---
function openChat(partner) {
    if (!partner) return;
    partnerUser = partner;
    currentChatID = user.phone < partner.phone ? `${user.phone}_${partner.phone}` : `${partner.phone}_${user.phone}`;
    
    document.getElementById('partner-name').innerText = partner.firstName + (partner.lastName ? ' ' + partner.lastName : '');
    document.getElementById('partner-ava').src = partner.avatar;
    
    document.getElementById('chat-placeholder').style.display = 'none';
    document.getElementById('chat-interface').style.display = 'flex';
    document.body.classList.add('chat-active');
    
    loadMessages();
    trackStatus();
    trackTyping();
    checkPinned();
}

function closeChat() {
    document.body.classList.remove('chat-active');
    document.getElementById('chat-interface').style.display = 'none';
    document.getElementById('chat-placeholder').style.display = 'block';
    
    if (currentChatID) db.ref(DB_CHATS+'/'+currentChatID).off();
    currentChatID = null;
}

// --- MESSAGES CORE ---
function loadMessages() {
    const list = document.getElementById('messages');
    list.innerHTML = ''; 
    lastRenderedDate = null;
    
    db.ref(DB_CHATS+'/'+currentChatID).off();
    
    db.ref(DB_CHATS+'/'+currentChatID).on('child_added', snap => {
        const msg = snap.val();
        renderMessage(snap.key, msg);
        if(msg.from !== user.phone && msg.status !== 'read') {
            db.ref(DB_CHATS+'/'+currentChatID+'/'+snap.key).update({status: 'read'});
        }
    });

    db.ref(DB_CHATS+'/'+currentChatID).on('child_changed', snap => {
        const id = snap.key;
        const data = snap.val();
        updateMessageStatusUI(id, data);
        updateReactionsUI(id, data);
        if (data.hiddenFor && data.hiddenFor[user.phone]) {
            const el = document.getElementById('msg-'+id);
            if(el) el.remove();
        }
    });
    
    db.ref(DB_CHATS+'/'+currentChatID).on('child_removed', snap => {
        const el = document.getElementById('msg-'+snap.key);
        if(el) el.remove();
    });
}

function renderMessage(key, data) {
    if (data.hiddenFor && data.hiddenFor[user.phone]) return;

    const list = document.getElementById('messages');
    
    // DATE DIVIDER
    const dateStr = new Date(data.ts).toLocaleDateString();
    if (dateStr !== lastRenderedDate) {
        const div = document.createElement('div');
        div.className = 'date-divider';
        const today = new Date().toLocaleDateString();
        div.innerText = dateStr === today ? 'Сегодня' : dateStr;
        list.appendChild(div);
        lastRenderedDate = dateStr;
    }

    const isMe = data.from === user.phone;
    const div = document.createElement('div');
    div.id = 'msg-'+key;
    div.className = `message ${isMe ? 'my-message' : 'their-message'}`;
    
    // Interactions
    div.oncontextmenu = (e) => { e.preventDefault(); showContextMenu(e, key, data); };
    let pressTimer;
    div.ontouchstart = (e) => { pressTimer = setTimeout(() => showContextMenu(e.touches[0], key, data), 600); }
    div.ontouchend = () => clearTimeout(pressTimer);

    // REPLY
    let replyHtml = '';
    if(data.replyTo) {
        replyHtml = `<div class="reply-context" onclick="scrollToMsg('${data.replyTo}')">
            <div class="reply-name">${data.replyName || 'Сообщение'}</div>
            <div style="opacity:0.7; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${data.replyText||'...'}</div>
        </div>`;
    }

    // CONTENT SWITCH
    let content = '';
    if(data.type === 'text') {
        content = data.content;
    } else if(data.type === 'image') {
        content = `<img src="${data.content}" class="msg-image" onclick="window.open(this.src)">`;
    } else if(data.type === 'video') {
        content = `<video src="${data.content}" controls class="msg-video"></video>`;
    } else if(data.type === 'audio') {
        // Simple Audio Player
        content = `<div class="audio-player">
            <button class="audio-btn" onclick="playAudio(this, '${data.content}')">▶</button>
            <span style="font-size:12px; margin-left:5px;">Голосовое</span>
        </div>`;
    }

    // STATUS
    const time = new Date(data.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    let statusIcon = '';
    if(isMe) {
        if(data.status === 'sent') statusIcon = '✔';
        else if(data.status === 'read') statusIcon = '<span class="tick-read">✔✔</span>';
        else statusIcon = '✔✔';
    }

    // REACTION
    let reactHtml = '';
    if(data.reactions) {
        let rStr = '';
        for(let uid in data.reactions) rStr += data.reactions[uid];
        if(rStr) reactHtml = `<div class="reactions-row"><div class="reaction-bubble">${rStr}</div></div>`;
    }

    div.innerHTML = `
        ${replyHtml}
        <div>${content}</div>
        <div class="msg-info">${time} <span id="status-${key}" class="msg-ticks">${statusIcon}</span></div>
        <div id="react-${key}">${reactHtml}</div>
    `;

    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

function playAudio(btn, src) {
    const a = new Audio(src);
    a.play();
    btn.innerText = '⏸';
    a.onended = () => btn.innerText = '▶';
}

function updateMessageStatusUI(key, data) {
    const el = document.getElementById('status-'+key);
    if(el && data.from === user.phone) {
        if(data.status === 'read') el.innerHTML = '<span class="tick-read">✔✔</span>';
        else if(data.status === 'delivered') el.innerHTML = '✔✔';
        else el.innerHTML = '✔';
    }
}
function updateReactionsUI(key, data) {
    const el = document.getElementById('react-'+key);
    if(el) {
        let rStr = '';
        if (data.reactions) for(let uid in data.reactions) rStr += data.reactions[uid];
        el.innerHTML = rStr ? `<div class="reactions-row"><div class="reaction-bubble">${rStr}</div></div>` : '';
    }
}

// --- SENDING LOGIC ---
async function sendMsg(type='text', content=null) {
    const inp = document.getElementById('msg-input');
    const txt = content || inp.value.trim();
    if(!txt && !content) return;
    
    const msg = {
        from: user.phone,
        type: type,
        content: txt,
        ts: Date.now(),
        status: 'sent'
    };

    if(replyToID) {
        msg.replyTo = replyToID;
        msg.replyName = document.getElementById('reply-text-preview').getAttribute('data-name');
        msg.replyText = document.getElementById('reply-text-preview').innerText;
        cancelReply();
    }

    const ref = await db.ref(DB_CHATS+'/'+currentChatID).push(msg);
    if(type === 'text') inp.value = '';

    // --- АВТОМАТИЧЕСКИЙ ЧАТ (Fix for "Show chat for both") ---
    // Force update contact lists for both users so chat appears immediately
    db.ref(DB_USERS+'/'+partnerUser.phone+'/contacts/'+user.phone).set(true);
    db.ref(DB_USERS+'/'+user.phone+'/contacts/'+partnerUser.phone).set(true);
    
    setTimeout(() => {
        db.ref(DB_CHATS+'/'+currentChatID+'/'+ref.key).update({status: 'delivered'});
    }, 1000);
}

// --- MEDIA HANDLERS ---
function handleImage(e) {
    const f = e.target.files[0];
    if(!f) return;
    // Compress Image
    const r = new FileReader();
    r.onload = (v) => {
        const i = new Image();
        i.onload = () => {
            const c = document.createElement('canvas');
            const max = 900;
            let w=i.width, h=i.height;
            if(w>h){if(w>max){h*=max/w;w=max}}else{if(h>max){w*=max/h;h=max}}
            c.width=w; c.height=h;
            c.getContext('2d').drawImage(i,0,0,w,h);
            sendMsg('image', c.toDataURL('image/jpeg', 0.8));
        };
        i.src = v.target.result;
    };
    r.readAsDataURL(f);
}

function handleVideo(e) {
    const f = e.target.files[0];
    if(!f) return;
    // Limit check: 5MB
    if(f.size > 5 * 1024 * 1024) return alert("Видео слишком большое! Максимум 5 МБ.");
    
    const r = new FileReader();
    r.onload = (v) => {
        sendMsg('video', v.target.result);
    };
    r.readAsDataURL(f);
}

function handleAva(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = (v) => {
        const i = new Image();
        i.onload = () => {
            const c = document.createElement('canvas');
            c.width=200; c.height=200; // Avatar standard size
            c.getContext('2d').drawImage(i,0,0,200,200);
            document.getElementById('edit-ava-preview').src = c.toDataURL('image/jpeg',0.8);
        };
        i.src = v.target.result;
    };
    r.readAsDataURL(f);
}

// --- VOICE RECORDING FIX ---
function startRec() {
    if (!navigator.mediaDevices) return alert("Микрофон недоступен");
    navigator.mediaDevices.getUserMedia({audio:true}).then(s => {
        mediaRecorder = new MediaRecorder(s);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.start();
        document.getElementById('mic-btn').classList.add('recording');
    }).catch(e => alert("Ошибка микрофона: " + e));
}

function stopRec() {
    if(mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('mic-btn').classList.remove('recording');
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const base64data = reader.result;
                sendMsg('audio', base64data);
            }
        }
    }
}

// --- CONTEXT ACTIONS ---
function showContextMenu(e, key, data) {
    selectedMsgID = key;
    selectedMsgData = data;
    const menu = document.getElementById('ctx-menu');
    let x = e.clientX || e.pageX;
    let y = e.clientY || e.pageY;
    
    menu.style.display = 'block';
    if (y + 250 > window.innerHeight) y -= 250;
    menu.style.top = y + 'px';
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
}

function replyMsg() {
    replyToID = selectedMsgID;
    let txt = '...';
    if(selectedMsgData.type === 'text') txt = selectedMsgData.content;
    else if(selectedMsgData.type === 'image') txt = '[Фото]';
    else if(selectedMsgData.type === 'video') txt = '[Видео]';
    else if(selectedMsgData.type === 'audio') txt = '[Голосовое]';
    
    document.getElementById('reply-bar').style.display = 'flex';
    const prev = document.getElementById('reply-text-preview');
    prev.innerText = txt;
    const isMe = selectedMsgData.from === user.phone;
    prev.setAttribute('data-name', isMe ? user.firstName : partnerUser.firstName);
    document.getElementById('ctx-menu').style.display = 'none';
    document.getElementById('msg-input').focus();
}

function cancelReply() {
    replyToID = null;
    document.getElementById('reply-bar').style.display = 'none';
}

function addReaction(emoji) {
    if(!selectedMsgID) return;
    db.ref(DB_CHATS+'/'+currentChatID+'/'+selectedMsgID+'/reactions/'+user.phone).set(emoji);
    document.getElementById('ctx-menu').style.display = 'none';
}

function pinMsg() {
    if(!selectedMsgID) return;
    let txt = '...';
    if(selectedMsgData.type === 'text') txt = selectedMsgData.content;
    else txt = '[' + selectedMsgData.type.toUpperCase() + ']';
    
    db.ref(DB_CHATS+'/'+currentChatID+'_meta/pinned').set({ id: selectedMsgID, text: txt });
    document.getElementById('ctx-menu').style.display = 'none';
}

function checkPinned() {
    db.ref(DB_CHATS+'/'+currentChatID+'_meta/pinned').on('value', snap => {
        const pin = snap.val();
        const bar = document.getElementById('pinned-msg-bar');
        if(pin) {
            bar.style.display = 'flex';
            document.getElementById('pinned-text').innerText = pin.text;
        } else {
            bar.style.display = 'none';
        }
    });
}
function unpinMsg() { db.ref(DB_CHATS+'/'+currentChatID+'_meta/pinned').remove(); }
function scrollToPinned() { 
    db.ref(DB_CHATS+'/'+currentChatID+'_meta/pinned').once('value', s => {
        if(s.exists()) scrollToMsg(s.val().id);
    });
}
function scrollToMsg(id) {
    const el = document.getElementById('msg-'+id);
    if(el) el.scrollIntoView({behavior: 'smooth', block: 'center'});
    else alert("Сообщение выше, пролистайте чат");
}

function copyMsg() {
    if(selectedMsgData.type === 'text') navigator.clipboard.writeText(selectedMsgData.content);
    document.getElementById('ctx-menu').style.display = 'none';
}

function deleteMsg(everyone) {
    if(everyone) {
        if(selectedMsgData.from !== user.phone) return alert("Можно удалить только свое сообщение у всех!");
        db.ref(DB_CHATS+'/'+currentChatID+'/'+selectedMsgID).remove();
    } else {
        db.ref(DB_CHATS+'/'+currentChatID+'/'+selectedMsgID+'/hiddenFor/'+user.phone).set(true);
        const el = document.getElementById('msg-'+selectedMsgID);
        if(el) el.remove();
    }
    document.getElementById('ctx-menu').style.display = 'none';
}

function forwardMsgInit() {
    document.getElementById('ctx-menu').style.display = 'none';
    document.getElementById('forward-modal').style.display = 'flex';
    
    db.ref(DB_USERS+'/'+user.phone+'/contacts').once('value', snap => {
        const list = document.getElementById('forward-list');
        list.innerHTML = '';
        snap.forEach(c => {
            const pid = c.key;
            db.ref(DB_USERS+'/'+pid).once('value', s => {
                const u = s.val();
                const div = document.createElement('div');
                div.className = 'contact-item';
                div.innerText = u.firstName;
                div.onclick = () => doForward(u);
                list.appendChild(div);
            });
        });
    });
}

async function doForward(targetUser) {
    const targetChatID = user.phone < targetUser.phone ? `${user.phone}_${targetUser.phone}` : `${targetUser.phone}_${user.phone}`;
    const newMsg = {
        from: user.phone,
        type: selectedMsgData.type,
        content: selectedMsgData.content,
        ts: Date.now(),
        status: 'sent',
        isForwarded: true
    };
    await db.ref(DB_CHATS+'/'+targetChatID).push(newMsg);
    // Auto-add contact on forward
    db.ref(DB_USERS+'/'+targetUser.phone+'/contacts/'+user.phone).set(true);
    db.ref(DB_USERS+'/'+user.phone+'/contacts/'+targetUser.phone).set(true);
    
    document.getElementById('forward-modal').style.display = 'none';
    alert('Переслано!');
}

// --- UTILS ---
function handleTyping() {
    db.ref(DB_TYPING+'/'+currentChatID+'/'+user.phone).set(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => db.ref(DB_TYPING+'/'+currentChatID+'/'+user.phone).remove(), 2000);
}

function trackTyping() {
    db.ref(DB_TYPING+'/'+currentChatID+'/'+partnerUser.phone).on('value', snap => {
        const st = document.getElementById('partner-status');
        if(snap.val()) {
            st.innerText = 'печатает...';
            st.style.color = 'var(--accent)';
        } else {
            db.ref(DB_STATUS+'/'+partnerUser.phone).once('value', s => updateStatusUI(s.val()));
        }
    });
}

function trackStatus() {
    db.ref(DB_STATUS+'/'+partnerUser.phone).on('value', snap => updateStatusUI(snap.val()));
}

function updateStatusUI(val) {
    const el = document.getElementById('partner-status');
    if (el.innerText === 'печатает...') return; 
    
    if(val === 'online') {
        el.innerText = 'в сети';
        el.style.color = 'var(--status-online)';
    } else {
        el.style.color = 'var(--text-secondary)';
        const d = new Date(val);
        const now = new Date();
        let str = (now - d < 86400000) ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : d.toLocaleDateString();
        el.innerText = 'был(а) ' + str;
    }
}
