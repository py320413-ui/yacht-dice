/* ==========================================
   Yacht Dice Core Game Engine - game.js
   ========================================== */

// Global Game State
const state = {
    gameMode: 'solo', // 'solo', 'local', 'online'
    gameState: 'lobby', // 'lobby', 'playing', 'finished'
    aiDifficulty: 'normal', // 'easy', 'normal', 'hard'
    players: [], // Array of player objects: { id, name, score: {}, isAI, isLocal }
    currentPlayerIdx: 0,
    dice: [
        { value: 1, kept: false },
        { value: 1, kept: false },
        { value: 1, kept: false },
        { value: 1, kept: false },
        { value: 1, kept: false }
    ],
    rollCount: 3, // Remaining rolls (3 -> 2 -> 1 -> 0)
    currentRound: 1, // Round 1 to 12
    soundEnabled: true,
    isRolling: false
};

// Yacht Dice Categories
const CATEGORIES = {
    ones: 'ones',
    twos: 'twos',
    threes: 'threes',
    fours: 'fours',
    fives: 'fives',
    sixes: 'sixes',
    choice: 'choice',
    '4ofkind': '4ofkind',
    fullhouse: 'fullhouse',
    sstraight: 'sstraight',
    lstraight: 'lstraight',
    yacht: 'yacht'
};

const CATEGORIES_LIST = Object.keys(CATEGORIES);

// Audio Synthesizer Engine (Web Audio API)
const soundEngine = {
    ctx: null,

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }
    },

    playRoll() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        // Shake sound: quick white noise bursts
        const now = this.ctx.currentTime;
        for (let i = 0; i < 4; i++) {
            const time = now + i * 0.15;
            this.playNoise(time, 0.08, 0.15);
        }
    },

    playDiceHit() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        // Wood-plastic impact sound
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
    },

    playKeep() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        // Metallic ting sound
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    },

    playScoreFixed() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        // Retro chime sound
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        
        notes.forEach((freq, idx) => {
            const time = now + idx * 0.07;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + 0.25);
        });
    },

    playBonus() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [587.33, 739.99, 880.00, 1174.66, 1479.98]; // D5, F#5, A5, D6, F#6

        notes.forEach((freq, idx) => {
            const time = now + idx * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.2, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + 0.4);
        });
    },

    playNoise(time, duration, volume) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 1.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(time);
        noise.stop(time + duration);
    },

    playClap() {
        if (!state.soundEnabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        // 1. 박수소리 합성 (다중 노이즈 펄스 중첩)
        const duration = 2.5; // 박수 갈채 총 지속 시간 (초)
        const clapCount = 90; // 중첩될 펄스 횟수
        
        for (let i = 0; i < clapCount; i++) {
            const progress = i / clapCount;
            // 갈수록 박수의 간격이 살짝 늘어남 (페이드아웃 디케이 변위)
            const randDelay = progress * duration + (Math.random() * 0.1 - 0.05);
            const time = now + Math.max(0, randDelay);
            
            // 펄스 하나당 길이: 0.04초 ~ 0.07초
            const pDuration = 0.04 + Math.random() * 0.03;
            
            // 볼륨 감쇄: 초반에 강하고 갈수록 감쇠되는 엔벨로프
            const volume = (0.22 * (1 - progress)) * (0.6 + Math.random() * 0.4);
            
            this.playNoise(time, pDuration, volume);
        }

        // 2. 승리 선언 찬란한 아르페지오 신스 멜로디 팡파레 믹싱
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00]; // C5, E5, G5, C6, E6, G6, C7
        notes.forEach((freq, idx) => {
            const time = now + idx * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // 배음을 다채롭게 하기 위해 sine과 triangle 교차
            osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, time);
            
            // 미세 글라이드 연출
            osc.frequency.exponentialRampToValueAtTime(freq * 1.015, time + 0.6);

            gain.gain.setValueAtTime(0.2, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.62);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + 0.62);
        });
    }
};

/* ==========================================
   Yacht Dice Combinations & Scoring Logic
   ========================================== */
function calculateScores(diceValues) {
    const counts = {};
    diceValues.forEach(v => counts[v] = (counts[v] || 0) + 1);
    
    const sumAll = diceValues.reduce((a, b) => a + b, 0);
    const sorted = [...diceValues].sort((a, b) => a - b);
    const unique = [...new Set(sorted)];

    const scores = {
        ones: (counts[1] || 0) * 1,
        twos: (counts[2] || 0) * 2,
        threes: (counts[3] || 0) * 3,
        fours: (counts[4] || 0) * 4,
        fives: (counts[5] || 0) * 5,
        sixes: (counts[6] || 0) * 6,
        choice: sumAll,
        '4ofkind': 0,
        fullhouse: 0,
        sstraight: 0,
        lstraight: 0,
        yacht: 0
    };

    // Four of a kind
    for (let val in counts) {
        if (counts[val] >= 4) {
            scores['4ofkind'] = sumAll;
        }
    }

    // Full House
    const hasThree = Object.values(counts).includes(3);
    const hasTwo = Object.values(counts).includes(2);
    const hasFive = Object.values(counts).includes(5); // 5 of a kind counts as full house as well
    if ((hasThree && hasTwo) || hasFive) {
        scores['fullhouse'] = sumAll;
    }

    // Small Straight (4 consecutive dice)
    // S.Straight candidates: [1,2,3,4], [2,3,4,5], [3,4,5,6]
    const uStr = unique.join('');
    if (uStr.includes('1234') || uStr.includes('2345') || uStr.includes('3456')) {
        scores['sstraight'] = 15;
    }

    // Large Straight (5 consecutive dice)
    // L.Straight candidates: [1,2,3,4,5], [2,3,4,5,6]
    if (uStr === '12345' || uStr === '23456') {
        scores['lstraight'] = 30;
    }

    // Yacht (5 of a kind)
    if (Object.values(counts).includes(5)) {
        scores['yacht'] = 50;
    }

    return scores;
}

/* ==========================================
   3D 실린더 컵 Z-stacking 다중 적층 레이어 동적 생성
   ========================================== */
