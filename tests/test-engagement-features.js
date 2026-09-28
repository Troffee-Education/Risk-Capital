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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runEngagementTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING ENGAGEMENT & 15-ROUND HOST VERIFICATION SUITE');
  console.log('===============================================================');

  const hostSocket = createClientSocket();
  await new Promise(resolve => hostSocket.on('connect', resolve));

  // 1. Create Room
  const createRes = await new Promise(resolve => {
    hostSocket.emit('host:createRoom', { mode: 'mode_macro_15' }, resolve);
  });
  assert(createRes.success, 'Host room creation must succeed');
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;
  console.log(`✅ [1/6] Created room ${roomCode}`);

  // Connect 50 test players
  const players = [];
  for (let i = 1; i <= 50; i++) {
    const pSocket = createClientSocket();
    const pUuid = `test-p-${i}-${Date.now()}`;
    const pName = `Trader_${i}`;
    players.push({ socket: pSocket, uuid: pUuid, name: pName, riskScore: 0 });
    await new Promise(resolve => pSocket.on('connect', resolve));
    await new Promise(resolve => {
      pSocket.emit('player:join', { roomCode, playerId: pUuid, nickname: pName }, resolve);
    });
  }
  console.log(`✅ [2/6] Connected 50 test players to room ${roomCode}`);

  // 2. Start Round 1 -> Verify MARKET_INTEL Server Phase
  const intelPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for MARKET_INTEL phase')), 4000);
    hostSocket.on('host:phaseChange', (data) => {
      if (data.phase === 'MARKET_INTEL') {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });

  hostSocket.emit('host:startRound', { roomCode, hostToken });
  const intelData = await intelPromise;

  assert.strictEqual(intelData.phase, 'MARKET_INTEL', 'Phase must be MARKET_INTEL');
  assert.strictEqual(intelData.roundIndex, 1, 'Round index must be 1');
  assert(intelData.event, 'Event payload must be present');
  assert(intelData.event.persona, 'Event persona must be present');
  assert(intelData.event.headlineText, 'Event headlineText must be present');
  assert(intelData.endTimestamp > Date.now(), 'endTimestamp must be in the future (10s window)');
  console.log(`✅ [3/6] Server-controlled MARKET_INTEL phase broadcast verified: "${intelData.event.headlineText}" by ${intelData.event.persona.name}`);

  // 3. Reconnection Resilience during MARKET_INTEL
  // We disconnect the original hostSocket and reconnect with a new host socket
  hostSocket.disconnect();
  const activeHostSocket = createClientSocket();
  await new Promise(resolve => activeHostSocket.on('connect', resolve));
  const reconnectRes = await new Promise(resolve => {
    activeHostSocket.emit('host:reconnect', { roomCode, hostToken }, resolve);
  });
  assert(reconnectRes.success, 'Host reconnect must succeed');
  assert.strictEqual(reconnectRes.status, 'MARKET_INTEL', 'Restored status must be MARKET_INTEL');
  assert(reconnectRes.currentEvent, 'Restored currentEvent must be present');
  assert(reconnectRes.timerEnd, 'Restored timerEnd must be present');
  console.log(`✅ [4/6] Host reconnection during MARKET_INTEL restores exact sub-phase & timer without desync`);

  // 4. Wait for Decision Window to open
  console.log('⏳ Waiting for auto-transition to decision window (IN_ROUND)...');
  const roundStartedPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for IN_ROUND')), 15000);
    activeHostSocket.on('host:roundStarted', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
  const roundData = await roundStartedPromise;
  assert(roundData.endTimestamp > Date.now(), '25s decision window endTimestamp set');

  // Submit choices to test "Oddest Decision" Spotlight edge case:
  // 48 choose opt_safe, 1 chooses opt_high (2.0% uptake <= 5%), 1 inactive
  for (let i = 0; i < 48; i++) {
    players[i].socket.emit('player:submitChoice', {
      roomCode,
      playerId: players[i].uuid,
      optionId: 'opt_safe'
    });
  }
  // Trader 49 is the rare pick (2.0% uptake)
  players[48].socket.emit('player:submitChoice', {
    roomCode,
    playerId: players[48].uuid,
    optionId: 'opt_high'
  });
  // Trader 50 does not submit (inactive)

  // Wait for round resolution (10s intel + 25s decision window = 35s total)
  console.log('⏳ Waiting for round resolution...');
  const resolutionPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for resolution')), 45000);
    activeHostSocket.on('host:roundResolved', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
  const resStats = await resolutionPromise;

  // Verify Wealth Distribution (5 buckets)
  assert(Array.isArray(resStats.wealthDistribution), 'wealthDistribution must be an array');
  assert.strictEqual(resStats.wealthDistribution.length, 5, 'Must have exactly 5 wealth distribution buckets');
  console.log(`✅ [5/6] Live Wealth Distribution computed 5 lightweight bars:`, resStats.wealthDistribution.map(b => `${b.label}: ${b.percentage}% (${b.count})`).join(' | '));

  // Verify Oddest Decision Spotlight (Trader 49 picked opt_high at 2.0%)
  assert(resStats.outlierPlayer, 'outlierPlayer must be populated when uptake <= 5.0%');
  assert.strictEqual(resStats.outlierPlayer.nickname, players[48].name, 'Trader 49 must be spotlighted');
  assert.strictEqual(resStats.outlierPlayer.optionLabel, 'Crypto Venture', 'Spotlight must display option name');
  console.log(`✅ [6/6] Oddest Decision Spotlight correctly identified rare pick: ${resStats.outlierPlayer.nickname} (${resStats.outlierPlayer.optionLabel} @ ${resStats.outlierPlayer.percentage}%)`);

  // Verify Player Titles in Top 3
  assert(Array.isArray(resStats.top3), 'top3 must be an array');
  assert(resStats.top3.length > 0, 'top3 must have entries');
  for (const leader of resStats.top3) {
    assert(leader.currentTitle, 'Leader must have currentTitle property in payload');
    assert(typeof leader.currentTitle === 'string', 'currentTitle must be a string');
  }
  console.log(`✅ Top 3 Market Leaders with Titles:`, resStats.top3.map(l => `#${l.rank} ${l.nickname} (${l.currentTitle}): $${l.liquidCash}`).join(' | '));

  // 5. Test Hive Mind Fallback Edge Case (All options > 5.0%)
  console.log('🧪 Testing Hive Mind Fallback Edge Case (All options > 5.0%)...');
  const intel2Promise = new Promise(resolve => activeHostSocket.once('host:phaseChange', resolve));
  activeHostSocket.emit('host:nextRound', { roomCode, hostToken });
  await intel2Promise;

  const round2StartedPromise = new Promise(resolve => activeHostSocket.once('host:roundStarted', resolve));
  await round2StartedPromise;

  // 25 pick opt_safe (50%), 25 pick opt_balanced (50%) -> all > 5.0%
  for (let i = 0; i < 25; i++) {
    players[i].socket.emit('player:submitChoice', { roomCode, playerId: players[i].uuid, optionId: 'opt_safe' });
  }
  for (let i = 25; i < 50; i++) {
    players[i].socket.emit('player:submitChoice', { roomCode, playerId: players[i].uuid, optionId: 'opt_balanced' });
  }

  const resStats2 = await new Promise(resolve => activeHostSocket.once('host:roundResolved', resolve));
  assert.strictEqual(resStats2.outlierPlayer, null, 'outlierPlayer must be null when all options > 5.0% uptake');
  console.log(`✅ Hive Mind Fallback correctly triggered (outlierPlayer is null)`);

  // Cleanup
  for (const p of players) {
    p.socket.disconnect();
  }
  activeHostSocket.disconnect();

  console.log('===============================================================');
  console.log('🎉 ALL ENGAGEMENT & HOST SCREEN VERIFICATION TESTS PASSED!');
  console.log('===============================================================');
  process.exit(0);
}

runEngagementTests().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
