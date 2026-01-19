const firebaseConfig = {
    apiKey: "AIzaSyAmKHf1fbcmXrCTKcZ_b-1EVv7JsN6y9C0",
    authDomain: "aloo-9633b.firebaseapp.com",
    databaseURL: "https://aloo-9633b-default-rtdb.firebaseio.com",
    projectId: "aloo-9633b",
    storageBucket: "aloo-9633b.firebasestorage.app",
    messagingSenderId: "865795470742",
    appId: "1:865795470742:web:69cb9fe49a3fb69ce699b7"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentUser, currentChatID, replyData = null;
let mediaRecorder, audioChunks = [];
let activeFriendData = null; // Для профиля

window.onload = function() {
    currentUser = JSON.parse(localStorage.getItem('chat_user'));
    if (currentUser) showApp();

    document.getElementById('sendCodeBtn').onclick = function() {
        const name = document.getElementById('reg-name').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const avatar = document.getElementById('chosen-img').src;
        if (name && phone) {
            currentUser = { name, phone, avatar: avatar.includes('data') ? avatar : '' };
            localStorage.setItem('chat_user', JSON.stringify(currentUser));
            // Сохраняем в облако, чтобы другие видели имя
            database.ref('users/' + phone).set(currentUser);
            showApp();
        }
    };

    document.getElementById('avatar-input').onchange = function(e) {
        const r = new FileReader();
        r.onload = ev => {
            const img = document.getElementById('chosen-img');
            img.src = ev.target.result; img.style.display = 'block';
            document.getElementById('plus-icon').style.display = 'none';
        };
        r.readAsDataURL(e.target.files[0]);
    };

    document.getElementById('messageInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendMessageAction();
    });
    document.getElementById('sendBtn').onclick = sendMessageAction;
};

async function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('my-avatar-display').src = currentUser.avatar || '';
    database.ref('status/' + currentUser.phone).set("online");
    database.ref('status/' + currentUser.phone).onDisconnect().set("offline");
    loadContacts();
}

async function loadContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = "";
    const cs = JSON.parse(localStorage.getItem('my_contacts') || "[]");
    
    for (let phone of cs) {
        // Ищем имя в Firebase
        const snap = await database.ref('users/' + phone).once('value');
        const userData = snap.val();
        
        const d = document.createElement('div');
        d.className = "contact-item";
        d.innerText = "👤 " + (userData ? userData.name : phone);
        d.onclick = () => openChat(phone);
        list.appendChild(d);
    }
}

document.getElementById('addContactBtn').onclick = function() {
    const p = document.getElementById('contactPhone').value.trim();
    if (p) {
        let cs = JSON.parse(localStorage.getItem('my_contacts') || "[]");
        if (!cs.includes(p)) cs.push(p);
        localStorage.setItem('my_contacts', JSON.stringify(cs));
        loadContacts();
        document.getElementById('contactPhone').value = "";
    }
};

async function openChat(phone) {
    const snap = await database.ref('users/' + phone).once('value');
    activeFriendData = snap.val() || { name: phone, phone: phone, avatar: '' };
    
    currentChatID = [currentUser.phone, phone].sort().join("_");
    document.getElementById('contacts-page').style.display = 'none';
    document.getElementById('chat-page').style.display = 'flex';
// Ставим имя в заголовок
    const title = document.getElementById('chatTitle');
    title.innerText = activeFriendData.name;
    title.onclick = () => {
        document.getElementById('view-name').innerText = activeFriendData.name;
        document.getElementById('view-phone').innerText = "Тел: " + activeFriendData.phone;
        document.getElementById('view-avatar').src = activeFriendData.avatar || '';
        document.getElementById('profile-modal').style.display = 'flex';
    };

    const msgDiv = document.getElementById('messages');
    database.ref('chats/' + currentChatID).off();
    database.ref('chats/' + currentChatID).on('value', snap => {
        msgDiv.innerHTML = "";
        snap.forEach(child => {
            const val = child.val();
            const isMine = val.p === currentUser.phone;
            const b = document.createElement('div');
            b.className = "msg-bubble " + (isMine ? "my-msg" : "their-msg");

            if (val.reply) {
                const r = document.createElement('div'); r.className = "reply-box";
                r.innerText = val.reply.author + ": " + val.reply.text; b.appendChild(r);
            }

            if (val.type === 'voice') {
                const a = document.createElement('audio'); a.src = val.m; a.controls = true; b.appendChild(a);
            } else if (val.type === 'img') {
                const i = document.createElement('img'); i.src = val.m; b.appendChild(i);
            } else if (val.type === 'video') {
                const v = document.createElement('video'); v.src = val.m; v.controls = true; b.appendChild(v);
            } else {
                const t = document.createElement('div'); t.innerText = val.m; b.appendChild(t);
            }

            if (val.reaction) {
                const re = document.createElement('div'); re.className = "reaction-tag";
                re.innerText = val.reaction; b.appendChild(re);
            }

            b.onclick = () => {
                replyData = { text: val.type === 'text' ? val.m.substring(0, 20) : "[" + val.type + "]", author: isMine ? "Вы" : activeFriendData.name };
                document.getElementById('reply-preview').style.display = 'block';
                document.getElementById('reply-text').innerText = "Ответ: " + replyData.text;
            };

            b.oncontextmenu = e => {
                e.preventDefault();
                const emo = prompt("Эмодзи: ❤️, 👍, 😂, 🔥");
                if (emo) database.ref('chats/' + currentChatID + '/' + child.key).update({ reaction: emo });
            };
            msgDiv.appendChild(b);
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
}

function sendMessageAction() {
    const inp = document.getElementById('messageInput');
    if (inp.value.trim()) {
        const msg = { p: currentUser.phone, m: inp.value, t: Date.now(), type: 'text' };
        if (replyData) { msg.reply = replyData; cancelReply(); }
        database.ref('chats/' + currentChatID).push(msg);
        inp.value = "";
    }
}

// Загрузка медиа
document.getElementById('img-input').onchange = e => {
    const r = new FileReader(); r.onload = ev => {
        database.ref('chats/' + currentChatID).push({ p: currentUser.phone, m: ev.target.result, t: Date.now(), type: 'img' });
    }; r.readAsDataURL(e.target.files[0]);
};
document.getElementById('video-input').onchange = e => {
    const r = new FileReader(); r.onload = ev => {
        database.ref('chats/' + currentChatID).push({ p: currentUser.phone, m: ev.target.result, t: Date.now(), type: 'video' });
    }; r.readAsDataURL(e.target.files[0]);
};

// Голосовые
document.getElementById('voiceBtn').onclick = function() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
mediaRecorder = new MediaRecorder(s);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const b = new Blob(audioChunks, { type: 'audio/webm' });
                const r = new FileReader(); r.onload = ev => {
                    database.ref('chats/' + currentChatID).push({ p: currentUser.phone, m: ev.target.result, t: Date.now(), type: 'voice' });
                }; r.readAsDataURL(b);
            };
            mediaRecorder.start();
            this.innerText = "🛑";
        });
    } else {
        mediaRecorder.stop();
        this.innerText = "🎤";
    }
};

function backToContacts() {
    document.getElementById('chat-page').style.display = 'none';
    document.getElementById('contacts-page').style.display = 'flex';
}
function cancelReply() {
    replyData = null;
    document.getElementById('reply-preview').style.display = 'none';
}
function closeProfile() { document.getElementById('profile-modal').style.display = 'none'; }
function logout() { localStorage.clear(); location.reload(); }
