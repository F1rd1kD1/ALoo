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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

window.onload = function() {
    // Элементы входа
    const phoneBox = document.getElementById('phone-box');
    const codeBox = document.getElementById('code-box');
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    
    // Элементы чата
    const contactsList = document.getElementById('contacts-list');
    const addContactBtn = document.getElementById('addContactBtn');
    const contactPhoneInput = document.getElementById('contactPhone');
    const chatHeader = document.getElementById('chatHeader');
    const messagesDiv = document.getElementById('messages');

    let confirmationResult = null;
    let currentUser = JSON.parse(localStorage.getItem('chat_user'));
    let activeChatID = null;

    // Проверка входа
    if (currentUser) {
        document.getElementById('auth-screen').style.display = 'none';
        loadContacts();
    }

    // 1. ОТПРАВКА СМС
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { 'size': 'invisible' });

    sendCodeBtn.onclick = function() {
        const phone = document.getElementById('reg-phone').value;
        const name = document.getElementById('reg-name').value;
        if (!phone || !name) return alert("Введите имя и номер!");

        auth.signInWithPhoneNumber(phone, window.recaptchaVerifier)
            .then((result) => {
                confirmationResult = result;
                phoneBox.style.display = 'none';
                codeBox.style.display = 'block';
            }).catch((err) => alert(err.message));
    };

    // 2. ПОДТВЕРЖДЕНИЕ КОДА
    verifyCodeBtn.onclick = function() {
        const code = document.getElementById('sms-code').value;
        confirmationResult.confirm(code).then((result) => {
            const user = { 
                name: document.getElementById('reg-name').value, 
                phone: result.user.phoneNumber 
            };
            localStorage.setItem('chat_user', JSON.stringify(user));
            location.reload();
        }).catch(() => alert("Неверный код!"));
    };

    // 3. КОНТАКТЫ
    addContactBtn.onclick = function() {
        const p = contactPhoneInput.value.trim();
        if (p) {
            let contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
            if (!contacts.includes(p)) {
                contacts.push(p);
                localStorage.setItem('my_contacts', JSON.stringify(contacts));
                loadContacts();
            }
            contactPhoneInput.value = "";
        }
    };

    function loadContacts() {
        contactsList.innerHTML = "";
        const contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
        contacts.forEach(phone => {
            const div = document.createElement('div');
            div.innerHTML = phone;
            div.style = "padding:15px; border-bottom:1px solid #eee; cursor:pointer;";
            div.onclick = () => startChat(phone);
            contactsList.appendChild(div);
        });
    }

    function startChat(friendPhone) {
        activeChatID = [currentUser.phone, friendPhone].sort().join("_");
        chatHeader.innerText = "Чат с: " + friendPhone;
        messagesDiv.innerHTML = "";
database.ref('chats/' + activeChatID).off();
        database.ref('chats/' + activeChatID).on('child_added', (snap) => {
            const d = snap.val();
            const msg = document.createElement('div');
            msg.style = d.p === currentUser.phone ? "align-self:flex-end; background:#dcf8c6; padding:10px; margin:5px; border-radius:10px;" : "align-self:flex-start; background:white; padding:10px; margin:5px; border-radius:10px;";
            msg.innerHTML = d.m;
            messagesDiv.appendChild(msg);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    }

    document.getElementById('sendBtn').onclick = function() {
        const txt = document.getElementById('messageInput').value;
        if (txt && activeChatID) {
            database.ref('chats/' + activeChatID).push({
                p: currentUser.phone,
                m: txt,
                t: Date.now()
            });
            document.getElementById('messageInput').value = "";
        }
    };
};
