const firebaseConfig = {
    apiKey: "AIzaSyAmKHf1fbcmXrCTKcZ_b-1EVv7JsN6y9C0",
    authDomain: "aloo-9633b.firebaseapp.com",
    databaseURL: "https://aloo-9633b-default-rtdb.firebaseio.com",
    projectId: "aloo-9633b",
    storageBucket: "aloo-9633b.firebasestorage.app",
    messagingSenderId: "865795470742",
    appId: "1:865795470742:web:69cb9fe49a3fb69ce699b7",
    measurementId: "G-2RWR9Z9PX6"
};

// Инициализация
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();
const database = firebase.database();

window.onload = function() {
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    const contactsList = document.getElementById('contacts-list');
    const messagesDiv = document.getElementById('messages');
    
    let currentUser = JSON.parse(localStorage.getItem('chat_user'));
    let activeChatID = null;
    let confirmationResult = null;

    // 1. Проверка авторизации
    if (currentUser) {
        authScreen.style.display = 'none';
        mainApp.style.display = 'block';
        loadContacts();
    }

    // 2. Настройка reCAPTCHA
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'normal'
    });

    // 3. Отправка СМС
    document.getElementById('sendCodeBtn').onclick = function() {
        const phone = document.getElementById('reg-phone').value.trim();
        const name = document.getElementById('reg-name').value.trim();
        
        if (!phone.startsWith('+') || name === "") {
            return alert("Введите имя и номер в формате +7...");
        }

        auth.signInWithPhoneNumber(phone, window.recaptchaVerifier)
            .then((result) => {
                confirmationResult = result;
                document.getElementById('phone-box').style.display = 'none';
                document.getElementById('code-box').style.display = 'block';
            }).catch(err => alert("Ошибка: " + err.message));
    };

    // 4. Подтверждение кода
    document.getElementById('verifyCodeBtn').onclick = function() {
        const code = document.getElementById('sms-code').value.trim();
        confirmationResult.confirm(code).then((result) => {
            const user = {
                name: document.getElementById('reg-name').value,
                phone: result.user.phoneNumber
            };
            localStorage.setItem('chat_user', JSON.stringify(user));
            location.reload();
        }).catch(() => alert("Неверный код!"));
    };

    // 5. Контакты
    document.getElementById('addContactBtn').onclick = function() {
        const p = document.getElementById('contactPhone').value.trim();
        if (p && p !== currentUser.phone) {
            let contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
            if (!contacts.includes(p)) {
                contacts.push(p);
                localStorage.setItem('my_contacts', JSON.stringify(contacts));
                loadContacts();
            }
            document.getElementById('contactPhone').value = "";
        }
    };

    function loadContacts() {
        contactsList.innerHTML = "";
        const contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
        contacts.forEach(phone => {
            const item = document.createElement('div');
            item.innerHTML = <b>${phone}</b>;
            item.style = "padding:15px; border-bottom:1px solid #eee; cursor:pointer; hover:background:#f5f5f5";
            item.onclick = () => startChat(phone);
            contactsList.appendChild(item);
        });
    }

    // 6. Загрузка чата
    function startChat(friendPhone) {
        activeChatID = [currentUser.phone, friendPhone].sort().join("_");
document.getElementById('chatHeader').innerText = "Чат с: " + friendPhone;
        messagesDiv.innerHTML = "";
        
        database.ref('chats/' + activeChatID).off();
        database.ref('chats/' + activeChatID).on('child_added', (snap) => {
            const d = snap.val();
            const wrap = document.createElement('div');
            wrap.style = d.p === currentUser.phone ? "align-self:flex-end; background:#dcf8c6; padding:8px 12px; margin:4px; border-radius:10px; max-width:70%; position:relative;" : "align-self:flex-start; background:white; padding:8px 12px; margin:4px; border-radius:10px; max-width:70%; border:1px solid #ddd;";
            wrap.innerHTML = <div>${d.m}</div><small style="font-size:9px; color:#888; float:right; margin-top:5px;">${new Date(d.t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>;
            messagesDiv.appendChild(wrap);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    }

    // 7. Отправка сообщения
    function sendMessage() {
        const txt = document.getElementById('messageInput').value.trim();
        if (txt && activeChatID) {
            database.ref('chats/' + activeChatID).push({
                p: currentUser.phone,
                n: currentUser.name,
                m: txt,
                t: Date.now()
            });
            document.getElementById('messageInput').value = "";
        }
    }

    document.getElementById('sendBtn').onclick = sendMessage;
    document.getElementById('messageInput').onkeypress = (e) => { if(e.key === "Enter") sendMessage(); };
};
