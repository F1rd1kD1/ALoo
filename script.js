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

let replyData = null;
function cancelReply() {
    replyData = null;
    document.getElementById('reply-preview').style.display = 'none';
}

window.onload = function() {
    let currentUser = JSON.parse(localStorage.getItem('chat_user'));
    let selectedAvatar = "";
    let mediaRecorder;
    let audioChunks = [];
    let currentChatID = "";

    if (currentUser) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('user-display-name').innerText = currentUser.name;
        if (currentUser.avatar) document.getElementById('my-avatar-display').src = currentUser.avatar;
        database.ref('status/' + currentUser.phone).set("online");
        database.ref('status/' + currentUser.phone).onDisconnect().set("offline");
        loadContacts();
    }

    document.getElementById('sendCodeBtn').onclick = function() {
        const name = document.getElementById('reg-name').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        if (name && phone) {
            localStorage.setItem('chat_user', JSON.stringify({ name: name, phone: phone, avatar: selectedAvatar }));
            location.reload();
        }
    };

    document.getElementById('avatar-input').onchange = function(e) {
        const r = new FileReader();
        r.onload = function(ev) {
            selectedAvatar = ev.target.result;
            const img = document.getElementById('chosen-img');
            img.src = selectedAvatar; img.style.display = 'block';
            document.getElementById('plus-icon').style.display = 'none';
        };
        r.readAsDataURL(e.target.files[0]);
    };

    function loadContacts() {
        const list = document.getElementById('contacts-list');
        list.innerHTML = "";
        const contacts = JSON.parse(localStorage.getItem('my_contacts') || "[]");
        contacts.forEach(function(phone) {
            const item = document.createElement('div');
            item.className = "contact-item";
            item.innerText = phone;
            item.onclick = function() { startChat(phone); };
            list.appendChild(item);
        });
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

    function startChat(friendPhone) {
        currentChatID = [currentUser.phone, friendPhone].sort().join("_");
        const msgDiv = document.getElementById('messages');
        const title = document.getElementById('chatTitle');
        title.innerText = friendPhone;

        database.ref('chats/' + currentChatID).off();
        database.ref('chats/' + currentChatID).on('value', function(snap) {
            msgDiv.innerHTML = "";
            snap.forEach(function(child) {
                const d = child.val();
                const isMine = d.p === currentUser.phone;
                const wrap = document.createElement('div');
                wrap.className = "msg-bubble " + (isMine ? "my-msg" : "their-msg");
// Если есть ответ
                if (d.reply) {
                    const rb = document.createElement('div');
                    rb.className = "reply-box";
                    rb.innerText = d.reply.author + ": " + d.reply.text;
                    wrap.appendChild(rb);
                }

                // Контент
                if (d.type === 'voice') {
                    const au = document.createElement('audio'); au.src = d.m; au.controls = true; wrap.appendChild(au);
                } else if (d.type === 'img') {
                    const im = document.createElement('img'); im.src = d.m; im.style.maxWidth = "100%"; wrap.appendChild(im);
                } else {
                    const tx = document.createElement('div'); tx.innerText = d.m; wrap.appendChild(tx);
                }

                // Реакция
                if (d.reaction) {
                    const rTag = document.createElement('div');
                    rTag.className = "reaction-tag";
                    rTag.innerText = d.reaction;
                    wrap.appendChild(rTag);
                }

                // Инфо (время + галочки)
                const info = document.createElement('div');
                info.style.fontSize = "9px"; info.style.textAlign = "right";
                info.innerText = new Date(d.t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) + (isMine ? (d.read ? " ✓✓" : " ✓") : "");
                wrap.appendChild(info);

                // События
                wrap.onclick = function() {
                    replyData = { text: d.type === 'text' ? d.m : "[" + d.type + "]", author: isMine ? "Вы" : friendPhone };
                    document.getElementById('reply-preview').style.display = 'block';
                    document.getElementById('reply-text').innerText = replyData.author + ": " + replyData.text;
                };
                wrap.oncontextmenu = function(e) {
                    e.preventDefault();
                    const emo = prompt("Реакция: ❤️, 👍, 😂, 🔥, 😮");
                    if (emo) database.ref('chats/' + currentChatID + '/' + child.key).update({ reaction: emo });
                };

                msgDiv.appendChild(wrap);
            });
            msgDiv.scrollTop = msgDiv.scrollHeight;
            // Помечаем прочитанным
            snap.forEach(function(c) { if(c.val().p === friendPhone) database.ref('chats/' + currentChatID + '/' + c.key).update({read:true}); });
        });
    }

    function sendMessage(id, content, type) {
        if (!content || !id) return;
        const msg = { p: currentUser.phone, m: content, t: Date.now(), type: type, read: false };
        if (replyData) { msg.reply = replyData; cancelReply(); }
        database.ref('chats/' + id).push(msg);
        document.getElementById('messageInput').value = "";
    }

    document.getElementById('sendBtn').onclick = function() { sendMessage(currentChatID, document.getElementById('messageInput').value, 'text'); };
    
    document.getElementById('voiceBtn').onclick = function() {
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function(s) {
                mediaRecorder = new MediaRecorder(s);
                audioChunks = [];
                mediaRecorder.ondataavailable = function(e) { audioChunks.push(e.data); };
                mediaRecorder.onstop = function() {
                    const b = new Blob(audioChunks, { type: 'audio/webm' });
                    const r = new FileReader(); r.onload = function(ev) { sendMessage(currentChatID, ev.target.result, 'voice'); }; r.readAsDataURL(b);
                };
                mediaRecorder.start();
                document.getElementById('voiceBtn').innerText = "🛑";
            });
        } else {
            mediaRecorder.stop();
            document.getElementById('voiceBtn').innerText = "🎤";
        }
    };
document.getElementById('img-msg-input').onchange = function(e) {
        const r = new FileReader(); r.onload = function(ev) { sendMessage(currentChatID, ev.target.result, 'img'); }; r.readAsDataURL(e.target.files[0]);
    };

    document.getElementById('logoutBtn').onclick = function() { localStorage.clear(); location.reload(); };
};
