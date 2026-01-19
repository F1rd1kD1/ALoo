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

let currentUser, currentChatID;

window.onload = function() {
    currentUser = JSON.parse(localStorage.getItem('chat_user'));
    if (currentUser) showApp();

    // Регистрация
    document.getElementById('sendCodeBtn').onclick = async function() {
        const name = document.getElementById('reg-name').value.trim();
        let username = document.getElementById('reg-username').value.trim().toLowerCase().replace('@','');
        const phone = document.getElementById('reg-phone').value.trim();
        const avatar = document.getElementById('chosen-img').src;

        if (name && phone) {
            let userObj = { name: name, phone: phone, avatar: avatar.includes('data') ? avatar : '' };
            
            if (username) {
                const snap = await database.ref('usernames/' + username).once('value');
                if (snap.exists()) return alert("Username занят!");
                userObj.username = '@' + username;
                await database.ref('usernames/' + username).set(phone);
            } else {
                userObj.username = '';
            }

            currentUser = userObj;
            localStorage.setItem('chat_user', JSON.stringify(currentUser));
            await database.ref('users/' + phone).set(currentUser);
            showApp();
        } else { alert("Введите имя и номер!"); }
    };

    // Сохранение изменений в профиле
    document.getElementById('saveProfileBtn').onclick = async function() {
        const newName = document.getElementById('edit-name-input').value.trim();
        let newUserRaw = document.getElementById('edit-username-input').value.trim().toLowerCase().replace('@','');
        const newAvatar = document.getElementById('edit-img-preview').src;

        if (newName && newUserRaw) {
            const newFullUser = '@' + newUserRaw;
            
            // Если ник изменился - проверяем уникальность
            if (newFullUser !== currentUser.username) {
                const check = await database.ref('usernames/' + newUserRaw).once('value');
                if (check.exists()) return alert("Этот @username уже занят!");
                
                // Удаляем старый ник
                if (currentUser.username) {
                    await database.ref('usernames/' + currentUser.username.replace('@','')).remove();
                }
                // Бронируем новый
                await database.ref('usernames/' + newUserRaw).set(currentUser.phone);
            }

            currentUser.name = newName;
            currentUser.username = newFullUser;
            if (newAvatar.includes('data')) currentUser.avatar = newAvatar;

            localStorage.setItem('chat_user', JSON.stringify(currentUser));
            await database.ref('users/' + currentUser.phone).update(currentUser);
            alert("Профиль обновлен!");
            closeEditProfile();
            showApp();
        }
    };

    // Загрузка фото
    document.getElementById('avatar-input').onchange = e => handleImg(e, 'chosen-img', true);
    document.getElementById('edit-avatar-input').onchange = e => handleImg(e, 'edit-img-preview');function showApp() {
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
        const d = document.createElement('div');
        d.className = "contact-item";
        d.innerHTML = '👤 <b>' + (ud ? ud.name : p) + '</b> <small style="opacity:0.5;margin-left:5px;">' + (ud && ud.username ? ud.username : '') + '</small>';
        d.onclick = function() { openChat(p); };
        list.appendChild(d);
    }
}

document.getElementById('addContactBtn').onclick = async function() {
    let inp = document.getElementById('search-input').value.trim().toLowerCase().replace('@','');
    let phone = "";
    if (isNaN(inp)) {
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
    const friend = s.val() || { name: phone, phone: phone };
    currentChatID = [currentUser.phone, phone].sort().join("_");
    
    document.getElementById('contacts-page').style.display = 'none';
    document.getElementById('chat-page').style.display = 'flex';
    document.getElementById('chatTitle').innerText = friend.name;
    document.getElementById('chatTitle').onclick = function() {
        document.getElementById('view-name').innerText = friend.name;
        document.getElementById('view-username').innerText = friend.username || '';
        document.getElementById('view-phone').innerText = friend.phone;
        document.getElementById('view-avatar').src = friend.avatar || '';
        document.getElementById('profile-modal').style.display = 'flex';
    };

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
        snap.forEach(function(child) {
            const v = child.val();
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
};
function sendMessage() {
    const inp = document.getElementById('messageInput');
    if (inp.value.trim()) {
        database.ref('chats/' + currentChatID).push({ p: currentUser.phone, m: inp.value, t: Date.now() });
        inp.value = "";
    }
}
document.getElementById('sendBtn').onclick = sendMessage;
document.getElementById('messageInput').onkeypress = e => { if(e.key==='Enter') sendMessage(); };

function openEditProfile() { 
    document.getElementById('contacts-page').style.display='none'; 
    document.getElementById('edit-profile-page').style.display='flex'; 
    document.getElementById('edit-name-input').value = currentUser.name; 
    document.getElementById('edit-username-input').value = currentUser.username ? currentUser.username.replace('@','') : '';
    document.getElementById('edit-img-preview').src = currentUser.avatar || '';
}
function closeEditProfile() { document.getElementById('edit-profile-page').style.display='none'; document.getElementById('contacts-page').style.display='flex'; }
function backToContacts() { document.getElementById('chat-page').style.display='none'; document.getElementById('contacts-page').style.display='flex'; }
function closeModals() { document.getElementById('delete-modal').style.display='none'; document.getElementById('profile-modal').style.display='none'; }
function logout() { localStorage.clear(); location.reload(); }

function handleImg(e, id, hidePlus) {
    const r = new FileReader();
    r.onload = ev => {
        const img = document.getElementById(id);
        img.src = ev.target.result; img.style.display = 'block';
        if(hidePlus) document.getElementById('plus-icon').style.display = 'none';
    };
    r.readAsDataURL(e.target.files[0]);
}
