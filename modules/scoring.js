/* ==========================================
   Yacht Dice - scoring.js
   ========================================== */

// Yacht Dice Combinations & Scoring Logic
export function calculateScores(diceValues) {
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
    const uStr = unique.join('');
    if (uStr.includes('1234') || uStr.includes('2345') || uStr.includes('3456')) {
        scores['sstraight'] = 15;
    }

    // Large Straight (5 consecutive dice)
    if (uStr === '12345' || uStr === '23456') {
        scores['lstraight'] = 30;
    }

    // Yacht (5 of a kind)
    if (Object.values(counts).includes(5)) {
        scores['yacht'] = 50;
    }

    return scores;
}

export function getCategoryLabel(cat) {
    const labels = {
        ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
        choice: 'Choice', '4ofkind': '4 of a Kind', fullhouse: 'Full House',
        sstraight: 'Small Straight', lstraight: 'Large Straight', yacht: 'Yacht'
    };
    return labels[cat] || cat;
}
