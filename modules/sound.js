/* ==========================================
   Yacht Dice - sound.js
   ========================================== */

import { state } from './state.js';

// Audio Synthesizer Engine (Web Audio API)
export const soundEngine = {
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
            const randDelay = progress * duration + (Math.random() * 0.1 - 0.05);
            const time = now + Math.max(0, randDelay);
            
            // 펄스 하나당 길이: 0.04초 ~ 0.07초
            const pDuration = 0.04 + Math.random() * 0.03;
            
            // 볼륨 감쇄
            const volume = (0.22 * (1 - progress)) * (0.6 + Math.random() * 0.4);
            
            this.playNoise(time, pDuration, volume);
        }

        // 2. 승리 선언 찬란한 아르페지오 신스 멜로디 팡파레 믹싱
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00]; // C5, E5, G5, C6, E6, G6, C7
        notes.forEach((freq, idx) => {
            const time = now + idx * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

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

export function playShakeTickSound() {
    soundEngine.init();
    if (!soundEngine.ctx) return;
    const now = soundEngine.ctx.currentTime;
    soundEngine.playNoise(now, 0.045, 0.07);
}
