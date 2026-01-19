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

let currentUser = null;
let currentChatID = null;
let isRegMode = false;

window.onload = function() {
    currentUser = JSON.parse(localStorage.getItem('chat_user'));
    if (currentUser) {
        showApp();
    }

    // Переключатель Вход / Регистрация
    document.getElementById('toggleAuth').onclick = function() {
        isRegMode = !isRegMode;
        document.getElementById('auth-title').innerText = isRegMode ? "Регистрация" : "Вход";
        document.getElementById('reg-fields').style.display = isRegMode ? "block" : "none";
        document.getElementById('mainAuthBtn').innerText = isRegMode ? "Создать аккаунт" : "Войти";
        document.getElementById('toggleAuth').innerText = isRegMode ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться";
    };

    // Кнопка Входа или Регистрации
    document.getElementById('mainAuthBtn').onclick = async function() {
        const phone = document.getElementById('auth-phone').value.trim();
        const pass = document.getElementById('auth-pass').value.trim();

        if (!phone || !pass) return alert("Заполните номер и пароль!");

        if (isRegMode) {
            const name = document.getElementById('reg-name').value.trim();
            let username = document.getElementById('reg-username').value.trim().toLowerCase().replace('@','');
            const avatar = document.getElementById('chosen-img').src;

            if (!name) return alert("Введите имя!");

            const check = await database.ref('users/' + phone).once('value');
            if (check.exists()) return alert("Этот номер уже занят!");

            let userObj = {
                name: name,
                phone: phone,
                pass: pass,
                avatar: avatar.includes('data') ? avatar : '',
                username: username ? '@' + username : ''
            };

            if (username) {
                const nickCheck = await database.ref('usernames/' + username).once('value');
                if (nickCheck.exists()) return alert("Этот никнейм занят!");
                await database.ref('usernames/' + username).set(phone);
            }

            await database.ref('users/' + phone).set(userObj);
            currentUser = userObj;
            saveAndShow();
        } else {
            const snap = await database.ref('users/' + phone).once('value');
            if (!snap.exists()) return alert("Пользователь не найден!");
            const data = snap.val();
            if (data.pass === pass) {
                currentUser = data;
                saveAndShow();
            } else {
                alert("Неверный пароль!");
            }
        }
    };

    // Настройки
    document.getElementById('saveProfileBtn').onclick = async function() {
        const newName = document.getElementById('edit-name-input').value.trim();
        let newNick = document.getElementById('edit-username-input').value.trim().toLowerCase().replace('@','');
        
        if (newName) {
            if (newNick && ('@' + newNick !== currentUser.username)) {
                const check = await database.ref('usernames/' + newNick).once('value');
                if (check.exists()) return alert("Никнейм занят!");
                if (currentUser.username) {
                    await database.ref('usernames/' + currentUser.username.replace('@','')).remove();
}
                await database.ref('usernames/' + newNick).set(currentUser.phone);
                currentUser.username = '@' + newNick;
            }
            
            currentUser.name = newName;
            const newAva = document.getElementById('edit-img-preview').src;
            if (newAva.includes('data')) currentUser.avatar = newAva;

            await database.ref('users/' + currentUser.phone).update(currentUser);
            saveAndShow();
            closeEditProfile();
        }
    };

    document.getElementById('avatar-input').onchange = e => handleImg(e, 'chosen-img');
    document.getElementById('edit-avatar-input').onchange = e => handleImg(e, 'edit-img-preview');
};

function saveAndShow() {
    localStorage.setItem('chat_user', JSON.stringify(currentUser));
    showApp();
}

function handleImg(e, id) {
    const r = new FileReader();
    r.onload = ev => {
        const img = document.getElementById(id);
        img.src = ev.target.result;
        img.style.display = 'block';
        if (id === 'chosen-img') document.getElementById('plus-icon').style.display = 'none';
    };
    r.readAsDataURL(e.target.files[0]);
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('my-avatar-display').src = currentUser.avatar || '';
    document.getElementById('my-name-display').innerText = currentUser.name;
    loadContacts();
}

