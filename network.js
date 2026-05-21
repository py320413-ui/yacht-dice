/* ==========================================
   Yacht Dice P2P Multiplayer Engine - network.js
   ========================================== */

class NetworkController {
    constructor() {
        this.peer = null;
        this.hostConnMap = new Map(); // Host mode: Map of connection objects
        this.clientConn = null;       // Client mode: Connection to host
        this.myNickname = '도전자';
        this.isHost = false;
        this.roomCode = '';           // 5-letter UI code
        this.peerIdPrefix = 'yacht-dice-p2p-'; // Unique prefix to prevent public collisions
        this.lobbyLimit = 4;
        
        this.connectedPeersInfo = []; // Array of { peerId, nickname, isHost }
    }

    // 1. Initialize PeerJS as HOST
    createRoom(nickname) {
        this.myNickname = nickname;
        this.isHost = true;
        this.roomCode = this.generateRandomRoomCode();
        const fullPeerId = this.peerIdPrefix + this.roomCode;

        this.initPeer(fullPeerId, () => {
            addGameLog(`🌐 멀티플레이어 방이 개설되었습니다! 방 코드: **${this.roomCode}**`, 'system-log');
            document.getElementById('display-room-code').innerText = this.roomCode;
            document.getElementById('online-room-info').style.display = 'flex';
            document.getElementById('network-status-text').innerText = "친구를 기다리는 중... (1/4)";
            
            // Add self to peer list
            this.connectedPeersInfo = [{ peerId: fullPeerId, nickname: this.myNickname, isHost: true }];
            this.updatePeersUI();

            // Set up lobby view transition
            state.gameMode = 'online';
            hideLobbyShowGame();
            renderScoreboard();
            
            // Show Force Start button for host
            document.getElementById('btn-force-start').style.display = 'block';
            document.getElementById('btn-force-start').disabled = true; // Wait for at least 1 join
        });
    }

    // 2. Initialize PeerJS and JOIN room as CLIENT
    joinRoom(nickname, roomCode) {
        this.myNickname = nickname;
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase().trim();
        const targetFullId = this.peerIdPrefix + this.roomCode;

        // Create client with random ID to connect to host
        this.initPeer(null, () => {
            addGameLog(`🌐 방 **${this.roomCode}**에 연결을 시도하고 있습니다...`, 'system-log');
            
            const conn = this.peer.connect(targetFullId, {
                metadata: { nickname: this.myNickname }
            });

            this.setupConnectionEvents(conn);
        });
    }

    // 3. Core PeerJS setup
    initPeer(id, onReady) {
        // Destroy existing peer if any
        if (this.peer) {
            this.peer.destroy();
        }

        this.peer = id ? new Peer(id) : new Peer();

        this.peer.on('open', (peerId) => {
            console.log('PeerJS Open. My ID:', peerId);
            onReady();
        });

        this.peer.on('connection', (conn) => {
            if (!this.isHost) {
                conn.close(); // Only Host accepts incoming connections
                return;
            }
            if (this.hostConnMap.size >= this.lobbyLimit - 1) {
                conn.send({ type: 'reject', reason: 'lobby_full' });
                conn.close();
                return;
            }
            
            this.setupConnectionEvents(conn);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'peer-unavailable') {
                showToast("방을 찾을 수 없습니다. 코드를 확인해 주세요.");
                this.destroy();
                exitToLobby();
            } else if (err.type === 'unavailable-id') {
                showToast("방 코드가 이미 사용 중입니다. 다시 시도해 주세요.");
                this.destroy();
                exitToLobby();
            } else {
                showToast(`네트워크 오류: ${err.message}`);
            }
        });

