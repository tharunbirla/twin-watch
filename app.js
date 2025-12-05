document.addEventListener("DOMContentLoaded", () => {
    const peer = new Peer({
        config: {
            'iceServers': [
                { "urls": "stun:stun.l.google.com:19302" },
                { "urls": "stun:stun1.l.google.com:19302" },
                { "urls": "stun:stun2.l.google.com:19302" },
                { "urls": "stun:stun3.l.google.com:19302" },
                { "urls": "stun:stun4.l.google.com:19302" },
                { "urls": "stun:stun.openrelay.metered.ca:80" }
            ]
        },
        debug: 2
    });
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
        console.log('My peer ID is: ' + id);
    });

    peer.on('error', err => {
        console.error('PeerJS error:', err);
        let errorMsg = "An error occurred.";
        if (err.type === 'peer-unavailable') {
            errorMsg = "Peer not found. Please check the ID.";
        } else if (err.type === 'network') {
            errorMsg = "Network error. Please check your connection.";
        } else if (err.type === 'browser-incompatible') {
            errorMsg = "Your browser does not support WebRTC.";
        } else if (err.type === 'disconnected') {
            errorMsg = "You are disconnected from the signaling server.";
        }

        newMessage.textContent = errorMsg;
        chatBox.appendChild(newMessage.cloneNode(true));
    });

    peer.on('disconnected', () => {
        console.log('Connection to signaling server lost. Attempting to reconnect...');
        newMessage.textContent = "Disconnected from server. Reconnecting...";
        chatBox.appendChild(newMessage.cloneNode(true));
        peer.reconnect();
    });

    peer.on('connection', connection => {
        conn = connection;
        setupConnection();
        newMessage.textContent = "A new user has connected.";
        chatBox.appendChild(newMessage.cloneNode(true));
    });

    function setupConnection() {
        conn.on('data', handleData);
        conn.on('close', () => {
            newMessage.textContent = "Connection closed.";
            chatBox.appendChild(newMessage.cloneNode(true));
            conn = null;
        });
        conn.on('error', (err) => {
            console.error("Connection error:", err);
            newMessage.textContent = "Connection error occurred.";
            chatBox.appendChild(newMessage.cloneNode(true));
        });
    }

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
                chatBox.appendChild(newMessage.cloneNode(true));
                break;
            case 'chat':
                appendMessage(data.message, false);
                break;
        }
    }

    function broadcast(data) {
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    sendMessageBtn.addEventListener("click", () => {
        const message = chatMessageInput.value;
        if (message.startsWith('/create')){
            host = true;
            chatBox.innerHTML = '';
            newMessage.textContent = "Room created. Share this ID with your friend: " + peerId;
            chatBox.appendChild(newMessage.cloneNode(true));
            chatMessageInput.value = '';
        }
        if (message.startsWith('/join')) {
            const parts = message.split(" ");
            const arg = parts[1];
            host = false;
            if (arg && !host) {
                conn = peer.connect(arg);
                conn.on('open', () => {
                    setupConnection();
                    chatBox.innerHTML = '';
                    newMessage.textContent = "Connected to the room: " + arg
                    chatBox.appendChild(newMessage.cloneNode(true));
                    chatMessageInput.value = '';
                });
                conn.on('error', (err) => {
                    console.error("Connection attempt error:", err);
                    chatBox.innerHTML = '';
                    newMessage.textContent = "Error occurred while connecting. Try again.";
                    chatBox.appendChild(newMessage.cloneNode(true));
                    chatMessageInput.value = '';
                });
            } else {
                chatBox.innerHTML = '';
                newMessage.textContent = "Invalid or missing invite code.";
                chatBox.appendChild(newMessage.cloneNode(true));
                chatMessageInput.value = '';
            }
        }
        if (message.startsWith('/leave')) {
            if (conn && !host) {
                if (conn) conn.close();
                chatBox.innerHTML = '';
                newMessage.textContent = "You have left the room.";
                chatBox.appendChild(newMessage.cloneNode(true));
                chatMessageInput.value = '';
            } else {
                newMessage.textContent = "You are the host and cannot leave the room.";
                chatMessageInput.value = '';
                chatBox.appendChild(newMessage.cloneNode(true));
            }
        }
        if (message.startsWith('/status')) {
            if (!conn || !conn.open) {
                newMessage.textContent = "Status: Disconnected";
            } else {
                newMessage.textContent = "Status: Connected";
            }
            chatBox.appendChild(newMessage.cloneNode(true));
            chatMessageInput.value = '';
        }
        if (message.startsWith('/info') && host) {
            newMessage.textContent = "Your are the host: " + peerId ;
            chatBox.appendChild(newMessage.cloneNode(true));
            chatMessageInput.value = '';
        }
        if (message && conn && conn.open && !message.startsWith('/')) {
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
