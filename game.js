/* ==========================================
   Yacht Dice - game.js (Main Orchestrator Entry)
   ========================================== */

import { state, CATEGORIES_LIST } from './modules/state.js';
import { soundEngine } from './modules/sound.js';
import { calculateScores, getCategoryLabel } from './modules/scoring.js';
import { 
    physicsEngine, 
    dragPhysics, 
    gestureState,
    setupShakeGesture, 
    DICE_ROTATIONS,
    arrangeActiveDiceInLine, 
    resolveStaticCollisions, 
    generateDiceTrayCoordinates, 
    isHardwareAccelerationEnabled,
    normalizeAngle180
} from './modules/physics.js';
import { getAIKeeps, getAIScoreChoice } from './modules/ai.js';

// Re-export state for module consistency
export { state };

// ==========================================
// 1. UI Event Handlers & View Rendering Init
// ==========================================

function initApp() {
    // 3D 가속 상태 실시간 판별 가동
    state.gpuAccelerated = isHardwareAccelerationEnabled();
    if (!state.gpuAccelerated) {
        console.warn("WebGL/GPU Hardware Acceleration disabled! 2D Fallback Glassmorphism mode activated.");
        document.body.classList.add('gpu-disabled'); // CPU-Friendly CSS 오버라이드 가동

        // [프리미엄 세련된 GPU 경고 배너동적 생성 배포]
        const banner = document.createElement('div');
        banner.className = 'gpu-warning-banner';
        banner.innerHTML = `
            <div class="banner-content">
                <span class="banner-icon">💡</span>
                <span class="banner-text">하드웨어 가속(GPU)이 비활성화되어 <strong>초경량 2D 정적 모드</strong>로 플레이합니다. 브라우저 설정에서 그래픽 가속을 켜시면 화려하고 실감나는 3D 입체 주사위 텀블링을 즐기실 수 있습니다!</span>
                <button class="banner-close-btn">&times;</button>
            </div>
        `;
        document.body.appendChild(banner);
        
        banner.querySelector('.banner-close-btn').addEventListener('click', () => {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-20px)';
            setTimeout(() => banner.remove(), 400);
        });
    }

    setupLobbyEvents();
    setupGameEvents();
    initializeDiceStage();
    createCup3DLayers(); // 3D 원통 Z-stacking 조립
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Setup Lobby Screen Actions
function setupLobbyEvents() {
    const cards = document.querySelectorAll('.mode-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const mode = card.dataset.mode;
            state.gameMode = mode;

            // Show/Hide relevant configuration panels
            document.querySelectorAll('.setup-panel').forEach(p => p.style.display = 'none');
            document.getElementById(`panel-${mode}`).style.display = 'block';
        });
    });

    // Local Player Count Selector Action
    const localCountSel = document.getElementById('local-player-count');
    if (localCountSel) {
        localCountSel.addEventListener('change', () => {
            const count = parseInt(localCountSel.value);
            const container = document.getElementById('local-names-container');
            container.innerHTML = '';
            for (let i = 0; i < count; i++) {
                container.innerHTML += `
                    <div class="player-entry">
                        <span>${i+1}번 주자</span>
                        <input type="text" class="local-name-input" data-idx="${i}" value="플레이어 ${i+1}" maxlength="8">
                    </div>
                `;
            }
        });
    }

    // Start Game Trigger
    document.getElementById('btn-start-game').addEventListener('click', () => {
        soundEngine.init();
        if (state.gameMode === 'solo') {
            initSoloMode();
        } else if (state.gameMode === 'local') {
            initLocalMode();
        } else if (state.gameMode === 'online') {
            showToast("방 만들기 혹은 참여를 선택해주세요!");
        }
    });
}

// Setup Game Screen Action Buttons
function setupGameEvents() {
    document.getElementById('btn-roll').addEventListener('click', rollDice);
    
    // 드래그&흔들기 제스처 시스템 초기화 (콜백 주입을 통한 디커플링 완료)
    setupShakeGesture((power) => {
        rollDiceWithPower(power);
    });
    
    document.getElementById('btn-reset-turn').addEventListener('click', () => {
        if (state.isRolling) return;
        if (state.rollCount === 3) return; // Haven't rolled yet
        state.dice.forEach(d => d.kept = false);
        renderDice();
    });

    // Exit Button
    document.getElementById('btn-exit-game').addEventListener('click', confirmExitToLobby);

    // Modal Actions
    document.getElementById('btn-modal-restart').addEventListener('click', () => {
        document.getElementById('modal-gameover').classList.remove('active');
        if (state.gameMode === 'solo') initSoloMode();
        else if (state.gameMode === 'local') initLocalMode();
        else if (state.gameMode === 'online') {
            if (window.networkController) window.networkController.requestRestart();
        }
    });

    document.getElementById('btn-modal-lobby').addEventListener('click', () => {
        document.getElementById('modal-gameover').classList.remove('active');
        exitToLobby();
    });

    // emoji reaction float
    const emojiBtns = document.querySelectorAll('.emoji-btn');
    emojiBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            if (state.gameMode === 'online' && window.networkController) {
                window.networkController.sendEmoji(emoji);
            }
            createEmojiReaction(emoji, true);
        });
    });
}