        this.peer.on('disconnected', () => {
            console.log('Peer disconnected from signaling server.');
        });
    }

    // 4. Handle connection messages
    setupConnectionEvents(conn) {
        conn.on('open', () => {
            if (this.isHost) {
                // Host mode: Register client connection
                const clientNickname = conn.metadata.nickname || '참가자';
                this.hostConnMap.set(conn.peer, conn);
                
                addGameLog(`👥 **${clientNickname}**님이 입장하셨습니다.`, 'system-log');
                
                // Rebuild connected peers list
                this.connectedPeersInfo.push({
                    peerId: conn.peer,
                    nickname: clientNickname,
                    isHost: false
                });

                this.updatePeersUI();
                
                // Broadcast updated peer list to all clients
                this.broadcast({
                    type: 'lobby-update',
                    peers: this.connectedPeersInfo
                });

                document.getElementById('btn-force-start').disabled = false;
                document.getElementById('network-status-text').innerText = `대기실 인원: (${this.connectedPeersInfo.length}/4)`;
            } else {
                // Client mode: Connected to host
                this.clientConn = conn;
                state.gameMode = 'online';
                hideLobbyShowGame();
                
                addGameLog(`✅ 방장 연결에 성공했습니다! 대기실 대기 중...`, 'system-log');
                document.getElementById('display-room-code').innerText = this.roomCode;
                document.getElementById('online-room-info').style.display = 'flex';
                document.getElementById('btn-force-start').style.display = 'none'; // Client cannot force start
            }
        });

        conn.on('data', (data) => {
            this.handleIncomingData(conn, data);
        });

        conn.on('close', () => {
            if (this.isHost) {
                const disconnected = this.connectedPeersInfo.find(p => p.peerId === conn.peer);
                const nickname = disconnected ? disconnected.nickname : '알 수 없는 유저';
                
                addGameLog(`🔌 **${nickname}**님이 퇴장하셨습니다.`, 'system-log');
                this.hostConnMap.delete(conn.peer);
                this.connectedPeersInfo = this.connectedPeersInfo.filter(p => p.peerId !== conn.peer);
                
                this.updatePeersUI();
                this.broadcast({
                    type: 'lobby-update',
                    peers: this.connectedPeersInfo
                });

                if (this.connectedPeersInfo.length <= 1) {
                    document.getElementById('btn-force-start').disabled = true;
                }
                document.getElementById('network-status-text').innerText = `대기실 인원: (${this.connectedPeersInfo.length}/4)`;

                // If game was playing, abort it
                if (state.gameState === 'playing') {
                    addGameLog("⚠️ 방의 플레이어가 퇴장하여 대전을 중단합니다.", 'system-log');
                    alert("플레이어가 퇴장하여 대전이 강제 종료됩니다.");
                    exitToLobby();
                }
            } else {
                // Host disconnected
                addGameLog("🔌 방장이 방을 폭파했거나 연결이 끊어졌습니다.", 'system-log');
                alert("방장과의 연결이 해제되었습니다.");
                this.destroy();
                exitToLobby();
            }
        });
    }

    // 5. Send and Route data packets
    handleIncomingData(senderConn, data) {
        switch (data.type) {
            case 'reject':
                if (data.reason === 'lobby_full') {
                    showToast("방 정원이 가득 찼습니다.");
                    this.destroy();
                    exitToLobby();
                }
                break;

            case 'lobby-update':
                // Client receives peer lists from Host
                this.connectedPeersInfo = data.peers;
                this.updatePeersUI();
                document.getElementById('network-status-text').innerText = `대기실 인원: (${this.connectedPeersInfo.length}/4)`;
                break;

            case 'game-start':
                // Clients receive start command from host
                this.executeSyncStart(data.players);
                break;

            case 'action-roll':
                // Sync roll from active player (via Host)
                if (this.isHost) {
                    // Host forwards client roll to all other clients
                    this.broadcast(data, senderConn.peer);
                }
                
                // Play rolling animation with synchronized dice values
                executeDiceRoll(data.values);
                break;

            case 'action-keep':
                // Sync keep changes
                if (this.isHost) {
                    this.broadcast(data, senderConn.peer);
                }
                
                // Sync keep array
                state.dice.forEach((d, idx) => {
                    d.kept = data.keeps[idx];
                });
                renderDice();
                break;

            case 'action-score':
                // Sync score selection
                if (this.isHost) {
                    this.broadcast(data, senderConn.peer);
                }
                
                executeRecordScore(state.currentPlayerIdx, data.category, data.score);
                break;

            case 'chat':
                // Sync chats
                if (this.isHost) {
                    this.broadcast(data, senderConn.peer);
                }
                appendChatBubble(data.sender, data.message, 'other');
                break;

            case 'emoji':
                // Sync floating emoji reaction
                if (this.isHost) {
                    this.broadcast(data, senderConn.peer);
                }
                createEmojiReaction(data.emoji);
                break;

            case 'request-restart':
                if (this.isHost) {
                    // Host restarts game for everyone
                    this.forceStartGame();
                }
                break;
        }
    }

    // 6. Broadcast payload to all peers (Host only)
    broadcast(data, excludePeerId = null) {
        if (!this.isHost) return;
        this.hostConnMap.forEach((conn, peerId) => {
            if (peerId !== excludePeerId) {
                conn.send(data);
            }
        });
    }

    // 7. Force Game Start by Host
    forceStartGame() {
        if (!this.isHost) return;

        // Initialize players array based on connected peers
        const playersConfig = this.connectedPeersInfo.map((p, idx) => ({
            id: p.peerId,
            name: p.nickname,
            score: createEmptyScore(),
            isAI: false,
            // Check if this peer is the local client
            isLocal: (p.peerId === this.peer.id)
        }));

        this.broadcast({
            type: 'game-start',
            players: playersConfig
        });

        this.executeSyncStart(playersConfig);
    }

    executeSyncStart(playersConfig) {
        const logsDiv = document.getElementById('log-messages');
        if (logsDiv) {
            logsDiv.innerHTML = '';
        }

        state.gameState = 'playing';
        state.players = playersConfig;
        
        // Map local player flag properly for everyone
        state.players.forEach(p => {
            p.isLocal = (p.id === this.peer.id);
        });

        state.currentPlayerIdx = 0;
        state.currentRound = 1;
        resetTurnState();

        renderScoreboard();
        document.getElementById('network-status-text').innerText = "게임 진행 중";
        addGameLog("⚔️ 온라인 P2P 실시간 멀티플레이가 시작되었습니다!");
        startTurn();
    }

    // 8. Play synchronization actions
    sendRoll(values) {
        const payload = { type: 'action-roll', values };
        if (this.isHost) {
            this.broadcast(payload);
        } else if (this.clientConn) {
            this.clientConn.send(payload);
        }
    }

    sendKeepState(keeps) {
        const payload = { type: 'action-keep', keeps };
        if (this.isHost) {
            this.broadcast(payload);
        } else if (this.clientConn) {
            this.clientConn.send(payload);
        }
    }

    sendScore(category, score) {
        const payload = { type: 'action-score', category, score };
        if (this.isHost) {
            this.broadcast(payload);
        } else if (this.clientConn) {
            this.clientConn.send(payload);
        }
    }

    sendChatMessage(message) {
        const payload = { type: 'chat', sender: this.myNickname, message };
        if (this.isHost) {
            this.broadcast(payload);
        } else if (this.clientConn) {
            this.clientConn.send(payload);
        }
    }

    sendEmoji(emoji) {
        const payload = { type: 'emoji', emoji };
        if (this.isHost) {
            this.broadcast(payload);
        } else if (this.clientConn) {
            this.clientConn.send(payload);
        }
    }

    requestRestart() {
        const payload = { type: 'request-restart' };
        if (this.isHost) {
            this.forceStartGame();
        } else if (this.clientConn) {
            this.clientConn.send(payload);
        }
    }

    // 9. Update connected peers HUD UI list
    updatePeersUI() {
        const listDiv = document.getElementById('display-peers');
        listDiv.innerHTML = '';

        this.connectedPeersInfo.forEach(p => {
            const isMe = (p.peerId === this.peer.id);
            const displayNick = isMe ? `${p.nickname} (나)` : p.nickname;
            
            const peerDiv = document.createElement('div');
            peerDiv.className = `peer-item connected ${p.isHost ? 'host' : ''}`;
            peerDiv.innerText = displayNick;
            listDiv.appendChild(peerDiv);
        });
    }

    // 10. Generate random 5-letter Room Code
    generateRandomRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing O/0, I/1
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // 11. Complete clean up
    destroy() {
        if (this.clientConn) {
            this.clientConn.close();
            this.clientConn = null;
        }
        this.hostConnMap.forEach(conn => conn.close());
        this.hostConnMap.clear();
        
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.isHost = false;
        this.roomCode = '';
        this.connectedPeersInfo = [];
    }
}

