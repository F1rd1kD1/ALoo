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

// --- STATE ---
let user = null;
let currentChatID = null;
let partnerUser = null;
let isReg = false;
let mediaRecorder, audioChunks = [];
let typingTimeout;

// Для контекстных действий
let selectedMsgID = null;
let selectedMsgData = null;
let replyToID = null;

// --- INIT ---
window.onload = function() {
    const saved = localStorage.getItem('pro_messenger_user');
    if (saved) {
        user = JSON.parse(saved);
        initApp();
    }
    
    // Listeners
    document.getElementById('msg-input').onkeydown = (e) => {
        if(e.key === 'Enter') sendMsg();
        handleTyping();
    };
    
    document.getElementById('search-inp').onchange = searchGlobal;
    document.getElementById('media-input').onchange = handleFile;
    document.getElementById('ava-upload').onchange = handleAva;
    
    const mic = document.getElementById('mic-btn');
    mic.onmousedown = startRec; mic.onmouseup = stopRec;
    mic.ontouchstart = startRec; mic.ontouchend = stopRec;

    // Скрытие контекстного меню
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
    const ph = document.getElementById('auth-phone').value;
    const ps = document.getElementById('auth-pass').value;
    if(!ph || !ps) return;

    if (isReg) {
        const nick = document.getElementById('reg-username').value.toLowerCase().replace('@','');
        const name = document.getElementById('reg-name').value;
        const check = await db.ref('usernames/'+nick).once('value');
        if(check.exists()) return alert('Ник занят!');

        user = { phone: ph, pass: ps, username: '@'+nick, firstName: name, avatar: 'https://cdn-icons-png.flaticon.com/512/149/149071.png', bio: '' };
        await db.ref('users/'+ph).set(user);
        await db.ref('usernames/'+nick).set(ph);
    } else {
        const s = await db.ref('users/'+ph).once('value');
        if(!s.exists() || s.val().pass !== ps) return alert('Ошибка!');
        user = s.val();
    }
    localStorage.setItem('pro_messenger_user', JSON.stringify(user));
    initApp();
}

function logout() { localStorage.clear(); location.reload(); }

// --- APP START ---
function initApp() {
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('my-name-display').innerText = user.firstName;
    document.getElementById('my-ava').src = user.avatar;
    
    // Tracking Online
    const statusRef = db.ref('status/' + user.phone);
    statusRef.onDisconnect().set(Date.now());
    statusRef.set('online');
    setInterval(() => statusRef.set('online'), 10000);
    
    loadContacts();
}

// --- CONTACTS ---
function loadContacts() {
    db.ref('users/'+user.phone+'/contacts').on('value', snap => {
        const list = document.getElementById('contacts-list');
        list.innerHTML = '';
        snap.forEach(c => {
            const pid = c.key;
            db.ref('users/'+pid).once('value', s => {
                const u = s.val();
                if(!u) return;
                const div = document.createElement('div');
                div.className = 'contact-item';
                div.innerHTML = `<img src="${u.avatar}" class="avatar"><div><b>${u.firstName}</b><div style="font-size:12px;opacity:0.6;">${u.username}</div></div>`;
                div.onclick = () => openChat(u);
                list.appendChild(div);
            });
        });
    });
}

async function searchGlobal() {
    const val = document.getElementById('search-inp').value.toLowerCase().replace('@','');
    const s = await db.ref('usernames/'+val).once('value');
    if(s.exists() && s.val() !== user.phone) {
        await db.ref('users/'+user.phone+'/contacts/'+s.val()).set(true);
        alert('Контакт добавлен!');
        document.getElementById('search-inp').value = '';
    } else alert('Не найдено');
}

// --- CHAT LOGIC ---
function openChat(partner) {
    partnerUser = partner;
    currentChatID = user.phone < partner.phone ? `${user.phone}_${partner.phone}` : `${partner.phone}_${user.phone}`;
    
    document.getElementById('partner-name').innerText = partner.firstName;
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
    currentChatID = null;
}

// --- MESSAGES & DATES & STATUSES ---
let lastRenderedDate = null;