// 3D 실린더 컵 Z-stacking 다중 적층 레이어 동적 생성
export function createCup3DLayers() {
    const wrapper = document.getElementById('cup-layers-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const layerCount = 150; 
    for (let i = 0; i < layerCount; i++) {
        const layer = document.createElement('div');
        layer.className = 'cup-layer';
        
        layer.style.transform = `translateZ(-${i * 1.1}px)`;
        layer.style.background = '#1b1330';
        
        if (i === layerCount - 1) {
            layer.style.border = '3.5px solid #00f5d4';
            layer.style.boxShadow = '0 0 35px #00f5d4, inset 0 0 15px #00f5d4';
        }
        
        wrapper.appendChild(layer);
    }
}

// ==========================================
// 2. Core Game Modes Initializations
// ==========================================

export function initSoloMode() {
    const logsDiv = document.getElementById('log-messages');
    if (logsDiv) {
        logsDiv.innerHTML = '';
    }

    state.gameMode = 'solo';
    state.gameState = 'playing';
    state.aiDifficulty = document.getElementById('ai-difficulty').value;
    
    const playerName = document.getElementById('solo-player-name').value.trim() || '플레이어';
    
    state.players = [
        { id: 'player1', name: playerName, score: createEmptyScore(), isAI: false, isLocal: true },
        { id: 'ai', name: `🤖 AI (${getDifficultyLabel(state.aiDifficulty)})`, score: createEmptyScore(), isAI: true, isLocal: false }
    ];
    
    state.currentPlayerIdx = 0;
    state.currentRound = 1;
    resetTurnState();
    
    hideLobbyShowGame();
    renderScoreboard();
    addGameLog(`🎲 AI 솔로 대전 시작! 난이도: ${getDifficultyLabel(state.aiDifficulty)}`);
    startTurn();
}

export function initLocalMode() {
    const logsDiv = document.getElementById('log-messages');
    if (logsDiv) {
        logsDiv.innerHTML = '';
    }

    state.gameMode = 'local';
    state.gameState = 'playing';
    
    const inputElements = document.querySelectorAll('.local-name-input');
    state.players = [];
    inputElements.forEach((el, index) => {
        const name = el.value.trim() || `플레이어 ${index + 1}`;
        state.players.push({
            id: `local_${index}`,
            name: name,
            score: createEmptyScore(),
            isAI: false,
            isLocal: true
        });
    });

    state.currentPlayerIdx = 0;
    state.currentRound = 1;
    resetTurnState();

    hideLobbyShowGame();
    renderScoreboard();
    addGameLog(`🎲 로컬 ${state.players.length}인 플레이 시작!`);
    startTurn();
}

export function createEmptyScore() {
    const s = {};
    CATEGORIES_LIST.forEach(cat => s[cat] = null);
    return s;
}

function getDifficultyLabel(diff) {
    if (diff === 'easy') return '쉬움';
    if (diff === 'hard') return '어려움';
    return '보통';
}

export function hideLobbyShowGame() {
    document.getElementById('lobby-view').style.display = 'none';
    document.getElementById('game-view').style.display = 'flex';
    
    const roomInfo = document.getElementById('online-room-info');
    if (roomInfo) {
        roomInfo.style.display = (state.gameMode === 'online') ? 'flex' : 'none';
    }
}

export function exitToLobby() {
    if (state.gameMode === 'online' && window.networkController) {
        window.networkController.destroy();
    }
    state.gameState = 'lobby';
    document.getElementById('game-view').style.display = 'none';
    document.getElementById('lobby-view').style.display = 'block';
}

export function confirmExitToLobby() {
    if (confirm("정말로 로비로 나가시겠습니까? 현재 게임 진행 상황이 모두 소실됩니다.")) {
        exitToLobby();
    }
}

// ==========================================
// 3. Dice Manipulation & Animation Rendering
// ==========================================

export function toggleDiceKeep(index) {
    if (state.isRolling || state.rollCount === 3) return; 
    
    const activePlayerObj = state.players[state.currentPlayerIdx];
    if (activePlayerObj.isAI) return;
    if (state.gameMode === 'online' && !activePlayerObj.isLocal) return;

    state.dice[index].kept = !state.dice[index].kept;
    soundEngine.playKeep();
    
    arrangeActiveDiceInLine();
    renderDice();
    
    // Broadcast keep status in online multiplayer
    if (state.gameMode === 'online' && window.networkController) {
        window.networkController.sendKeepState(state.dice.map(d => d.kept));
    }
}

// 2D 폴백 주사위 전용 눈금 Grid 마크업 생성기
export function get2DDiceMarkup(value) {
    const pipMarkup = '<span class="pip"></span>';
    let pips = '';
    
    if (value === 1) {
        pips = '<span class="pip"></span>';
    } else {
        for (let k = 0; k < value; k++) {
            pips += pipMarkup;
        }
    }
    
    const faceClasses = ['front', 'top', 'right', 'left', 'bottom', 'back'];
    const faceClass = faceClasses[value - 1] || 'front';
    return `<div class="face ${faceClass}" style="display: grid !important; grid-template: repeat(3, 1fr) / repeat(3, 1fr) !important; padding: 12px !important; box-sizing: border-box !important; position:static; width:100%; height:100%; border:none; box-shadow:none; border-radius:14px; background:none;">${pips}</div>`;
}

// CPU-Friendly 초경량 2D 정적 단면 모드 실행기 (하드웨어 가속 비활성화 우회)
export function executeLightweight2DRoll(forcedValues = null, shakePower = 50, isDragRelease = false) {
    const cup = document.getElementById('dice-cup');
    const rollButton = document.getElementById('btn-roll');
    const slots = document.querySelectorAll('.dice-slot');
    
    if (rollButton) rollButton.disabled = true;
    soundEngine.playRoll(); 
    
    addGameLog(`⚡ 정위치 2D 주사위 눈금 롤링 가동...`);

    state.dice.forEach((d, i) => {
        const slot = slots[i];
        if (!slot) return;

        const dice2d = document.getElementById(`dice-2d-${i}`);
        const dice3d = document.getElementById(`dice-3d-${i}`);
        
        if (dice2d) dice2d.style.display = 'flex';
        if (dice3d) dice3d.style.display = 'none';

        if (d.kept) return; 
        
        slot.classList.add('rolling', 'rolling-2d-static');
        slot.style.display = 'flex';
        slot.style.opacity = '1';
        slot.style.pointerEvents = 'auto';
        
        arrangeActiveDiceInLine();
        slot.style.left = d.randomLeft;
        slot.style.top = d.randomTop;
        slot.style.transform = 'rotateZ(0deg)';

        if (dice2d) {
            dice2d.innerHTML = get2DDiceMarkup(d.value);
        }
    });

    if (cup) {
        cup.style.transition = 'none';
        cup.style.transform = 'none';
        if (isDragRelease) {
            cup.style.left = '0px';
            cup.style.top = '0px';
        }
    }

    let rollDuration = isDragRelease ? 1650 : 2450;
    
    let intervalId = setInterval(() => {
        state.dice.forEach((d, i) => {
            if (d.kept) return;
            const dice2d = document.getElementById(`dice-2d-${i}`);
            if (dice2d) {
                const tempVal = Math.floor(Math.random() * 6) + 1;
                dice2d.innerHTML = get2DDiceMarkup(tempVal);
            }
        });
    }, 50);

    setTimeout(() => {
        clearInterval(intervalId);
        
        if (cup) {
            cup.classList.remove('pouring', 'pouring-open', 'shaking');
            cup.style.transition = '';
            cup.style.transform = '';
            cup.style.left = '';
            cup.style.top = '';
        }

        state.dice.forEach((d, i) => {
            const slot = slots[i];
            if (slot) {
                slot.classList.remove('rolling', 'rolling-2d-static');
            }
            if (!d.kept) {
                if (forcedValues && forcedValues[i]) {
                    d.value = forcedValues[i];
                } else {
                    d.value = Math.floor(Math.random() * 6) + 1;
                }
                
                d.randomAngle = 0;
                
                const dice2d = document.getElementById(`dice-2d-${i}`);
                if (dice2d) {
                    dice2d.style.display = 'flex';
                    dice2d.innerHTML = get2DDiceMarkup(d.value);
                }
                const dice3d = document.getElementById(`dice-3d-${i}`);
                if (dice3d) {
                    dice3d.style.display = 'none';
                }
            }
        });

        if (state.gameMode === 'online' && !forcedValues && window.networkController) {
            window.networkController.sendRoll(state.dice.map(d => d.value));
        }

        state.isRolling = false;
        soundEngine.playDiceHit(); 

        arrangeActiveDiceInLine();
        renderDice();
        checkCombinationCelebrate();

        renderScoreboard();
        updateRollTrackerUI();

        const active = activePlayer();
        if (active.isAI && state.rollCount > 0) {
            setTimeout(aiDecideKeep, 1000);
        } else if (active.isAI && state.rollCount === 0) {
            setTimeout(aiDecideScore, 1000);
        }
    }, rollDuration);
}

export function renderDice() {
    const slots = document.querySelectorAll('.dice-slot');
    if (slots.length === 0) return;
    
    resolveStaticCollisions();
    
    state.dice.forEach((d, i) => {
        const slot = slots[i];
        if (!slot) return;
        const cube = document.getElementById(`cube-${i}`);
        const dice3d = document.getElementById(`dice-3d-${i}`);
        const dice2d = document.getElementById(`dice-2d-${i}`);
        
        if (state.gpuAccelerated) {
            if (dice3d) dice3d.style.display = 'block';
            if (dice2d) dice2d.style.display = 'none';
        } else {
            if (dice3d) dice3d.style.display = 'none';
            if (dice2d) {
                dice2d.style.display = 'flex';
                dice2d.innerHTML = get2DDiceMarkup(d.value);
            }
        }
        
        if (d.kept) {
            slot.classList.remove('showcase');
            slot.classList.add('keep');
            slot.style.display = 'flex';
            slot.style.opacity = '1';
            slot.style.pointerEvents = 'auto';
            
            slot.style.top = '82%';
            slot.style.left = `${(i * 19) + 12}%`;
            slot.style.transform = 'rotateZ(0deg)';
        } else {
            slot.classList.remove('keep');
            
            let shouldHide = (state.rollCount === 3) || (state.isRolling && !physicsEngine.running);
            if (!state.gpuAccelerated) {
                shouldHide = false; 
            }
            
            if (shouldHide) {
                slot.classList.remove('showcase');
                slot.style.display = 'none';
                slot.style.opacity = '0';
                slot.style.pointerEvents = 'none';
            } else {
                slot.style.display = 'flex';
                slot.style.opacity = '1';
                slot.style.pointerEvents = 'auto';
                
                if (!state.gpuAccelerated || (!state.isRolling && state.rollCount < 3)) {
                    slot.classList.add('showcase');
                } else {
                    slot.classList.remove('showcase');
                }
                
                if (!state.gpuAccelerated) {
                    arrangeActiveDiceInLine();
                    slot.style.top = d.randomTop;
                    slot.style.left = d.randomLeft;
                    slot.style.transform = 'rotateZ(0deg)';
                } else {
                    if (d.randomTop === undefined) {
                        const coords = generateDiceTrayCoordinates(i);
                        d.randomTop = coords.randomTop;
                        d.randomLeft = coords.randomLeft;
                        d.randomAngle = coords.randomAngle;
                    }
                    slot.style.top = d.randomTop;
                    slot.style.left = d.randomLeft;
                    slot.style.transform = `rotateZ(${d.randomAngle}deg)`;
                }
            }
        }
        
        if (!state.isRolling && cube) {
            const rot = DICE_ROTATIONS[d.value];
            if (rot) {
                cube.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
            }
        }
    });
}

export function rollDice() {
    if (state.isRolling || state.rollCount === 0) return;
    
    const activePlayerObj = state.players[state.currentPlayerIdx];
    if (state.gameMode === 'online' && !activePlayerObj.isLocal) return;
    if (activePlayerObj.isAI) return;

    executeDiceRoll(null, 50); 
}

export function rollDiceWithPower(shakePower) {
    if (state.isRolling || state.rollCount === 0) return;
    
    const activePlayerObj = state.players[state.currentPlayerIdx];
    if (state.gameMode === 'online' && !activePlayerObj.isLocal) return;
    if (activePlayerObj.isAI) return;

    executeDiceRoll(null, shakePower, true); 
}

export function executeDiceRoll(forcedValues = null, shakePower = 50, isDragRelease = false) {
    if (state.rollCount === 0) return;
    
    state.isRolling = true;
    state.rollCount--;
    updateRollTrackerUI();
    
    const slots = document.querySelectorAll('.dice-slot');
    state.dice.forEach((d, i) => {
        if (!d.kept) {
            const slot = slots[i];
            if (slot) {
                slot.classList.remove('showcase');
                slot.style.display = 'none';
                slot.style.opacity = '0';
                slot.style.pointerEvents = 'none';
            }
        }
    });
    
    if (!state.gpuAccelerated) {
        executeLightweight2DRoll(forcedValues, shakePower, isDragRelease);
        return;
    }
    
    addGameLog(`🎲 주사위 롤링... (남은 횟수: ${state.rollCount}회)`);

    const cup = document.getElementById('dice-cup');
    const rollButton = document.getElementById('btn-roll');
    
    if (rollButton) rollButton.disabled = true;

    if (isDragRelease) {
        if (cup) {
            cup.classList.remove('pressed');
            cup.classList.add('pouring-open');
            cup.style.left = `${dragPhysics.releaseX || gestureState.releaseX}px`;
            cup.style.top = `${dragPhysics.releaseY || gestureState.releaseY}px`;
            
            cup.style.transition = 'left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1.15), top 0.4s cubic-bezier(0.25, 0.8, 0.25, 1.15), transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1.15)';
            cup.style.transform = `perspective(900px) translateZ(60px) rotateX(60deg) rotateY(-45deg) rotateZ(-35deg) scale(1.15)`;
        }
        
        soundEngine.playRoll(); 
        
        setTimeout(() => {
            const slots = document.querySelectorAll('.dice-slot');
            state.dice.forEach((d, i) => {
                if (d.kept) return;
                if (forcedValues) {
                    d.value = forcedValues[i];
                }
                const slot = slots[i];
                if (slot) {
                    slot.classList.add('rolling');
                }
            });

            const tray = document.getElementById('dice-tray');
            let launchOrigin = null;
            if (tray) {
                const trayRect = tray.getBoundingClientRect();
                const cupCenterInTrayX = (dragPhysics.cupOrigCenterX || gestureState.cupOrigCenterX) - trayRect.left;
                const cupCenterInTrayY = (dragPhysics.cupOrigCenterY || gestureState.cupOrigCenterY) - trayRect.top;
                launchOrigin = {
                    x: cupCenterInTrayX + (dragPhysics.releaseX || gestureState.releaseX),
                    y: cupCenterInTrayY + (dragPhysics.releaseY || gestureState.releaseY)
                };
            }

            physicsEngine.init(state.dice.map(d => d.kept), shakePower, launchOrigin);
            physicsEngine.start(() => {
                handleDiceRollComplete(forcedValues);
            }, forcedValues);

        }, 150); 
        
    } else {
        if (cup) {
            cup.classList.add('shaking');
        }
        soundEngine.playRoll(); 

        setTimeout(() => {
            if (cup) {
                cup.classList.remove('shaking');
                cup.classList.add('pouring');
            }

            setTimeout(() => {
                const slots = document.querySelectorAll('.dice-slot');
                state.dice.forEach((d, i) => {
                    if (d.kept) return;
                    if (forcedValues) {
                        d.value = forcedValues[i];
                    }
                    const slot = slots[i];
                    if (slot) {
                        slot.classList.add('rolling');
                    }
                });

                physicsEngine.init(state.dice.map(d => d.kept), shakePower);
                physicsEngine.start(() => {
                    handleDiceRollComplete(forcedValues);
                }, forcedValues);

            }, 200); 

        }, 600);
    }
}

function handleDiceRollComplete(forcedValues = null) {
    const cup = document.getElementById('dice-cup');
    const slots = document.querySelectorAll('.dice-slot');

    if (cup) {
        cup.classList.remove('pouring', 'pouring-open');
        cup.style.transition = 'left 0.62s cubic-bezier(0.25, 0.8, 0.25, 1), top 0.62s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.62s cubic-bezier(0.25, 0.8, 0.25, 1), filter 0.5s ease';
        cup.style.left = '0px';
        cup.style.top = '0px';
        cup.style.transform = 'perspective(900px) translateZ(0px) scale(1)';
        
        setTimeout(() => {
            cup.style.zIndex   = '';
            cup.style.transition = '';
            cup.style.left = '';
            cup.style.top = '';
            cup.style.transform  = '';
            
            for (let i = 0; i < 5; i++) {
                const el = document.getElementById(`mini-dice-${i}`);
                const cubeEl = document.getElementById(`mini-cube-${i}`);
                if (el) el.style.left = '';
                if (cubeEl) cubeEl.style.transform = '';
            }
        }, 630);
    }

    state.dice.forEach((d, i) => {
        const slot = slots[i];
        if (slot) {
            slot.classList.remove('rolling');
        }
        
        if (!d.kept) {
            const phys = physicsEngine.dicePhysics[i];
            if (phys && phys.body) {
                d.randomLeft = `${phys.body.position.x}px`;
                d.randomTop = `${phys.body.position.y}px`;
                d.randomAngle = normalizeAngle180(phys.body.angle * (180 / Math.PI));
            }
        }
    });

    if (state.gameMode === 'online' && !forcedValues && window.networkController) {
        window.networkController.sendRoll(state.dice.map(d => d.value));
    }

    state.isRolling = false;
    soundEngine.playDiceHit(); 
    
    setTimeout(() => {
        arrangeActiveDiceInLine();
        renderDice();
        checkCombinationCelebrate();
    }, 250);
    
    renderScoreboard();
    updateRollTrackerUI(); 

    if (state.rollCount === 0) {
        document.getElementById('display-turn-status').innerText = "더 이상 주사위를 굴릴 수 없습니다. 점수를 기록해 주세요.";
    } else {
        document.getElementById('display-turn-status').innerText = "남은 롤 횟수를 사용하거나 점수를 입력해 주세요.";
    }

    const active = activePlayer();
    if (active.isAI && state.rollCount > 0) {
        setTimeout(aiDecideKeep, 2500);
    } else if (active.isAI && state.rollCount === 0) {
        setTimeout(aiDecideScore, 2500);
    }
}

export function updateRollTrackerUI() {
    const dots = document.getElementById('roll-dots').querySelectorAll('.dot');
    dots.forEach((dot, idx) => {
        if (idx < state.rollCount) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });

    document.getElementById('btn-roll').disabled = (state.rollCount === 0 || state.isRolling);
}

// ==========================================
// 4. Turn Management Flow
// ==========================================

export function activePlayer() {
    return state.players[state.currentPlayerIdx];
}

export function startTurn() {
    resetTurnState();
    const active = activePlayer();
    
    document.getElementById('display-current-turn').innerText = `${active.name}의 턴`;
    
    renderScoreboard();

    if (active.isAI) {
        document.getElementById('display-turn-status').innerText = "AI가 생각하는 중...";
        document.getElementById('btn-roll').disabled = true;
        document.getElementById('btn-reset-turn').disabled = true;
        setTimeout(aiExecuteRoll, 1200);
    } else {
        if (state.gameMode === 'online') {
            if (active.isLocal) {
                document.getElementById('display-turn-status').innerText = "당신의 차례입니다! 주사위를 굴리세요.";
                document.getElementById('btn-roll').disabled = false;
                document.getElementById('btn-reset-turn').disabled = false;
            } else {
                document.getElementById('display-turn-status').innerText = `${active.name}의 턴을 대기하고 있습니다...`;
                document.getElementById('btn-roll').disabled = true;
                document.getElementById('btn-reset-turn').disabled = true;
            }
        } else {
            document.getElementById('display-turn-status').innerText = "주사위를 굴리거나 점수판을 탭해 주세요.";
            document.getElementById('btn-roll').disabled = false;
            document.getElementById('btn-reset-turn').disabled = false;
        }
    }
}

export function resetTurnState() {
    state.rollCount = 3;
    state.dice.forEach((d, i) => {
        d.value = 1;
        d.kept = false;
        
        const coords = generateDiceTrayCoordinates(i);
        d.randomTop = coords.randomTop;
        d.randomLeft = coords.randomLeft;
        d.randomAngle = coords.randomAngle;
    });
    updateRollTrackerUI();
    renderDice();
}

export function recordScore(playerIdx, category) {
    if (state.isRolling) return;
    
    const targetPlayer = state.players[playerIdx];
    
    if (state.gameMode === 'online' && !targetPlayer.isLocal) return;
    if (targetPlayer.isAI) return;
    if (state.currentPlayerIdx !== playerIdx) return;
    if (state.rollCount === 3) {
        showToast("주사위를 최소 1번 굴린 후에 점수를 지정할 수 있습니다!");
        return;
    }
    
    if (targetPlayer.score[category] !== null) return; 
    
    const diceValues = state.dice.map(d => d.value);
    const calculated = calculateScores(diceValues);
    const scoreVal = calculated[category];

    executeRecordScore(playerIdx, category, scoreVal);
}

export function executeRecordScore(playerIdx, category, scoreVal) {
    const targetPlayer = state.players[playerIdx];
    targetPlayer.score[category] = scoreVal;
    
    soundEngine.playScoreFixed();
    addGameLog(`📝 ${targetPlayer.name}님이 **${getCategoryLabel(category)}**에 **${scoreVal}점** 기록!`);

    if (category === 'yacht' && scoreVal === 50) {
        triggerYachtParty(`${targetPlayer.name} YACHT!! 🎉🎉`);
    }

    const upperKeys = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
    const currentUpperSum = upperKeys.reduce((a, b) => a + (targetPlayer.score[b] || 0), 0);
    const isCompletedUpper = upperKeys.every(k => targetPlayer.score[k] !== null);
    
    if (currentUpperSum >= 63 && targetPlayer.score['bonus'] === null) {
        targetPlayer.score['bonus'] = 35;
        soundEngine.playBonus();
        triggerConfetti(0.25, 0.4);
        addGameLog(`✨ ${targetPlayer.name}님이 보너스 35점을 획득했습니다! (상단 합계: ${currentUpperSum}점)`);
    } else if (isCompletedUpper && currentUpperSum < 63 && targetPlayer.score['bonus'] === null) {
        targetPlayer.score['bonus'] = 0;
    }

    if (state.gameMode === 'online' && targetPlayer.isLocal && window.networkController) {
        window.networkController.sendScore(category, scoreVal);
    }

    setTimeout(nextPlayerTurn, 1000);
}

export function nextPlayerTurn() {
    state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
    
    if (state.currentPlayerIdx === 0) {
        state.currentRound++;
    }

    if (state.currentRound > 12) {
        finishGame();
    } else {
        startTurn();
    }
}

export function finishGame() {
    state.gameState = 'finished';
    
    const finalScores = state.players.map(p => {
        const total = CATEGORIES_LIST.reduce((a, b) => a + (p.score[b] || 0), 0) + (p.score['bonus'] || 0);
        return { name: p.name, score: total };
    });

    finalScores.sort((a, b) => b.score - a.score);
    const winner = finalScores[0];
    
    triggerYachtParty(`🏆 우승: ${winner.name} (${winner.score}점)!`);

    const resultsDiv = document.getElementById('gameover-results');
    resultsDiv.innerHTML = finalScores.map((p, idx) => `
        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; margin: 10px 0; font-weight: ${idx === 0 ? '800' : '400'}; color: ${idx === 0 ? 'var(--accent-gold)' : 'var(--text-main)'}">
            <span>${idx + 1}등. ${p.name}</span>
            <span>${p.score}점</span>
        </div>
    `).join('');

    document.getElementById('modal-gameover').classList.add('active');
}

// ==========================================
// 5. AI strategy wrappers in view
// ==========================================

export function aiExecuteRoll() {
    if (state.gameState !== 'playing') return;
    executeDiceRoll();
}

export function aiDecideKeep() {
    if (state.gameState !== 'playing') return;
    
    const ai = activePlayer();
    const diceValues = state.dice.map(d => d.value);
    
    // Heuristic 결정 로직을 ai.js 모듈로부터 안전하게 주입/호출
    const keeps = getAIKeeps(diceValues, ai.score, state.aiDifficulty);

    state.dice.forEach((d, idx) => {
        if (d.kept !== keeps[idx]) {
            d.kept = keeps[idx];
            soundEngine.playKeep();
        }
    });

    renderDice();
    addGameLog(`🤖 AI가 ${keeps.filter(k=>k).length}개의 주사위를 킵했습니다.`);

    setTimeout(aiExecuteRoll, 1200);
}

export function aiDecideScore() {
    if (state.gameState !== 'playing') return;

    const ai = activePlayer();
    const diceValues = state.dice.map(d => d.value);
    const computed = calculateScores(diceValues);

    const chosenCat = getAIScoreChoice(computed, ai.score, state.aiDifficulty);

    const scoreVal = computed[chosenCat];
    executeRecordScore(state.currentPlayerIdx, chosenCat, scoreVal);
}

// ==========================================
// 6. Scoreboard Layout Renderer
// ==========================================

export function renderScoreboard() {
    const tableHeader = document.getElementById('table-header-row');
    const tableBody = document.getElementById('table-body');
    
    tableHeader.innerHTML = `<th style="width: 200px;">카테고리</th>`;
    state.players.forEach((p, idx) => {
        const activeClass = (state.gameState === 'playing' && idx === state.currentPlayerIdx) ? 'active-player-col' : '';
        tableHeader.innerHTML += `<th class="${activeClass}">${p.name}</th>`;
    });

    const diceValues = state.dice.map(d => d.value);
    const computedCurrent = calculateScores(diceValues);

    CATEGORIES_LIST.forEach(cat => {
        const row = tableBody.querySelector(`tr[data-cat="${cat}"]`);
        if (!row) return;

        const catCell = row.cells[0];
        row.innerHTML = '';
        row.appendChild(catCell);

        state.players.forEach((p, pIdx) => {
            const isCurrentPlayer = (pIdx === state.currentPlayerIdx);
            const scoreVal = p.score[cat];
            
            const cell = document.createElement('td');
            cell.className = 'score-cell';
            
            if (state.gameState === 'playing' && idxIsActive(pIdx)) {
                cell.classList.add('active-player-col');
            }

            if (scoreVal !== null) {
                cell.innerText = scoreVal;
                cell.classList.add('fixed');
                if (isCurrentPlayer) cell.classList.add('active-user-score');
            } else if (state.gameState === 'playing' && isCurrentPlayer && !p.isAI) {
                if (state.rollCount < 3) {
                    cell.innerText = computedCurrent[cat];
                    cell.classList.add('selectable');
                    cell.addEventListener('click', () => recordScore(pIdx, cat));
                } else {
                    cell.innerText = '-';
                    cell.style.opacity = 0.3;
                }
            } else {
                cell.innerText = '-';
                cell.style.opacity = 0.3;
            }

            row.appendChild(cell);
        });
    });

    // Subtotal Row
    const subtotalRow = tableBody.querySelector('tr[data-cat="subtotal"]');
    if (subtotalRow) {
        const catCell = subtotalRow.cells[0];
        subtotalRow.innerHTML = '';
        subtotalRow.appendChild(catCell);
        
        state.players.forEach((p, pIdx) => {
            const sum = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].reduce((a,b) => a + (p.score[b] || 0), 0);
            const cell = document.createElement('td');
            cell.className = 'score-cell';
            if (idxIsActive(pIdx)) cell.classList.add('active-player-col');
            cell.innerHTML = `${sum} <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 400;">/ 63</span>`;
            subtotalRow.appendChild(cell);
        });
    }

    // Bonus Row
    const bonusRow = tableBody.querySelector('tr[data-cat="bonus"]');
    if (bonusRow) {
        const catCell = bonusRow.cells[0];
        bonusRow.innerHTML = '';
        bonusRow.appendChild(catCell);

        state.players.forEach((p, pIdx) => {
            const bonus = p.score['bonus'];
            const cell = document.createElement('td');
            cell.className = 'score-cell bonus-cell';
            if (idxIsActive(pIdx)) cell.classList.add('active-player-col');
            
            if (bonus === 35) {
                cell.innerText = '+35';
                cell.classList.add('qualified');
            } else if (bonus === 0) {
                cell.innerText = '0';
                cell.style.opacity = 0.5;
            } else {
                cell.innerHTML = `<span style="font-size: 0.8rem; opacity: 0.4;">+35</span>`;
            }
            bonusRow.appendChild(cell);
        });
    }

    // Total Row
    const totalRow = tableBody.querySelector('tr[data-cat="total"]');
    if (totalRow) {
        const catCell = totalRow.cells[0];
        totalRow.innerHTML = '';
        totalRow.appendChild(catCell);

        state.players.forEach((p, pIdx) => {
            const sum = CATEGORIES_LIST.reduce((a,b) => a + (p.score[b] || 0), 0) + (p.score['bonus'] || 0);
            const cell = document.createElement('td');
            cell.className = 'score-cell';
            if (idxIsActive(pIdx)) cell.classList.add('active-player-col');
            cell.innerText = `${sum}점`;
            totalRow.appendChild(cell);
        });
    }
}

