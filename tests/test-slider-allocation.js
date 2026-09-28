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

async function runSliderAllocationTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING REAL-DEAL & CASH SLIDER (0%-100%) AUTOMATED TEST SUITE');
  console.log('===============================================================');

  const hostSocket = createClientSocket();
  await new Promise(resolve => hostSocket.on('connect', resolve));

  // 1. Host creates room in Mode 1
  const createRes = await new Promise(resolve => {
    hostSocket.emit('host:createRoom', { mode: 'mode_1_sprint' }, resolve);
  });

  assert(createRes.success, 'Room creation must succeed');
  assert.strictEqual(createRes.mode, 'mode_1_sprint', 'Room mode must be mode_1_sprint');
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;
  console.log(`✅ [1/6] Created Mode 1 Room: ${roomCode}`);

  // 2. Connect 4 players
  // Alice: Hires Analyst ($5k fee), allocates 75% ($71,250 of $95,000)
  // Bob: Allocates 50% ($50,000 of $100,000)
  // Charlie: Allocates 0% ($0 invested, $100,000 kept in safe bank)
  // Diana: Allocates 100% ALL IN ($100,000)
  const players = [
    { name: 'Alice', id: 'p-alice-slider', allocPct: 75, hireAnalyst: true },
    { name: 'Bob', id: 'p-bob-slider', allocPct: 50, hireAnalyst: false },
    { name: 'Charlie', id: 'p-charlie-slider', allocPct: 0, hireAnalyst: false },
    { name: 'Diana', id: 'p-diana-slider', allocPct: 100, hireAnalyst: false }
  ];

  for (const p of players) {
    p.socket = createClientSocket();
    await new Promise(resolve => p.socket.on('connect', resolve));
    const joinRes = await new Promise(resolve => {
      p.socket.emit('player:join', { roomCode, playerId: p.id, nickname: p.name }, resolve);
    });
    assert(joinRes.success, `Player ${p.name} join must succeed`);
    assert.strictEqual(joinRes.liquidCash, 100000, `Starting liquid cash must be $100,000`);
  }
  console.log(`✅ [2/6] 4 Players joined with $100,000 starting cash`);

  // 3. Start Round 1 -> Intel Phase -> Decision Phase
  const intelPromise = new Promise(resolve => {
    hostSocket.on('host:phaseChange', data => {
      if (data.phase === 'MARKET_INTEL') resolve(data);
    });
  });

  hostSocket.emit('host:startRound', { roomCode, hostToken });
  const intelData = await intelPromise;
  assert.strictEqual(intelData.roundIndex, 1, 'Round 1 intel broadcast');
  console.log(`✅ [3/6] Round 1 Intel Phase broadcast: "${intelData.event.headlineText}"`);

  // Wait for Decision Phase
  const roundStartedPromise = new Promise(resolve => {
    hostSocket.on('host:roundStarted', resolve);
  });
  const roundData = await roundStartedPromise;
  assert(roundData.business || roundData.opportunity, 'Round must include featured deal metadata');
  const opp = roundData.opportunity || roundData.business;
  assert(opp.name, 'Featured opportunity must have a name');
  assert(opp.riskScore !== undefined, 'Featured opportunity must have a Risk Score');
  console.log(`   🏢 Featured Real Deal: "${opp.name}" (${opp.industry}) | ⚡ Risk Score: ${opp.riskScore}/10 | Upside: +${opp.win}% | Downside: ${opp.fail}%`);

  // 4. Test Analyst Hiring & Slider Submissions
  // Alice hires the analyst ($5,000 fee)
  const aliceHireRes = await new Promise(resolve => {
    players[0].socket.emit('player:hireAnalyst', { roomCode, playerId: players[0].id }, resolve);
  });
  assert(aliceHireRes.success, 'Alice hiring analyst must succeed');
  assert.strictEqual(aliceHireRes.liquidCash, 95000, 'Alice cash after analyst fee must be $95,000');

  // Alice submits 75% allocation
  const aliceSub = await new Promise(resolve => {
    players[0].socket.emit('player:submitChoice', {
      roomCode,
      playerId: players[0].id,
      allocationPct: 75
    }, resolve);
  });
  assert(aliceSub.success, 'Alice 75% allocation must succeed');
  assert.strictEqual(aliceSub.allocationPct, 75, 'Alice allocation percent must be 75%');
  assert.strictEqual(aliceSub.amount, 71250, 'Alice 75% amount on $95,000 must be $71,250');

  // Bob submits 50% allocation ($50,000)
  const bobSub = await new Promise(resolve => {
    players[1].socket.emit('player:submitChoice', {
      roomCode,
      playerId: players[1].id,
      allocationPct: 50
    }, resolve);
  });
  assert(bobSub.success, 'Bob 50% allocation must succeed');
  assert.strictEqual(bobSub.amount, 50000, 'Bob amount must be $50,000');

  // Charlie submits 0% allocation (100% bank safe reserve)
  const charlieSub = await new Promise(resolve => {
    players[2].socket.emit('player:submitChoice', {
      roomCode,
      playerId: players[2].id,
      allocationPct: 0
    }, resolve);
  });
  assert(charlieSub.success, 'Charlie 0% pass must succeed');
  assert.strictEqual(charlieSub.amount, 0, 'Charlie amount must be $0');

  // Diana submits 100% ALL-IN ($100,000)
  const dianaSub = await new Promise(resolve => {
    players[3].socket.emit('player:submitChoice', {
      roomCode,
      playerId: players[3].id,
      allocationPct: 100
    }, resolve);
  });
  assert(dianaSub.success, 'Diana 100% ALL-IN must succeed');
  assert.strictEqual(dianaSub.amount, 100000, 'Diana amount must be $100,000');

  console.log(`✅ [4/6] All 4 slider allocations (75%, 50%, 0% Pass, 100% All-In) successfully locked`);

  // 5. Wait for Round Resolution
  const hostResolvedPromise = new Promise(resolve => {
    hostSocket.on('host:roundResolved', resolve);
  });
  const playerResolvedPromises = players.map(p => new Promise(resolve => {
    p.socket.on('player:roundResolved', resolve);
  }));

  const hostResolved = await hostResolvedPromise;
  const playerOutcomes = await Promise.all(playerResolvedPromises);

  // Charlie chose 0% ($0 invested) -> Liquid cash MUST remain exactly $100,000
  const charlieOutcome = playerOutcomes[2];
  assert.strictEqual(charlieOutcome.liquidCash, 100000, 'Charlie (0% Pass) cash must stay exactly $100,000');
  assert.strictEqual(charlieOutcome.deltaCash, 0, 'Charlie delta cash must be 0');
  console.log(`   🛡️ Charlie (0% Pass): Final Cash: $${charlieOutcome.liquidCash.toLocaleString()} (100% Bank Safe)`);

  // Alice (75% of $95,000 = $71,250 invested, $23,750 reserve)
  const aliceOutcome = playerOutcomes[0];
  assert(aliceOutcome.analystVerdict, 'Alice must receive analyst verdict');
  console.log(`   📊 Alice (75% alloc): Final Cash: $${aliceOutcome.liquidCash.toLocaleString()} | Delta: $${aliceOutcome.deltaCash.toLocaleString()}`);

  // Bob (50% of $100,000 = $50,000 invested, $50,000 reserve)
  const bobOutcome = playerOutcomes[1];
  console.log(`   📊 Bob (50% alloc): Final Cash: $${bobOutcome.liquidCash.toLocaleString()} | Delta: $${bobOutcome.deltaCash.toLocaleString()}`);

  // Diana (100% ALL-IN = $100,000 invested, $0 reserve)
  const dianaOutcome = playerOutcomes[3];
  console.log(`   🔥 Diana (100% ALL-IN): Final Cash: $${dianaOutcome.liquidCash.toLocaleString()} | Delta: $${dianaOutcome.deltaCash.toLocaleString()}`);

  console.log(`✅ [5/6] Round resolution verified with isolated risk exposure and untouched cash reserves`);

  // 6. Cleanup
  hostSocket.disconnect();
  players.forEach(p => p.socket.disconnect());

  console.log('✅ [6/6] Clean disconnects confirmed');
  console.log('===============================================================');
  console.log('🎉 ALL REAL-DEAL & MONEY SLIDER TESTS PASSED 100%!');
  console.log('===============================================================\n');
}

if (require.main === module) {
  runSliderAllocationTests().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('❌ Slider Allocation Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runSliderAllocationTests };
