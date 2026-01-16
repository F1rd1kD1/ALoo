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

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();

window.onload = function() {
    const authScreen = document.getElementById('auth-screen');
    const loginBtn = document.getElementById('loginBtn');
    const regName = document.getElementById('reg-name');
    const regPhone = document.getElementById('reg-phone');
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    const targetPhoneInput = document.getElementById('targetPhone');
    const startChatBtn = document.getElementById('startChatBtn');
    const chatHeader = document.getElementById('chatHeader');

    let user = JSON.parse(localStorage.getItem('chat_user'));
    let currentChatID = null;

    if (user && user.name && user.phone) {
        if (authScreen) authScreen.style.display = 'none';
    }

    // Вход
    if (loginBtn) {
        loginBtn.onclick = function() {
            const n = regName.value.trim();
            const p = regPhone.value.trim();
            if (n && p) {
                user = { name: n, phone: p };
                localStorage.setItem('chat_user', JSON.stringify(user));
                location.reload();
            }
        };
    }

    // ФУНКЦИЯ СОЗДАНИЯ ID ЧАТА (всегда одинаковый для двух людей)
    function getChatID(phone1, phone2) {
        return [phone1, phone2].sort().join("_");
    }

    // Начать чат с конкретным человеком
    startChatBtn.onclick = function() {
        const friendPhone = targetPhoneInput.value.trim();
        if (friendPhone && friendPhone !== user.phone) {
            currentChatID = getChatID(user.phone, friendPhone);
            chatHeader.innerText = "Чат с: " + friendPhone;
            loadMessages(currentChatID);
        } else {
            alert("Введите корректный номер друга");
        }
    };

    function doSend() {
        const txt = messageInput.value.trim();
        if (txt && user && currentChatID) {
            database.ref('chats/' + currentChatID).push({
                u: user.name,
                p: user.phone,
                m: txt,
                t: Date.now()
            });
            messageInput.value = "";
        } else if (!currentChatID) {
            alert("Сначала выберите, кому писать!");
        }
    }

    sendBtn.onclick = doSend;

    // Загрузка сообщений именно для этого чата
    function loadMessages(chatID) {
        messagesDiv.innerHTML = ""; // Очищаем экран
        database.ref('chats/' + chatID).off(); // Отключаем старые слушатели
        
        database.ref('chats/' + chatID).limitToLast(50).on('child_added', function(snap) {
            const d = snap.val();
            const time = new Date(d.t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const wrap = document.createElement('div');
            wrap.style.display = "flex";
            wrap.style.width = "100%";
            wrap.style.margin = "4px 0";

            const el = document.createElement('div');
            el.style.padding = "8px 12px";
            el.style.borderRadius = "12px";
            el.style.maxWidth = "70%";
            el.style.fontFamily = "sans-serif";

            if (d.p === user.phone) {
                wrap.style.justifyContent = "flex-end";
                el.style.background = "#dcf8c6";
el.innerHTML = "<b>Вы</b><br>" + d.m + "<br><small style='font-size:10px; color:#888; float:right;'>" + time + " ✓✓</small>";
            } else {
                wrap.style.justifyContent = "flex-start";
                el.style.background = "#fff";
                el.style.border = "1px solid #eee";
                el.innerHTML = "<b style='color:#075E54'>" + d.u + "</b><br>" + d.m + "<br><small style='font-size:10px; color:#888;'>" + time + "</small>";
            }

            wrap.appendChild(el);
            messagesDiv.appendChild(wrap);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    }
};