function createCup3DLayers() {
    const wrapper = document.getElementById('cup-layers-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const layerCount = 150; // 150개 초정밀 Z-적층
    for (let i = 0; i < layerCount; i++) {
        const layer = document.createElement('div');
        layer.className = 'cup-layer';
        
        // Z축 안쪽 방향으로 1.1px 단위 적층
        layer.style.transform = `translateZ(-${i * 1.1}px)`;
        
        // 옆면을 단순하게 단색으로 표현
        layer.style.background = '#1b1330';
        
        // 맨 하단 (150번째 레이어) 마감에 옥색 네온 엣지 포인트 및 백라이트 글로우 처리
        if (i === layerCount - 1) {
            layer.style.border = '3.5px solid #00f5d4';
            layer.style.boxShadow = '0 0 35px #00f5d4, inset 0 0 15px #00f5d4';
        }
        
        wrapper.appendChild(layer);
    }
}

/* ==========================================
   UI Event Handlers & View Rendering
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    setupLobbyEvents();
    setupGameEvents();
    initializeDiceStage();
    createCup3DLayers(); // 3D 원통 Z-stacking 조립
});

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

    // Start Game Trigger
    document.getElementById('btn-start-game').addEventListener('click', () => {
        soundEngine.init();
        if (state.gameMode === 'solo') {
            initSoloMode();
        } else if (state.gameMode === 'local') {
            initLocalMode();
        } else if (state.gameMode === 'online') {
            // Online mode initialized via network.js
            showToast("방 만들기 혹은 참여를 선택해주세요!");
        }
    });
}

// ==========================================
// 컵 드래그 탑뷰 전환 및 컵 내부 미니 주사위 2D 관성 물리 엔진 (dragPhysics)
// ==========================================
const dragPhysics = {
    running: false,
    dice: [], // Array of { id, x, y, vx, vy, rotX, rotY, rotZ, vRotX, vRotY, vRotZ, el, cubeEl, radius, mass }
    animationId: null,
    centerX: 62,
    centerY: 62,
    maxRadius: 51, // 62 (컵 내부 반경) - 11 (미니 주사위 반지름 22px / 2)
    friction: 0.96, // 내부 마찰계수
    bounce: 0.6, // 컵 내벽 탄성계수
    miniDiceBounce: 0.65, // 주사위 상호 간 탄성계수
    lastSoundTime: 0,

    init() {
        this.dice = [];
        const slots = 5;
        for (let i = 0; i < slots; i++) {
            const el = document.getElementById(`mini-dice-${i}`);
            const cubeEl = document.getElementById(`mini-cube-${i}`);
            
            // 초기 위치: 컵 중심 (62, 62) 근처에 고르게 퍼뜨려 배치
            const angle = (i / slots) * Math.PI * 2;
            const dist = 15 + Math.random() * 15;
            const x = this.centerX + Math.cos(angle) * dist;
            const y = this.centerY + Math.sin(angle) * dist;

            this.dice.push({
                id: i,
                x: x,
                y: y,
                vx: 0,
                vy: 0,
                rotX: Math.random() * 360,
                rotY: Math.random() * 360,
                rotZ: Math.random() * 360,
                vRotX: 0,
                vRotY: 0,
                vRotZ: 0,
                radius: 11,
                mass: 1.0,
                el: el,
                cubeEl: cubeEl
            });
        }
    },

    start() {
        this.init();
        if (this.running) return;
        this.running = true;

        const loop = () => {
            if (!this.running) return;
            this.update();
            this.render();
            this.animationId = requestAnimationFrame(loop);
        };
        this.animationId = requestAnimationFrame(loop);
    },

    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    },

    applyInertia(dx, dy) {
        // 드래그 속도에 비례해 반대 방향 관성 인가
        const scale = -0.45;
        this.dice.forEach(d => {
            d.vx += dx * scale + (Math.random() - 0.5) * 1.5;
            d.vy += dy * scale + (Math.random() - 0.5) * 1.5;
            
            // 속도에 맞추어 3D 회전토크 부여
            d.vRotX += dy * 1.5;
            d.vRotY += dx * 1.5;
            d.vRotZ += (dx - dy) * 0.8;
        });
    },

    update() {
        const dList = this.dice;

        // 1. 개별 주사위 이동 및 컵 원형 내벽 충돌 처리
        dList.forEach(d => {
            d.vx *= this.friction;
            d.vy *= this.friction;
            d.vRotX *= this.friction;
            d.vRotY *= this.friction;
            d.vRotZ *= this.friction;

            d.x += d.vx;
            d.y += d.vy;

            d.rotX += d.vRotX;
            d.rotY += d.vRotY;
            d.rotZ += d.vRotZ;

            const dx = d.x - this.centerX;
            const dy = d.y - this.centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > this.maxRadius) {
                const nx = dx / (dist || 1);
                const ny = dy / (dist || 1);

                d.x = this.centerX + nx * this.maxRadius;
                d.y = this.centerY + ny * this.maxRadius;

                const vn = d.vx * nx + d.vy * ny;
                if (vn > 0) {
                    d.vx -= (1 + this.bounce) * vn * nx;
                    d.vy -= (1 + this.bounce) * vn * ny;
                    
                    d.vRotZ += vn * 1.2;
                    d.vRotX += vn * 0.8;

                    this.playHitSound();
                }
            }
        });

        // 2. 주사위 상호 간의 2D 탄성 충돌 연산
        for (let iter = 0; iter < 5; iter++) {
            this.resolveCollisions();
        }
    },

    resolveCollisions() {
        const dList = this.dice;
        const len = dList.length;

        for (let i = 0; i < len; i++) {
            for (let j = i + 1; j < len; j++) {
                const d1 = dList[i];
                const d2 = dList[j];

                const dx = d2.x - d1.x;
                const dy = d2.y - d1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = d1.radius + d2.radius;

                if (dist < minDist) {
                    const overlap = minDist - dist;
                    const nx = dx / (dist || 1);
                    const ny = dy / (dist || 1);

                    d1.x -= nx * overlap * 0.51;
                    d1.y -= ny * overlap * 0.51;
                    d2.x += nx * overlap * 0.51;
                    d2.y += ny * overlap * 0.51;

                    // 컵 안을 이탈하지 않도록 샌드위치 방지
                    [d1, d2].forEach(d => {
                        const wallDx = d.x - this.centerX;
                        const wallDy = d.y - this.centerY;
                        const wallDist = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
                        if (wallDist > this.maxRadius) {
                            const wnx = wallDx / (wallDist || 1);
                            const wny = wallDy / (wallDist || 1);
                            d.x = this.centerX + wnx * this.maxRadius;
                            d.y = this.centerY + wny * this.maxRadius;
                        }
                    });

                    const rvx = d1.vx - d2.vx;
                    const rvy = d1.vy - d2.vy;
                    const vn = rvx * nx + rvy * ny;

                    if (vn > 0) {
                        const impulse = (1 + this.miniDiceBounce) * vn / 2;
                        d1.vx -= nx * impulse;
                        d1.vy -= ny * impulse;
                        d2.vx += nx * impulse;
                        d2.vy += ny * impulse;

                        const tx = -ny;
                        const ty = nx;
                        const vt = rvx * tx + rvy * ty;
                        d1.vRotZ += vt * 0.25;
                        d2.vRotZ -= vt * 0.25;

                        this.playHitSound();
                    }
                }
            }
        }
    },

    render() {
        this.dice.forEach(d => {
            if (!d.el || !d.cubeEl) return;

            d.el.style.left = `${d.x}px`;
            d.el.style.top = `${d.y}px`;

            d.cubeEl.style.transform = `rotateX(${d.rotX}deg) rotateY(${d.rotY}deg) rotateZ(${d.rotZ}deg)`;
        });
    },

    playHitSound() {
        const now = Date.now();
        if (now - this.lastSoundTime > 70) {
            playShakeTickSound();
            this.lastSoundTime = now;
        }
    }
};

// ==========================================
// Drag & Shake Gesture State Machine
// ==========================================
const gestureState = {
    isDragging: false,
    lastX: 0,
    lastY: 0,
    shakePower: 0,
    lastSoundTime: 0,
    velocityX: 0,
    velocityY: 0,
    totalDistance: 0,
    justReleased: false,
    cupOrigCenterX: 0,
    cupOrigCenterY: 0,
    grabOffsetX: 0,
    grabOffsetY: 0,
    boardRect: null,
    cupWidth: 140, // 110 -> 140px로 탑뷰 규격 매칭
    cupHeight: 140, // 140px 탑뷰
    translateX: 0,
    translateY: 0,
    smoothVx: 0,
    smoothVy: 0
};

function setupShakeGesture() {
    const cup = document.getElementById('dice-cup');
    const board = document.querySelector('.dice-board');
    if (!cup || !board) return;

    // ── mousedown / touchstart: 컵 잡기 ──
    const onDown = (e) => {
        if (state.isRolling) return;
        if (state.rollCount === 0) return;
        const active = state.players[state.currentPlayerIdx];
        if (active && active.isAI) return;
        if (state.gameMode === 'online' && active && !active.isLocal) return;

        const pt = e.touches ? e.touches[0] : e;
        const cupRect = cup.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();

        gestureState.cupOrigCenterX = cupRect.left + cupRect.width / 2;
        gestureState.cupOrigCenterY = cupRect.top + cupRect.height / 2;
        gestureState.grabOffsetX = pt.clientX - gestureState.cupOrigCenterX;
        gestureState.grabOffsetY = pt.clientY - gestureState.cupOrigCenterY;

        gestureState.boardRect = boardRect;
        gestureState.cupWidth  = cupRect.width;
        gestureState.cupHeight = cupRect.height;
        gestureState.translateX = 0;
        gestureState.translateY = 0;

        gestureState.isDragging = true;
        gestureState.lastX = pt.clientX;
        gestureState.lastY = pt.clientY;
        gestureState.shakePower = 0;
        gestureState.totalDistance = 0;
        gestureState.velocityX = 0;
        gestureState.velocityY = 0;
        gestureState.smoothVx = 0;
        gestureState.smoothVy = 0;
        gestureState.justReleased = false;

        cup.style.zIndex = '60';
        cup.style.transition = 'none';
        cup.classList.add('pressed');
        cup.classList.remove('max-power', 'shaking', 'pouring');

        cup.style.left = '0px';
        cup.style.top = '0px';

        // [탑뷰 개편] rotateX 기울기를 완전 폐지하고, 둥근 컵이 위로 붕 떠오르는 스케일(1.15)과 섀도우만 적용!
        cup.style.transform = `perspective(900px) translateZ(60px) scale(1.15)`;
        cup.style.filter = 'drop-shadow(0 25px 35px rgba(0, 0, 0, 0.65))';

        // 컵 내부 전용 미니 주사위 2D 물리 엔진 가동
        dragPhysics.start();

        // 파워 게이지 노출
        const gauge = document.getElementById('shake-power-wrap');
        const bar   = document.getElementById('shake-power-bar');
        if (gauge) gauge.classList.add('visible');
        if (bar)   bar.style.width = '0%';

        soundEngine.init();
        e.preventDefault();
    };

    // ── mousemove / touchmove: 컵을 보드 내에서 드래그하며 흔들기 ──
    const onMove = (e) => {
        if (!gestureState.isDragging) return;
        const pt = e.touches ? e.touches[0] : e;

        let targetCX = pt.clientX - gestureState.grabOffsetX;
        let targetCY = pt.clientY - gestureState.grabOffsetY;

        const br = gestureState.boardRect;
        const hw = gestureState.cupWidth  / 2;
        const hh = gestureState.cupHeight / 2;
        targetCX = Math.max(br.left + hw, Math.min(targetCX, br.right  - hw));
        targetCY = Math.max(br.top  + hh, Math.min(targetCY, br.bottom - hh));

        gestureState.translateX = targetCX - gestureState.cupOrigCenterX;
        gestureState.translateY = targetCY - gestureState.cupOrigCenterY;

        const dx = pt.clientX - gestureState.lastX;
        const dy = pt.clientY - gestureState.lastY;
        const speed = Math.sqrt(dx * dx + dy * dy);

        gestureState.velocityX = dx;
        gestureState.velocityY = dy;
        gestureState.totalDistance += speed;
        gestureState.lastX = pt.clientX;
        gestureState.lastY = pt.clientY;

        gestureState.smoothVx = gestureState.smoothVx * 0.75 + dx * 0.25;
        gestureState.smoothVy = gestureState.smoothVy * 0.75 + dy * 0.25;

        // 파워 가산
        const powerGain = Math.min(speed * 0.95, 5);
        gestureState.shakePower = Math.min(gestureState.shakePower + powerGain, 100);

        // [탑뷰 흔들림 디테일] 찌그러짐을 방지하기 위해 rotateX/rotateY 회전을 완전 배제하고,
        // 오직 마우스 델타 속도에 반응하는 미세한 평면 회전(rotateZ) 및 translate 진동만 반영
        const tiltZ = Math.max(-6, Math.min(6, gestureState.smoothVx * 0.35));
        const liftZ = 60 + (gestureState.shakePower * 0.12);
        const sc = 1.15 + (gestureState.shakePower / 100) * 0.05;

        // 파워 100% 도달 시 시각 진동
        let vibX = 0, vibY = 0;
        if (gestureState.shakePower >= 100) {
            vibX = (Math.random() - 0.5) * 4;
            vibY = (Math.random() - 0.5) * 4;
            cup.style.filter = 'brightness(1.3) drop-shadow(0 0 20px rgba(0, 245, 212, 0.85))';
        } else {
            cup.style.filter = 'drop-shadow(0 25px 35px rgba(0, 0, 0, 0.65))';
        }

        // 위치 이동은 left와 top 스타일로 처리하여 perspective 소실점 왜곡을 원천 방지!
        cup.style.left = `${gestureState.translateX + vibX}px`;
        cup.style.top = `${gestureState.translateY + vibY}px`;
        // 둥근 정원 탑뷰를 유지한 채 평면 회전(rotate) 및 로컬 Z축 띄우기만 transform으로 처리
        cup.style.transform = `perspective(900px) translateZ(${liftZ}px) rotate(${tiltZ}deg) scale(${sc})`;

        // 컵 내부 미니 주사위 2D 물리 엔진에 마우스 관성 속도 주입
        dragPhysics.applyInertia(dx, dy);

        // 파워 게이지 바 갱신
        const bar = document.getElementById('shake-power-bar');
        if (bar) {
            const pct = gestureState.shakePower;
            bar.style.width = `${pct}%`;
            const r = Math.round(255 * (pct / 100));
            const g = Math.round(245 * (1 - pct / 100));
            bar.style.boxShadow = `0 0 ${6 + pct * 0.12}px rgba(${r},${g},212,0.7)`;
        }

        e.preventDefault();
    };

    // ── mouseup / touchend: 컵 놓기 ──
    const onUp = (e) => {
        if (!gestureState.isDragging) return;
        gestureState.isDragging = false;
        gestureState.justReleased = true;

        cup.classList.remove('pressed');
        cup.style.filter = '';

        // 미니 주사위 물리 시뮬레이션 즉시 중지
        dragPhysics.stop();

        // 드래그 종료 시점의 변위 박제
        gestureState.releaseX = gestureState.translateX;
        gestureState.releaseY = gestureState.translateY;

        // [탑뷰 개편] 컵을 즉시 원래 위치로 복귀시키지 않고, 드래그를 놓은 그 시점의 위치 상태를 일시 유지
        // 쏟는(pouring) 연출은 이 박제된 좌표를 기반으로 동적 롤링 시점에 진행됩니다.
        cup.style.transition = 'transform 0.15s ease';

        const gauge = document.getElementById('shake-power-wrap');
        const bar   = document.getElementById('shake-power-bar');
        setTimeout(() => {
            if (gauge) gauge.classList.remove('visible');
            if (bar)   bar.style.width = '0%';
        }, 540);

        // 최종 파워를 전달하여 물리적 던지기 시뮬레이션 개시 (드래그 릴리즈)
        const power = Math.max(gestureState.shakePower, 5);
        rollDiceWithPower(power);

        setTimeout(() => { gestureState.justReleased = false; }, 200);
    };

    cup.addEventListener('mousedown',  onDown, { passive: false });
    cup.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchend',  onUp);
}

function playShakeTickSound() {
    soundEngine.init();
    if (!soundEngine.ctx) return;
    const now = soundEngine.ctx.currentTime;
    soundEngine.playNoise(now, 0.045, 0.07);
}

// Setup Game Screen Action Buttons
function setupGameEvents() {
    document.getElementById('btn-roll').addEventListener('click', rollDice);
    
    // 드래그&흔들기 제스처 시스템 초기화 (컵 클릭 대신)
    setupShakeGesture();
    
    document.getElementById('btn-reset-turn').addEventListener('click', () => {
        if (state.isRolling) return;
        // reset current dice holds unless already locked
        if (state.rollCount === 3) return; // Haven't rolled yet
        state.dice.forEach(d => d.kept = false);
        renderDice();
    });

    // Tab buttons for Chat & Log switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Chat Actions
    document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // Emoji reaction floating trigger
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
}

/* ==========================================
   2D Elastic Collision Physics Engine (JS Math)
   ========================================== */
function lerpAngle(current, target, t) {
    let diff = (target - current) % 360;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    return current + diff * t;
}

// 임의의 3D 회전각을 -180도 ~ 180도 범위로 압축 정규화하는 헬퍼 함수
function normalizeAngle180(angle) {
    let a = angle % 360;
    if (a < -180) a += 360;
    if (a > 180) a -= 360;
    return a;
}

// 현재의 누적 회전각과 가장 가까운 목표 등가 각도를 계산하는 정규화 함수 (역회전 튐 버그 완벽 방지)
function getClosestEquivalentAngle(current, target) {
    let diff = (target - current) % 360;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    return current + diff;
}

// 3D 기하학 기반 실시간 윗면 눈금 계산 함수 (탑뷰 시점 기준 Z축 법선 벡터 투영)
function getVisibleFace(rx, ry) {
    const radX = rx * Math.PI / 180;
    const radY = ry * Math.PI / 180;

    const cx = Math.cos(radX);
    const sx = Math.sin(radX);
    const cy = Math.cos(radY);
    const sy = Math.sin(radY);

    // 각 면의 Z 성분값 계산 (CSS preserve-3d 회전 변환 행렬 기반)
    const z1 = cx * cy;
    const z6 = -z1;
    const z3 = cx * sy;
    const z4 = -z3;
    const z2 = sx;
    const z5 = -z2;

    const faces = [
        { val: 1, z: z1 },
        { val: 6, z: z6 },
        { val: 3, z: z3 },
        { val: 4, z: z4 },
        { val: 2, z: z2 },
        { val: 5, z: z5 }
    ];

    let maxFace = faces[0];
    for (let i = 1; i < faces.length; i++) {
        if (faces[i].z > maxFace.z) {
            maxFace = faces[i];
        }
    }
    return maxFace.val;
}

const physicsEngine = {
    running: false,
    dicePhysics: [], // Array of { id, body: Matter.Body, isKept }
    animationId: null,
    trayWidth: 960,
    trayHeight: 960,
    keepBoundaryY: 672, // Y축 70% 선이 킵 가이드라인 경계
    radius: 52.5, // 주사위 반지름 (시각적 크기는 105px)
    
    // Matter.js 관련 인스턴스 보관용 속성
    engine: null,
    world: null,
    
    // 튜닝 파라미터
    bounce: 0.70,       // 벽면 탄성계수
    diceBounce: 0.75,   // 주사위끼리 탄성계수
    minVelocity: 0.12,  // 정지 판단 임계 속도
    lastHitSoundTime: 0,

    init(keptStates, shakePower = 50, launchOrigin = null) {
        // 1. 기존 Matter.js 세계 초기화 및 정리
        if (this.engine) {
            Matter.World.clear(this.world);
            Matter.Engine.clear(this.engine);
        }
        
        // 2. 엔진 인스턴스 생성 (탑뷰이므로 중력은 y:0 으로 제거)
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 0 }
        });
        this.world = this.engine.world;
        this.dicePhysics = [];

        // 3. 충돌 효과음 재생 바인딩 (주사위 간 충돌 또는 벽 충돌 시 찰진 사운드 재생)
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                const bA = pair.bodyA;
                const bB = pair.bodyB;
                const rvx = bA.velocity.x - bB.velocity.x;
                const rvy = bA.velocity.y - bB.velocity.y;
                const speedSq = rvx * rvx + rvy * rvy;
                if (speedSq > 1.2) {
                    this.playHitSound();
                }
            });
        });

        // 4. 벽 설치 (트레이 사방 장벽)
        const wallThickness = 120;
        const wallOptions = { 
            isStatic: true, 
            restitution: this.bounce, // 벽 탄성
            friction: 0.2 
        };
        
        // 왼쪽 벽
        const leftWall = Matter.Bodies.rectangle(
            0 - wallThickness / 2, 
            this.keepBoundaryY / 2, 
            wallThickness, 
            this.keepBoundaryY, 
            wallOptions
        );
        // 오른쪽 벽
        const rightWall = Matter.Bodies.rectangle(
            this.trayWidth + wallThickness / 2, 
            this.keepBoundaryY / 2, 
            wallThickness, 
            this.keepBoundaryY, 
            wallOptions
        );
        // 위쪽 벽
        const topWall = Matter.Bodies.rectangle(
            this.trayWidth / 2, 
            0 - wallThickness / 2, 
            this.trayWidth, 
            wallThickness, 
            wallOptions
        );
        // 아래쪽 벽 (바닥 - 킵존 경계 672px)
        const bottomWall = Matter.Bodies.rectangle(
            this.trayWidth / 2, 
            this.keepBoundaryY + wallThickness / 2, 
            this.trayWidth, 
            wallThickness, 
            wallOptions
        );

        Matter.World.add(this.world, [leftWall, rightWall, topWall, bottomWall]);

        // 5. 5개 주사위 바디 생성 및 월드 추가
        const powerScale = 0.6 + (shakePower / 100) * 1.35;
        const diceSize = 105;

        for (let i = 0; i < 5; i++) {
            const isKept = keptStates[i];
            if (isKept) {
                // 킵된 주사위는 물리에서 제외하고 호환 더미 객체만 삽입
                this.dicePhysics.push({
                    id: i,
                    body: null,
                    isKept: true
                });
            } else {
                let initX, initY, baseVx, baseVy;
                
                if (launchOrigin) {
                    const angleOffset = (i / 5) * Math.PI * 2;
                    initX = launchOrigin.x + Math.cos(angleOffset) * 18;
                    initY = launchOrigin.y + Math.sin(angleOffset) * 18;
                    
                    // Clamp
                    initX = Math.max(this.radius + 15, Math.min(initX, this.trayWidth - this.radius - 15));
                    initY = Math.max(this.radius + 15, Math.min(initY, this.keepBoundaryY - this.radius - 15));
                    
                    const targetX = 480;
                    const targetY = 330;
                    const shootAngle = Math.atan2(targetY - initY, targetX - initX) + (Math.random() * 0.3 - 0.15);
                    const speed = (28 + Math.random() * 12) * powerScale;
                    
                    baseVx = Math.cos(shootAngle) * speed;
                    baseVy = Math.sin(shootAngle) * speed;
                } else {
                    initX = 900;
                    initY = 80 + (i * 125);
                    baseVx = -(32 + Math.random() * 15) * powerScale;
                    baseVy = ((Math.random() * 26) - 13) * powerScale;
                }

                // 주사위 물리 바디 생성 (완벽한 사각형 105px x 105px 기하학 + 모서리 chamfer 적용)
                const bodyOptions = {
                    density: 0.002,
                    restitution: this.diceBounce, // 주사위끼리 탄성계수
                    friction: 0.3,              // 접촉면 마찰계수
                    frictionAir: 0.05,          // 공기저항 감속 효과
                    chamfer: { radius: 12 },
                    render: { visible: false }
                };
                const body = Matter.Bodies.rectangle(initX, initY, diceSize, diceSize, bodyOptions);
                Matter.Body.setAngle(body, Math.random() * Math.PI * 2);
                
                // 초기 속도 및 각속도 적용 (라디안 단위 변환 필수)
                Matter.Body.setVelocity(body, { x: baseVx, y: baseVy });
                Matter.Body.setAngularVelocity(body, (Math.random() > 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.35));

                // 3D 회전 각도 및 텀블링 속도를 Matter.js 바디의 plugin 객체에 바인딩
                body.plugin = {
                    isDice: true,
                    rx: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
                    ry: [0, 90, 180, 270][Math.floor(Math.random() * 4)],
                    rxVel: (Math.random() - 0.5) * 85 * powerScale,
                    ryVel: (Math.random() - 0.5) * 85 * powerScale,
                    isSettled: false,
                    targetRx: null,
                    targetRy: null
                };

                this.dicePhysics.push({
                    id: i,
                    body: body,
                    isKept: false
                });
                
                Matter.World.add(this.world, body);
            }
        }
    },

    start(onComplete, forcedValues = null) {
        if (this.running) return;
        this.running = true;
        
        const loop = () => {
            if (!this.running) return;
            this.update();

            let allStopped = true;
            let allSettled = true;

            this.dicePhysics.forEach((d, i) => {
                if (d.isKept || !d.body) return;

                const body = d.body;
                const p = body.plugin;

                // 속도 및 물리 회전력 기반 움직임 여부(비행 텀블링 단계 여부) 선제 판정
                const phyMoving = body.speed > this.minVelocity || Math.abs(body.angularSpeed) > 0.06;
                const rotMoving = Math.abs(p.rxVel) > 0.4 || Math.abs(p.ryVel) > 0.4;
                const isMoving  = phyMoving || rotMoving;

                // 3D 회전각 실시간 연속(Continuous) 누적
                p.rx += p.rxVel;
                p.ry += p.ryVel;

                // [하이브리드 정렬 복원 토크 융합 물리 모델]
                // 주사위가 텀블링할 때는 자유 회전하며 3D 입체감을 보여주다가,
                // 물리 속도가 줄어드는 감속 구간(body.speed < 4.0)에 진입하면
                // 윗면 점수 판정을 미리 Lock하고 그 윗면 정각을 향해 가상의 3D 바닥 안착 복원 토크(Torsional Spring)를 인가합니다.
                // 이를 통해 주사위가 멈출 때 억지로 휙 돌며 보간되는 것이 아니라,
                // 현실처럼 구르는 도중 자연스럽게 면 방향으로 평평하게 유도되며 턱! 멈추게 됩니다.
                if (body.speed < 4.0) {
                    if (p.targetRx === undefined || p.targetRx === null) {
                        if (forcedValues && forcedValues[i]) {
                            state.dice[i].value = forcedValues[i];
                        } else {
                            state.dice[i].value = getVisibleFace(p.rx, p.ry);
                        }
                        
                        const targetRot = DICE_ROTATIONS[state.dice[i].value] || { x: 0, y: 0 };
                        p.targetRx = getClosestEquivalentAngle(p.rx, targetRot.x);
                        p.targetRy = getClosestEquivalentAngle(p.ry, targetRot.y);
                    }

                    // 복원 토크(Spring force) 및 감쇄 마찰 융합
                    const torqueX = (p.targetRx - p.rx) * 0.16;
                    const torqueY = (p.targetRy - p.ry) * 0.16;
                    
                    p.rxVel = p.rxVel * 0.80 + torqueX * 0.20;
                    p.ryVel = p.ryVel * 0.80 + torqueY * 0.20;
                } else {
                    // 고속 비행 텀블링 구역: 자유 감속 회전 및 안착 타겟 초기화
                    p.rxVel *= 0.955;
                    p.ryVel *= 0.955;
                    p.targetRx = null;
                    p.targetRy = null;
                }

                // [정지 완료 판정]
                // 1) 2D 물리 바디가 완전히 정지 (speed < minVelocity)
                // 2) 3D 큐브 각도가 복원 토크에 의해 타겟 안착 각도에 0.5도 이내로 조밀하게 정착(Settled)함
                if (!isMoving) {
                    if (p.targetRx !== null && p.targetRx !== undefined) {
                        const diffX = Math.abs(p.targetRx - p.rx);
                        const diffY = Math.abs(p.targetRy - p.ry);
                        if (diffX < 0.5 && diffY < 0.5) {
                            p.rx = p.targetRx;
                            p.ry = p.targetRy;
                            p.rxVel = 0;
                            p.ryVel = 0;
                            p.isSettled = true;
                        } else {
                            p.isSettled = false;
                        }
                    } else {
                        p.isSettled = false;
                    }
                } else {
                    allStopped = false;
                    p.isSettled = false;
                }

                if (!p.isSettled) {
                    allSettled = false;
                }
            });

            this.render();

            if (allStopped && allSettled) {
                // 최종 정지 강제 정렬 동기화
                this.render(true);
                this.stop();
                
                if (onComplete) onComplete();
            } else {
                this.animationId = requestAnimationFrame(loop);
            }
        };

        this.animationId = requestAnimationFrame(loop);
    },

    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    },

    update() {
        if (!this.engine) return;
        // Matter.js 엔진 프레임 업데이트 (60fps 고정 타임스텝)
        Matter.Engine.update(this.engine, 1000 / 60);

        // 추가 벽면 관통 방어 안전 장치
        this.dicePhysics.forEach(d => {
            if (d.isKept || !d.body) return;
            const b = d.body;
            let corrected = false;
            let nx = b.position.x;
            let ny = b.position.y;

            if (nx < this.radius) { nx = this.radius; corrected = true; }
            if (nx > this.trayWidth - this.radius) { nx = this.trayWidth - this.radius; corrected = true; }
            if (ny < this.radius) { ny = this.radius; corrected = true; }
            const bottomLimit = this.keepBoundaryY - this.radius;
            if (ny > bottomLimit) { ny = bottomLimit; corrected = true; }

            if (corrected) {
                Matter.Body.setPosition(b, { x: nx, y: ny });
                let vx = b.velocity.x;
                let vy = b.velocity.y;
                if (nx === this.radius || nx === this.trayWidth - this.radius) vx = -vx * this.bounce;
                if (ny === this.radius || ny === bottomLimit) vy = -vy * this.bounce;
                Matter.Body.setVelocity(b, { x: vx, y: vy });
            }
        });
    },

    render(isFinal = false) {
        const slots = document.querySelectorAll('.dice-slot');
        this.dicePhysics.forEach((d, i) => {
            if (d.isKept || !d.body) return;
            const slot = slots[i];
            if (!slot) return;

            slot.style.display = 'flex';
            slot.style.opacity = '1';
            slot.style.pointerEvents = 'auto';

            const pos = d.body.position;
            // Z축 평면 회전각도 매 프레임 normalizeAngle180을 적용하면 경계선에서 툭 튀는 현상이 생기므로
            // 물리 렌더 프레임 동안에는 누적 각도를 그대로 부드럽게 투영시킵니다.
            const angleDeg = d.body.angle * (180 / Math.PI);
            const p = d.body.plugin;

            // DOM 2D 위치 및 회전각 투영
            slot.style.left = `${pos.x}px`;
            slot.style.top = `${pos.y}px`;
            slot.style.transform = `rotateZ(${angleDeg.toFixed(2)}deg)`;

            // cube DOM 3D 회전각 투영
            const cube = document.getElementById(`cube-${i}`);
            if (cube) {
                if (isFinal && p.targetRx !== null && p.targetRx !== undefined) {
                    p.rx = p.targetRx;
                    p.ry = p.targetRy;
                }
                cube.style.transform = `rotateX(${p.rx.toFixed(1)}deg) rotateY(${p.ry.toFixed(1)}deg)`;
            }

            // 움직이는 주사위 그림자 강조 디테일
            const isMoving = !p.isSettled;
            const dice3d = slot.querySelector('.dice-3d');
            if (dice3d) {
                dice3d.style.filter = isMoving
                    ? 'drop-shadow(6px 12px 16px rgba(0,0,0,.68))'
                    : 'drop-shadow(2px 4px 6px rgba(0,0,0,.45))';
            }
        });
    },

    playHitSound() {
        const now = Date.now();
        if (now - this.lastHitSoundTime > 85) {
            soundEngine.playDiceHit();
            this.lastHitSoundTime = now;
        }
    }
};