// Global Networking binding
window.networkController = new NetworkController();

// Bind Lobby Network Interface buttons
document.addEventListener('DOMContentLoaded', () => {
    // Online Config screen Buttons toggles
    document.getElementById('btn-create-room').addEventListener('click', () => {
        const nick = document.getElementById('online-player-name').value.trim() || '방장';
        window.networkController.createRoom(nick);
    });

    document.getElementById('btn-join-room-trigger').addEventListener('click', () => {
        document.getElementById('join-room-inputs').style.display = 'block';
    });

    document.getElementById('btn-submit-join').addEventListener('click', () => {
        const nick = document.getElementById('online-player-name').value.trim() || '도전자';
        const code = document.getElementById('join-room-code').value.trim();
        if (!code) {
            showToast("방 코드를 입력하세요!");
            return;
        }
        window.networkController.joinRoom(nick, code);
    });

    // Lobby force start button for host
    document.getElementById('btn-force-start').addEventListener('click', () => {
        if (window.networkController.isHost) {
            window.networkController.forceStartGame();
        }
    });

    // Copy room code utility
    document.getElementById('btn-copy-room-code').addEventListener('click', () => {
        const code = document.getElementById('display-room-code').innerText;
        if (code && code !== '------') {
            navigator.clipboard.writeText(code)
                .then(() => showToast("방 코드가 클립보드에 복사되었습니다! 📋"))
                .catch(() => showToast("복사 실패. 수동으로 복사하세요."));
        }
    });
});