function loadMessages() {
    const list = document.getElementById('messages');
    list.innerHTML = '';
    lastRenderedDate = null;
    
    db.ref('chats/'+currentChatID).off();
    
    // Child Added
    db.ref('chats/'+currentChatID).on('child_added', snap => {
        const msg = snap.val();
        renderMessage(snap.key, msg);
        // Mark as read if not mine
        if(msg.from !== user.phone && msg.status !== 'read') {
            db.ref('chats/'+currentChatID+'/'+snap.key).update({status: 'read'});
        }
    });

    // Child Changed (Status updates, Reactions, Deletions)
    db.ref('chats/'+currentChatID).on('child_changed', snap => {
        const id = snap.key;
        const data = snap.val();
        
        // Перерисовка для обновления галочек или реакций
        const el = document.getElementById('msg-'+id);
        if(el) el.remove(); // Удаляем старый DOM, рендерим заново (простой путь)
        // Для точного сохранения позиции даты, лучше бы обновлять in-place, но для надежности перерендерим
        // В рамках "полного кода" без фреймворков это допустимо, но лучше обновить конкретные поля.
        // Здесь мы упростим: заменим контент, но структура сложная. 
        // Просто обновим галочки и реакции динамически.
        
        updateMessageStatusUI(id, data);
        updateReactionsUI(id, data);
    });
    
    // Child Removed
    db.ref('chats/'+currentChatID).on('child_removed', snap => {
        const el = document.getElementById('msg-'+snap.key);
        if(el) el.remove();
    });
}

function renderMessage(key, data) {
    if (data.hiddenFor && data.hiddenFor[user.phone]) return; // Скрыто "у меня"

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
    
    // Контекстное меню по ПКМ
    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e, key, data);
    };

    // REPLY CONTEXT
    let replyHtml = '';
    if(data.replyTo) {
        // Мы не ищем исходный текст в базе для простоты, предполагаем, что он сохранен в snapshot
        // или просто пишем "Ответ на сообщение". Чтобы было красиво, надо сохранять replyText в объекте сообщения
        const rName = data.replyName || 'Сообщение';
        const rText = data.replyText || '...';
        replyHtml = `<div class="reply-context" onclick="scrollToMsg('${data.replyTo}')">
            <div class="reply-name">${rName}</div>
            <div style="opacity:0.7; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${rText}</div>
        </div>`;
    }

    // CONTENT
    let content = '';
    if(data.type === 'text') content = data.content;
    else if(data.type === 'image') content = `<img src="${data.content}" class="msg-image" onclick="window.open(this.src)">`;
    else if(data.type === 'audio') content = `<div class="audio-player"><button onclick="new Audio('${data.content}').play()" class="icon-btn" style="font-size:14px;">▶</button> Голосовое</div>`;

    // META (Time + Status)
    const time = new Date(data.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    let statusIcon = '';
    if(isMe) {
        if(data.status === 'sent') statusIcon = '✔';
        else if(data.status === 'read') statusIcon = '<span class="tick-read">✔✔</span>';
        else statusIcon = '✔✔'; // delivered
    }

    // REACTIONS
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
    if(el && data.reactions) {
        let rStr = '';
        for(let uid in data.reactions) rStr += data.reactions[uid];
        el.innerHTML = `<div class="reactions-row"><div class="reaction-bubble">${rStr}</div></div>`;
    } else if(el) {
        el.innerHTML = '';
    }
}

// --- SENDING ---
async function sendMsg(type='text', content=null) {
    const inp = document.getElementById('msg-input');
    const txt = content || inp.value.trim();
    if(!txt && !content) return;
    
    const msg = {
        from: user.phone,
        type: type,
        content: txt,
        ts: Date.now(),
        status: 'sent', // sent -> delivered -> read
    };

    if(replyToID) {
        msg.replyTo = replyToID;
        msg.replyName = document.getElementById('reply-text-preview').getAttribute('data-name');
        msg.replyText = document.getElementById('reply-text-preview').innerText;
        cancelReply();
    }

    const ref = await db.ref('chats/'+currentChatID).push(msg);
    if(type === 'text') inp.value = '';
    
    // Simulate Delivery (через 1 сек, если нет бэкенда)
    setTimeout(() => {
        db.ref('chats/'+currentChatID+'/'+ref.key).update({status: 'delivered'});
    }, 1500);
}

