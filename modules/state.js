/* ==========================================
   Yacht Dice - state.js
   ========================================== */

// Global Game State
export const state = {
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
    isRolling: false,
    gpuAccelerated: true // 하드웨어 가속 감지 상태값 디폴트 추가
};

// Yacht Dice Categories
export const CATEGORIES = {
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

export const CATEGORIES_LIST = Object.keys(CATEGORIES);
