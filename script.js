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

var currentUser, currentChatID, isRegMode = false, selectedMsgKey, typingTimeout;

window.onload = function() {
    currentUser = JSON.parse(localStorage.getItem('chat_user'));
    if (currentUser) { showApp(); setUserOnline(); }

    document.getElementById('toggleAuth').onclick = function() {
        isRegMode = !isRegMode;
        document.getElementById('auth-title').innerText = isRegMode ? "РЕГИСТРАЦИЯ" : "ВХОД";
        document.getElementById('reg-fields').style.display = isRegMode ? "block" : "none";
        this.innerText = isRegMode ? "Уже есть аккаунт? Войти" : "Создать аккаунт";
    };

    document.getElementById('mainAuthBtn').onclick = async function() {
        var phone = document.getElementById('auth-phone').value.trim();
        var pass = document.getElementById('auth-pass').value.trim();
        if(!phone) return alert("Введите номер");

        if(isRegMode) {
            var name = document.getElementById('reg-name').value.trim();
            var nick = document.getElementById('reg-username').value.trim().toLowerCase().replace('@','');
            var ava = document.getElementById('chosen-img').src;
            if(!name) return alert("Введите имя");
            currentUser = { 
                name: name, 
                phone: phone, 
                pass: pass, 
                avatar: (ava.indexOf('data') !== -1 ? ava : ''), 
                username: (nick ? '@' + nick : '') 
            };
            await database.ref('users/' + phone).set(currentUser);
            if(nick) await database.ref('usernames/' + nick).set(phone);
            saveAndShow(); setUserOnline();
        } else {
            var s = await database.ref('users/' + phone).once('value');
            if(!s.exists()) return alert("Нет такого пользователя");
            if(s.val().pass !== pass) return alert("Неверный пароль!");
            currentUser = s.val(); saveAndShow(); setUserOnline();
        }
    };

    document.getElementById('messageInput').oninput = function() {
        if(!currentChatID) return;
        database.ref('typing/' + currentChatID + '/' + currentUser.phone).set(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function() { 
            database.ref('typing/' + currentChatID + '/' + currentUser.phone).set(false); 
        }, 2000);
    };

    document.getElementById('addContactBtn').onclick = async function() {
        var inp = document.getElementById('search-input').value.trim().toLowerCase().replace('@','');
        var sn = await database.ref('usernames/' + inp).once('value');
        var ph = sn.exists() ? sn.val() : inp;
        if(ph && ph !== currentUser.phone) {
            var su = await database.ref('users/' + ph).once('value');
            if(su.exists()) { addToContacts(ph); openChat(ph); document.getElementById('search-input').value = ""; }
        }
    };

    document.getElementById('avatar-input').onchange = function(e) {
        var r = new FileReader();
        r.onload = function(ev) { document.getElementById('chosen-img').src = ev.target.result; };
        r.readAsDataURL(e.target.files[0]);
    };

    document.getElementById('chat-file-input').onchange = function(e) {
        var r = new FileReader();
        r.onload = function(ev) { 
            database.ref('chats/' + currentChatID).push({ 
                p: currentUser.phone, m: ev.target.result, t: Date.now(), s: 0, type: 'img' 
            }); 
        };
        r.readAsDataURL(e.target.files[0]);
    };
document.getElementById('sendBtn').onclick = sendMessage;
    
    document.getElementById('delete-all-btn').onclick = function() {
        database.ref('chats/' + currentChatID + '/' + selectedMsgKey).remove();
        document.getElementById('delete-modal').style.display = 'none';
    };

    document.getElementById('clearChatBtn').onclick = function() { 
        if(confirm("Очистить историю чата?")) database.ref('chats/' + currentChatID).remove(); 
    };
};

function setUserOnline() { 
    var r = database.ref('status/' + currentUser.phone); 
    r.set(true); 
    r.onDisconnect().set(false); 
}

function addToContacts(p) {
    var c = JSON.parse(localStorage.getItem('my_contacts') || "[]");
    if(c.indexOf(p) === -1) { c.push(p); localStorage.setItem('my_contacts', JSON.stringify(c)); }
}

