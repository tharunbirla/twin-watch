document.addEventListener("DOMContentLoaded", () => {
    const peer = new Peer();
    let conn;
    let host = false;

    const video = document.getElementById("video");
    // const createRoomBtn = document.getElementById("create-room");
    const joinRoomBtn = document.getElementById("join-room");
    const roomIdInput = document.getElementById("room-id");
    const videoFileInput = document.getElementById("video-file");
    const chatBox = document.getElementById("chat-box");
    const chatMessageInput = document.getElementById("chat-message");
    const sendMessageBtn = document.getElementById("send-message");
    const toggleChatBtn = document.getElementById("toggle-chat");
    const fullscreenToggleBtn = document.getElementById("fullscreen-toggle");
    const themeToggleBtn = document.getElementById("theme-toggle");
    const chatContainer = document.getElementById("chat-container");
    const uploadVideoBtn = document.getElementById("upload-video");
    const newMessage = document.getElementById("status");

    let peerId = '';

    peer.on('open', id => {
        peerId = id;
    });

    peer.on('connection', connection => {
        conn = connection;
        conn.on('data', handleData);
        newMessage.textContent = "A new user has connected.";
        chatBox.appendChild(newMessage);
    });

    // createRoomBtn.addEventListener("click", () => {
    //     host = true;
    //     alert(`Room created. Share this ID with your friend: ${peerId}`);
            // newMessage.textContent = "Room created. Share this ID with your friend: " + peerId;
            // chatBox.appendChild(newMessage);
    // });

    // joinRoomBtn.addEventListener("click", () => {
    //     const roomId = roomIdInput.value;
    //     conn = peer.connect(roomId);
    //     conn.on('open', () => {
    //         console.log("Connected to host");
    //         conn.on('data', handleData);
    //     });
    // });

    videoFileInput.addEventListener("change", () => {
        const file = videoFileInput.files[0];
        if (file) {
            const fileURL = URL.createObjectURL(file);
            video.src = fileURL;
            if (host) {
                broadcast({ type: 'file-selected' });
            }
        }
    });

    video.addEventListener("play", () => {
        if (host) {
            broadcast({ type: 'play', time: video.currentTime });
        }
    });

    video.addEventListener("pause", () => {
        if (host) {
            broadcast({ type: 'pause', time: video.currentTime });
        }
    });

    video.addEventListener("seeked", () => {
        if (host) {
            broadcast({ type: 'seek', time: video.currentTime });
        }
    });

    video.addEventListener("loadedmetadata", () => {
        if (!host) {
            video.controls = false;
            video.classList.add('client-video')
        }
    });

    function handleData(data) {
        switch (data.type) {
            case 'play':
                video.currentTime = data.time;
                video.play();
                break;
            case 'pause':
                video.currentTime = data.time;
                video.pause();
                break;
            case 'seek':
                video.currentTime = data.time;
                break;
            case 'file-selected':
                alert("The host has selected a video file. Please select the same file to synchronize playback.");
                newMessage.textContent = "The host has selected a video file. Please select the same file to synchronize playback.";
                chatBox.appendChild(newMessage);
                break;
            case 'chat':
                appendMessage(data.message, false);
                break;
        }
    }

    function broadcast(data) {
        if (conn) {
            conn.send(data);
        }
    }

    sendMessageBtn.addEventListener("click", () => {
        const message = chatMessageInput.value;
        if (message.startsWith('/create')){
            host = true;
            chatBox.innerHTML = '';
            newMessage.textContent = "Room created. Share this ID with your friend: " + peerId;
            chatBox.appendChild(newMessage);
            chatMessageInput.value = '';
        }
        if (message.startsWith('/join')) {
            const parts = message.split(" ");
            const arg = parts[1];
            host = false;
            if (arg && !host) {
                conn = peer.connect(arg);
                conn.on('open', () => {
                    conn.on('data', handleData);
                    chatBox.innerHTML = '';
                    newMessage.textContent = "Connected to the room.: " + arg
                    chatBox.appendChild(newMessage);
                    chatMessageInput.value = '';
                });
                conn.on('error', () => {
                    chatBox.innerHTML = '';
                    newMessage.textContent = "Error occurred while connecting. Try again.";
                    chatBox.appendChild(newMessage);
                    chatMessageInput.value = '';
                });
            } else {
                chatBox.innerHTML = '';
                newMessage.textContent = "Invalid or missing invite code.";
                chatBox.appendChild(newMessage);
                chatMessageInput.value = '';
            }
        }
        if (message.startsWith('/leave')) {
            if (conn && !host) {
                if (conn) conn.close();
                chatBox.innerHTML = '';
                newMessage.textContent = "You have left the room.";
                chatBox.appendChild(newMessage);
                chatMessageInput.value = '';
            } else {
                newMessage.textContent = "You are the host and cannot leave the room.";
                chatMessageInput.value = '';
            }
        }
        if (message.startsWith('/status')) {
            if (!conn) {
                newMessage.textContent = "Status: Disconnected";
                chatBox.appendChild(newMessage);
                chatMessageInput.value = '';
            } else {
                newMessage.textContent = "Status: Connected";
                chatBox.appendChild(newMessage);
                chatMessageInput.value = '';
            }
        }
        if (message.startsWith('/info') && host) {
            newMessage.textContent = "Your the the host: " + peerId ;
            chatBox.appendChild(newMessage);
            chatMessageInput.value = '';
        }
        if (message && conn && !message.startsWith('/')) {
            broadcast({ type: 'chat', message });
            appendMessage(message, true);
            chatMessageInput.value = '';
        }
    });

    chatMessageInput.addEventListener("keypress", event => {
        if (event.key === "Enter") {
            sendMessageBtn.click();
        }
    });

    function appendMessage(message, self) {
        const messageElement = document.createElement("div");
        messageElement.className = 'chat-bubble' + (self ? ' chat-bubble-self' : '');
        messageElement.textContent = message;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    toggleChatBtn.addEventListener("click", () => {
        if (chatContainer.style.width === '0px') {
            chatContainer.style.width = '300px';
        } else {
            chatContainer.style.width = '0px';
        }
    });

    themeToggleBtn.addEventListener("click", () => {
        document.body.classList.toggle('dark-theme');
    });

    uploadVideoBtn.addEventListener("click", () => {
        videoFileInput.click();
    });

    fullscreenToggleBtn.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            if (video.requestFullscreen) {
                video.requestFullscreen();
            } else if (video.mozRequestFullScreen) { // Firefox
                video.mozRequestFullScreen();
            } else if (video.webkitRequestFullscreen) { // Chrome, Safari and Opera
                video.webkitRequestFullscreen();
            } else if (video.msRequestFullscreen) { // IE/Edge
                video.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { // Firefox
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { // Chrome, Safari and Opera
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { // IE/Edge
                document.msExitFullscreen();
            }
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!host && document.fullscreenElement) {
            video.setAttribute("controls","false");
            video.removeAttribute('controls');
            video.setAttribute("playsinline","true");
            video.style.pointerEvents = "none"
        }
    });

    document.addEventListener('mozfullscreenchange', () => {
        if (!host && document.mozFullScreen) {
            video.setAttribute("controls","false");
            video.removeAttribute('controls');
            video.setAttribute("playsinline","true");
            video.style.pointerEvents = "none"
        }
    });

    document.addEventListener('webkitfullscreenchange', () => {
        if (!host && document.webkitIsFullScreen) {
            video.setAttribute("controls","false");
            video.removeAttribute('controls');
            video.setAttribute("playsinline","true");
            video.style.pointerEvents = "none"
        }
    });

    document.addEventListener('msfullscreenchange', () => {
        if (!host && document.msFullscreenElement) {
            video.setAttribute("controls","false");
            video.removeAttribute('controls');
            video.setAttribute("playsinline","true");
            video.style.pointerEvents = "none"
        }
    });
});
