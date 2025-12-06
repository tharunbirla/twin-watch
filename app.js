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
    const raiseHandBtn = document.getElementById('raise-hand');

    // Reply / Reaction state
    let replyTarget = null; // { id, text }
    const messages = {}; // store message objects by id for reaction/reply updates
    let unseenCount = 0;
    let newDividerInserted = false;

    function updateChatNotification() {
        if (!toggleChatBtn) return;
        let dot = toggleChatBtn.querySelector('.notification-dot');
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'notification-dot';
            toggleChatBtn.appendChild(dot);
        }
        if (unseenCount > 0) {
            dot.textContent = unseenCount > 99 ? '99+' : String(unseenCount);
            dot.style.display = 'inline-flex';
        } else {
            dot.style.display = 'none';
        }
    }

    function markAllSeen() {
        unseenCount = 0;
        updateChatNotification();
        // remove unread classes from DOM
        const unreadBubbles = chatBox.querySelectorAll('.chat-bubble.unread');
        unreadBubbles.forEach(b => b.classList.remove('unread'));
        // remove divider
        const divider = chatBox.querySelector('.new-divider');
        if (divider) divider.remove();
        // update stored messages
        Object.values(messages).forEach(m => { if (m) m.unread = false; });
        newDividerInserted = false;
    }

    // Create reply preview element above input area
    const chatInputWrapper = document.querySelector('.chat-input-wrapper');
    const replyPreview = document.createElement('div');
    replyPreview.className = 'reply-preview';
    replyPreview.innerHTML = `<div class="reply-text" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div><button class="reply-cancel" title="Cancel reply">✕</button>`;
    const replyTextEl = replyPreview.querySelector('.reply-text');
    const replyCancelBtn = replyPreview.querySelector('.reply-cancel');
    replyCancelBtn.addEventListener('click', () => {
        replyTarget = null;
        replyPreview.classList.remove('show');
    });
    // insert preview before input container
    const inputContainer = document.querySelector('.chat-input-container');
    if (chatInputWrapper && inputContainer) chatInputWrapper.insertBefore(replyPreview, inputContainer);

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

    // Handle incoming attention / raise-hand requests
    function showAttentionToast(fromId) {
        // create toast
        const existing = document.querySelector('.attention-toast');
        if (existing) existing.remove();
        const t = document.createElement('div');
        t.className = 'attention-toast';
        t.innerHTML = `<div class="toast-msg">User requested your attention</div><div class="toast-actions"><button class="toast-btn pause">Pause Stream</button><button class="toast-btn secondary ack">Acknowledge</button></div>`;
        document.body.appendChild(t);

        // click handlers
        t.querySelector('.pause').addEventListener('click', () => {
            // If this client is host, broadcast pause to peers
            if (host) {
                const time = (playerType === 'html5') ? video.currentTime : (youtubePlayer && youtubePlayer.getCurrentTime ? youtubePlayer.getCurrentTime() : 0);
                broadcast({ type: 'pause', time });
                appendSystemCard('Action', 'Paused stream for requester.', 'info');
            } else if (conn && conn.open) {
                // send response to requester asking them to pause
                conn.send({ type: 'raise-hand-response', action: 'pause', target: fromId, from: peerId || 'peer' });
            }
            t.remove();
        });

        t.querySelector('.ack').addEventListener('click', () => {
            if (conn && conn.open) conn.send({ type: 'raise-hand-response', action: 'ack', target: fromId, from: peerId || 'peer' });
            appendSystemCard('Acknowledged', 'You acknowledged the request.', 'success');
            t.remove();
        });

        // auto-dismiss after 12s
        setTimeout(() => { if (t.parentNode) t.remove(); }, 12000);
    }

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

    // Raise-hand button behavior: send attention request to peer
    if (raiseHandBtn) {
        raiseHandBtn.addEventListener('click', () => {
            if (conn && conn.open) {
                conn.send({ type: 'raise-hand', from: peerId || 'peer', time: Date.now() });
                // feedback to sender
                appendSystemCard('Request Sent', 'Attention request sent to peer.', 'info');
            } else {
                appendSystemCard('No Connection', 'No peer connected to receive your request.', 'error');
            }
        });
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
        const text = chatMessageInput.value.trim();
        if (!text) return;

        if (text.startsWith('/')) {
            handleCommand(text);
            chatMessageInput.value = '';
            return;
        }

        // Build message object
        const messageObj = {
            id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
            text: text,
            sender: peerId || 'me',
            replyToId: replyTarget ? replyTarget.id : null,
            replyToText: replyTarget ? replyTarget.text : null,
            // keep reactions keyed by user so each user can only have one reaction per message
            reactionsByUser: {}
        };
        // Sent messages are immediately seen by the sender
        messageObj.unread = false;

        // Store locally
        messages[messageObj.id] = messageObj;

        if (conn && conn.open) {
            // Don't send the local `unread` flag to peers — let recipients decide if the message is unread
            const outbound = Object.assign({}, messageObj);
            delete outbound.unread;
            broadcast({ type: 'chat', message: outbound });
            appendMessage(messageObj, true);
        } else {
            appendMessage(messageObj, true);
            if(!host && !conn) appendSystemCard("Note", "You are not connected to anyone.", "info");
        }

        // reset input and reply state
        chatMessageInput.value = '';
        replyTarget = null;
        replyPreview.classList.remove('show');
    });

    chatMessageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessageBtn.click();
    });

    function handleData(data) {
        // handle raise-hand responses
        if (data.type === 'raise-hand-response') {
            // only handle responses targeted to this client
            if (data.target === peerId) {
                if (data.action === 'ack') {
                    appendSystemCard('Request Acknowledged', `Peer acknowledged your request.`, 'success');
                } else if (data.action === 'pause') {
                    // peer asked sender to pause
                    if (playerType === 'html5') video.pause();
                    else if (playerType === 'youtube' && youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') youtubePlayer.pauseVideo();
                    appendSystemCard('Paused', 'Peer requested pause and you paused the stream.', 'info');
                }
            }
            return;
        }

        if (data.type === 'chat') {
            // Support older format where data.message is a string
            let msgObj = null;
            if (!data.message) return;
            if (typeof data.message === 'string') {
                msgObj = {
                    id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
                    text: data.message,
                    sender: data.sender || 'peer',
                    replyToId: data.replyToId || null,
                    replyToText: data.replyToText || null,
                    reactions: data.reactions || []
                };
            } else {
                msgObj = data.message;
            }
            // determine unread status: if chat is closed, mark as unread and increment counter
            if (typeof msgObj.unread === 'undefined') {
                if (chatContainer && chatContainer.classList.contains('open')) {
                    msgObj.unread = false;
                } else {
                    msgObj.unread = true;
                    unseenCount++;
                    updateChatNotification();
                }
            }
            // normalize incoming reactions array (older format) into reactionsByUser map
            if (msgObj.reactions && Array.isArray(msgObj.reactions)) {
                msgObj.reactionsByUser = msgObj.reactionsByUser || {};
                msgObj.reactions.forEach(r => {
                    if (r && r.by && r.emoji) msgObj.reactionsByUser[r.by] = r.emoji;
                });
                delete msgObj.reactions;
            }
            msgObj.reactionsByUser = msgObj.reactionsByUser || {};
            messages[msgObj.id] = msgObj;
            appendMessage(msgObj, false);
        } 
        else if (data.type === 'reaction') {
            // { type: 'reaction', messageId, emoji, by }
            applyReaction(data.messageId, data.emoji, data.by);
        } else if (data.type === 'raise-hand') {
            // incoming attention request
            const fromId = data.from || 'peer';
            showAttentionToast(fromId);
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

    function appendMessage(messageObj, self) {
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${self ? 'chat-bubble-self' : 'chat-bubble-other'}`;
        bubble.dataset.messageId = messageObj.id;
        bubble.style.position = 'relative';

        // Mark unread visually
        if (messageObj.unread) bubble.classList.add('unread');

        // Reply block
        if (messageObj.replyToText) {
            const replyBlock = document.createElement('div');
            replyBlock.style.fontSize = '0.85rem';
            replyBlock.style.color = 'var(--color-text-secondary)';
            replyBlock.style.marginBottom = '6px';
            replyBlock.style.padding = '8px';
            replyBlock.style.background = 'rgba(0,0,0,0.03)';
            replyBlock.style.borderRadius = '8px';
            replyBlock.textContent = `Replying to: ${messageObj.replyToText}`;
            bubble.appendChild(replyBlock);
        }

        const textNode = document.createElement('div');
        textNode.textContent = messageObj.text;
        bubble.appendChild(textNode);

        // Actions (Reply / React)
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        actions.innerHTML = `<button class="message-action-btn reply-btn" title="Reply">↩</button><button class="message-action-btn react-btn" title="React">😊</button>`;
        bubble.appendChild(actions);

        // Reaction list container
        const reactionList = document.createElement('div');
        reactionList.className = 'reaction-list';
        bubble.appendChild(reactionList);

        // Wire action buttons
        actions.querySelector('.reply-btn').addEventListener('click', (e) => {
            replyTarget = { id: messageObj.id, text: messageObj.text };
            replyTextEl.textContent = `Replying to: ${messageObj.text}`;
            replyPreview.classList.add('show');
            chatMessageInput.focus();
            e.stopPropagation();
        });

        actions.querySelector('.react-btn').addEventListener('click', (e) => {
            showEmojiPickerForMessage(messageObj.id, e);
            e.stopPropagation();
        });

        // Render existing reactions (reactionsByUser) aggregated by emoji
        const reactionsMap = messageObj.reactionsByUser || {};
        const counts = {};
        Object.values(reactionsMap).forEach(em => { counts[em] = (counts[em] || 0) + 1; });
        Object.keys(counts).forEach(em => {
            const item = document.createElement('div');
            item.className = 'reaction-item';
            item.dataset.emoji = em;
            item.innerHTML = `<span class="emoji">${em}</span><span class="count">${counts[em]}</span>`;
            reactionList.appendChild(item);
        });

        // If message is unread and divider not yet inserted, insert divider before appending
        if (messageObj.unread && !newDividerInserted) {
            const divider = document.createElement('div');
            divider.className = 'new-divider';
            divider.textContent = 'New messages';
            chatBox.appendChild(divider);
            newDividerInserted = true;
        }

        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Helper: find message bubble element by id
    function findMessageElementById(id) {
        return chatBox.querySelector(`[data-message-id="${id}"]`);
    }

    // Reaction helpers
    function addReactionBadgeToElement(container, emoji, count) {
        const item = document.createElement('div');
        item.className = 'reaction-item';
        item.dataset.emoji = emoji;
        item.innerHTML = `<span class="emoji">${emoji}</span><span class="count">${count}</span>`;
        container.appendChild(item);
    }

    function applyReaction(messageId, emoji, by) {
        // Ensure message record
        const msg = messages[messageId] = messages[messageId] || { reactionsByUser: {} };
        msg.reactionsByUser = msg.reactionsByUser || {};

        const prev = msg.reactionsByUser[by];
        if (prev === emoji) {
            // toggle off
            delete msg.reactionsByUser[by];
        } else {
            // set/replace reaction for this user
            msg.reactionsByUser[by] = emoji;
        }

        // update DOM
        const bubble = findMessageElementById(messageId);
        if (!bubble) return;
        const reactionList = bubble.querySelector('.reaction-list');
        if (!reactionList) return;
        reactionList.innerHTML = '';

        // aggregate counts
        const counts = {};
        Object.values(msg.reactionsByUser || {}).forEach(em => { counts[em] = (counts[em] || 0) + 1; });
        Object.keys(counts).forEach(em => addReactionBadgeToElement(reactionList, em, counts[em]));
    }

    // Emoji picker UI
    let activeEmojiPicker = null;
    function showEmojiPickerForMessage(messageId, event) {
        hideEmojiPicker();
        const emojis = ['👍','❤️','😂','😮','😢'];
        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        emojis.forEach(em => {
            const btn = document.createElement('button');
            btn.textContent = em;
            btn.style.border = 'none';
            btn.style.background = 'transparent';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '20px';
            btn.addEventListener('click', (ev) => {
                // send reaction
                const payload = { type: 'reaction', messageId, emoji: em, by: peerId || 'peer' };
                if (conn && conn.open) conn.send(payload);
                applyReaction(messageId, em, peerId || 'me');
                hideEmojiPicker();
                ev.stopPropagation();
            });
            picker.appendChild(btn);
        });

        document.body.appendChild(picker);
        // position near cursor, but clamp to viewport so it doesn't go off-screen
        const pad = 8;
        let x = pad, y = pad;
        try {
            if (event && (typeof event.clientX === 'number' || typeof event.pageX === 'number')) {
                // prefer clientX/clientY for fixed positioning
                const ex = (typeof event.clientX === 'number') ? event.clientX : event.pageX;
                const ey = (typeof event.clientY === 'number') ? event.clientY : event.pageY;
                x = ex + pad;
                y = ey + pad;
            } else {
                // fallback: position near the message element
                const targetEl = findMessageElementById(messageId);
                if (targetEl) {
                    const r = targetEl.getBoundingClientRect();
                    x = r.right + pad;
                    y = r.top + pad;
                }
            }
        } catch (err) {
            x = pad; y = pad;
        }

        picker.style.left = x + 'px';
        picker.style.top = y + 'px';
        // clamp to viewport after it is rendered
        const rect = picker.getBoundingClientRect();
        let adjustedLeft = rect.left;
        let adjustedTop = rect.top;
        if (rect.right > window.innerWidth) {
            adjustedLeft = Math.max(pad, window.innerWidth - rect.width - pad);
        }
        if (rect.bottom > window.innerHeight) {
            adjustedTop = Math.max(pad, window.innerHeight - rect.height - pad);
        }
        if (adjustedLeft !== rect.left) picker.style.left = adjustedLeft + 'px';
        if (adjustedTop !== rect.top) picker.style.top = adjustedTop + 'px';

        activeEmojiPicker = picker;

        // hide on next click
        setTimeout(() => {
            window.addEventListener('click', hideEmojiPicker);
        }, 50);
    }

    function hideEmojiPicker() {
        if (activeEmojiPicker) {
            activeEmojiPicker.remove();
            activeEmojiPicker = null;
            window.removeEventListener('click', hideEmojiPicker);
        }
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

    toggleChatBtn.addEventListener("click", () => {
        const wasOpen = chatContainer.classList.contains('open');
        chatContainer.classList.toggle('open');
        const isNowOpen = chatContainer.classList.contains('open');
        // if chat just opened, mark all as seen
        if (!wasOpen && isNowOpen) markAllSeen();
    });
    closeChatMobileBtn.addEventListener("click", () => {
        chatContainer.classList.remove('open');
        // when explicitly closed we do nothing
    });
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