// 주사위 트레이 보드판 내의 랜덤 좌표(px 단위)를 생성하는 헬퍼 함수 (물리 엔진 미사용 또는 리셋 시 백업용)
function generateDiceTrayCoordinates(index) {
    // 960px * 960px 트레이, 킵존 가이드라인 높이 288px (Y 경계선 672px)
    // 주사위 크기 105px (반지름 52.5px). X 범위: 70px ~ 850px 가로 균등 분산
    const randomLeft = 70 + (index * 175) + Math.floor(Math.random() * 30); 
    // Y 범위: 70px ~ 520px 사이 분산 (킵존 경계 672px를 안전하게 상회)
    const randomTop = 70 + Math.floor(Math.random() * 450); 
    const randomAngle = Math.floor(Math.random() * 70) - 35; // Z축 회전: -35도 ~ 35도
    return { 
        randomTop: `${randomTop}px`, 
        randomLeft: `${randomLeft}px`, 
        randomAngle 
    };
}

// Generate the 3D Dice slots DOM
function initializeDiceStage() {
    const stage = document.getElementById('dice-tray');
    if (!stage) return;
    
    // keep-zone-guide 마크업은 보존하면서 주사위 슬롯들 배치
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
            <div class="dice-3d">
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
            <span class="keep-badge">KEEP</span>
        `;
        
        slot.addEventListener('click', () => toggleDiceKeep(i));
        stage.appendChild(slot);
    }
}

/* ==========================================
   Core Modes Initializations
   ========================================== */
function initSoloMode() {
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

function initLocalMode() {
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

function createEmptyScore() {
    const s = {};
    CATEGORIES_LIST.forEach(cat => s[cat] = null);
    return s;
}

function getDifficultyLabel(diff) {
    if (diff === 'easy') return '쉬움';
    if (diff === 'hard') return '어려움';
    return '보통';
}

function hideLobbyShowGame() {
    document.getElementById('lobby-view').style.display = 'none';
    document.getElementById('game-view').style.display = 'flex';
    // Hide or show online side controls
    const roomInfo = document.getElementById('online-room-info');
    if (roomInfo) {
        roomInfo.style.display = (state.gameMode === 'online') ? 'flex' : 'none';
    }
    
    const chatBtn = document.getElementById('tab-chat-btn');
    if (chatBtn) {
        chatBtn.style.display = (state.gameMode === 'online') ? 'block' : 'none';
    }
    
    if (state.gameMode !== 'online') {
        // Force Game Logs tab active if exist
        const logTab = document.querySelector('.tab-btn[data-tab="tab-logs"]');
        if (logTab) logTab.click();
    }
}

function exitToLobby() {
    if (state.gameMode === 'online' && window.networkController) {
        window.networkController.destroy();
    }
    state.gameState = 'lobby';
    document.getElementById('game-view').style.display = 'none';
    document.getElementById('lobby-view').style.display = 'block';
}

function confirmExitToLobby() {
    if (confirm("정말로 로비로 나가시겠습니까? 현재 게임 진행 상황이 모두 소실됩니다.")) {
        exitToLobby();
    }
}

/* ==========================================
   Dice Manipulation & Animation Rendering
   ========================================== */
function toggleDiceKeep(index) {
    if (state.isRolling || state.rollCount === 3) return; // Cannot keep before rolling at all
    
    // AI turn or not active player's turn in online mode -> block interaction
    const activePlayer = state.players[state.currentPlayerIdx];
    if (activePlayer.isAI) return;
    if (state.gameMode === 'online' && !activePlayer.isLocal) return;

    state.dice[index].kept = !state.dice[index].kept;
    soundEngine.playKeep();
    
    // [중앙 정렬 쇼케이스 동적 재계산]
    // 킵을 켜고 끌 때마다 트레이 안의 활성 주사위들을 수평 중앙에 맞추어 예쁘게 자동 정렬시킵니다!
    arrangeActiveDiceInLine();
    
    renderDice();
    
    // Broadcast keep status in online multiplayer
    if (state.gameMode === 'online' && window.networkController) {
        window.networkController.sendKeepState(state.dice.map(d => d.kept));
    }
}

// 3D rotation vectors corresponding to each dice face
const DICE_ROTATIONS = {
    1: { x: 0, y: 0 },         // Front (1)
    2: { x: -90, y: 0 },       // Top (2)
    3: { x: 0, y: -90 },       // Right (3)
    4: { x: 0, y: 90 },        // Left (4)
    5: { x: 90, y: 0 },        // Bottom (5)
    6: { x: 180, y: 0 }        // Back (6)
};

function resolveStaticCollisions() {
    // 킵되지 않았으며 화면에 표시되는 주사위들만 수집
    const activeDice = state.dice.filter((d) => {
        if (d.kept) return false;
        const shouldHide = (state.rollCount === 3) || (state.isRolling && !physicsEngine.running);
        return !shouldHide;
    });

    if (activeDice.length <= 1) return;

    // 문자열 픽셀 좌표를 파싱하여 실수 연산 좌표로 임시 구축
    const coords = activeDice.map(d => {
        if (d.randomLeft === undefined || d.randomTop === undefined) {
            const idx = state.dice.indexOf(d);
            const initCoords = generateDiceTrayCoordinates(idx);
            d.randomLeft = initCoords.randomLeft;
            d.randomTop = initCoords.randomTop;
            d.randomAngle = initCoords.randomAngle;
        }
        return {
            diceObj: d,
            x: parseFloat(d.randomLeft),
            y: parseFloat(d.randomTop)
        };
    });

    const radius = 52.5;
    const minDist = radius + radius + 9; // 주사위 직경 105px + 9px 안전버퍼 마진 = 114px
    const trayWidth = 960;
    const keepBoundaryY = 672; // Y 경계

    // Constraint Solver 루프를 15회 기동하여 겹친 쌍을 서로 부드럽게 반대방향으로 밀어내기
    for (let iter = 0; iter < 15; iter++) {
        for (let i = 0; i < coords.length; i++) {
            for (let j = i + 1; j < coords.length; j++) {
                const c1 = coords[i];
                const c2 = coords[j];

                const dx = c2.x - c1.x;
                const dy = c2.y - c1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDist) {
                    const overlap = minDist - dist;
                    const nx = dx / (dist || 1);
                    const ny = dy / (dist || 1);

                    // 각 0.52 비율로 밀어내어 고속 평형 상태 도달
                    c1.x -= nx * overlap * 0.52;
                    c1.y -= ny * overlap * 0.52;
                    c2.x += nx * overlap * 0.52;
                    c2.y += ny * overlap * 0.52;

                    // 밀린 좌표가 벽이나 킵 가이드라인 밑으로 나가지 않게 Clamp 처리
                    [c1, c2].forEach(c => {
                        if (c.x < radius) c.x = radius;
                        if (c.x > trayWidth - radius) c.x = trayWidth - radius;
                        if (c.y < radius) c.y = radius;
                        if (c.y > keepBoundaryY - radius) c.y = keepBoundaryY - radius;
                    });
                }
            }
        }
    }

    // 계산 완료된 실수 좌표를 다시 px 문자열로 동기화 반영
    coords.forEach(c => {
        c.diceObj.randomLeft = `${c.x}px`;
        c.diceObj.randomTop = `${c.y}px`;
    });
}

function renderDice() {
    const slots = document.querySelectorAll('.dice-slot');
    if (slots.length === 0) return;
    
    // 렌더 실행 전, 킵 풀린 주사위들의 2D 백업 위치 겹침을 선제적으로 완벽하게 해소
    resolveStaticCollisions();
    
    state.dice.forEach((d, i) => {
        const slot = slots[i];
        if (!slot) return;
        const cube = document.getElementById(`cube-${i}`);
        
        // Render kept badge and styling
        if (d.kept) {
            slot.classList.remove('showcase');
            slot.classList.add('keep');
            slot.style.display = 'flex';
            slot.style.opacity = '1';
            slot.style.pointerEvents = 'auto';
            
            // 킵 상태: 하단 KEEP ZONE에 안정적으로 일렬 정렬 및 Z축 회전 리셋
            slot.style.top = '82%';
            slot.style.left = `${(i * 19) + 12}%`;
            slot.style.transform = 'rotateZ(0deg)';
        } else {
            slot.classList.remove('keep');
            
            // 주사위 숨김 조건 정의
            // 1) 턴 초기 상태 (아직 롤을 전혀 하지 않음): rollCount === 3
            // 2) 롤 진행 중이나 아직 물리 엔진이 활성화 안 된 경우 (즉, 컵 쉐이킹 페이즈): isRolling && !physicsEngine.running
            const shouldHide = (state.rollCount === 3) || (state.isRolling && !physicsEngine.running);
            
            if (shouldHide) {
                slot.classList.remove('showcase');
                slot.style.display = 'none';
                slot.style.opacity = '0';
                slot.style.pointerEvents = 'none';
            } else {
                slot.style.display = 'flex';
                slot.style.opacity = '1';
                slot.style.pointerEvents = 'auto';
                
                // [프리미엄 쇼케이스 연출] 롤 완료되어 정지한 정착 단계일 때 1.28배 확대 및 네온 글로우 클래스 추가
                if (!state.isRolling && state.rollCount < 3) {
                    slot.classList.add('showcase');
                } else {
                    slot.classList.remove('showcase');
                }
                
                // 킵 해제/기본 상태: 트레이 내 무작위 좌표 및 삐딱한 각도 부여
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
        
        if (!state.isRolling && cube) {
            // 물리 엔진이 완전히 멈춰놓은 정밀한 3D 각도를 유지하기 위해 정지 시 덮어쓰지 않고 그대로 박제합니다.
            // 단, 턴이 완전히 새로 시작하여 초기화되거나(rollCount === 3) 킵된 주사위인 경우에만 예쁘게 정각 정렬을 수행합니다.
            if (state.rollCount === 3 || d.kept) {
                const rot = DICE_ROTATIONS[d.value];
                cube.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
            }
        }
    });
}

function rollDice() {
    if (state.isRolling || state.rollCount === 0) return;
    
    // Anti-cheat online lock
    const activePlayer = state.players[state.currentPlayerIdx];
    if (state.gameMode === 'online' && !activePlayer.isLocal) return;
    if (activePlayer.isAI) return;

    executeDiceRoll(null, 50); // ROLL DICE 버튼: 기본 파워 50
}

function rollDiceWithPower(shakePower) {
    if (state.isRolling || state.rollCount === 0) return;
    
    // Anti-cheat online lock
    const activePlayer = state.players[state.currentPlayerIdx];
    if (state.gameMode === 'online' && !activePlayer.isLocal) return;
    if (activePlayer.isAI) return;

    executeDiceRoll(null, shakePower, true); // 드래그 릴리즈: 세 번째 인수 true
}

function executeDiceRoll(forcedValues = null, shakePower = 50, isDragRelease = false) {
    if (state.rollCount === 0) return;
    
    state.isRolling = true;
    state.rollCount--;
    updateRollTrackerUI();
    
    addGameLog(`🎲 주사위 롤링... (남은 횟수: ${state.rollCount}회)`);

    // 주사위 컵 및 롤 버튼 획득
    const cup = document.getElementById('dice-cup');
    const rollButton = document.getElementById('btn-roll');
    
    // UI 인터랙션 잠금
    if (rollButton) rollButton.disabled = true;

    // 드래그 릴리즈 인지 아니면 버튼 클릭인지 구분하여 분기 처리
    if (isDragRelease) {
        // [드래그 릴리즈]
        // 1. 이미 흔드는 동작이 충분히 완료되었으므로 shaking 페이즈를 건너뜁니다.
        // 2. 뚜껑이 열려있는 동안 주사위가 쏟아져 나가도록 pouring-open 클래스를 즉시 적용합니다.
        if (cup) {
            cup.classList.remove('pressed');
            cup.classList.add('pouring-open');
            
            // 마우스를 놓은 바로 그 릴리즈 좌표는 left, top으로 지정하여 perspective 소실점 왜곡을 완전 배제
            cup.style.left = `${gestureState.releaseX}px`;
            cup.style.top = `${gestureState.releaseY}px`;
            
            // 로컬 3D transform을 일정하게 적용하여 어느 위치에서 놓든 100% 동일한 극적 기울기로 쏟아지도록 고정
            cup.style.transition = 'left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1.15), top 0.4s cubic-bezier(0.25, 0.8, 0.25, 1.15), transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1.15)';
            cup.style.transform = `perspective(900px) translateZ(60px) rotateX(60deg) rotateY(-45deg) rotateZ(-35deg) scale(1.15)`;
        }
        
        soundEngine.playRoll(); // 쏟아지는 소리
        
        // 쏟는 비주얼 액션이 약간 시작된 시점인 0.15초 뒤에 주사위를 물리 엔진에 투입하여 날아가게 합니다.
        setTimeout(() => {
            const slots = document.querySelectorAll('.dice-slot');
            
            // 킵되지 않은 주사위들 롤 상태로 마킹 및 강제 결과값 동기화 설정
            state.dice.forEach((d, i) => {
                if (d.kept) return;
                
                // 만약 멀티플레이 강제 결과값이 있다면 그 값을 미리 대입
                if (forcedValues) {
                    d.value = forcedValues[i];
                }
                
                const slot = slots[i];
                if (slot) {
                    slot.classList.add('rolling');
                }
            });

            // [드래그 릴리즈 전용] 컵의 정확한 릴리즈 좌표를 계산하여 주사위 발사 좌표로 지정
            const tray = document.getElementById('dice-tray');
            let launchOrigin = null;
            if (tray) {
                const trayRect = tray.getBoundingClientRect();
                // 컵의 원점(보드 중심)이 트레이 기준 어디인지 구한 후, 놓았을 때의 변위를 더해줌
                const cupCenterInTrayX = gestureState.cupOrigCenterX - trayRect.left;
                const cupCenterInTrayY = gestureState.cupOrigCenterY - trayRect.top;
                launchOrigin = {
                    x: cupCenterInTrayX + gestureState.releaseX,
                    y: cupCenterInTrayY + gestureState.releaseY
                };
            }

            // 물리 시뮬레이션 모델 초기화 (shakePower 및 릴리즈 발사 좌표 전달)
            physicsEngine.init(state.dice.map(d => d.kept), shakePower, launchOrigin);

            // 물리 시뮬레이션 시작!
            physicsEngine.start(() => {
                // [시뮬레이션 완료 콜백] 모든 주사위 정지 완료
                
                // 1. 주사위 통 쏟기 해제 및 원래의 dice-cup-container(0, 0) 위치로 매끄럽게 복귀
                if (cup) {
                    cup.classList.remove('pouring-open');
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
                        
                        // 컵 내부 전용 미니 주사위 3D 스타일 완벽하게 리셋
                        for (let i = 0; i < 5; i++) {
                            const el = document.getElementById(`mini-dice-${i}`);
                            const cubeEl = document.getElementById(`mini-cube-${i}`);
                            if (el) {
                                el.style.left = '';
                                el.style.top = '';
                            }
                            if (cubeEl) {
                                cubeEl.style.transform = '';
                            }
                        }
                    }, 630);
                }

                // 2. 물리 롤링 마크 클래스 제거 및 최종 상태 렌더링 동기화
                state.dice.forEach((d, i) => {
                    const slot = slots[i];
                    if (slot) {
                        slot.classList.remove('rolling');
                    }
                    
                    // 정지한 물리 좌표를 백업 좌표로 변환하여 보존 (킵 풀었을 때 그 자리로 돌아가기 위함)
                    if (!d.kept) {
                        const phys = physicsEngine.dicePhysics[i];
                        if (phys && phys.body) {
                            d.randomLeft = `${phys.body.position.x}px`;
                            d.randomTop = `${phys.body.position.y}px`;
                            d.randomAngle = normalizeAngle180(phys.body.angle * (180 / Math.PI));
                        }
                    }
                });

                // [보완] 굴러가는 모습을 끝까지 완벽하게 보이도록 억지 일렬 순간이동 정렬(arrangeActiveDiceInLine)을 수행하지 않고, 물리가 착지한 그 자연스러운 위치 그대로 유지합니다.
                // arrangeActiveDiceInLine();

                // 온라인 멀티 동기화 (물리가 끝나고 동적으로 확정된 주사위 값 전송!)
                if (state.gameMode === 'online' && !forcedValues && window.networkController) {
                    window.networkController.sendRoll(state.dice.map(d => d.value));
                }

                // 3. 상태 정리 및 화면 최종 정돈
                state.isRolling = false;
                soundEngine.playDiceHit(); // 최종 착지음
                
                // [프리미엄 연출] 주사위 물리 안착 후 0.25초 뒤에 가로 정중앙 일렬 정렬 및 확대(Showcase) 상태를 트리거합니다.
                setTimeout(() => {
                    arrangeActiveDiceInLine();
                    renderDice();
                    
                    // 정렬 및 확대 연출이 완전히 시작된 직후 상위 족보 축하 팝업 및 오디오 연출 트리거
                    checkCombinationCelebrate();
                }, 250);
                
                renderScoreboard();
                updateRollTrackerUI(); // 롤 횟수 버튼 잠금 해제 체크

                // 상태 표시 메시지 업데이트
                if (state.rollCount === 0) {
                    document.getElementById('display-turn-status').innerText = "더 이상 주사위를 굴릴 수 없습니다. 점수를 기록해 주세요.";
                } else {
                    document.getElementById('display-turn-status').innerText = "남은 롤 횟수를 사용하거나 점수를 입력해 주세요.";
                }

                // 4. AI의 경우 다음 액션으로 체인 (축하 오버레이 팝업을 감상할 시간을 확보하기 위해 딜레이를 2.5초로 연장)
                const active = activePlayer();
                if (active.isAI && state.rollCount > 0) {
                    setTimeout(aiDecideKeep, 2500);
                } else if (active.isAI && state.rollCount === 0) {
                    setTimeout(aiDecideScore, 2500);
                }
            }, forcedValues);

        }, 150); // 쏟기 액션 0.15초 후 주사위 분사
        
    } else {
        // [버튼 클릭 롤 (기본 롤)]
        // 1단계: 주사위 통 흔들기 (shaking) 시작
        if (cup) {
            cup.classList.add('shaking');
        }
        soundEngine.playRoll(); // 자갈 자갈 흔드는 컵 사운드 작동

        // 0.6초간 흔든 뒤 2단계: 쏟아붓기 (pouring) 전환
        setTimeout(() => {
            if (cup) {
                cup.classList.remove('shaking');
                cup.classList.add('pouring');
            }

            // 흔들기 시작 후 0.8초 시점(즉, 쏟기 개시 0.2초 후)에 주사위 발사 및 물리 엔진 개시
            setTimeout(() => {
                const slots = document.querySelectorAll('.dice-slot');
                
                // 킵되지 않은 주사위들 롤 상태로 마킹 및 강제 결과값 동기화 설정
                state.dice.forEach((d, i) => {
                    if (d.kept) return;
                    
                    // 만약 멀티플레이 강제 결과값이 있다면 그 값을 미리 대입
                    if (forcedValues) {
                        d.value = forcedValues[i];
                    }
                    
                    const slot = slots[i];
                    if (slot) {
                        slot.classList.add('rolling');
                    }
                });

                // 물리 시뮬레이션 모델 초기화 (shakePower 전달)
                physicsEngine.init(state.dice.map(d => d.kept), shakePower);

                // 물리 시뮬레이션 시작!
                physicsEngine.start(() => {
                    // [시뮬레이션 완료 콜백] 모든 주사위 정지 완료
                    
                    // 1. 주사위 통 쏟기 해제 및 원래의 제자리 위치로 매끄럽게 복귀
                    if (cup) {
                        cup.classList.remove('pouring');
                        cup.style.transition = 'transform 0.62s cubic-bezier(0.25, 0.8, 0.25, 1), filter 0.5s ease';
                        cup.style.transform = 'perspective(800px) translate3d(0px, 0px, 0px) scale(1)';
                        
                        setTimeout(() => {
                            cup.style.zIndex   = '';
                            cup.style.transition = '';
                            cup.style.transform  = '';
                            
                            // 컵 내부 전용 미니 주사위 3D 스타일 완벽하게 리셋
                            for (let i = 0; i < 5; i++) {
                                const el = document.getElementById(`mini-dice-${i}`);
                                const cubeEl = document.getElementById(`mini-cube-${i}`);
                                if (el) {
                                    el.style.left = '';
                                    el.style.top = '';
                                }
                                if (cubeEl) {
                                    cubeEl.style.transform = '';
                                }
                            }
                        }, 630);
                    }

                    // 2. 물리 롤링 마크 클래스 제거 및 최종 상태 렌더링 동기화
                    state.dice.forEach((d, i) => {
                        const slot = slots[i];
                        if (slot) {
                            slot.classList.remove('rolling');
                        }
                        
                        // 정지한 물리 좌표를 백업 좌표로 변환하여 보존 (킵 풀었을 때 그 자리로 돌아가기 위함)
                        if (!d.kept) {
                            const phys = physicsEngine.dicePhysics[i];
                            if (phys && phys.body) {
                                d.randomLeft = `${phys.body.position.x}px`;
                                d.randomTop = `${phys.body.position.y}px`;
                                d.randomAngle = normalizeAngle180(phys.body.angle * (180 / Math.PI));
                            }
                        }
                    });

                    // [보완] 굴러가는 모습을 끝까지 완벽하게 보이도록 억지 일렬 순간이동 정렬(arrangeActiveDiceInLine)을 수행하지 않고, 물리가 착지한 그 자연스러운 위치 그대로 유지합니다.
                    // arrangeActiveDiceInLine();

                    // 온라인 멀티 동기화 (물리가 끝나고 동적으로 확정된 주사위 값 전송!)
                    if (state.gameMode === 'online' && !forcedValues && window.networkController) {
                        window.networkController.sendRoll(state.dice.map(d => d.value));
                    }

                    // 3. 상태 정리 및 화면 최종 정돈
                    state.isRolling = false;
                    soundEngine.playDiceHit(); // 최종 착지음
                    
                    // [프리미엄 연출] 주사위 물리 안착 후 0.25초 뒤에 가로 정중앙 일렬 정렬 및 확대(Showcase) 상태를 트리거합니다.
                    setTimeout(() => {
                        arrangeActiveDiceInLine();
                        renderDice();
                        
                        // 정렬 및 확대 연출이 완전히 시작된 직후 상위 족보 축하 팝업 및 오디오 연출 트리거
                        checkCombinationCelebrate();
                    }, 250);
                    
                    renderScoreboard();
                    updateRollTrackerUI(); // 롤 횟수 버튼 잠금 해제 체크

                    // 상태 표시 메시지 업데이트
                    if (state.rollCount === 0) {
                        document.getElementById('display-turn-status').innerText = "더 이상 주사위를 굴릴 수 없습니다. 점수를 기록해 주세요.";
                    } else {
                        document.getElementById('display-turn-status').innerText = "남은 롤 횟수를 사용하거나 점수를 입력해 주세요.";
                    }

                    // 4. AI의 경우 다음 액션으로 체인 (축하 오버레이 팝업을 감상할 시간을 확보하기 위해 딜레이를 2.5초로 연장)
                    const active = activePlayer();
                    if (active.isAI && state.rollCount > 0) {
                        setTimeout(aiDecideKeep, 2500);
                    } else if (active.isAI && state.rollCount === 0) {
                        setTimeout(aiDecideScore, 2500);
                    }
                }, forcedValues);

            }, 200); // 쉐이킹 시작 시점 기준 총 0.8초 후 주사위 분사

        }, 600);
    }
}

function updateRollTrackerUI() {
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

/* ==========================================
   Turn Management Flow
   ========================================== */
function activePlayer() {
    return state.players[state.currentPlayerIdx];
}

function startTurn() {
    resetTurnState();
    const active = activePlayer();
    
    document.getElementById('display-current-turn').innerText = `${active.name}의 턴`;
    
    // Highlight Active player column
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

function resetTurnState() {
    state.rollCount = 3;
    state.dice.forEach((d, i) => {
        d.value = 1;
        d.kept = false;
        
        // 초기 랜덤 좌표 갱신
        const coords = generateDiceTrayCoordinates(i);
        d.randomTop = coords.randomTop;
        d.randomLeft = coords.randomLeft;
        d.randomAngle = coords.randomAngle;
    });
    updateRollTrackerUI();
    renderDice();
}

function recordScore(playerIdx, category) {
    if (state.isRolling) return;
    
    const targetPlayer = state.players[playerIdx];
    
    // Lock actions during other's online turns
    if (state.gameMode === 'online' && !targetPlayer.isLocal) return;
    if (targetPlayer.isAI) return;
    if (state.currentPlayerIdx !== playerIdx) return;
    if (state.rollCount === 3) {
        showToast("주사위를 최소 1번 굴린 후에 점수를 지정할 수 있습니다!");
        return;
    }
    
    if (targetPlayer.score[category] !== null) return; // Already recorded
    
    const diceValues = state.dice.map(d => d.value);
    const calculated = calculateScores(diceValues);
    const scoreVal = calculated[category];

    executeRecordScore(playerIdx, category, scoreVal);
}

function executeRecordScore(playerIdx, category, scoreVal) {
    const targetPlayer = state.players[playerIdx];
    targetPlayer.score[category] = scoreVal;
    
    soundEngine.playScoreFixed();
    addGameLog(`📝 ${targetPlayer.name}님이 **${getCategoryLabel(category)}**에 **${scoreVal}점** 기록!`);

    // Check for Yacht visual excitement!
    if (category === 'yacht' && scoreVal === 50) {
        triggerYachtParty(`${targetPlayer.name} YACHT!! 🎉🎉`);
    }

    // Check for Upper Section Bonus Trigger
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

    // Network Sync
    if (state.gameMode === 'online' && targetPlayer.isLocal && window.networkController) {
        window.networkController.sendScore(category, scoreVal);
    }

    // Move to next player or round
    setTimeout(nextPlayerTurn, 1000);
}

function nextPlayerTurn() {
    state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
    
    // Check if round finished
    if (state.currentPlayerIdx === 0) {
        state.currentRound++;
    }

    if (state.currentRound > 12) {
        finishGame();
    } else {
        startTurn();
    }
}

function finishGame() {
    state.gameState = 'finished';
    
    // Calculate final scores
    const finalScores = state.players.map(p => {
        const total = CATEGORIES_LIST.reduce((a, b) => a + (p.score[b] || 0), 0) + (p.score['bonus'] || 0);
        return { name: p.name, score: total };
    });

    // Sort winners
    finalScores.sort((a, b) => b.score - a.score);
    const winner = finalScores[0];
    
    // Trigger big celebration!
    triggerYachtParty(`🏆 우승: ${winner.name} (${winner.score}점)!`);

    // Render Game Over Modal Content
    const resultsDiv = document.getElementById('gameover-results');
    resultsDiv.innerHTML = finalScores.map((p, idx) => `
        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; margin: 10px 0; font-weight: ${idx === 0 ? '800' : '400'}; color: ${idx === 0 ? 'var(--accent-gold)' : 'var(--text-main)'}">
            <span>${idx + 1}등. ${p.name}</span>
            <span>${p.score}점</span>
        </div>
    `).join('');

    document.getElementById('modal-gameover').classList.add('active');
}

/* ==========================================
   AI Strategy Simulator (Probability Algorithms)
   ========================================== */
function aiExecuteRoll() {
    if (state.gameState !== 'playing') return;
    executeDiceRoll();
}

function aiDecideKeep() {
    if (state.gameState !== 'playing') return;
    
    const ai = activePlayer();
    const diceValues = state.dice.map(d => d.value);
    
    let keeps = [];
    if (state.aiDifficulty === 'easy') {
        keeps = getEasyAIKeeps(diceValues);
    } else if (state.aiDifficulty === 'normal') {
        keeps = getNormalAIKeeps(diceValues, ai.score);
    } else {
        keeps = getHardAIKeeps(diceValues, ai.score);
    }

    // Apply keeps
    state.dice.forEach((d, idx) => {
        if (d.kept !== keeps[idx]) {
            d.kept = keeps[idx];
            soundEngine.playKeep();
        }
    });

    renderDice();
    addGameLog(`🤖 AI가 ${keeps.filter(k=>k).length}개의 주사위를 킵했습니다.`);

    // Next roll
    setTimeout(aiExecuteRoll, 1200);
}

function aiDecideScore() {
    if (state.gameState !== 'playing') return;

    const ai = activePlayer();
    const diceValues = state.dice.map(d => d.value);
    const computed = calculateScores(diceValues);

    let chosenCat = '';
    if (state.aiDifficulty === 'easy') {
        // Choose first empty category randomly
        const emptyCats = CATEGORIES_LIST.filter(c => ai.score[c] === null);
        chosenCat = emptyCats[Math.floor(Math.random() * emptyCats.length)];
    } else if (state.aiDifficulty === 'normal') {
        chosenCat = getNormalAIScoreChoice(computed, ai.score);
    } else {
        chosenCat = getHardAIScoreChoice(computed, ai.score);
    }

    const scoreVal = computed[chosenCat];
    executeRecordScore(state.currentPlayerIdx, chosenCat, scoreVal);
}

// 1. Easy AI keeps random dice
function getEasyAIKeeps(diceValues) {
    return diceValues.map(() => Math.random() > 0.6); // 40% chance to keep each
}

// 2. Normal AI (Rule-based heuristic)
function getNormalAIKeeps(diceValues, score) {
    const counts = {};
    diceValues.forEach(v => counts[v] = (counts[v] || 0) + 1);

    // Rule A: If Yacht is empty and we have 3 or 4 of a kind, keep those
    if (score['yacht'] === null) {
        for (let num in counts) {
            if (counts[num] >= 3) {
                return diceValues.map(v => v === parseInt(num));
            }
        }
    }

    // Rule B: Straight hunting
    const sortedUnique = [...new Set(diceValues)].sort((a,b)=>a-b);
    const uStr = sortedUnique.join('');
    if (score['lstraight'] === null || score['sstraight'] === null) {
        if (uStr.includes('1234') || uStr.includes('2345') || uStr.includes('3456')) {
            // Keep the straight sequence
            return diceValues.map(v => sortedUnique.slice(0,4).includes(v));
        }
    }

    // Rule C: Keep high matching numbers (pairs or more)
    let bestMatchingVal = 0;
    let maxCount = 1;
    for (let num in counts) {
        if (counts[num] > maxCount || (counts[num] === maxCount && parseInt(num) > bestMatchingVal)) {
            bestMatchingVal = parseInt(num);
            maxCount = counts[num];
        }
    }

    if (maxCount >= 2) {
        return diceValues.map(v => v === bestMatchingVal);
    }

    // Default: Keep nothing
    return [false, false, false, false, false];
}

function getNormalAIScoreChoice(computed, score) {
    // Greedy heuristic: Choose the empty category that yields the highest ratio relative to max possible
    const candidates = CATEGORIES_LIST.filter(c => score[c] === null);
    
    // Max theoretical scores
    const maxScores = {
        ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30,
        choice: 30, '4ofkind': 30, fullhouse: 30, sstraight: 15, lstraight: 30, yacht: 50
    };

    let bestCat = candidates[0];
    let bestRatio = -1;

    candidates.forEach(c => {
        const ratio = computed[c] / (maxScores[c] || 1);
        // Bonus weight to premium categories
        let weight = 1.0;
        if (c === 'yacht' && computed[c] === 50) weight = 2.0;
        if (c === 'lstraight' && computed[c] === 30) weight = 1.5;
        if (c === 'fullhouse' && computed[c] > 0) weight = 1.3;

        const scoreWithWeight = ratio * weight;
        if (scoreWithWeight > bestRatio) {
            bestRatio = scoreWithWeight;
            bestCat = c;
        }
    });

    return bestCat;
}

// 3. Hard AI (Expectation calculation optimizer)
function getHardAIKeeps(diceValues, score) {
    // For optimal Yacht speed, Hard AI compares expected value (EV) of keeping combinations.
    // Since calculating strict exact combinations of all subsets is expensive, we approximate:
    const counts = {};
    diceValues.forEach(v => counts[v] = (counts[v] || 0) + 1);

    // Yacht Priority
    if (score['yacht'] === null) {
        for (let num in counts) {
            if (counts[num] >= 3) return diceValues.map(v => v === parseInt(num));
        }
    }

    // Straight Priority
    const sortedUnique = [...new Set(diceValues)].sort((a,b)=>a-b);
    const uStr = sortedUnique.join('');
    if (score['lstraight'] === null && (uStr.includes('1234') || uStr.includes('2345') || uStr.includes('3456'))) {
        return diceValues.map(v => sortedUnique.includes(v));
    }

    // Upper sections (Ones - Sixes) weighting to hunt bonus
    const upperKeys = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
    const currentUpperSum = upperKeys.reduce((a, b) => a + (score[b] || 0), 0);
    const missingUpperKeys = upperKeys.filter(k => score[k] === null);

    // If we have high value matching pairs and upper section is empty, target them
    for (let i = 6; i >= 4; i--) {
        if (counts[i] >= 2 && score[upperKeys[i-1]] === null) {
            return diceValues.map(v => v === i);
        }
    }

    // General high matching values
    let bestVal = 0;
    let bestCount = 1;
    for (let num in counts) {
        if (counts[num] > bestCount || (counts[num] === bestCount && parseInt(num) >= 4)) {
            bestVal = parseInt(num);
            bestCount = counts[num];
        }
    }
    
    if (bestCount >= 2) {
        return diceValues.map(v => v === bestVal);
    }

    return [false, false, false, false, false];
}

function getHardAIScoreChoice(computed, score) {
    const candidates = CATEGORIES_LIST.filter(c => score[c] === null);
    
    // Advanced utility scoring:
    // AI prioritizes premium elements, but crucially, calculates "Sacrifice value" 
    // when forcing 0 into highly improbable categories (e.g. putting 0 in Yacht or L.Straight is safer than 0 in Ones/Twos)
    let bestCat = candidates[0];
    let bestUtility = -9999;

    candidates.forEach(c => {
        let scoreVal = computed[c];
        let utility = scoreVal;

        // Add safety margin for Ones/Twos/Threes - don't score 0 if we can avoid it because they fuel the Bonus
        if (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].includes(c)) {
            if (scoreVal === 0) utility -= 10; // heavy penalty for 0 in upper
            // Bonus potential weighting
            utility += (scoreVal * 1.5);
        }

        // Sacrifice weights (If we have to throw away a zero, Yacht is the best choice because 50 is rare anyway)
        if (scoreVal === 0) {
            if (c === 'yacht') utility = -1; // least painful 0
            if (c === 'lstraight') utility = -2;
            if (c === 'sstraight') utility = -3;
            if (c === 'fullhouse') utility = -4;
            if (c === '4ofkind') utility = -5;
            if (c === 'choice') utility = -100; // never sacrifice choice with 0!
        } else {
            // Yacht reward
            if (c === 'yacht' && scoreVal === 50) utility += 100;
            if (c === 'lstraight' && scoreVal === 30) utility += 40;
            if (c === 'fullhouse' && scoreVal > 0) utility += 15;
            if (c === 'sstraight' && scoreVal === 15) utility += 10;
        }

        if (utility > bestUtility) {
            bestUtility = utility;
            bestCat = c;
        }
    });

    return bestCat;
}

/* ==========================================
   Scoreboard Layout Renderer
   ========================================== */
function renderScoreboard() {
    const tableHeader = document.getElementById('table-header-row');
    const tableBody = document.getElementById('table-body');
    
    // Clear and build player columns in header
    tableHeader.innerHTML = `<th style="width: 200px;">카테고리</th>`;
    state.players.forEach((p, idx) => {
        const activeClass = (state.gameState === 'playing' && idx === state.currentPlayerIdx) ? 'active-player-col' : '';
        tableHeader.innerHTML += `<th class="${activeClass}">${p.name}</th>`;
    });

    const diceValues = state.dice.map(d => d.value);
    const computedCurrent = calculateScores(diceValues);

    // Build categories rows
    CATEGORIES_LIST.forEach(cat => {
        const row = tableBody.querySelector(`tr[data-cat="${cat}"]`);
        if (!row) return;

        // Preserve only the first category cell
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
                // Fixed recorded score
                cell.innerText = scoreVal;
                cell.classList.add('fixed');
                if (isCurrentPlayer) cell.classList.add('active-user-score');
            } else if (state.gameState === 'playing' && isCurrentPlayer && !p.isAI) {
                // Selectable empty preview cell for active HUMAN player
                if (state.rollCount < 3) {
                    cell.innerText = computedCurrent[cat];
                    cell.classList.add('selectable');
                    cell.addEventListener('click', () => recordScore(pIdx, cat));
                } else {
                    cell.innerText = '-';
                    cell.style.opacity = 0.3;
                }
            } else {
                // Empty cell for AI or other players
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
            const sum = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].reduce((a,b) => a + (p.score[b] || 0), 0);
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
                // Not finished yet or not qualified
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

/* ==========================================
   Effects, Logs & Utilities
   ========================================== */
function addGameLog(message, type = 'system-log') {
    const logsDiv = document.getElementById('log-messages');
    
    // Category logs coloring override
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

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (state.gameMode === 'online' && window.networkController) {
        window.networkController.sendChatMessage(msg);
    }
    
    appendChatBubble('도전자 (나)', msg, 'me');
    input.value = '';
}

function appendChatBubble(sender, message, styleClass) {
    const chatDiv = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${styleClass}`;
    bubble.innerHTML = `<span class="sender">${sender}</span><span>${escapeHtml(message)}</span>`;
    
    chatDiv.appendChild(bubble);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function createEmojiReaction(emoji, isSender = false) {
    const reaction = document.createElement('div');
    reaction.className = 'emoji-reaction-float';
    reaction.innerText = emoji;
    
    // Random position within central board
    const x = 100 + Math.random() * (window.innerWidth - 300);
    reaction.style.left = `${x}px`;
    reaction.style.bottom = `150px`;
    
    document.body.appendChild(reaction);
    
    setTimeout(() => {
        reaction.remove();
    }, 2500);
}

function triggerConfetti(durationSec, velocity) {
    const canvas = document.getElementById('confetti-canvas');
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

function triggerYachtParty(message) {
    addGameLog(`🎉 ${message} 🎉`, 'system-log');
    triggerConfetti(3, 45);
    
    // Large overlay pop text
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

function getCategoryLabel(cat) {
    const labels = {
        ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
        choice: 'Choice', '4ofkind': '4 of a Kind', fullhouse: 'Full House',
        sstraight: 'Small Straight', lstraight: 'Large Straight', yacht: 'Yacht'
    };
    return labels[cat] || cat;
}

function showToast(msg) {
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

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ==========================================
   NEW: 주사위 롤 종료 후 가로 정중앙 일렬 자동 정렬 헬퍼 함수
   ========================================== */
function arrangeActiveDiceInLine() {
    // 킵되지 않은 활성 주사위의 인덱스 추출
    const activeIndices = [];
    state.dice.forEach((d, idx) => {
        if (!d.kept) {
            activeIndices.push(idx);
        }
    });

    const N = activeIndices.length;
    if (N === 0) return;

    // 960px * 960px 트레이
    const diceSize = 105;
    const gap = 64; // [조정] 쇼케이스 1.28배 확대 시의 가로 반지름 증가폭(29.4px)을 감안하여 기존 38px에서 64px로 시원하게 확대!
    const trayWidth = 960;
    
    // 수평 정렬을 위한 총 가로 폭 계산
    const totalW = N * diceSize + (N - 1) * gap;
    // 시작하는 X 좌표 계산 (중앙 정렬 편차 확보)
    const startX = (trayWidth - totalW) / 2;
    // 롤링 영역 세로 중심선 (0px ~ 672px 킵라인 상위 구역의 한가운데)
    const centerY = 336;

    activeIndices.forEach((idx, k) => {
        const d = state.dice[idx];
        const x = startX + k * (diceSize + gap) + diceSize / 2;
        
        d.randomLeft = `${x}px`;
        d.randomTop = `${centerY}px`;
        d.randomAngle = 0; // 정렬 시 삐딱함 없이 완전히 예쁜 수평 리셋
    });
}

/* ==========================================
   NEW: 주사위 롤 정지 직후 최고 족보 판정 및 미래지향적 네온 오버레이 축하 연출 트리거
   ========================================== */
function checkCombinationCelebrate() {
    const diceValues = state.dice.map(d => d.value);
    const scores = calculateScores(diceValues);

    let comboKey = null;
    let comboName = "";
    let comboSub = "";
    let cssClass = "";

    // 족보의 희소성 및 우선순위 순으로 판별
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

            // 기존 클래스들 정리 후 족보 커스텀 네온 클래스 추가
            overlay.className = "celebration-overlay active " + cssClass;

            // Yacht 달성 시 스페셜 무지개빛 폭죽 비 및 합성 대규모 박수 사운드 실행
            if (comboKey === "yacht") {
                triggerConfetti(3.5, 45); // 무지개 컨페티
                soundEngine.playClap(); // 합성 박수 및 상승 신스 아르페지오 팡파레
            } else {
                // 다른 족보들은 고풍스럽고 경쾌한 멜로디 Chime 출력
                soundEngine.playBonus();
            }

            // 2.2초 동안 연출한 뒤 페이드아웃 후 비활성화
            setTimeout(() => {
                overlay.classList.remove('active');
            }, 2200);
        }
    }
}
