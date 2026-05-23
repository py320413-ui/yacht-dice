/* ==========================================
   Yacht Dice - ai.js (AI Strategy Simulator)
   ========================================== */

import { CATEGORIES_LIST } from './state.js';

// 1. Core Interface: Get keep decisions for AI
export function getAIKeeps(diceValues, scoreMap, difficulty) {
    if (difficulty === 'easy') {
        return getEasyAIKeeps(diceValues);
    } else if (difficulty === 'normal') {
        return getNormalAIKeeps(diceValues, scoreMap);
    } else {
        return getHardAIKeeps(diceValues, scoreMap);
    }
}

// 2. Core Interface: Get category selection for AI
export function getAIScoreChoice(computedScores, scoreMap, difficulty) {
    if (difficulty === 'easy') {
        const emptyCats = CATEGORIES_LIST.filter(c => scoreMap[c] === null);
        return emptyCats[Math.floor(Math.random() * emptyCats.length)];
    } else if (difficulty === 'normal') {
        return getNormalAIScoreChoice(computedScores, scoreMap);
    } else {
        return getHardAIScoreChoice(computedScores, scoreMap);
    }
}

// ── 쉬움(Easy) AI 알고리즘 ──
function getEasyAIKeeps(diceValues) {
    return diceValues.map(() => Math.random() > 0.6); // 40% 확률로 무작위 킵
}

// ── 보통(Normal) AI 알고리즘 (Heuristics 기반) ──
function getNormalAIKeeps(diceValues, score) {
    const counts = {};
    diceValues.forEach(v => counts[v] = (counts[v] || 0) + 1);

    // Rule A: Yacht 비어있고 3개 혹은 4개 매칭 시 킵 진행
    if (score['yacht'] === null) {
        for (let num in counts) {
            if (counts[num] >= 3) {
                return diceValues.map(v => v === parseInt(num));
            }
        }
    }

    // Rule B: Straight 사냥
    const sortedUnique = [...new Set(diceValues)].sort((a,b)=>a-b);
    const uStr = sortedUnique.join('');
    if (score['lstraight'] === null || score['sstraight'] === null) {
        if (uStr.includes('1234') || uStr.includes('2345') || uStr.includes('3456')) {
            return diceValues.map(v => sortedUnique.slice(0,4).includes(v));
        }
    }

    // Rule C: 하이 매칭 숫자 (페어 이상) 킵
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

    return [false, false, false, false, false];
}

function getNormalAIScoreChoice(computed, score) {
    const candidates = CATEGORIES_LIST.filter(c => score[c] === null);
    
    const maxScores = {
        ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30,
        choice: 30, '4ofkind': 30, fullhouse: 30, sstraight: 15, lstraight: 30, yacht: 50
    };

    let bestCat = candidates[0];
    let bestRatio = -1;

    candidates.forEach(c => {
        const ratio = computed[c] / (maxScores[c] || 1);
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

// ── 어려움(Hard) AI 알고리즘 (Expectation-Value 기댓값 근사 연산 모델) ──
function getHardAIKeeps(diceValues, score) {
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

    // Upper Section Bonus hunt priority
    const upperKeys = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
    
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
    
    let bestCat = candidates[0];
    let bestUtility = -9999;

    candidates.forEach(c => {
        let scoreVal = computed[c];
        let utility = scoreVal;

        // 상단 항목 보너스 동기 가중치 부여 및 0점 기입 패널티 부과
        if (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].includes(c)) {
            if (scoreVal === 0) utility -= 10; 
            utility += (scoreVal * 1.5);
        }

        // 희생 전략 기여 가중치 (0점을 적어야 할 때 희귀 족보인 Yacht나 L.Straight를 먼저 버림)
        if (scoreVal === 0) {
            if (c === 'yacht') utility = -1; 
            if (c === 'lstraight') utility = -2;
            if (c === 'sstraight') utility = -3;
            if (c === 'fullhouse') utility = -4;
            if (c === '4ofkind') utility = -5;
            if (c === 'choice') utility = -100; // Choice 0점 기입은 절대 금지
        } else {
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
