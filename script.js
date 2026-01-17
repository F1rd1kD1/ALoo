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

// Инициализация Firebase
if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
}
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

    // 1. Проверка авторизации при загрузке
    if (currentUser) {
        if (authScreen) authScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        loadContacts();
    }

    // 2. Настройка reCAPTCHA (БЕЗ символов < или >)
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'normal'
    });

    // 3. Отправка СМС
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    if (sendCodeBtn) {
        sendCodeBtn.onclick = function() {
            const phone = document.getElementById('reg-phone').value.trim();
            const name = document.getElementById('reg-name').value.trim();
            
            if (!phone.startsWith('+') || name === "") {
                return alert("Введите имя и номер в формате +7...");
            }

            auth.signInWithPhoneNumber(phone, window.recaptchaVerifier)
                .then(function(result) {
                    confirmationResult = result;
                    document.getElementById('phone-box').style.display = 'none';
                    document.getElementById('code-box').style.display = 'block';
                }).catch(function(err) {
                    alert("Ошибка: " + err.message);
                });
        };
    }

    // 4. Подтверждение кода из СМС
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    if (verifyCodeBtn) {
        verifyCodeBtn.onclick = function() {
            const code = document.getElementById('sms-code').value.trim();
            confirmationResult.confirm(code).then(function(result) {
                const user = {
                    name: document.getElementById('reg-name').value,
                    phone: result.user.phoneNumber
                };
                localStorage.setItem('chat_user', JSON.stringify(user));
                location.reload();
            }).catch(function() {
                alert("Неверный код!");
            });
        };
    }

    // 5. Логика добавления контактов
    const addContactBtn = document.getElementById('addContactBtn');
    if (addContactBtn) {
        addContactBtn.onclick = function() {
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
    }

    function loadContacts() {
        if (!contactsList) return;
        contactsList.innerHTML = "";
const contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
        contacts.forEach(function(phone) {
            const item = document.createElement('div');
            item.innerHTML = "<b>" + phone + "</b>";
            item.style.padding = "15px";
            item.style.borderBottom = "1px solid #eee";
            item.style.cursor = "pointer";
            item.onclick = function() { startChat(phone); };
            contactsList.appendChild(item);
        });
    }

    // 6. Переключение на чат с конкретным человеком
    function startChat(friendPhone) {
        activeChatID = [currentUser.phone, friendPhone].sort().join("_");
        document.getElementById('chatHeader').innerText = "Чат с: " + friendPhone;
        messagesDiv.innerHTML = "";
        
        database.ref('chats/' + activeChatID).off();
        database.ref('chats/' + activeChatID).on('child_added', function(snap) {
            const d = snap.val();
            const wrap = document.createElement('div');
            
            // Стили сообщения
            wrap.style.padding = "8px 12px";
            wrap.style.margin = "4px";
            wrap.style.borderRadius = "10px";
            wrap.style.maxWidth = "70%";
            wrap.style.fontFamily = "sans-serif";

            if (d.p === currentUser.phone) {
                wrap.style.alignSelf = "flex-end";
                wrap.style.background = "#dcf8c6";
            } else {
                wrap.style.alignSelf = "flex-start";
                wrap.style.background = "white";
                wrap.style.border = "1px solid #ddd";
            }
            
            const time = new Date(d.t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            wrap.innerHTML = "<div>" + d.m + "</div><small style='font-size:9px; color:#888; float:right;'>" + time + "</small>";
            
            messagesDiv.appendChild(wrap);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    }

    // 7. Отправка сообщения
    function sendMessage() {
        const input = document.getElementById('messageInput');
        const txt = input.value.trim();
        if (txt && activeChatID) {
            database.ref('chats/' + activeChatID).push({
                p: currentUser.phone,
                m: txt,
                t: Date.now()
            });
            input.value = "";
        }
    }

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.onclick = sendMessage;
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.onkeypress = function(e) { 
            if(e.key === "Enter") sendMessage(); 
        };
    }
};
