/* ==========================================
   Yacht Dice - physics.js
   ========================================== */

import { state } from './state.js';
import { soundEngine, playShakeTickSound } from './sound.js';

// ES Modules 격리 스코프 대비 명시적 전역 Matter 참조 바인딩
const Matter = window.Matter;

// 3D rotation vectors corresponding to each dice face
export const DICE_ROTATIONS = {
    1: { x: 0, y: 0 },         // Front (1)
    2: { x: -90, y: 0 },       // Top (2)
    3: { x: 0, y: -90 },       // Right (3)
    4: { x: 0, y: 90 },        // Left (4)
    5: { x: 90, y: 0 },        // Bottom (5)
    6: { x: 180, y: 0 }        // Back (6)
};

// WebGL 및 렌더러 테스트 기반 실시간 GPU 그래픽 하드웨어 가속 감지기 (방법 A)
export function isHardwareAccelerationEnabled() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return false;
        
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
            const rLower = renderer.toLowerCase();
            if (rLower.includes('swiftshader') || 
                rLower.includes('software rendering') ||
                rLower.includes('llvmpipe') ||
                rLower.includes('microsoft basic render driver') ||
                rLower.includes('warp') ||
                rLower.includes('google swiftshader')) {
                return false;
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}

// 컵 내부 전용 미니 주사위 2D 관성 물리 엔진
export const dragPhysics = {
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
        const scale = -0.45;
        this.dice.forEach(d => {
            d.vx += dx * scale + (Math.random() - 0.5) * 1.5;
            d.vy += dy * scale + (Math.random() - 0.5) * 1.5;
            
            d.vRotX += dy * 1.5;
            d.vRotY += dx * 1.5;
            d.vRotZ += (dx - dy) * 0.8;
        });
    },

    update() {
        const dList = this.dice;

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

// Drag & Shake Gesture State Machine
export const gestureState = {
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
    cupWidth: 140, 
    cupHeight: 140, 
    translateX: 0,
    translateY: 0,
    smoothVx: 0,
    smoothVy: 0,
    releaseX: 0,
    releaseY: 0
};

// Setup Drag & Shake Gesture Engine with Callback
export function setupShakeGesture(onRollWithPower) {
    const cup = document.getElementById('dice-cup');
    const board = document.querySelector('.dice-board');
    if (!cup || !board) return;

    const onDown = (e) => {
        if (!state.gpuAccelerated) return; 
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

        // 테이블 위 주사위들 즉시 사라지기 (외부 트리거 콜백 필요하지만, 직접 DOM 제어)
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

        cup.style.left = '0px';
        cup.style.top = '0px';
        cup.style.transform = `perspective(900px) translateZ(60px) scale(1.15)`;
        cup.style.filter = 'drop-shadow(0 25px 35px rgba(0, 0, 0, 0.65))';

        dragPhysics.start();

        const gauge = document.getElementById('shake-power-wrap');
        const bar   = document.getElementById('shake-power-bar');
        if (gauge) gauge.classList.add('visible');
        if (bar)   bar.style.width = '0%';

        soundEngine.init();
        e.preventDefault();
    };

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

        const powerGain = Math.min(speed * 0.95, 5);
        gestureState.shakePower = Math.min(gestureState.shakePower + powerGain, 100);

        const tiltZ = Math.max(-6, Math.min(6, gestureState.smoothVx * 0.35));
        const liftZ = 60 + (gestureState.shakePower * 0.12);
        const sc = 1.15 + (gestureState.shakePower / 100) * 0.05;

        let vibX = 0, vibY = 0;
        if (gestureState.shakePower >= 100) {
            vibX = (Math.random() - 0.5) * 4;
            vibY = (Math.random() - 0.5) * 4;
            cup.style.filter = 'brightness(1.3) drop-shadow(0 0 20px rgba(0, 245, 212, 0.85))';
        } else {
            cup.style.filter = 'drop-shadow(0 25px 35px rgba(0, 0, 0, 0.65))';
        }

        cup.style.left = `${gestureState.translateX + vibX}px`;
        cup.style.top = `${gestureState.translateY + vibY}px`;
        cup.style.transform = `perspective(900px) translateZ(${liftZ}px) rotate(${tiltZ}deg) scale(${sc})`;

        dragPhysics.applyInertia(dx, dy);

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

    const onUp = (e) => {
        if (!gestureState.isDragging) return;
        gestureState.isDragging = false;
        gestureState.justReleased = true;

        cup.classList.remove('pressed');
        cup.style.filter = '';

        dragPhysics.stop();

        gestureState.releaseX = gestureState.translateX;
        gestureState.releaseY = gestureState.translateY;

        cup.style.transition = 'transform 0.15s ease';

        const gauge = document.getElementById('shake-power-wrap');
        const bar   = document.getElementById('shake-power-bar');
        setTimeout(() => {
            if (gauge) gauge.classList.remove('visible');
            if (bar)   bar.style.width = '0%';
        }, 540);

        const power = Math.max(gestureState.shakePower, 5);
        if (onRollWithPower) {
            onRollWithPower(power);
        }

        setTimeout(() => { gestureState.justReleased = false; }, 200);
    };

    cup.addEventListener('mousedown',  onDown, { passive: false });
    cup.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchend',  onUp);
}

// ── Matter.js 기반 주사위 비행/텀블링 및 안착 물리 엔진 ──

export function lerpAngle(current, target, t) {
    let diff = (target - current) % 360;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    return current + diff * t;
}

export function normalizeAngle180(angle) {
    let a = angle % 360;
    if (a < -180) a += 360;
    if (a > 180) a -= 360;
    return a;
}

export function getClosestEquivalentAngle(current, target) {
    let diff = (target - current) % 360;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    return current + diff;
}

// 3D 기하학 기반 실시간 윗면 눈금 계산 함수
export function getVisibleFace(rx, ry) {
    const radX = rx * Math.PI / 180;
    const radY = ry * Math.PI / 180;

    const cx = Math.cos(radX);
    const sx = Math.sin(radX);
    const cy = Math.cos(radY);
    const sy = Math.sin(radY);

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

export const physicsEngine = {
    running: false,
    dicePhysics: [],
    animationId: null,
    trayWidth: 960,
    trayHeight: 960,
    keepBoundaryY: 672, 
    radius: 52.5,
    
    engine: null,
    world: null,
    
    bounce: 0.70,       
    diceBounce: 0.75,   
    minVelocity: 0.12,  
    lastHitSoundTime: 0,

    init(keptStates, shakePower = 50, launchOrigin = null) {
        if (this.engine) {
            Matter.World.clear(this.world);
            Matter.Engine.clear(this.engine);
        }
        
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 0 }
        });
        this.world = this.engine.world;
        this.dicePhysics = [];

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

        const wallThickness = 120;
        const wallOptions = { 
            isStatic: true, 
            restitution: this.bounce, 
            friction: 0.2 
        };
        
        const leftWall = Matter.Bodies.rectangle(
            0 - wallThickness / 2, 
            this.keepBoundaryY / 2, 
            wallThickness, 
            this.keepBoundaryY, 
            wallOptions
        );
        const rightWall = Matter.Bodies.rectangle(
            this.trayWidth + wallThickness / 2, 
            this.keepBoundaryY / 2, 
            wallThickness, 
            this.keepBoundaryY, 
            wallOptions
        );
        const topWall = Matter.Bodies.rectangle(
            this.trayWidth / 2, 
            0 - wallThickness / 2, 
            this.trayWidth, 
            wallThickness, 
            wallOptions
        );
        const bottomWall = Matter.Bodies.rectangle(
            this.trayWidth / 2, 
            this.keepBoundaryY + wallThickness / 2, 
            this.trayWidth, 
            wallThickness, 
            wallOptions
        );

        Matter.World.add(this.world, [leftWall, rightWall, topWall, bottomWall]);

        const powerScale = 0.6 + (shakePower / 100) * 1.35;
        const diceSize = 105;

        for (let i = 0; i < 5; i++) {
            const isKept = keptStates[i];
            if (isKept) {
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

                const bodyOptions = {
                    density: 0.002,
                    restitution: this.diceBounce,
                    friction: 0.3,
                    frictionAir: 0.05,
                    chamfer: { radius: 12 },
                    render: { visible: false }
                };
                const body = Matter.Bodies.rectangle(initX, initY, diceSize, diceSize, bodyOptions);
                Matter.Body.setAngle(body, Math.random() * Math.PI * 2);
                
                Matter.Body.setVelocity(body, { x: baseVx, y: baseVy });
                Matter.Body.setAngularVelocity(body, (Math.random() > 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.35));

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

                const phyMoving = body.speed > this.minVelocity || Math.abs(body.angularSpeed) > 0.06;
                const rotMoving = Math.abs(p.rxVel) > 0.4 || Math.abs(p.ryVel) > 0.4;
                const isMoving  = phyMoving || rotMoving;

                p.rx += p.rxVel;
                p.ry += p.ryVel;

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

                    const torqueX = (p.targetRx - p.rx) * 0.16;
                    const torqueY = (p.targetRy - p.ry) * 0.16;
                    
                    p.rxVel = p.rxVel * 0.80 + torqueX * 0.20;
                    p.ryVel = p.ryVel * 0.80 + torqueY * 0.20;
                } else {
                    p.rxVel *= 0.955;
                    p.ryVel *= 0.955;
                    p.targetRx = null;
                    p.targetRy = null;
                }

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
        Matter.Engine.update(this.engine, 1000 / 60);

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
            const angleDeg = d.body.angle * (180 / Math.PI);
            const p = d.body.plugin;

            slot.style.left = `${pos.x}px`;
            slot.style.top = `${pos.y}px`;
            slot.style.transform = `rotateZ(${angleDeg.toFixed(2)}deg)`;

            const cube = document.getElementById(`cube-${i}`);
            if (cube) {
                if (isFinal && p.targetRx !== null && p.targetRx !== undefined) {
                    p.rx = p.targetRx;
                    p.ry = p.targetRy;
                }
                cube.style.transform = `rotateX(${p.rx.toFixed(1)}deg) rotateY(${p.ry.toFixed(1)}deg)`;
            }

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

// 주사위 트레이 보드판 내의 랜덤 좌표를 생성하는 헬퍼 함수
export function generateDiceTrayCoordinates(index) {
    const randomLeft = 70 + (index * 175) + Math.floor(Math.random() * 30); 
    const randomTop = 70 + Math.floor(Math.random() * 450); 
    const randomAngle = Math.floor(Math.random() * 70) - 35; 
    return { 
        randomTop: `${randomTop}px`, 
        randomLeft: `${randomLeft}px`, 
        randomAngle 
    };
}

// 롤 정지 직후 활성 주사위 가로 정중앙 일렬 자동 정렬
export function arrangeActiveDiceInLine() {
    const activeIndices = [];
    state.dice.forEach((d, idx) => {
        if (!d.kept) {
            activeIndices.push(idx);
        }
    });

    const N = activeIndices.length;
    if (N === 0) return;

    const diceSize = 105;
    const gap = 64; 
    const trayWidth = 960;
    
    const totalW = N * diceSize + (N - 1) * gap;
    const startX = (trayWidth - totalW) / 2;
    const centerY = 336;

    activeIndices.forEach((idx, k) => {
        const d = state.dice[idx];
        const x = startX + k * (diceSize + gap) + diceSize / 2;
        
        d.randomLeft = `${x}px`;
        d.randomTop = `${centerY}px`;
        d.randomAngle = 0; 
    });
}

// 킵되지 않은 주사위들 2D 백업 위치 겹침 Constraint Solver
export function resolveStaticCollisions() {
    if (!state.gpuAccelerated) return; 
    
    const activeDice = state.dice.filter((d) => {
        if (d.kept) return false;
        const shouldHide = (state.rollCount === 3) || (state.isRolling && !physicsEngine.running);
        return !shouldHide;
    });

    if (activeDice.length <= 1) return;

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
    const minDist = radius + radius + 9; 
    const trayWidth = 960;
    const keepBoundaryY = 672; 

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

                    c1.x -= nx * overlap * 0.52;
                    c1.y -= ny * overlap * 0.52;
                    c2.x += nx * overlap * 0.52;
                    c2.y += ny * overlap * 0.52;

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

    coords.forEach(c => {
        c.diceObj.randomLeft = `${c.x}px`;
        c.diceObj.randomTop = `${c.y}px`;
    });
}