async function loadContacts() {
    var list = document.getElementById('contacts-list'); 
    list.innerHTML = "";
    var cs = JSON.parse(localStorage.getItem('my_contacts') || "[]");
    for(var i=0; i < cs.length; i++) {
        var p = cs[i];
        var s = await database.ref('users/' + p).once('value');
        var ud = s.val(); if(!ud) continue;
        
        var d = document.createElement('div'); 
        d.className = "contact-item";
        
        var imgUrl = ud.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        var dot = document.createElement('div'); 
        dot.className = "online-dot";
        
        (function(phone, el){ 
            database.ref('status/' + phone).on('value', function(snap) { 
                el.style.display = snap.val() ? 'block' : 'none'; 
            }); 
        })(p, dot);
        
        d.innerHTML = '<img src="' + imgUrl + '"><div style="margin-left:10px"><b>' + ud.name + '</b><br><small>' + (ud.username || p) + '</small></div>';
        d.appendChild(dot);
        (function(phone){ d.onclick = function() { openChat(phone); }; })(p);
        list.appendChild(d);
    }
}

async function openChat(p) {
    var s = await database.ref('users/' + p).once('value');
    currentChatID = [currentUser.phone, p].sort().join("_");
    document.getElementById('contacts-page').style.display = 'none';
    document.getElementById('chat-page').style.display = 'flex';
    document.getElementById('chatTitle').innerText = s.val().name;

    database.ref('status/' + p).on('value', function(snap) { 
        document.getElementById('online-status-text').style.display = snap.val() ? 'block' : 'none'; 
    });

    database.ref('typing/' + currentChatID + '/' + p).on('value', function(snap) {
        var t = snap.val(); 
        document.getElementById('typing-indicator').style.display = t ? 'block' : 'none';
        if(t) document.getElementById('online-status-text').style.display = 'none';
    });

    database.ref('chats/' + currentChatID).off();
    database.ref('chats/' + currentChatID).on('value', function(snap) {
        var box = document.getElementById('messages'); 
        box.innerHTML = "";
        snap.forEach(function(c) {
            var v = c.val(); 
            var isMe = v.p === currentUser.phone;
            if(!isMe && v.s === 0) database.ref('chats/' + currentChatID + '/' + c.key).update({ s: 1 });
            
            var b = document.createElement('div'); 
            b.className = "msg-bubble " + (isMe ? "my-msg" : "their-msg");
            
            var time = new Date(v.t); 
            var ts = time.getHours() + ":" + (time.getMinutes() < 10 ? '0' : '') + time.getMinutes();
            
            var content = "";
            if(v.type === 'img') {
                content = '<img class="chat-img" src="' + v.m + '" onclick="window.open(this.src)">';
            } else {
                content = '<div>' + v.m + '</div>';
            }
            
            var statusIcon = isMe ? '<span>' + (v.s === 1 ? '✓✓' : '✓') + '</span>' : '';
b.innerHTML = content + '<div class="msg-info"><span>' + ts + '</span>' + statusIcon + '</div>';
            
            b.onclick = function() { if(isMe) { selectedMsgKey = c.key; document.getElementById('delete-modal').style.display='flex'; } };
            box.appendChild(b);
        });
        box.scrollTop = box.scrollHeight;
    });
    addToContacts(p);
}

function sendMessage() {
    var i = document.getElementById('messageInput');
    if(i.value.trim()) {
        database.ref('chats/' + currentChatID).push({ p: currentUser.phone, m: i.value, t: Date.now(), s: 0 });
        database.ref('typing/' + currentChatID + '/' + currentUser.phone).set(false);
        i.value = "";
    }
}

function showApp() { 
    document.getElementById('auth-screen').style.display = 'none'; 
    document.getElementById('main-app').style.display = 'block'; 
    document.getElementById('my-avatar-display').src = currentUser.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('my-name-display').innerText = currentUser.name;
    loadContacts(); 
}

function saveAndShow() { 
    localStorage.setItem('chat_user', JSON.stringify(currentUser)); 
    showApp(); 
}

function backToContacts() { 
    document.getElementById('chat-page').style.display = 'none'; 
    document.getElementById('contacts-page').style.display = 'flex'; 
    loadContacts(); 
}

function logout() { 
    if(currentUser) database.ref('status/' + currentUser.phone).set(false); 
    localStorage.clear(); 
    location.reload(); 
}
