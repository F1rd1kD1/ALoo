// КОНФИГУРАЦИЯ FIREBASE
var firebaseConfig = {
    apiKey: "AIzaSyAmKHf1fbcmXrCTKcZ_b-1EVv7JsN6y9C0",
    authDomain: "aloo-9633b.firebaseapp.com",
    databaseURL: "https://aloo-9633b-default-rtdb.firebaseio.com",
    projectId: "aloo-9633b",
    storageBucket: "aloo-9633b.firebasestorage.app",
    messagingSenderId: "865795470742",
    appId: "1:865795470742:web:69cb9fe49a3fb69ce6999b7"
};

firebase.initializeApp(firebaseConfig);
var database = firebase.database();

// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
var currentUser = null;
var currentChatID = null;
var isRegMode = false;
var mediaRecorder = null;
var audioChunks = [];
var selectedMsgId = null;
var isEditing = false;
var replyData = null;
var allMessages = [];

// ПРИ ЗАГРУЗКЕ
window.onload = function() {
    var saved = localStorage.getItem('chat_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        showApp();
        setUserOnline();
    }

    // Слушатели кнопок
    document.getElementById('mainAuthBtn').onclick = handleAuth;
    document.getElementById('sendBtn').onclick = sendMessage;
    document.getElementById('saveProfileBtn').onclick = saveProfile;
    document.getElementById('addContactBtn').onclick = addContact;
    document.getElementById('micBtn').onclick = toggleRecording;

    // Переключатель регистрации
    document.getElementById('toggleAuth').onclick = function() {
        isRegMode = !isRegMode;
        document.getElementById('auth-title').innerText = isRegMode ? "РЕГИСТРАЦИЯ" : "ДОСТУП";
        document.getElementById('reg-fields').style.display = isRegMode ? "block" : "none";
    };

    // Фото в чат
    document.getElementById('chat-file-input').onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            var msg = {
                p: currentUser.phone,
                m: ev.target.result,
                t: Date.now(),
                type: 'img',
                read: false
            };
            database.ref('chats/' + currentChatID).push(msg);
        };
        reader.readAsDataURL(file);
    };

    // Функции меню сообщений
    document.getElementById('btn-reply-msg').onclick = startReply;
    document.getElementById('btn-edit-msg').onclick = startEdit;
    document.getElementById('btn-burn-msg').onclick = makeBurning;
    document.getElementById('btn-delete-msg').onclick = deleteMessage;
};

// АВТОРИЗАЦИЯ
function handleAuth() {
    var ph = document.getElementById('auth-phone').value.trim();
    var ps = document.getElementById('auth-pass').value.trim();
    
    if (isRegMode) {
        var nick = document.getElementById('reg-username').value.trim().toLowerCase().replace('@','');
        if (!nick || !ph) return alert("Заполните поля!");
        
        database.ref('usernames/' + nick).once('value').then(snap => {
            if (snap.exists()) return alert("Никнейм занят!");
            
            currentUser = {
                name: document.getElementById('reg-name').value || nick,
                phone: ph,
                pass: ps,
                username: "@" + nick,
                avatar: document.getElementById('chosen-img').src,
                contacts: []
            };
            
            database.ref('users/' + ph).set(currentUser);
            database.ref('usernames/' + nick).set(ph);
            saveAndShow();
        });
    } else {
        database.ref('users/' + ph).once('value').then(snap => {
            if (snap.exists() && snap.val().pass === ps) {
                currentUser = snap.val();
                saveAndShow();
            } else {
                alert("Ошибка входа!");
            }
        });
    }
}

// РАБОТА С ЧАТОМ
function openChat(targetPhone) {
    currentChatID = [currentUser.phone, targetPhone].sort().join("_");
    
    database.ref('users/' + targetPhone).once('value').then(snap => {
        var ud = snap.val();
        document.getElementById('chatTitle').innerText = ud.name;
        document.getElementById('chat-avatar-display').src = ud.avatar;
        switchPage('contacts-page', 'chat-page');
        
        // Статус онлайн
        database.ref('status/' + targetPhone).on('value', s => {
            document.getElementById('online-status-text').innerText = s.val() ? "в сети" : "был недавно";
        });

        // Загрузка сообщений
        database.ref('chats/' + currentChatID).on('value', snapMessages => {
            allMessages = [];
            snapMessages.forEach(c => {
                var m = c.val();
                m.id = c.key;
                // Проверка сгорания
                if (m.burnAt && Date.now() > m.burnAt) {
                    database.ref('chats/' + currentChatID + '/' + m.id).remove();
                } else {
                    allMessages.push(m);
                }
            });
            renderMessages("");
            markAsRead();
        });
    });
}

function renderMessages(query) {
    var box = document.getElementById('messages');
    box.innerHTML = "";
    
    allMessages.forEach(v => {
        if (query && v.type === 'text' && !v.m.toLowerCase().includes(query)) return;
        
        var isMe = v.p === currentUser.phone;
        var div = document.createElement('div');
        div.className = "msg-bubble " + (isMe ? "my-msg" : "their-msg");
        
        div.onclick = function() {
            selectedMsgId = v.id;
            document.getElementById('msg-menu').style.display = 'flex';
        };

        var content = "";
        if (v.type === 'img') {
            content = `<img src="${v.m}" style="max-width:100%; border-radius:10px;">`;
        } else if (v.type === 'audio') {
            content = `<audio controls src="${v.m}" style="width:180px; filter:invert(1);"></audio>`;
        } else {
            content = `<div>${v.m}</div>`;
        }

        var time = new Date(v.t);
        var ts = time.getHours() + ":" + (time.getMinutes() < 10 ? '0' : '') + time.getMinutes();
        var ticks = isMe ? `<span style="font-size:10px; margin-left:5px; color:${v.read?'#00d4ff':'#555'}">✓${v.read?'✓':''}</span>` : "";

        div.innerHTML = content + `<div style="display:flex; justify-content:flex-end; font-size:9px; opacity:0.5; margin-top:4px;">${v.burnAt?'🔥 ':''}${ts}${ticks}</div>`;
        box.appendChild(div);
    });
    
    // Всегда скроллим вниз при открытии
    box.scrollTop = box.scrollHeight;
}

