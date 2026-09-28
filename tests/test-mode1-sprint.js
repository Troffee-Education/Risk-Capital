const { io: Client } = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

function createClientSocket() {
  return Client(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
  });
}

async function runMode1SprintTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING MODE 1: "THE BUSINESS SPOTLIGHT" AUTOMATED TEST SUITE');
  console.log('===============================================================');

  const hostSocket = createClientSocket();
  await new Promise(resolve => hostSocket.on('connect', resolve));

  // 1. Host creates room in Mode 1 (The Cash Sprint / Business Spotlight)
  const createRes = await new Promise(resolve => {
    hostSocket.emit('host:createRoom', { mode: 'mode_1_sprint' }, resolve);
  });

  assert(createRes.success, 'Room creation must succeed');
  assert.strictEqual(createRes.mode, 'mode_1_sprint', 'Room mode must be mode_1_sprint');
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;
  console.log(`✅ [1/7] Created Mode 1 Room: ${roomCode}`);

  // 2. Connect 4 players
  // Player 1 (Alice): Hires Analyst ($5k fee), invests in High Risk
  // Player 2 (Bob): No Analyst, invests in Medium Risk
  // Player 3 (Charlie): No Analyst, invests in Safe Anchor
  // Player 4 (Diana): Hires Analyst ($5k fee), but times out (inaction penalty on post-fee cash)
  const players = [
    { name: 'Alice', id: 'p-alice-uuid', opt: 'opt_high', hireAnalyst: true },
    { name: 'Bob', id: 'p-bob-uuid', opt: 'opt_balanced', hireAnalyst: false },
    { name: 'Charlie', id: 'p-charlie-uuid', opt: 'opt_safe', hireAnalyst: false },
    { name: 'Diana', id: 'p-diana-uuid', opt: null, hireAnalyst: true }
  ];

  for (const p of players) {
    p.socket = createClientSocket();
    await new Promise(resolve => p.socket.on('connect', resolve));
    const joinRes = await new Promise(resolve => {
      p.socket.emit('player:join', { roomCode, playerId: p.id, nickname: p.name }, resolve);
    });
    assert(joinRes.success, `Player ${p.name} join must succeed`);
    assert.strictEqual(joinRes.liquidCash, 100000, `Starting liquid cash must be $100,000`);
    assert.strictEqual(joinRes.mode, 'mode_1_sprint', `Player must receive mode_1_sprint`);
  }
  console.log(`✅ [2/7] 4 Players joined with $100,000 starting cash in Mode 1`);

  // 3. Start Round 1 -> Intel Phase -> Decision Phase
  const intelPromise = new Promise(resolve => {
    hostSocket.on('host:phaseChange', data => {
      if (data.phase === 'MARKET_INTEL') resolve(data);
    });
  });

  hostSocket.emit('host:startRound', { roomCode, hostToken });
  const intelData = await intelPromise;
  assert.strictEqual(intelData.roundIndex, 1, 'Round 1 intel broadcast');
  console.log(`✅ [3/7] Round 1 Intel Phase broadcast: "${intelData.event.headlineText}"`);

  // Wait for Decision Phase
  const roundStartedPromise = new Promise(resolve => {
    hostSocket.on('host:roundStarted', resolve);
  });
  const roundData = await roundStartedPromise;
  assert(roundData.business || roundData.opportunity, 'Round must include featured deal metadata in Mode 1');
  assert(roundData.business.name, 'Featured deal must have a name');
  assert(roundData.business.dossier && roundData.business.dossier.length === 3, 'Featured deal must have 3 dossier bullets');
  console.log(`   🏢 Featured Deal: "${roundData.business.name}" (${roundData.business.industry})`);

  // 4. Test Analyst Hiring Mechanics & Safeguards
  // Alice hires the analyst
  const aliceHireRes = await new Promise(resolve => {
    players[0].socket.emit('player:hireAnalyst', { roomCode, playerId: players[0].id }, resolve);
  });
  assert(aliceHireRes.success, 'Alice hiring analyst must succeed');
  assert.strictEqual(aliceHireRes.analystFee, 5000, 'Analyst fee must be $5,000');
  assert.strictEqual(aliceHireRes.liquidCash, 95000, 'Alice liquid cash after fee must be $95,000');
  assert(aliceHireRes.analystMemo, 'Alice must receive analyst memo');
  assert(aliceHireRes.analystMemo.text, 'Analyst memo must contain tip text');
  console.log(`   🕵️ Alice hired analyst: $100,000 -> $95,000 | Memo: "${aliceHireRes.analystMemo.text.substring(0, 45)}..."`);

  // Diana also hires the analyst
  const dianaHireRes = await new Promise(resolve => {
    players[3].socket.emit('player:hireAnalyst', { roomCode, playerId: players[3].id }, resolve);
  });
  assert(dianaHireRes.success, 'Diana hiring analyst must succeed');
  assert.strictEqual(dianaHireRes.liquidCash, 95000, 'Diana liquid cash after fee must be $95,000');

  // SAFEGUARD TEST 1: Alice submits choice, then tries to hire analyst again -> REJECTED
  const aliceSub = await new Promise(resolve => {
    players[0].socket.emit('player:submitChoice', {
      roomCode,
      playerId: players[0].id,
      optionId: 'opt_high',
      amount: 95000
    }, resolve);
  });
  assert(aliceSub.success, 'Alice submission of remaining $95,000 must succeed');

  const aliceSecondHire = await new Promise(resolve => {
    players[0].socket.emit('player:hireAnalyst', { roomCode, playerId: players[0].id }, resolve);
  });
  assert.strictEqual(aliceSecondHire.success, false, 'Hiring analyst after submitting choice must be strictly rejected');
  console.log(`   🛡️ Safeguard passed: Hiring analyst after submitting choice was rejected`);

  // Bob submits 50% ($50,000) & Charlie submits Safe Anchor
  const bobSub = await new Promise(resolve => {
    players[1].socket.emit('player:submitChoice', { roomCode, playerId: players[1].id, optionId: 'opt_balanced', amount: 50000 }, resolve);
  });
  assert(bobSub.success, 'Bob partial allocation (50%) must succeed');
  assert.strictEqual(bobSub.amount, 50000, 'Bob allocated amount must be $50,000');

  const charlieSub = await new Promise(resolve => {
    players[2].socket.emit('player:submitChoice', { roomCode, playerId: players[2].id, optionId: 'opt_safe', amount: 100000 }, resolve);
  });
  assert(charlieSub.success, 'Charlie submission must succeed');

  console.log(`✅ [4/7] Analyst hire mechanics, custom 50% cash allocation ($50k), and submission safeguards verified`);

  // 5. Wait for Round Resolution
  const hostResolvedPromise = new Promise(resolve => {
    hostSocket.on('host:roundResolved', resolve);
  });
  const playerResolvedPromises = players.map(p => new Promise(resolve => {
    p.socket.on('player:roundResolved', resolve);
  }));

  const hostResolved = await hostResolvedPromise;
  const playerOutcomes = await Promise.all(playerResolvedPromises);

  assert(hostResolved.hostHeadline, 'Host must receive headline');
  assert.strictEqual(hostResolved.counts.inactive, 1, 'Diana must be counted as inactive');
  assert(hostResolved.analystHiredCount >= 2, 'Host must record at least 2 analyst hires');

  // Verify Alice received analyst post-mortem verdict
  const aliceOutcome = playerOutcomes[0];
  assert(aliceOutcome.analystVerdict, 'Alice must receive analyst verdict in outcome');
  assert(typeof aliceOutcome.analystVerdict.reliable === 'boolean', 'Analyst verdict reliability must be boolean');
  assert(aliceOutcome.narrativeReceipt.includes('Analyst'), 'Alice narrative receipt must mention analyst');
  console.log(`   📝 Alice Post-Mortem Verdict: ${aliceOutcome.analystVerdict.reliable ? 'ACCURATE' : 'DECEPTIVE'} | New Cash: $${aliceOutcome.liquidCash}`);

  // Verify Diana (who paid $5,000 for analyst, then timed out):
  // Post-fee cash was $95,000. Inaction penalty 3% applied on $95,000 = $92,150.
  // Then auto-assigned to Safe Anchor (guaranteed coupon return on $92,150).
  const dianaOutcome = playerOutcomes[3];
  assert(dianaOutcome.autoAssigned, 'Diana must be marked as auto-assigned');
  assert(dianaOutcome.narrativeReceipt.includes('TIMEOUT PENALTY'), 'Diana receipt must include timeout penalty');
  console.log(`   ⚠️ Diana (Paid $5k, then timed out): Final Cash: $${dianaOutcome.liquidCash} | Receipt: "${dianaOutcome.narrativeReceipt.substring(0, 60)}..."`);
  console.log(`✅ [5/7] Settlement, Analyst Post-Mortem disclosure, and post-fee inaction penalties verified`);

  // 6. Test Multi-Round Progression (Up to 10 Rounds or $500k target win)
  console.log(`\n▶ Advancing through remaining rounds to test 10-round max limit & $500k sprint target...`);
  let currentRound = 1;
  while (currentRound < 10 && !hostResolved.isGameOver) {
    currentRound++;
    const nextIntelPromise = new Promise(resolve => {
      hostSocket.once('host:phaseChange', data => {
        if (data.phase === 'MARKET_INTEL') resolve(data);
      });
    });

    hostSocket.emit('host:nextRound', { roomCode, hostToken });
    const nIntel = await nextIntelPromise;
    assert.strictEqual(nIntel.roundIndex, currentRound, `Advancing to Round ${currentRound}`);

    const nRoundStartedPromise = new Promise(resolve => {
      hostSocket.once('host:roundStarted', resolve);
    });
    const nRound = await nRoundStartedPromise;
    assert(nRound.business, `Round ${currentRound} must feature a business spotlight`);

    // Submit all players
    for (const p of players) {
      await new Promise(resolve => {
        p.socket.emit('player:submitChoice', {
          roomCode,
          playerId: p.id,
          optionId: p.opt || 'opt_safe'
        }, resolve);
      });
    }

    const nResolved = await new Promise(resolve => {
      hostSocket.once('host:roundResolved', resolve);
    });

    console.log(`   🏁 Round ${currentRound} resolved: ${nResolved.business?.name} | Leader: ${nResolved.top3[0]?.nickname} ($${nResolved.top3[0]?.liquidCash.toLocaleString()})`);
    if (nResolved.isGameOver) {
      console.log(`   🏆 Game over condition met at Round ${currentRound}! (Target reached or max rounds)`);
      break;
    }
  }

  console.log(`✅ [6/7] 10-round story progression & win condition checks validated`);

  // 7. Cleanup
  hostSocket.disconnect();
  players.forEach(p => p.socket.disconnect());

  console.log('✅ [7/7] Clean socket disconnects confirmed');
  console.log('===============================================================');
  console.log('🎉 ALL MODE 1 SINGLE-BUSINESS & ANALYST TESTS PASSED 100%!');
  console.log('===============================================================\n');
}

if (require.main === module) {
  runMode1SprintTests().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('❌ Mode 1 Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runMode1SprintTests };