// --- CONTEXT ACTIONS ---
function showContextMenu(e, key, data) {
    selectedMsgID = key;
    selectedMsgData = data;
    const menu = document.getElementById('ctx-menu');
    
    // Позиционирование
    const rect = document.getElementById('msg-'+key).getBoundingClientRect();
    menu.style.display = 'block';
    menu.style.top = rect.top + 'px';
    // Если сообщение справа, меню левее
    if (data.from === user.phone) menu.style.left = (rect.left - 180) + 'px';
    else menu.style.left = (rect.right + 10) + 'px';
}

// 1. Reply
function replyMsg() {
    replyToID = selectedMsgID;
    const txt = selectedMsgData.type === 'text' ? selectedMsgData.content : '[Медиа]';
    document.getElementById('reply-bar').style.display = 'flex';
    const prev = document.getElementById('reply-text-preview');
    prev.innerText = txt;
    // Определяем имя
    const isMe = selectedMsgData.from === user.phone;
    prev.setAttribute('data-name', isMe ? user.firstName : partnerUser.firstName);
    
    document.getElementById('ctx-menu').style.display = 'none';
    document.getElementById('msg-input').focus();
}
function cancelReply() {
    replyToID = null;
    document.getElementById('reply-bar').style.display = 'none';
}

// 2. Reactions
function addReaction(emoji) {
    if(!selectedMsgID) return;
    db.ref('chats/'+currentChatID+'/'+selectedMsgID+'/reactions/'+user.phone).set(emoji);
    document.getElementById('ctx-menu').style.display = 'none';
}

// 3. Pin
function pinMsg() {
    if(!selectedMsgID) return;
    const txt = selectedMsgData.type === 'text' ? selectedMsgData.content : '[Медиа]';
    db.ref('chats/'+currentChatID+'_meta/pinned').set({
        id: selectedMsgID,
        text: txt
    });
    document.getElementById('ctx-menu').style.display = 'none';
}
function checkPinned() {
    db.ref('chats/'+currentChatID+'_meta/pinned').on('value', snap => {
        const pin = snap.val();
        const bar = document.getElementById('pinned-msg-bar');
        if(pin) {
            bar.style.display = 'flex';
            document.getElementById('pinned-text').innerText = pin.text;
            bar.onclick = () => scrollToMsg(pin.id);
        } else {
            bar.style.display = 'none';
        }
    });
}
function unpinMsg() {
    db.ref('chats/'+currentChatID+'_meta/pinned').remove();
}
function scrollToMsg(id) {
    const el = document.getElementById('msg-'+id);
    if(el) el.scrollIntoView({behavior: 'smooth', block: 'center'});
}

// 4. Copy
function copyMsg() {
    if(selectedMsgData.type === 'text') {
        navigator.clipboard.writeText(selectedMsgData.content);
        alert('Скопировано!');
    }
    document.getElementById('ctx-menu').style.display = 'none';
}

// 5. Delete
function deleteMsg(everyone) {
    if(everyone) {
        // Удалить у всех (реальное удаление узла)
        if(selectedMsgData.from !== user.phone) return alert('Можно удалять только свои сообщения у всех!');
        db.ref('chats/'+currentChatID+'/'+selectedMsgID).remove();
    } else {
        // Удалить у меня (флаг скрытия)
        db.ref('chats/'+currentChatID+'/'+selectedMsgID+'/hiddenFor/'+user.phone).set(true);
        const el = document.getElementById('msg-'+selectedMsgID);
        if(el) el.remove();
    }
    document.getElementById('ctx-menu').style.display = 'none';
}

