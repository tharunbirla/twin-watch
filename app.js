document.addEventListener("DOMContentLoaded", () => {
    // --------------------------------------------------------
    // Configuration & Initialization
    // --------------------------------------------------------
    const peer = new Peer({
        config: {
            'iceServers': [
                { "urls": "stun:stun.l.google.com:19302" },
                { "urls": "stun:stun1.l.google.com:19302" },
                { "urls": "stun:stun2.l.google.com:19302" },
                { "urls": "stun:stun.openrelay.metered.ca:80" }
            ]
        },
        debug: 1
    });

    let conn;
    let host = false;
    let peerId = '';
    let playerType = 'html5'; // 'html5', 'youtube', 'vidking'
    let youtubePlayer;
    let isYouTubeApiReady = false;

    // DOM Elements
    const video = document.getElementById("video");
    const videoContainer = document.getElementById("video-container");
    const videoOverlay = document.getElementById("video-overlay");
    const chatBox = document.getElementById("chat-box");
    const chatMessageInput = document.getElementById("chat-message");
    const sendMessageBtn = document.getElementById("send-message");
    const toggleChatBtn = document.getElementById("toggle-chat");
    const closeChatMobileBtn = document.getElementById("close-chat-mobile");
    const chatContainer = document.getElementById("chat-container");
    const fullscreenToggleBtn = document.getElementById("fullscreen-toggle");
    const themeToggleBtn = document.getElementById("theme-toggle");
    const uploadVideoBtn = document.getElementById("upload-video");
    const videoFileInput = document.getElementById("video-file");
    const settingsToggleBtn = document.getElementById("settings-toggle");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettingsBtn = document.getElementById("close-settings");
    const streamUrlInput = document.getElementById("stream-url-input");
    const streamUrlBtn = document.getElementById("stream-url-btn");

    // --------------------------------------------------------
    // YouTube API Setup
    // --------------------------------------------------------
    // This must be global so the API script can find it
    window.onYouTubeIframeAPIReady = function() {
        console.log("YouTube API is ready.");
        isYouTubeApiReady = true;
    };

    // --------------------------------------------------------
    // PeerJS Events
    // --------------------------------------------------------
    peer.on('open', id => {
        peerId = id;
        console.log('My peer ID is: ' + id);
        appendSystemCard("Welcome to Twin Watch!", "Use the chat to create or join a room.", "info");
    });

    peer.on('error', err => {
        console.error('PeerJS error:', err);
        let errorMsg = "An error occurred.";
        if (err.type === 'peer-unavailable') errorMsg = "Peer not found. Please check the ID.";
        else if (err.type === 'network') errorMsg = "Network error.";
        appendSystemCard("Error", errorMsg, "error");
    });

    peer.on('disconnected', () => {
        appendSystemCard("Disconnected", "Connection lost. Reconnecting...", "error");
        peer.reconnect();
    });

    peer.on('connection', connection => {
        if (conn) conn.close();
        conn = connection;
        setupConnection();
        appendSystemCard("New Connection", "A user has joined your room.", "success");
        if (host) updateHostControls();
    });

    // --------------------------------------------------------
    // Data Handling & Synchronization
    // --------------------------------------------------------

    function setupConnection() {
        conn.on('data', handleData);
        conn.on('close', () => {
            conn = null;
            appendSystemCard("Disconnected", "Peer has left the room.", "error");
        });
    }

    function handleData(data) {
        if (data.type === 'chat') {
            appendMessage(data.message, false);
        } 
        else if (data.type === 'source') {
            loadVideo(data.playerType, data.src);
            appendSystemCard("Source Updated", `Host changed video source to ${data.playerType}.`, "info");
        }
        else {
            // Video Sync Logic
            syncVideo(data);
        }
    }

    function syncVideo(data) {
        // --- HTML5 SYNC ---
        if (playerType === 'html5') {
            switch (data.type) {
                case 'play':
                    if(Math.abs(video.currentTime - data.time) > 0.5) video.currentTime = data.time;
                    video.play().catch(() => {});
                    break;
                case 'pause':
                    video.currentTime = data.time;
                    video.pause();
                    break;
                case 'seek':
                    video.currentTime = data.time;
                    break;
            }
        } 
        // --- YOUTUBE SYNC ---
        else if (playerType === 'youtube' && youtubePlayer && typeof youtubePlayer.playVideo === 'function') {
             switch (data.type) {
                case 'play':
                    // Only seek if we are drifted by more than 0.5 seconds to prevent stutter
                    const diff = Math.abs(youtubePlayer.getCurrentTime() - data.time);
                    if(diff > 0.5) {
                        youtubePlayer.seekTo(data.time, true);
                    }
                    youtubePlayer.playVideo();
                    break;
                case 'pause':
                    // For pause, we want exact sync
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
            console.log("Sent command:", data.type, data.time);
        }
    }

    // --------------------------------------------------------
    // Video Player Management
    // --------------------------------------------------------

    function loadVideo(type, src) {
        playerType = type;
        
        // Reset Views
        video.style.display = 'none';
        const ytElem = document.getElementById('youtube-player');
        if(ytElem) ytElem.style.display = 'none';
        const oldVk = document.querySelector('.vidking-embed');
        if(oldVk) oldVk.remove();

        if (type === 'html5') {
            video.style.display = 'block';
            if(src) video.src = src;
        } else if (type === 'youtube') {
            if(ytElem) ytElem.style.display = 'block';
            createYouTubePlayer(src);
        } else if (type === 'vidking') {
            const iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.className = 'vidking-embed';
            iframe.allow = "autoplay; fullscreen";
            iframe.style.border = 'none';
            videoContainer.appendChild(iframe);
        }
        updateHostControls();
    }

    function createYouTubePlayer(videoId) {
        // If player exists, just load new video
        if (youtubePlayer && typeof youtubePlayer.loadVideoById === 'function') {
            youtubePlayer.loadVideoById(videoId);
            return;
        }

        // Retry if API isn't ready
        if (!window.YT || !window.YT.Player) {
            console.log("YouTube API not ready, retrying...");
            setTimeout(() => createYouTubePlayer(videoId), 500);
            return;
        }

        // Create Player
        youtubePlayer = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                // Host gets controls, Peer gets none (overlay handles blocking, but this is extra safety)
                'controls': host ? 1 : 0, 
                'disablekb': host ? 0 : 1,
                'rel': 0,
                'modestbranding': 1,
                'origin': window.location.origin
            },
            events: {
                'onStateChange': onPlayerStateChange
            }
        });
    }

    function onPlayerStateChange(event) {
        if (!host) return; // PEERS DO NOT BROADCAST

        const time = youtubePlayer.getCurrentTime();

        // 1 = PLAYING, 2 = PAUSED, 3 = BUFFERING
        if (event.data === YT.PlayerState.PLAYING) {
            broadcast({ type: 'play', time: time });
        } 
        else if (event.data === YT.PlayerState.PAUSED) {
            broadcast({ type: 'pause', time: time });
        }
        else if (event.data === YT.PlayerState.BUFFERING) {
            // If host is buffering, pause peer so they don't get ahead
            broadcast({ type: 'pause', time: time });
        }
    }

    function updateHostControls() {
        if (host) {
            videoOverlay.style.display = 'none';
            if (playerType === 'html5') video.setAttribute('controls', 'true');
        } else {
            videoOverlay.style.display = 'block'; // Peer gets overlay
            if (playerType === 'html5') video.removeAttribute('controls');
        }
    }

    // --------------------------------------------------------
    // Chat & UI Handling (Same as previous, included for completeness)
    // --------------------------------------------------------

    function handleCommand(message) {
        if (message.startsWith('/create')) {
            host = true;
            updateHostControls();
            chatBox.innerHTML = ''; 
            appendSystemCard("Room Created", "Share the Room ID below with your friends.", "room-created");
        } 
        else if (message.startsWith('/join')) {
            const parts = message.split(" ");
            const roomId = parts[1];
            if (!roomId) {
                appendSystemCard("Error", "Please provide a Room ID. Usage: /join <id>", "error");
                return;
            }
            host = false;
            updateHostControls();
            
            if (conn) conn.close();
            conn = peer.connect(roomId);
            appendSystemCard("Connecting...", `Attempting to join room: ${roomId}`, "info");

            conn.on('open', () => {
                setupConnection();
                chatBox.innerHTML = '';
                appendSystemCard("Connected!", `You have joined room: ${roomId}`, "success");
            });
            conn.on('error', (err) => {
                appendSystemCard("Connection Failed", "Could not connect to peer.", "error");
            });
        }
        else if (message.startsWith('/source')) {
             if (!host) {
                 appendSystemCard("Permission Denied", "Only host can set source.", "error");
                 return;
             }
             const parts = message.split(" ");
             if(parts[1]) processStreamUrl(parts[1]);
        }
        else if (message.startsWith('/help')) {
            appendSystemCard("Commands", "/create - Start room\n/join <id> - Join room\n/source <url> - Change video", "info");
        }
    }

    sendMessageBtn.addEventListener("click", () => {
        const message = chatMessageInput.value.trim();
        if (!message) return;

        if (message.startsWith('/')) {
            handleCommand(message);
        } else {
            if (conn && conn.open) {
                broadcast({ type: 'chat', message });
                appendMessage(message, true);
            } else {
                appendMessage(message, true);
                if(!host && !conn) appendSystemCard("Note", "You are not connected to anyone.", "info");
            }
        }
        chatMessageInput.value = '';
    });

    chatMessageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessageBtn.click();
    });

    function appendMessage(message, self) {
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${self ? 'chat-bubble-self' : 'chat-bubble-other'}`;
        bubble.textContent = message;
        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function appendSystemCard(title, text, type = 'info') {
        const card = document.createElement("div");
        card.className = "system-card";

        let iconSvg = '';
        if (type === 'room-created') {
             iconSvg = `<svg class="system-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
        } else if (type === 'success') {
             iconSvg = `<svg class="system-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
        } else if (type === 'error') {
             iconSvg = `<svg class="system-icon" style="color:#d93025" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        }

        let contentHtml = `${iconSvg}<h4 class="system-title">${title}</h4><p class="system-text">${text}</p>`;

        if (type === 'room-created') {
            contentHtml += `<div class="copy-row"><input type="text" class="room-id-display" value="${peerId}" readonly><button class="copy-btn-small" onclick="copyToClipboard('${peerId}', this)">COPY</button></div>`;
        }

        card.innerHTML = contentHtml;
        chatBox.appendChild(card);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    window.copyToClipboard = function(text, btnElement) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btnElement.textContent;
            btnElement.textContent = "COPIED";
            setTimeout(() => btnElement.textContent = originalText, 2000);
        });
    };

    function processStreamUrl(url) {
        let type = '';
        let src = '';

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            type = 'youtube';
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            const match = url.match(regExp);
            if (match && match[2].length === 11) src = match[2];
            else { alert("Invalid YouTube URL"); return; }
        } else if (url.includes('vidking.net')) {
            type = 'vidking';
            src = url;
        } else {
             alert("Unsupported URL");
             return;
        }

        loadVideo(type, src);
        broadcast({ type: 'source', playerType: type, src: src });
        appendSystemCard("Stream Started", `Source set to ${type}`, "info");
    }

    streamUrlBtn.addEventListener("click", () => {
        if (!host) {
            alert("Only host can change stream.");
            return;
        }
        const url = streamUrlInput.value;
        if (url) {
            processStreamUrl(url);
            settingsModal.style.display = "none";
            streamUrlInput.value = '';
        }
    });

    uploadVideoBtn.addEventListener("click", () => videoFileInput.click());
    
    videoFileInput.addEventListener("change", () => {
        const file = videoFileInput.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            loadVideo('html5', url);
            if (host) {
                broadcast({ type: 'source', playerType: 'html5', src: '' }); 
                appendSystemCard("Local File Loaded", "Peers must load the same file manually.", "info");
            }
        }
    });

    toggleChatBtn.addEventListener("click", () => chatContainer.classList.toggle('open'));
    closeChatMobileBtn.addEventListener("click", () => chatContainer.classList.remove('open'));
    themeToggleBtn.addEventListener("click", () => document.body.classList.toggle('dark-theme'));
    settingsToggleBtn.addEventListener("click", () => settingsModal.style.display = "block");
    closeSettingsBtn.addEventListener("click", () => settingsModal.style.display = "none");
    window.onclick = (event) => { if (event.target == settingsModal) settingsModal.style.display = "none"; };

    fullscreenToggleBtn.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            if(videoContainer.requestFullscreen) videoContainer.requestFullscreen();
        } else {
            if(document.exitFullscreen) document.exitFullscreen();
        }
    });

    video.addEventListener('play', () => { if(host) broadcast({type:'play', time: video.currentTime}); });
    video.addEventListener('pause', () => { if(host) broadcast({type:'pause', time: video.currentTime}); });
    video.addEventListener('seeked', () => { if(host) broadcast({type:'seek', time: video.currentTime}); });
});
