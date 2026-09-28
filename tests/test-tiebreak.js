// Deterministic Leaderboard Tie-Break Verification Test
const assert = require('assert');

function sortLeaderboard(playersList) {
  return [...playersList].sort((a, b) => {
    // 1. Higher liquidCash
    if (b.liquidCash !== a.liquidCash) {
      return b.liquidCash - a.liquidCash;
    }
    // 2. Lower cumulative riskScore (rewards achieving same return with less risk taken)
    const aRisk = a.riskScore || 0;
    const bRisk = b.riskScore || 0;
    if (aRisk !== bRisk) {
      return aRisk - bRisk;
    }
    // 3. Earlier player join timestamp (final tiebreaker)
    const aJoin = a.joinedAt || 0;
    const bJoin = b.joinedAt || 0;
    if (aJoin !== bJoin) {
      return aJoin - bJoin;
    }
    // 4. Deterministic string tie-breaker for identical inputs
    return (a.id || '').localeCompare(b.id || '');
  });
}

function computeTop3(playersList) {
  const sorted = sortLeaderboard(playersList);
  return sorted.slice(0, 3).map((p, idx, arr) => {
    const pRisk = p.riskScore || 0;
    const pJoin = p.joinedAt || 0;
    const prev = arr[idx - 1];
    const next = arr[idx + 1];

    const tiedWithPrev = prev && (prev.liquidCash === p.liquidCash && (prev.riskScore || 0) === pRisk && (prev.joinedAt || 0) === pJoin);
    const tiedWithNext = next && (next.liquidCash === p.liquidCash && (next.riskScore || 0) === pRisk && (next.joinedAt || 0) === pJoin);
    const isTied = Boolean(tiedWithPrev || tiedWithNext);

    return {
      rank: idx + 1,
      id: p.id,
      nickname: p.nickname,
      liquidCash: p.liquidCash,
      riskScore: pRisk,
      joinedAt: pJoin,
      isTied
    };
  });
}

console.log('🧪 RUNNING DETERMINISTIC TIE-BREAK UNIT TESTS...\n');

// Test Case 1: Primary Criterion (Higher Cash)
const test1 = [
  { id: 'p1', nickname: 'Alice', liquidCash: 120000, riskScore: 3, joinedAt: 1000 },
  { id: 'p2', nickname: 'Bob', liquidCash: 150000, riskScore: 5, joinedAt: 2000 },
  { id: 'p3', nickname: 'Charlie', liquidCash: 110000, riskScore: 1, joinedAt: 500 }
];
const res1 = computeTop3(test1);
assert.strictEqual(res1[0].nickname, 'Bob', 'Highest cash should be rank 1');
assert.strictEqual(res1[1].nickname, 'Alice', 'Second highest cash should be rank 2');
assert.strictEqual(res1[2].nickname, 'Charlie', 'Third highest cash should be rank 3');
console.log('✓ Test 1 Passed: Primary cash sorting works');

// Test Case 2: Tie-Break Criterion 2 (Equal cash, Lower Risk Score wins)
const test2 = [
  { id: 'p1', nickname: 'HighRiskTrader', liquidCash: 150000, riskScore: 6, joinedAt: 1000 },
  { id: 'p2', nickname: 'PrudentTrader', liquidCash: 150000, riskScore: 2, joinedAt: 2000 },
  { id: 'p3', nickname: 'ThirdPlace', liquidCash: 100000, riskScore: 1, joinedAt: 3000 }
];
const res2 = computeTop3(test2);
assert.strictEqual(res2[0].nickname, 'PrudentTrader', 'Prudent trader (lower risk score) must win the tie');
assert.strictEqual(res2[1].nickname, 'HighRiskTrader', 'Higher risk trader should be second');
console.log('✓ Test 2 Passed: Equal cash tie broken by lower riskScore');

// Test Case 3: Tie-Break Criterion 3 (Equal cash & Equal Risk, Earlier Joiner wins)
const test3 = [
  { id: 'p1', nickname: 'LateJoiner', liquidCash: 150000, riskScore: 3, joinedAt: 5000 },
  { id: 'p2', nickname: 'EarlyJoiner', liquidCash: 150000, riskScore: 3, joinedAt: 1000 },
  { id: 'p3', nickname: 'ThirdPlace', liquidCash: 100000, riskScore: 1, joinedAt: 3000 }
];
const res3 = computeTop3(test3);
assert.strictEqual(res3[0].nickname, 'EarlyJoiner', 'Early joiner must win tie when cash and risk are equal');
assert.strictEqual(res3[1].nickname, 'LateJoiner', 'Late joiner should be second');
console.log('✓ Test 3 Passed: Equal cash + risk tie broken by earlier join timestamp');

// Test Case 4: Complete Tie across all 3 criteria (isTied flag set to true)
const test4 = [
  { id: 'p1', nickname: 'Twin_A', liquidCash: 150000, riskScore: 3, joinedAt: 1000 },
  { id: 'p2', nickname: 'Twin_B', liquidCash: 150000, riskScore: 3, joinedAt: 1000 },
  { id: 'p3', nickname: 'Solo', liquidCash: 100000, riskScore: 1, joinedAt: 1000 }
];
const res4 = computeTop3(test4);
assert.strictEqual(res4[0].isTied, true, 'Twin_A should be marked isTied: true');
assert.strictEqual(res4[1].isTied, true, 'Twin_B should be marked isTied: true');
assert.strictEqual(res4[2].isTied, false, 'Solo should NOT be marked isTied');
console.log('✓ Test 4 Passed: Exact tie across all criteria sets isTied: true gracefully');

// Test Case 5: Mathematical Determinism (100 shuffles produce identical output)
for (let i = 0; i < 100; i++) {
  const shuffled = [...test1, ...test2, ...test3].sort(() => Math.random() - 0.5);
  const result = computeTop3(shuffled);
  assert.strictEqual(result[0].nickname, 'PrudentTrader');
  assert.strictEqual(result[1].nickname, 'EarlyJoiner');
  assert.strictEqual(result[2].nickname, 'LateJoiner');
}
console.log('✓ Test 5 Passed: Strict determinism verified across 100 randomized input shuffles\n');

console.log('🎉 ALL TIE-BREAK TESTS PASSED FLAWLESSLY!');