function sendMessage() {
    var inp = document.getElementById('messageInput');
    if (!inp.value.trim()) return;

    if (isEditing) {
        database.ref('chats/' + currentChatID + '/' + selectedMsgId).update({ m: inp.value, edited: true });
        isEditing = false;
    } else {
        var msg = {
            p: currentUser.phone,
            m: inp.value,
            t: Date.now(),
            type: 'text',
            read: false
        };
        if (replyData) {
            msg.reply = replyData;
            cancelReply();
        }
        database.ref('chats/' + currentChatID).push(msg);
    }
    inp.value = "";
}

// ПОИСК КОНТАКТА
function addContact() {
    var val = document.getElementById('search-input').value.trim().toLowerCase().replace('@','');
    database.ref('usernames/' + val).once('value').then(sn => {
        if (sn.exists()) {
            var ph = sn.val();
            var contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
            if (!contacts.includes(ph)) {
                contacts.push(ph);
                localStorage.setItem('my_contacts', JSON.stringify(contacts));
            }
            openChat(ph);
        } else {
            alert("Пользователь не найден!");
        }
    });
}

function loadContacts() {
    var list = document.getElementById('contacts-list');
    list.innerHTML = "";
    var contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
    
    contacts.forEach(ph => {
        database.ref('users/' + ph).once('value').then(snap => {
            var u = snap.val();
            var d = document.createElement('div');
            d.style = "padding:15px; display:flex; align-items:center; border-bottom:1px solid #111; cursor:pointer;";
            d.innerHTML = `<img src="${u.avatar}" class="mini-ava" style="margin-right:15px;"><b>${u.name}</b>`;
            d.onclick = function() { openChat(ph); };
            list.appendChild(d);
        });
    });
}

// ПРОФИЛЬ
function openProfile() {
    document.getElementById('edit-name').value = currentUser.name;
    document.getElementById('edit-pass').value = currentUser.pass;
    document.getElementById('edit-avatar-preview').src = currentUser.avatar;
    switchPage('contacts-page', 'profile-page');
}

function saveProfile() {
    currentUser.name = document.getElementById('edit-name').value;
    currentUser.pass = document.getElementById('edit-pass').value;
    currentUser.avatar = document.getElementById('edit-avatar-preview').src;
    
    database.ref('users/' + currentUser.phone).update(currentUser).then(() => {
        localStorage.setItem('chat_user', JSON.stringify(currentUser));
        alert("Сохранено!");
        switchPage('profile-page', 'contacts-page');
        showApp();
    });
}

// ВСПОМОГАТЕЛЬНОЕ
function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('my-avatar-display').src = currentUser.avatar;
    document.getElementById('my-name-display').innerText = currentUser.name;
    loadContacts();
}

function saveAndShow() {
    localStorage.setItem('chat_user', JSON.stringify(currentUser));
    showApp();
}

function switchPage(oldP, newP) {
    document.getElementById(oldP).style.display = 'none';
    document.getElementById(newP).style.display = 'flex';
}

function backToContacts() {
    switchPage('chat-page', 'contacts-page');
    loadContacts();
}

function logout() {
    localStorage.clear();
    location.reload();
}

function setUserOnline() {
    var r = database.ref('status/' + currentUser.phone);
    r.set(true);
    r.onDisconnect().set(false);
}

function markAsRead() {
    allMessages.forEach(m => {
        if (m.p !== currentUser.phone && !m.read) {
            database.ref('chats/' + currentChatID + '/' + m.id).update({ read: true });
        }
    });
}

// ФУНКЦИИ СООБЩЕНИЙ
function closeMsgMenu() { document.getElementById('msg-menu').style.display = 'none'; }

function startReply() {
    var m = allMessages.find(x => x.id === selectedMsgId);
    replyData = { text: m.m };
    document.getElementById('reply-text').innerText = m.m;
    document.getElementById('reply-preview').style.display = 'block';
    closeMsgMenu();
}

function cancelReply() {
    replyData = null;
    document.getElementById('reply-preview').style.display = 'none';
}

function startEdit() {
    var m = allMessages.find(x => x.id === selectedMsgId);
    if (m.p !== currentUser.phone) return alert("Нельзя редактировать чужое!");
    document.getElementById('messageInput').value = m.m;
    isEditing = true;
    closeMsgMenu();
}

function deleteMessage() {
    database.ref('chats/' + currentChatID + '/' + selectedMsgId).remove();
    closeMsgMenu();
}

function makeBurning() {
    database.ref('chats/' + currentChatID + '/' + selectedMsgId).update({ burnAt: Date.now() + 30000 });
    closeMsgMenu();
}

// ГОЛОСОВЫЕ
async function toggleRecording() {
    if (!mediaRecorder) {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            var blob = new Blob(audioChunks, { type: 'audio/webm' });
            var reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                database.ref('chats/' + currentChatID).push({
                    p: currentUser.phone,
                    m: reader.result,
                    t: Date.now(),
                    type: 'audio',
                    read: false
                });
            };
        };
    }
    if (mediaRecorder.state === 'inactive') {
        audioChunks = [];
        mediaRecorder.start();
        document.getElementById('micBtn').style.color = 'red';
    } else {
        mediaRecorder.stop();
        document.getElementById('micBtn').style.color = 'white';
    }
}