function idxIsActive(idx) {
    return state.gameState === 'playing' && idx === state.currentPlayerIdx;
}

// ==========================================
// 7. Visual Effects, Game Logs & Toast Popups
// ==========================================

export function addGameLog(message, type = 'system-log') {
    const logsDiv = document.getElementById('log-messages');
    if (!logsDiv) return;
    
    let finalType = type;
    if (message.includes('기록!')) finalType = 'score-log';
    else if (message.includes('턴')) finalType = 'turn-log';

    const log = document.createElement('div');
    log.className = `log-entry ${finalType}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    log.innerHTML = `<span style="color: var(--text-muted); font-size: 0.72rem; margin-right: 6px;">[${time}]</span> ${message}`;
    
    logsDiv.appendChild(log);
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

export function createEmojiReaction(emoji, isSender = false) {
    const reaction = document.createElement('div');
    reaction.className = 'emoji-reaction-float';
    reaction.innerText = emoji;
    
    const x = 100 + Math.random() * (window.innerWidth - 300);
    reaction.style.left = `${x}px`;
    reaction.style.bottom = `150px`;
    
    document.body.appendChild(reaction);
    
    setTimeout(() => {
        reaction.remove();
    }, 2500);
}

export function triggerConfetti(durationSec, velocity) {
    if (!window.confetti) return;

    const end = Date.now() + (durationSec * 1000);

    (function frame() {
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#00f5d4', '#9d4edd', '#ff007f']
        });
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#00f5d4', '#9d4edd', '#ff007f']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

export function triggerYachtParty(message) {
    addGameLog(`🎉 ${message} 🎉`, 'system-log');
    triggerConfetti(3, 45);
    
    const pop = document.createElement('div');
    pop.style.position = 'fixed';
    pop.style.top = '50%';
    pop.style.left = '50%';
    pop.style.transform = 'translate(-50%, -50%) scale(0.5)';
    pop.style.color = 'var(--accent-cyan)';
    pop.style.fontSize = '3.5rem';
    pop.style.fontWeight = '900';
    pop.style.textShadow = '0 0 30px var(--accent-cyan-glow), 0 0 60px rgba(0,245,212,0.8)';
    pop.style.zIndex = '9999';
    pop.style.pointerEvents = 'none';
    pop.style.textAlign = 'center';
    pop.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    pop.innerText = message;
    
    document.body.appendChild(pop);
    
    setTimeout(() => {
        pop.style.transform = 'translate(-50%, -50%) scale(1.1)';
    }, 50);

    setTimeout(() => {
        pop.style.opacity = '0';
        pop.style.transform = 'translate(-50%, -50%) scale(1.5)';
        setTimeout(() => pop.remove(), 500);
    }, 2500);
}

export function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '40px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.background = 'rgba(25, 18, 38, 0.9)';
    toast.style.border = '1px solid var(--primary)';
    toast.style.boxShadow = '0 0 15px var(--primary-glow)';
    toast.style.color = 'var(--text-main)';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '10px';
    toast.style.fontSize = '0.9rem';
    toast.style.zIndex = '99999';
    toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.style.opacity = '0';
    toast.innerText = msg;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// 주사위 트레이 슬롯 HTML 동적 빌더
export function initializeDiceStage() {
    const stage = document.getElementById('dice-tray');
    if (!stage) return;
    
    stage.innerHTML = `
        <div class="keep-zone-guide">
            <span>KEEP ZONE</span>
        </div>
    `;
    
    for (let i = 0; i < 5; i++) {
        const slot = document.createElement('div');
        slot.className = 'dice-slot';
        slot.dataset.index = i;
        slot.innerHTML = `
            <div class="dice-3d" id="dice-3d-${i}">
                <div class="cube" id="cube-${i}">
                    <div class="face front"><span class="pip"></span></div>
                    <div class="face back">
                        <span class="pip"></span><span class="pip"></span>
                        <span class="pip"></span><span class="pip"></span>
                        <span class="pip"></span><span class="pip"></span>
                    </div>
                    <div class="face right">
                        <span class="pip"></span><span class="pip"></span>
                        <span class="pip"></span>
                    </div>
                    <div class="face left">
                        <span class="pip"></span><span class="pip"></span>
                        <span class="pip"></span><span class="pip"></span>
                    </div>
                    <div class="face top">
                        <span class="pip"></span><span class="pip"></span>
                    </div>
                    <div class="face bottom">
                        <span class="pip"></span><span class="pip"></span>
                        <span class="pip"></span><span class="pip"></span>
                        <span class="pip"></span>
                    </div>
                </div>
            </div>
            <div class="dice-2d" id="dice-2d-${i}"></div>
            <span class="keep-badge">KEEP</span>
        `;
        
        slot.addEventListener('click', () => toggleDiceKeep(i));
        stage.appendChild(slot);
    }
}

// 최고 족보 판정 및 네온 세레머니 오버레이 노출
export function checkCombinationCelebrate() {
    const diceValues = state.dice.map(d => d.value);
    const scores = calculateScores(diceValues);

    let comboKey = null;
    let comboName = "";
    let comboSub = "";
    let cssClass = "";

    if (scores.yacht === 50) {
        comboKey = "yacht";
        comboName = "Yacht!!!";
        comboSub = "대박! 모든 주사위의 눈이 일치합니다! (50점 획득 가능)";
        cssClass = "yacht-celebration";
    } else if (scores.lstraight === 30) {
        comboKey = "lstraight";
        comboName = "L. Straight!";
        comboSub = "짜릿한 5개 연속 눈 완성! (30점 획득 가능)";
        cssClass = "lstraight-celebration";
    } else if (scores.sstraight === 15) {
        comboKey = "sstraight";
        comboName = "S. Straight!";
        comboSub = "축하합니다! 4개 연속 눈 완성! (15점 획득 가능)";
        cssClass = "sstraight-celebration";
    } else if (scores.fullhouse > 0) {
        comboKey = "fullhouse";
        comboName = "Full House!";
        comboSub = "트리플과 페어의 결합! 완벽한 하우스 완성!";
        cssClass = "fullhouse-celebration";
    } else if (scores['4ofkind'] > 0) {
        comboKey = "4ofkind";
        comboName = "4 of a Kind!!";
        comboSub = "강력한 동일 눈 4개 완성! (눈의 총합 점수 획득)";
        cssClass = "four-celebration";
    }

    if (comboKey) {
        const overlay = document.getElementById('celebration-overlay');
        const textEl = document.getElementById('celebration-text');
        const subtextEl = document.getElementById('celebration-subtext');

        if (overlay && textEl && subtextEl) {
            textEl.innerText = comboName;
            subtextEl.innerText = comboSub;

            overlay.className = "celebration-overlay active " + cssClass;

            if (comboKey === "yacht") {
                triggerConfetti(3.5, 45); 
                soundEngine.playClap(); 
            } else {
                soundEngine.playBonus();
            }

            if (overlay.celebrationTimeoutId) {
                clearTimeout(overlay.celebrationTimeoutId);
            }

            const clickHandler = () => {
                overlay.classList.remove('active');
                if (overlay.celebrationTimeoutId) {
                    clearTimeout(overlay.celebrationTimeoutId);
                }
                overlay.removeEventListener('click', clickHandler);
            };

            overlay.addEventListener('click', clickHandler);

            overlay.celebrationTimeoutId = setTimeout(() => {
                overlay.classList.remove('active');
                overlay.removeEventListener('click', clickHandler);
            }, 2200);
        }
    }
}
