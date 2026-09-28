// Automated Stress and Verification Test for Risk Capital (500 Concurrent Clients)
const { io } = require('socket.io-client');
const assert = require('assert');

// Support configurable target URL via CLI or env (e.g. SERVER_URL=https://my-app.onrender.com node test-simulation.js)
const SERVER_URL = process.env.SERVER_URL || process.argv[2] || 'http://localhost:3000';
const NUM_PLAYERS = parseInt(process.env.NUM_PLAYERS || '500', 10);
const BATCH_SIZE = 50; // Batch connection concurrency to simulate high burst without local socket exhaustion

function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getMemoryReport() {
  const mem = process.memoryUsage();
  return {
    rss: formatBytes(mem.rss),
    heapUsed: formatBytes(mem.heapUsed),
    heapTotal: formatBytes(mem.heapTotal),
    external: formatBytes(mem.external)
  };
}

async function runTest() {
  console.log('================================================================');
  console.log(`🧪 RISK CAPITAL 500-PLAYER REALTIME LOAD & RESILIENCE TEST`);
  console.log(`🎯 Target Endpoint: ${SERVER_URL}`);
  console.log(`👥 Target Scale:    ${NUM_PLAYERS} Concurrent Player Connections`);
  console.log('================================================================\n');

  const memStart = getMemoryReport();
  console.log(`[Baseline Memory Usage] Heap: ${memStart.heapUsed} / RSS: ${memStart.rss}`);

  // 1. Connect Host
  console.log('\n[Step 1] Connecting Host Socket & Creating Room...');
  const hostConnectStart = Date.now();
  const hostSocket = io(SERVER_URL, {
    reconnection: false,
    transports: ['websocket', 'polling']
  });

  await new Promise((resolve, reject) => {
    hostSocket.on('connect', resolve);
    hostSocket.on('connect_error', reject);
  });
  const hostConnectLatency = Date.now() - hostConnectStart;
  console.log(`  ✓ Host connected (Handshake Latency: ${hostConnectLatency}ms)`);

  // Create Room
  const roomData = await new Promise((resolve) => {
    hostSocket.emit('host:createRoom', {}, resolve);
  });

  assert(roomData.success, 'Room creation failed');
  assert(roomData.roomCode && roomData.roomCode.length === 4, 'Room code should be 4 characters');
  assert(roomData.hostToken, 'Host token should exist');
  console.log(`  ✓ Room created with code: [${roomData.roomCode}], Token: ${roomData.hostToken.substring(0, 8)}...`);

  const roomCode = roomData.roomCode;
  const hostToken = roomData.hostToken;

  // 2. Test Host Reconnection Resilience
  console.log('\n[Step 2] Testing Host Reconnection Resilience...');
  hostSocket.disconnect();
  
  const reconnectedHostSocket = io(SERVER_URL, {
    reconnection: false,
    transports: ['websocket', 'polling']
  });
  await new Promise((resolve) => reconnectedHostSocket.on('connect', resolve));

  const reconnData = await new Promise((resolve) => {
    reconnectedHostSocket.emit('host:reconnect', { roomCode, hostToken }, resolve);
  });

  assert(reconnData.success, 'Host reconnection failed');
  assert(reconnData.status === 'LOBBY', 'Status should be LOBBY');
  assert(reconnData.serverTime, 'serverTime should be returned for clock sync');
  console.log('  ✓ Host reconnection restored room authority successfully');

  // 3. Connect & Join 500 Players
  console.log(`\n[Step 3] Spawning & Joining ${NUM_PLAYERS} Players (Batches of ${BATCH_SIZE})...`);
  const joinStart = Date.now();
  const players = [];
  let failedConnections = 0;
  const joinLatencies = [];

  for (let batch = 0; batch < NUM_PLAYERS; batch += BATCH_SIZE) {
    const currentBatchSize = Math.min(BATCH_SIZE, NUM_PLAYERS - batch);
    const batchPromises = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const playerIndex = batch + i + 1;
      const playerId = `sim-trader-uuid-${playerIndex}`;
      const nickname = `Trader_${playerIndex}`;

      const pPromise = (async () => {
        try {
          const pSocket = io(SERVER_URL, {
            reconnection: false,
            transports: ['websocket', 'polling'],
            timeout: 15000
          });

          await new Promise((res, rej) => {
            pSocket.once('connect', res);
            pSocket.once('connect_error', rej);
          });

          const joinReqStart = Date.now();
          const joinRes = await new Promise((res) => {
            pSocket.emit('player:join', { roomCode, playerId, nickname }, res);
          });

          const latency = Date.now() - joinReqStart;
          joinLatencies.push(latency);

          assert(joinRes.success, `Player ${playerIndex} failed to join`);
          assert(joinRes.liquidCash === 100000, `Starting cash must be 100000`);
          assert(joinRes.serverTime, 'serverTime must be present for client clock sync');

          players.push({
            index: playerIndex,
            id: playerId,
            nickname,
            socket: pSocket,
            joinRes,
            chosenOption: null,
            resolvedOutcome: null
          });
        } catch (err) {
          failedConnections++;
          console.error(`  ⚠️ Socket connection failed for Player ${playerIndex}:`, err.message);
        }
      })();

      batchPromises.push(pPromise);
    }

    await Promise.all(batchPromises);
    process.stdout.write(`  -> Connected & Joined: ${players.length}/${NUM_PLAYERS}\r`);
  }

  const totalJoinTime = Date.now() - joinStart;
  const avgJoinLatency = (joinLatencies.reduce((a, b) => a + b, 0) / joinLatencies.length).toFixed(1);
  const minJoinLatency = Math.min(...joinLatencies);
  const maxJoinLatency = Math.max(...joinLatencies);

  console.log(`\n  ✓ All ${players.length}/${NUM_PLAYERS} players connected & joined room.`);
  console.log(`  📊 Join Performance Metrics:`);
  console.log(`     • Total Sync Time:   ${totalJoinTime}ms (${(totalJoinTime / 1000).toFixed(2)}s)`);
  console.log(`     • Join Round-Trip:   Avg ${avgJoinLatency}ms | Min ${minJoinLatency}ms | Max ${maxJoinLatency}ms`);
  console.log(`     • Dropped Sockets:   ${failedConnections} (${((failedConnections / NUM_PLAYERS) * 100).toFixed(1)}%)`);

  assert(failedConnections === 0, `Expected 0 dropped sockets, got ${failedConnections}`);
  assert(players.length === NUM_PLAYERS, `Expected ${NUM_PLAYERS} joined players`);

  const memAfterJoin = getMemoryReport();
  console.log(`  🧠 Memory After 500 Sockets: Heap: ${memAfterJoin.heapUsed} | RSS: ${memAfterJoin.rss}`);

  // 4. Test Player Reconnection (Player #1)
  console.log('\n[Step 4] Testing Player Reconnection on Player #1...');
  const player1 = players[0];
  player1.socket.disconnect();

  const newPlayer1Socket = io(SERVER_URL, {
    reconnection: false,
    transports: ['websocket', 'polling']
  });
  await new Promise((resolve) => newPlayer1Socket.on('connect', resolve));
  const p1Reconn = await new Promise((resolve) => {
    newPlayer1Socket.emit('player:join', { roomCode, playerId: player1.id, nickname: player1.nickname }, resolve);
  });
  assert(p1Reconn.success, 'Player #1 reconnect failed');
  assert(p1Reconn.liquidCash === 100000, 'Player #1 balance preserved');
  player1.socket = newPlayer1Socket;
  console.log('  ✓ Player #1 reconnect and state preservation verified under 500-client load');

  // 5. Host Starts Round 1
  console.log('\n[Step 5] Host Starting Round 1 & Measuring Broadcast Latency...');
  const roundStartTimestamp = Date.now();
  const playerBroadcastLatencies = [];

  const roundStartPromises = players.map(p => {
    return new Promise(resolve => {
      p.socket.once('round:started', (data) => {
        playerBroadcastLatencies.push(Date.now() - roundStartTimestamp);
        resolve(data);
      });
    });
  });

  const hostRoundStartPromise = new Promise(resolve => {
    reconnectedHostSocket.once('host:roundStarted', resolve);
  });

  reconnectedHostSocket.emit('host:startRound', { roomCode, hostToken });

  const [hostStartEvent, ...playerStartEvents] = await Promise.all([
    hostRoundStartPromise,
    ...roundStartPromises
  ]);

  const avgRoundStartLatency = (playerBroadcastLatencies.reduce((a, b) => a + b, 0) / playerBroadcastLatencies.length).toFixed(1);
  const maxRoundStartLatency = Math.max(...playerBroadcastLatencies);

  assert(hostStartEvent.roundIndex === 1, 'Host round index should be 1');
  assert(playerStartEvents[0].options.length === 3, 'Options should contain 3 assets');
  console.log(`  ✓ Round 1 started. Broadcast delivered to all ${NUM_PLAYERS} players.`);
  console.log(`     • Round Start Broadcast Latency: Avg ${avgRoundStartLatency}ms | Max ${maxRoundStartLatency}ms`);

  // 6. Test Cheat Prevention & Validation
  console.log('\n[Step 6] Testing Cheat Prevention & Strict Option Validation...');
  const invalidSubRes = await new Promise(resolve => {
    players[0].socket.emit('player:submitChoice', {
      roomCode,
      playerId: players[0].id,
      optionId: 'opt_cheat_9999'
    }, resolve);
  });
  assert(!invalidSubRes.success, 'Invalid optionId must be rejected');
  console.log('  ✓ Server correctly rejected illegal optionId (opt_cheat_9999)');

  // 7. Simulate Submissions (400 active, 100 inactive timeouts)
  const numActive = 400;
  const numInactive = NUM_PLAYERS - numActive;
  console.log(`\n[Step 7] Simulating Submissions (${numActive} submitted, ${numInactive} inactive timeouts)...`);

  const optionTypes = ['opt_safe', 'opt_balanced', 'opt_high'];
  const subStart = Date.now();

  for (let i = 0; i < numActive; i++) {
    const chosenOption = optionTypes[i % 3];
    players[i].chosenOption = chosenOption;

    const subRes = await new Promise(resolve => {
      players[i].socket.emit('player:submitChoice', {
        roomCode,
        playerId: players[i].id,
        optionId: chosenOption
      }, resolve);
    });
    assert(subRes.success, `Submission failed for player ${i + 1}`);

    // Idempotency check on a sample of players
    if (i % 50 === 0) {
      const doubleSubRes = await new Promise(resolve => {
        players[i].socket.emit('player:submitChoice', {
          roomCode,
          playerId: players[i].id,
          optionId: 'opt_safe'
        }, resolve);
      });
      assert(!doubleSubRes.success, `Double submission for player ${i + 1} should be rejected`);
    }
  }

  const subDuration = Date.now() - subStart;
  console.log(`  ✓ ${numActive} choices submitted in ${subDuration}ms (${(numActive / (subDuration / 1000)).toFixed(1)} ops/sec).`);
  console.log(`  ✓ Idempotency verified: Duplicate submissions rejected.`);
  console.log(`  ✓ ${numInactive} players intentionally unsubmitted to test Inaction Policy at scale.`);

  // 8. Wait for Strict 25-Second Resolution
  console.log('\n[Step 8] Waiting for server 25s countdown timer resolution...');
  const hostResolvedPromise = new Promise(resolve => {
    reconnectedHostSocket.once('host:roundResolved', resolve);
  });

  const playerResolvedPromises = players.map(p => {
    return new Promise(resolve => {
      p.socket.once('player:roundResolved', (data) => {
        p.resolvedOutcome = data;
        resolve(data);
      });
    });
  });

  const [hostResolution, ...playerOutcomes] = await Promise.all([
    hostResolvedPromise,
    ...playerResolvedPromises
  ]);

  console.log(`  ✓ Round resolved event received on Host and all ${NUM_PLAYERS} Players.`);

  // 9. Verify Host Aggregate Stats & Top 3 Leaderboard
  console.log('\n[Step 9] Verifying Host Aggregate Stats & Top 3 Leaderboard...');
  assert(hostResolution.totalPlayers === NUM_PLAYERS, `Total players should be ${NUM_PLAYERS}`);
  assert(hostResolution.counts.inactive === numInactive, `Inactive count must be ${numInactive}`);
  assert(hostResolution.top3.length === 3, 'Top 3 podium must contain 3 players');
  
  console.log(`  ✓ Aggregate Stats: Safe=${hostResolution.counts.opt_safe} (${hostResolution.percentages.opt_safe}%), Balanced=${hostResolution.counts.opt_balanced} (${hostResolution.percentages.opt_balanced}%), High=${hostResolution.counts.opt_high} (${hostResolution.percentages.opt_high}%), Inactive=${hostResolution.counts.inactive} (${hostResolution.percentages.inactive}%)`);
  console.log('  ✓ Top 3 Leaderboard at 500-player scale:');
  hostResolution.top3.forEach(t => {
    console.log(`     Rank #${t.rank}: ${t.nickname} -> $${t.liquidCash.toLocaleString()}`);
  });

  // 10. Verify Individual Player Outcomes & Bandwidth Privacy
  console.log('\n[Step 10] Verifying Bandwidth Privacy & Individual Math...');
  let inactiveCorrect = 0;
  let safeCorrect = 0;
  let balancedCorrect = 0;
  let highCorrect = 0;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const outcome = p.resolvedOutcome;

    assert(outcome, `Player ${i + 1} must receive personal outcome`);
    assert(typeof outcome.liquidCash === 'number', 'Must contain personal liquidCash');
    assert(outcome.players === undefined, 'PROHIBITION: Player payload must NOT contain full player list');
    assert(outcome.top3 === undefined, 'PROHIBITION: Player payload must NOT contain leaderboard');

    if (i >= numActive) {
      // Inactive player: penalty check ($100,000 * 0.97 = $97,000)
      assert(outcome.autoAssigned === true, 'Inactive player should be marked autoAssigned');
      assert(outcome.liquidCash === 97000, `Inactive player liquid cash should be 97000 (got ${outcome.liquidCash})`);
      assert(outcome.percentChange === -3.0, 'Inactive penalty must be -3%');
      inactiveCorrect++;
    } else if (p.chosenOption === 'opt_safe') {
      assert(outcome.liquidCash === 103000, `Safe player cash should be 103000 (got ${outcome.liquidCash})`);
      assert(outcome.percentChange === 3.0, 'Safe return must be +3%');
      safeCorrect++;
    } else if (p.chosenOption === 'opt_balanced') {
      assert(outcome.liquidCash === 110000, `Balanced player cash should be 110000 (got ${outcome.liquidCash})`);
      assert(outcome.percentChange === 10.0, 'Balanced return must be +10%');
      balancedCorrect++;
    } else if (p.chosenOption === 'opt_high') {
      assert(outcome.liquidCash === 150000 || outcome.liquidCash === 60000, `High risk cash should be 150000 or 60000 (got ${outcome.liquidCash})`);
      highCorrect++;
    }
  }

  console.log(`  ✓ Bandwidth Safety verified: Zero leaked player lists or full leaderboards across all ${NUM_PLAYERS} sockets.`);
  console.log(`  ✓ Inaction Policy verified: All ${inactiveCorrect} timed-out players received -3% penalty ($97,000).`);
  console.log(`  ✓ Financial Math verified: Safe (${safeCorrect}), Balanced (${balancedCorrect}), High (${highCorrect}).`);

  // Disconnect all sockets
  players.forEach(p => p.socket.disconnect());
  reconnectedHostSocket.disconnect();

  const memEnd = getMemoryReport();
  console.log('\n================================================================');
  console.log(`📊 FINAL RESOURCE & PERFORMANCE SUMMARY:`);
  console.log(`   • Initial Process Memory: Heap ${memStart.heapUsed} | RSS ${memStart.rss}`);
  console.log(`   • Peak 500-Socket Memory: Heap ${memAfterJoin.heapUsed} | RSS ${memAfterJoin.rss}`);
  console.log(`   • Final Process Memory:   Heap ${memEnd.heapUsed} | RSS ${memEnd.rss}`);
  console.log(`   • Memory delta for 500 players: ${(parseFloat(memAfterJoin.heapUsed) - parseFloat(memStart.heapUsed)).toFixed(2)} MB`);
  console.log(`   • Dropped / Failed Sockets: ${failedConnections}`);
  console.log(`   • All 500 Player Inboxes Verified: PASS`);
  console.log(`   • Host Aggregate & Top 3 Podium: PASS`);
  console.log('🎉 500-CLIENT REALTIME SCALE TEST COMPLETED SUCCESSFULLY!');
  console.log('================================================================\n');

  process.exit(0);
}

runTest().catch(err => {
  console.error('\n❌ 500-CLIENT TEST FAILED WITH ERROR:', err);
  process.exit(1);
});
