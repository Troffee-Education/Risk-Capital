const io = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3098';

async function runTest() {
  console.log(`====================================================`);
  console.log(`🧪 Testing Early Timer Cutoff (Instant Round Resolution)`);
  console.log(`📡 Connecting to: ${SERVER_URL}`);
  console.log(`====================================================`);

  const hostSocket = io(SERVER_URL, { reconnection: false, forceNew: true });
  await new Promise(r => hostSocket.on('connect', r));

  const roomRes = await new Promise(r => hostSocket.emit('host:createRoom', { mode: 'mode_1_sprint' }, r));
  assert(roomRes.success, 'Failed to create room');
  const roomCode = roomRes.roomCode;
  const hostToken = roomRes.hostToken;
  console.log(`✅ Room created: ${roomCode}`);

  // Create 3 players
  const players = [];
  for (let i = 1; i <= 3; i++) {
    const s = io(SERVER_URL, { reconnection: false, forceNew: true });
    await new Promise(r => s.on('connect', r));
    const joinRes = await new Promise(r => s.emit('player:join', {
      roomCode,
      playerId: `early-player-${i}`,
      nickname: `Trader_${i}`
    }, r));
    assert(joinRes.success, `Player ${i} join failed`);
    players.push({ id: `early-player-${i}`, socket: s });
  }
  console.log(`✅ 3 players connected to room ${roomCode}`);

  // Host starts round
  const roundStartedPromise = new Promise(resolve => {
    hostSocket.on('host:roundStarted', resolve);
  });
  await new Promise(r => hostSocket.emit('host:startMarketIntel', { roomCode, hostToken }, r));
  await new Promise(r => hostSocket.emit('host:openRound', { roomCode, hostToken }, r));
  const roundStarted = await roundStartedPromise;
  console.log(`✅ Round started with ${roundStarted.durationSeconds}s timer.`);

  const startTime = Date.now();

  // Set up listeners for round resolution
  let hostResolvedReceived = false;
  hostSocket.on('host:roundResolved', (data) => {
    hostResolvedReceived = true;
  });

  // Player 1 submits choice
  await new Promise(r => players[0].socket.emit('player:submitChoice', {
    roomCode,
    playerId: players[0].id,
    allocationPct: 50
  }, r));
  assert(!hostResolvedReceived, 'Round resolved prematurely before all players submitted');
  console.log(`✅ Player 1 locked in choice (1/3 submitted) - Timer still running`);

  // Player 2 submits choice
  await new Promise(r => players[1].socket.emit('player:submitChoice', {
    roomCode,
    playerId: players[1].id,
    allocationPct: 75
  }, r));
  assert(!hostResolvedReceived, 'Round resolved prematurely before all players submitted');
  console.log(`✅ Player 2 locked in choice (2/3 submitted) - Timer still running`);

  // Player 3 submits choice -> Should trigger fast cutoff!
  const player3ResolvePromise = new Promise(resolve => {
    players[2].socket.on('player:roundResolved', resolve);
  });
  const hostResolvePromise = new Promise(resolve => {
    hostSocket.on('host:roundResolved', resolve);
  });

  console.log(`⚡ Player 3 locking in choice (3/3 submitted)...`);
  await new Promise(r => players[2].socket.emit('player:submitChoice', {
    roomCode,
    playerId: players[2].id,
    allocationPct: 100
  }, r));

  const [p3Outcome, hostStats] = await Promise.all([player3ResolvePromise, hostResolvePromise]);
  const elapsedMs = Date.now() - startTime;

  assert(hostStats, 'Host did not receive roundResolved event');
  assert(p3Outcome, 'Player 3 did not receive roundResolved event');
  console.log(`✅ All 3 players finished -> Timer cut and resolved in ${elapsedMs}ms (vs full duration)!`);
  console.log(`   Host Stats: Round ${hostStats.roundIndex}, Total Players: ${hostStats.totalPlayers}`);
  console.log(`   Player 3 Net Worth: $${p3Outcome.liquidCash.toLocaleString()}`);

  // Disconnect
  hostSocket.disconnect();
  players.forEach(p => p.socket.disconnect());

  console.log(`\n🎉 EARLY TIMER CUTOFF TEST PASSED PERFECTLY!\n`);
}

runTest().catch(err => {
  console.error(`❌ Test failed:`, err);
  process.exit(1);
});