async function loadContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = "";
    const cs = JSON.parse(localStorage.getItem('my_contacts') || "[]");
    for (let p of cs) {
        const s = await database.ref('users/' + p).once('value');
        const ud = s.val();
        if (!ud) continue;
        const d = document.createElement('div');
        d.className = "contact-item";
        d.innerHTML = '👤 <b>' + ud.name + '</b> <small style="opacity:0.5; margin-left:5px;">' + (ud.username || '') + '</small>';
        d.onclick = function() { openChat(p); };
        list.appendChild(d);
    }
}

document.getElementById('addContactBtn').onclick = async function() {
    let inp = document.getElementById('search-input').value.trim().toLowerCase().replace('@','');
    let phone = "";
    if (isNaN(inp) || inp.length < 5) {
        const s = await database.ref('usernames/' + inp).once('value');
        phone = s.val();
    } else { phone = inp; }

    if (phone && phone !== currentUser.phone) {
        let cs = JSON.parse(localStorage.getItem('my_contacts') || "[]");
        if (!cs.includes(phone)) cs.push(phone);
        localStorage.setItem('my_contacts', JSON.stringify(cs));
        loadContacts();
        openChat(phone);
    } else { alert("Не найдено"); }
};

async function openChat(phone) {
    const s = await database.ref('users/' + phone).once('value');
    const friend = s.val();
    currentChatID = [currentUser.phone, phone].sort().join("_");
    document.getElementById('contacts-page').style.display = 'none';
    document.getElementById('chat-page').style.display = 'flex';
    document.getElementById('chatTitle').innerText = friend.name;

    document.getElementById('clearChatBtn').onclick = function() {
        document.getElementById('delete-modal').style.display = 'flex';
        document.getElementById('delete-mine-btn').onclick = function() {
            let cs = JSON.parse(localStorage.getItem('my_contacts') || "[]");
            localStorage.setItem('my_contacts', JSON.stringify(cs.filter(x => x !== phone)));
            backToContacts(); loadContacts(); closeModals();
        };
        document.getElementById('delete-all-btn').onclick = function() {
            database.ref('chats/' + currentChatID).remove();
            closeModals();
        };
    };
const msgDiv = document.getElementById('messages');
    database.ref('chats/' + currentChatID).off();
    database.ref('chats/' + currentChatID).on('value', function(snap) {
        msgDiv.innerHTML = "";
        snap.forEach(function(c) {
            const v = c.val();
            const isMe = v.p === currentUser.phone;
            const time = new Date(v.t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const b = document.createElement('div');
            b.className = "msg-bubble " + (isMe ? "my-msg" : "their-msg");
            b.innerHTML = '<div>' + v.m + '</div><span class="msg-time">' + time + '</span>';
            msgDiv.appendChild(b);
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
}

function sendMessage() {
    const inp = document.getElementById('messageInput');
    if (inp.value.trim() && currentChatID) {
        database.ref('chats/' + currentChatID).push({ p: currentUser.phone, m: inp.value, t: Date.now() });
        inp.value = "";
    }
}
document.getElementById('sendBtn').onclick = sendMessage;

function openEditProfile() {
    document.getElementById('contacts-page').style.display = 'none';
    document.getElementById('edit-profile-page').style.display = 'flex';
    document.getElementById('edit-name-input').value = currentUser.name;
    document.getElementById('edit-username-input').value = currentUser.username ? currentUser.username.replace('@','') : '';
    document.getElementById('edit-img-preview').src = currentUser.avatar || '';
}

function closeEditProfile() { document.getElementById('edit-profile-page').style.display = 'none'; document.getElementById('contacts-page').style.display = 'flex'; }
function backToContacts() { document.getElementById('chat-page').style.display = 'none'; document.getElementById('contacts-page').style.display = 'flex'; }
function closeModals() { document.getElementById('delete-modal').style.display = 'none'; }
function logout() { localStorage.clear(); location.reload(); }
