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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// Элементы страницы
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const usernameInput = document.getElementById('username');

// ФУНКЦИЯ ОТПРАВКИ
sendBtn.onclick = function() {
    const name = usernameInput.value.trim() || "Аноним";
    const text = messageInput.value.trim();

    if (text === "") {
        alert("Сначала напиши что-нибудь!");
        return;
    }

    database.ref('chat_messages').push({
        username: name,
        message: text,
        timestamp: Date.now()
    })
    .then(() => {
        messageInput.value = ""; 
    })
    .catch((error) => {
        alert("Ошибка Firebase: " + error.message);
    });
};

// ФУНКЦИЯ ПОЛУЧЕНИЯ
database.ref('chat_messages').on('child_added', (snapshot) => {
    const data = snapshot.val();
    const msgElement = document.createElement('div');
    msgElement.style.padding = "5px 10px";
    msgElement.style.margin = "5px 0";
    msgElement.style.background = "#e1ffc7";
    msgElement.style.borderRadius = "5px";
    
    // ИСПРАВЛЕНО ЗДЕСЬ: добавлены правильные кавычки
    msgElement.innerHTML = "<b>" + data.username + ":</b> " + data.message;
    
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});
// Отправка по нажатию клавиши Enter
messageInput.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        event.preventDefault(); // Чтобы страница не перезагружалась
        sendBtn.click(); // Просто имитируем нажатие на кнопку "Отправить"
    }
});