// 6. Forward
function forwardMsgInit() {
    document.getElementById('ctx-menu').style.display = 'none';
    document.getElementById('forward-modal').style.display = 'flex';
    
    // Load contacts into modal
    db.ref('users/'+user.phone+'/contacts').once('value', snap => {
        const list = document.getElementById('forward-list');
        list.innerHTML = '';
        snap.forEach(c => {
            const pid = c.key;
            db.ref('users/'+pid).once('value', s => {
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
    // Determine target Chat ID
    const targetChatID = user.phone < targetUser.phone ? `${user.phone}_${targetUser.phone}` : `${targetUser.phone}_${user.phone}`;
    
    const newMsg = {
        from: user.phone,
        type: selectedMsgData.type,
        content: selectedMsgData.content,
        ts: Date.now(),
        status: 'sent',
        isForwarded: true
    };
    
    await db.ref('chats/'+targetChatID).push(newMsg);
    document.getElementById('forward-modal').style.display = 'none';
    alert('Переслано!');
}


// --- TYPING & STATUS ---
function trackStatus() {
    db.ref('status/'+partnerUser.phone).on('value', snap => {
        const val = snap.val();
        const el = document.getElementById('partner-status');
        const st = document.getElementById('partner-status');
        
        if(val === 'online') {
            st.innerText = 'в сети';
            st.style.color = 'var(--status-online)';
        } else {
            st.style.color = 'var(--status-offline)';
            const d = new Date(val);
            const now = new Date();
            let str = (now - d < 86400000) ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : d.toLocaleDateString();
            st.innerText = 'был(а) ' + str;
        }
    });
}

function handleTyping() {
    db.ref('typing/'+currentChatID+'/'+user.phone).set(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => db.ref('typing/'+currentChatID+'/'+user.phone).remove(), 2000);
}

function trackTyping() {
    db.ref('typing/'+currentChatID+'/'+partnerUser.phone).on('value', snap => {
        if(snap.val()) {
            document.getElementById('partner-status').innerText = 'печатает...';
            document.getElementById('partner-status').style.color = 'var(--status-online)';
        }
    });
}

// --- PROFILE & MEDIA UTIL ---
function handleFile(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = (v) => resize(v.target.result, (res) => sendMsg('image', res));
    r.readAsDataURL(f);
}
function handleAva(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = (v) => resize(v.target.result, (res) => document.getElementById('edit-ava-preview').src = res);
    r.readAsDataURL(f);
}
function resize(url, cb) {
    const i = new Image();
    i.onload = () => {
        const c = document.createElement('canvas');
        const max = 800;
        let w=i.width, h=i.height;
        if(w>h){if(w>max){h*=max/w;w=max}}else{if(h>max){w*=max/h;h=max}}
        c.width=w; c.height=h;
        c.getContext('2d').drawImage(i,0,0,w,h);
        cb(c.toDataURL('image/jpeg',0.7));
    };
    i.src=url;
}
async function saveProfile() {
    const up = {
        firstName: document.getElementById('edit-name').value,
        lastName: document.getElementById('edit-lastname').value,
        bio: document.getElementById('edit-bio').value,
        birthdate: document.getElementById('edit-birth').value,
        avatar: document.getElementById('edit-ava-preview').src,
        username: '@'+document.getElementById('edit-username').value.replace('@','')
    };
    await db.ref('users/'+user.phone).update(up);
    Object.assign(user, up);
    localStorage.setItem('pro_messenger_user', JSON.stringify(user));
    document.getElementById('my-name-display').innerText = user.firstName;
    document.getElementById('my-ava').src = user.avatar;
    document.getElementById('profile-modal').style.display='none';
}

function startRec() {
    navigator.mediaDevices.getUserMedia({audio:true}).then(s => {
        mediaRecorder = new MediaRecorder(s);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.start();
        document.getElementById('mic-btn').classList.add('recording');
    });
}
function stopRec() {
    if(mediaRecorder) {
        mediaRecorder.stop();
        document.getElementById('mic-btn').classList.remove('recording');
        mediaRecorder.onstop = () => {
            const r = new FileReader();
            r.onload = e => sendMsg('audio', e.target.result);
            r.readAsDataURL(new Blob(audioChunks));
        }
    }
}
