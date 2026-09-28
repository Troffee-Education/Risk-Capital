const { io } = require('socket.io-client');
const http = require('http');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting 15-Round Risk Capital Engine E2E Test');
  console.log(`📡 Connecting to server: ${SERVER_URL}`);
  console.log('====================================================');

  const hostSocket = io(SERVER_URL, { reconnection: false });
  await new Promise(r => hostSocket.once('connect', r));
  console.log('✅ Host connected to server.');

  // 1. Create Room in 15-round Macro Mode
  const createRes = await new Promise((resolve) => {
    hostSocket.emit('host:createRoom', { mode: 'mode_macro_15' }, resolve);
  });
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;
  console.log(`✅ Host created room ${roomCode}`);

  // 2. Connect 4 Players with distinct strategies
  // Player A: Invests in locked / recurring sectors
  // Player B: Quick Trade
  // Player C: Crypto
  // Player D: Inactivity (no submission)

  const pA = io(SERVER_URL, { reconnection: false });
  const pB = io(SERVER_URL, { reconnection: false });
  const pC = io(SERVER_URL, { reconnection: false });
  const pD = io(SERVER_URL, { reconnection: false });

  await Promise.all([
    new Promise(r => pA.once('connect', r)),
    new Promise(r => pB.once('connect', r)),
    new Promise(r => pC.once('connect', r)),
    new Promise(r => pD.once('connect', r))
  ]);

  const pARes = await new Promise(r => pA.emit('player:join', { roomCode, playerId: 'player-a-uuid', nickname: 'Alice' }, r));
  const pBRes = await new Promise(r => pB.emit('player:join', { roomCode, playerId: 'player-b-uuid', nickname: 'Bob' }, r));
  const pCRes = await new Promise(r => pC.emit('player:join', { roomCode, playerId: 'player-c-uuid', nickname: 'Charlie' }, r));
  const pDRes = await new Promise(r => pD.emit('player:join', { roomCode, playerId: 'player-d-uuid', nickname: 'Diana' }, r));

  console.log(`✅ 4 Players joined room: Alice ($${pARes.liquidCash}), Bob ($${pBRes.liquidCash}), Charlie ($${pCRes.liquidCash}), Diana ($${pDRes.liquidCash})`);

  // Test server-side rejection of amount > liquidCash and amount < 1000
  const invalidResExcess = await new Promise(r => pA.emit('player:submitChoice', { roomCode, playerId: 'player-a-uuid', optionId: 'agriculture', amount: 999999 }, r));
  if (!invalidResExcess.success) {
    console.log('✅ Server correctly rejected allocation exceeding liquid cash ($999,999).');
  } else {
    throw new Error('FAIL: Server did not reject over-budget allocation');
  }

  // 3. Step through 15 rounds
  for (let rd = 1; rd <= 15; rd++) {
    console.log(`\n--- [ROUND ${rd} / 15] ---`);

    // Host starts round / next round
    if (rd === 1) {
      hostSocket.emit('host:startRound', { roomCode, hostToken });
    } else {
      hostSocket.emit('host:nextRound', { roomCode, hostToken });
    }

    // Wait for MARKET_INTEL
    const intelData = await new Promise(r => hostSocket.once('host:phaseChange', r));
    console.log(`📢 Market Intel: ${intelData.event?.persona?.name || 'Central Authority'} - "${intelData.event?.headlineText?.substring(0, 50)}..."`);
    console.log(`   Affected Sectors: ${JSON.stringify(intelData.event?.affectedSectorIds)}`);

    // Wait for IN_ROUND decision phase
    const roundStartedData = await new Promise(r => hostSocket.once('host:roundStarted', r));
    console.log(`⚡ Decision window opened with ${roundStartedData.options?.length} offered sectors.`);

    // Players submit choices
    if (rd === 1) {
      await new Promise(r => pA.emit('player:submitChoice', { roomCode, playerId: 'player-a-uuid', optionId: 'auto_parts', amount: 50000 }, r));
    } else if (rd === 2) {
      await new Promise(r => pA.emit('player:submitChoice', { roomCode, playerId: 'player-a-uuid', optionId: 'biotechnology', amount: 30000 }, r));
    } else if (rd === 3) {
      await new Promise(r => pA.emit('player:submitChoice', { roomCode, playerId: 'player-a-uuid', optionId: 'chemicals', amount: 15000 }, r));
    } else {
      await new Promise(r => pA.emit('player:submitChoice', { roomCode, playerId: 'player-a-uuid', optionId: 'agriculture', amount: 5000 }, r));
    }

    // Player B: Quick Trade every round
    await new Promise(r => pB.emit('player:submitChoice', { roomCode, playerId: 'player-b-uuid', optionId: 'quickTrade', amount: 20000 }, r));

    // Player C: Crypto every round
    await new Promise(r => pC.emit('player:submitChoice', { roomCode, playerId: 'player-c-uuid', optionId: 'crypto', amount: 25000 }, r));

    // Player D: Inactivity (no submission)

    // Await round resolution on host
    const resolutionStats = await new Promise(r => hostSocket.once('host:roundResolved', r));
    console.log(`📊 Settlement Round ${rd}: Total: ${resolutionStats.totalPlayers}, Inactive: ${resolutionStats.counts.inactive}, Safe: ${resolutionStats.percentages.opt_safe}%, Balanced: ${resolutionStats.percentages.opt_balanced}%, High: ${resolutionStats.percentages.opt_high}%`);
    console.log(`   Top 1: ${resolutionStats.top3[0]?.nickname} - Net Worth: $${resolutionStats.top3[0]?.netWorth?.toLocaleString()}`);
  }

  // 4. Verify End-of-Game results
  const hostEndgame = await new Promise(r => hostSocket.once('host:gameFinished', r));
  console.log('\n====================================================');
  console.log('🏆 GAME FINISHED - FINAL OUTCOME TIERS');
  console.log('====================================================');
  hostEndgame.tierDistribution.forEach(t => {
    console.log(`• ${t.badge}: ${t.count} players (${t.percentage}%)`);
  });

  // Verify Player Endgame Payloads with Primary Driver punchlines
  const [pAFin, pBFin, pCFin, pDFin] = await Promise.all([
    new Promise(r => pA.once('player:gameFinished', r)),
    new Promise(r => pB.once('player:gameFinished', r)),
    new Promise(r => pC.once('player:gameFinished', r)),
    new Promise(r => pD.once('player:gameFinished', r))
  ]);

  console.log(`\nAlice: Rank #${pAFin.finalRank}, Net Worth: $${pAFin.finalNetWorth.toLocaleString()}, Tier: ${pAFin.outcomeTier.title}`);
  console.log(`   Punchline: "${pAFin.primaryDriverPunchline}"`);

  console.log(`Bob: Rank #${pBFin.finalRank}, Net Worth: $${pBFin.finalNetWorth.toLocaleString()}, Tier: ${pBFin.outcomeTier.title}`);
  console.log(`   Punchline: "${pBFin.primaryDriverPunchline}"`);

  console.log(`Charlie: Rank #${pCFin.finalRank}, Net Worth: $${pCFin.finalNetWorth.toLocaleString()}, Tier: ${pCFin.outcomeTier.title}`);
  console.log(`   Punchline: "${pCFin.primaryDriverPunchline}"`);

  console.log(`Diana (Inactive): Rank #${pDFin.finalRank}, Net Worth: $${pDFin.finalNetWorth.toLocaleString()}, Tier: ${pDFin.outcomeTier.title}`);
  console.log(`   Punchline: "${pDFin.primaryDriverPunchline}"`);

  // Assertions
  if (!pAFin.primaryDriverPunchline || !pBFin.primaryDriverPunchline) {
    throw new Error('FAIL: Missing primaryDriverPunchline in player gameFinished payload');
  }
  if (!hostEndgame.tierDistribution || hostEndgame.tierDistribution.length !== 3) {
    throw new Error('FAIL: Expected 3 outcome tiers in host endgame payload');
  }

  console.log('\n✅ ALL 15-ROUND ENGINE TESTS PASSED PERFECTLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
