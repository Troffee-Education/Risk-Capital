// Automated End-to-End Test for Cash Frenzy / Greed Grab Mini-Game
const io = require('socket.io-client');
const http = require('http');

const PORT = 3110;
const SERVER_URL = `http://localhost:${PORT}`;

process.env.PORT = PORT;
process.env.DECISION_DURATION = '200';
process.env.INTEL_DURATION = '100';
process.env.TEST_FAST_TIMERS = 'true';

let serverInstance;

function startServer() {
  return new Promise((resolve) => {
    delete require.cache[require.resolve('./server.js')];
    const app = require('./server.js');
    serverInstance = app.server || app;
    setTimeout(resolve, 500);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance && serverInstance.close) {
      serverInstance.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Cash Frenzy Mini-Game E2E Test Suite');
  console.log('====================================================');

  await startServer();

  const hostSocket = io(SERVER_URL, { reconnection: false, forceNew: true });
  await new Promise(r => hostSocket.on('connect', r));

  // 1. Host creates room
  const createRes = await new Promise(resolve => {
    hostSocket.emit('host:createRoom', { mode: 'mode_1_sprint' }, resolve);
  });
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;
  console.log(`✅ Host created room ${roomCode}`);

  // 2. Connect 3 players: Alice, Bob, Charlie
  const players = [];
  const playerNames = ['Alice', 'Bob', 'Charlie'];
  for (const name of playerNames) {
    const pSock = io(SERVER_URL, { reconnection: false, forceNew: true });
    await new Promise(r => pSock.on('connect', r));
    const joinRes = await new Promise(resolve => {
      pSock.emit('player:joinRoom', { roomCode, nickname: name }, resolve);
    });
    players.push({ name, socket: pSock, id: joinRes.playerId, initialCash: joinRes.liquidCash });
  }
  console.log(`✅ 3 Players joined room: Alice, Bob, Charlie (Initial: $100,000 each)`);

  // 3. Start Round 1 and advance through to Round 5
  console.log('⚡ Fast-forwarding to Round 5...');
  for (let r = 1; r <= 5; r++) {
    if (r === 1) {
      await new Promise(res => hostSocket.emit('host:startRound', { roomCode, hostToken }, res));
    } else {
      await new Promise(res => hostSocket.emit('host:nextRound', { roomCode, hostToken }, res));
    }
    await new Promise(res => hostSocket.once('host:roundResolved', res));

    // If Round 3 just resolved, handle the auto-triggered Liquidity Bomb!
    if (r === 3) {
      console.log('   💣 Round 3 Liquidity Bomb auto-triggered! Advancing after bomb...');
      const bombStartPromise = new Promise(res => hostSocket.once('host:bombMinigameStarted', res));
      await new Promise(res => hostSocket.emit('host:nextRound', { roomCode, hostToken }, res));
      await bombStartPromise;
      // Wait for bomb to resolve
      await new Promise(res => hostSocket.once('host:bombResolved', res));
      // Continue to Round 4
      await new Promise(res => hostSocket.emit('host:continueAfterBomb', { roomCode, hostToken }, res));
      await new Promise(res => hostSocket.once('host:roundResolved', res)); // Wait for Round 4 resolution
      r = 4; // Advanced through Round 4
    }
  }
  console.log('✅ Round 5 resolved.');

  // 4. Host advances after Round 5 -> Expect auto-trigger of Cash Frenzy!
  console.log('🚀 Host triggering advance after Round 5 (Expecting Cash Frenzy Mini-Game)...');

  const frenzyStartPromise = Promise.all([
    new Promise(res => hostSocket.once('host:frenzyStarted', res)),
    ...players.map(p => new Promise(res => p.socket.once('player:frenzyStarted', res)))
  ]);

  await new Promise(res => hostSocket.emit('host:nextRound', { roomCode, hostToken }, res));
  const [hostFrenzyStart, ...playerStarts] = await frenzyStartPromise;

  if (!hostFrenzyStart || hostFrenzyStart.durationSeconds !== 5) {
    throw new Error('Host did not receive valid host:frenzyStarted payload');
  }
  console.log(`✅ Cash Frenzy successfully auto-triggered! Duration: ${hostFrenzyStart.durationSeconds}s, Ready: ${hostFrenzyStart.readySeconds}s`);

  // 5. Simulate Rapid Tap Events
  console.log('⚡ Simulating rapid player taps...');
  for (let i = 0; i < 10; i++) {
    players[0].socket.emit('player:frenzyTap', { roomCode, playerId: players[0].id, type: 'cash' });
  }
  for (let i = 0; i < 4; i++) {
    players[1].socket.emit('player:frenzyTap', { roomCode, playerId: players[1].id, type: 'golden' });
  }
  for (let i = 0; i < 2; i++) {
    players[2].socket.emit('player:frenzyTap', { roomCode, playerId: players[2].id, type: 'toxic' });
  }

  // 6. Wait for Frenzy Resolution
  const frenzyResolvedPromise = Promise.all([
    new Promise(res => hostSocket.once('host:frenzyResolved', res)),
    ...players.map(p => new Promise(res => p.socket.once('player:frenzyResolved', res)))
  ]);

  const [hostResolution, aliceRes, bobRes, charlieRes] = await frenzyResolvedPromise;

  console.log(`✅ Cash Frenzy Resolved! Total Room Cash Injected: $${hostResolution.totalRoomCash.toLocaleString()}`);
  console.log(`   MVP Tapper: ${hostResolution.mvpTapper?.nickname} (Earned: $${hostResolution.mvpTapper?.cashEarned.toLocaleString()})`);

  if (bobRes.cashEarned !== 12000) {
    throw new Error(`Expected Bob to earn $12,000, got ${bobRes.cashEarned}`);
  }
  if (aliceRes.cashEarned !== 10000) {
    throw new Error(`Expected Alice to earn $10,000, got ${aliceRes.cashEarned}`);
  }
  if (charlieRes.cashEarned !== -5000) {
    throw new Error(`Expected Charlie to earn -$5,000, got ${charlieRes.cashEarned}`);
  }

  console.log(`✅ Verified Alice: +$10,000, Bob: +$12,000 (MVP), Charlie: -$5,000`);

  // 7. Host continues to Round 6
  console.log('⚡ Host continuing to Round 6...');
  const round6Promise = new Promise(res => hostSocket.once('host:marketIntelPhase', res));
  await new Promise(res => hostSocket.emit('host:continueAfterFrenzy', { roomCode, hostToken }, res));
  const round6Intel = await round6Promise;

  if (round6Intel.roundIndex !== 6) {
    throw new Error(`Expected Round 6, got Round ${round6Intel.roundIndex}`);
  }
  console.log(`✅ Seamlessly transitioned into Round 6 Market Intel!`);

  // Cleanup
  hostSocket.disconnect();
  players.forEach(p => p.socket.disconnect());
  await stopServer();

  console.log('====================================================');
  console.log('🎉 ALL CASH FRENZY MINI-GAME TESTS PASSED PERFECTLY!');
  console.log('====================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
