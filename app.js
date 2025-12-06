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
    const closeChatMobileBtn = document.getElementById("close-chat-mobile");
    const settingsToggleBtn = document.getElementById("settings-toggle");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettingsBtn = document.getElementById("close-settings");
    const streamUrlInput = document.getElementById("stream-url-input");
    const streamUrlBtn = document.getElementById("stream-url-btn");
    const videoContainer = document.getElementById("video-container");
    const videoOverlay = document.getElementById("video-overlay"); // Get overlay element

    let peerId = '';
    let playerType = 'html5'; // 'html5', 'youtube', 'vidking'
    let youtubePlayer;

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
        if (conn) {
            conn.close();
        }
        conn = connection;
        setupConnection();
        newMessage.textContent = "A new user has connected.";
        chatBox.appendChild(newMessage.cloneNode(true));
        
        // If we are host, ensure we stay in control
        if (host) {
            updateHostControls();
        }
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

    // --- Control Management ---

    function updateHostControls() {
        if (host) {
            // Host: Hide overlay, Enable controls
            videoOverlay.style.display = 'none';
            if (playerType === 'html5') {
                video.setAttribute('controls', 'true');
            }
            // For YouTube, we might need to recreate to show controls, 
            // but usually just hiding the overlay is enough for the host.
        } else {
            // Peer: Show overlay, Disable controls
            videoOverlay.style.display = 'block';
            if (playerType === 'html5') {
                video.removeAttribute('controls');
            }
        }
    }

    // --- Video Player Management ---

    function loadVideo(type, src) {
        playerType = type;

        // Hide all players initially
        video.style.display = 'none';
        const ytElem = document.getElementById('youtube-player');
        if (ytElem) ytElem.style.display = 'none';
        
        const oldVk = document.querySelector('.vidking-embed');
        if (oldVk) oldVk.remove();

        if (type === 'html5') {
            video.style.display = 'block';
            video.src = src;
            updateHostControls(); // Apply controls based on role
        } else if (type === 'youtube') {
            if (ytElem) ytElem.style.display = 'block';
            if (youtubePlayer && youtubePlayer.loadVideoById) {
                youtubePlayer.loadVideoById(src);
            } else {
                createYouTubePlayer(src);
            }
            updateHostControls();
        } else if (type === 'vidking') {
            const iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.className = 'vidking-embed';
            iframe.allow = "autoplay; fullscreen";
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            videoContainer.appendChild(iframe);
            updateHostControls(); // Overlay will block interaction
        }
    }

    function createYouTubePlayer(videoId) {
        if (youtubePlayer && typeof youtubePlayer.destroy === 'function') {
            youtubePlayer.destroy();
        }

        let ytContainer = document.getElementById('youtube-player');
        if (!ytContainer) {
             ytContainer = document.createElement('div');
             ytContainer.id = 'youtube-player';
             videoContainer.appendChild(ytContainer);
        }
        ytContainer.style.display = 'block';

        // Set controls based on host status
        const playerVars = {
            'playsinline': 1,
            'controls': host ? 1 : 0, // Hide controls for peers
            'disablekb': host ? 0 : 1, // Disable keyboard for peers
            'rel': 0
        };

        if (window.YT && window.YT.Player) {
            youtubePlayer = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: playerVars,
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                }
            });
        }
    }

    function onPlayerReady(event) {
        // Player is ready
    }

    function onPlayerStateChange(event) {
        if (!host) return; // Only host broadcasts events

        if (event.data === YT.PlayerState.PLAYING) {
             broadcast({ type: 'play', time: youtubePlayer.getCurrentTime() });
        } else if (event.data === YT.PlayerState.PAUSED) {
             broadcast({ type: 'pause', time: youtubePlayer.getCurrentTime() });
        }
    }

    // HTML5 Video Events
    video.addEventListener("play", () => {
        if (host && playerType === 'html5') {
            broadcast({ type: 'play', time: video.currentTime });
        } else if (!host && playerType === 'html5') {
            // If peer manages to click play (e.g. via keyboard before overlay), force pause?
            // The overlay prevents this, but good to be safe.
        }
    });

    video.addEventListener("pause", () => {
        if (host && playerType === 'html5') {
            broadcast({ type: 'pause', time: video.currentTime });
        }
    });

    video.addEventListener("seeked", () => {
        if (host && playerType === 'html5') {
            broadcast({ type: 'seek', time: video.currentTime });
        }
    });

    videoFileInput.addEventListener("change", () => {
        const file = videoFileInput.files[0];
        if (file) {
            const fileURL = URL.createObjectURL(file);
            loadVideo('html5', fileURL);
            if (host) {
                broadcast({ type: 'file-selected' });
            }
        }
    });

    function handleData(data) {
        if (data.type === 'chat') {
             appendMessage(data.message, false);
             return;
        }

        if (data.type === 'source') {
             loadVideo(data.playerType, data.src);
             appendMessage(`Source changed to ${data.playerType}`, false);
             return;
        }

        if (playerType === 'html5') {
            switch (data.type) {
                case 'play':
                    video.currentTime = data.time;
                    video.play().catch(e => console.log("Autoplay blocked:", e));
                    break;
                case 'pause':
                    video.currentTime = data.time;
                    video.pause();
                    break;
                case 'seek':
                    video.currentTime = data.time;
                    break;
                case 'file-selected':
                    alert("The host has selected a local video file. Please select the same file to synchronize playback.");
                    newMessage.textContent = "The host has selected a local video file. Please select the same file to synchronize playback.";
                    chatBox.appendChild(newMessage.cloneNode(true));
                    loadVideo('html5', '');
                    break;
            }
        } else if (playerType === 'youtube' && youtubePlayer && typeof youtubePlayer.seekTo === 'function') {
             switch (data.type) {
                case 'play':
                    youtubePlayer.seekTo(data.time, true);
                    youtubePlayer.playVideo();
                    break;
                case 'pause':
                    youtubePlayer.seekTo(data.time, true);
                    youtubePlayer.pauseVideo();
                    break;
                case 'seek':
                    youtubePlayer.seekTo(data.time, true);
                    break;
            }
        }
    }

    function broadcast(data) {
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    // --- Chat & Commands ---

    sendMessageBtn.addEventListener("click", () => {
        const message = chatMessageInput.value;

        if (message.startsWith('/')) {
            handleCommand(message);
        } else if (message && conn && conn.open) {
            broadcast({ type: 'chat', message });
            appendMessage(message, true);
        } else if (message) {
            appendMessage(message, true);
        }
        chatMessageInput.value = '';
    });

    function handleCommand(message) {
        if (message.startsWith('/create')){
            host = true;
            updateHostControls(); // Enable controls for host
            chatBox.innerHTML = '';
            newMessage.textContent = "Room created. Share this ID with your friend: " + peerId;
            chatBox.appendChild(newMessage.cloneNode(true));
        }
        else if (message.startsWith('/join')) {
            const parts = message.split(" ");
            const arg = parts[1];
            host = false;
            updateHostControls(); // Disable controls for peer
            if (arg) {
                if (conn) conn.close();
                conn = peer.connect(arg);
                conn.on('open', () => {
                    setupConnection();
                    chatBox.innerHTML = '';
                    newMessage.textContent = "Connected to the room: " + arg
                    chatBox.appendChild(newMessage.cloneNode(true));
                });
                conn.on('error', (err) => {
                    console.error("Connection attempt error:", err);
                    newMessage.textContent = "Error occurred while connecting. Try again.";
                    chatBox.appendChild(newMessage.cloneNode(true));
                });
            }
        }
        else if (message.startsWith('/source')) {
            if (!host) {
                newMessage.textContent = "Only host can set the source.";
                chatBox.appendChild(newMessage.cloneNode(true));
                return;
            }
            const parts = message.split(" ");
            const url = parts[1];
            processStreamUrl(url);
        }
    }

    function processStreamUrl(url) {
        let type = '';
        let src = '';

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            type = 'youtube';
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            const match = url.match(regExp);
            if (match && match[2].length === 11) {
                src = match[2];
            } else {
                alert("Invalid YouTube URL");
                return;
            }
        } else if (url.includes('vidking.net')) {
            type = 'vidking';
            src = url;
        } else {
             alert("Unsupported URL. Please use YouTube or Vidking.");
             return;
        }

        loadVideo(type, src);
        broadcast({ type: 'source', playerType: type, src: src });
        appendMessage(`Source changed to ${type}`, true);
    }

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

    // --- UI Event Listeners ---

    toggleChatBtn.addEventListener("click", () => {
        chatContainer.classList.toggle('open');
    });

    closeChatMobileBtn.addEventListener("click", () => {
        chatContainer.classList.remove('open');
    });

    themeToggleBtn.addEventListener("click", () => {
        document.body.classList.toggle('dark-theme');
    });

    uploadVideoBtn.addEventListener("click", () => {
        videoFileInput.click();
    });

    settingsToggleBtn.addEventListener("click", () => {
        settingsModal.style.display = "block";
    });

    closeSettingsBtn.addEventListener("click", () => {
        settingsModal.style.display = "none";
    });

    window.addEventListener('click', function(event) {
        if (event.target == settingsModal) {
            settingsModal.style.display = "none";
        }
    });

    streamUrlBtn.addEventListener("click", () => {
        const url = streamUrlInput.value;
        if (url) {
            if (host) {
                 processStreamUrl(url);
                 settingsModal.style.display = "none";
                 streamUrlInput.value = '';
            } else {
                alert("Only the host can change the stream source.");
            }
        }
    });

    fullscreenToggleBtn.addEventListener("click", () => {
        if (!document.fullscreenElement) {
             const elem = videoContainer;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!host && document.fullscreenElement) {
             video.setAttribute("controls","false");
             video.removeAttribute('controls');
             video.setAttribute("playsinline","true");
             if (playerType === 'html5') {
                video.style.pointerEvents = "none";
             }
        }
    });
});