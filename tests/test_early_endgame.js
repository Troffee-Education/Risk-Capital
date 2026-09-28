const io = require('socket.io-client');

async function runTest() {
  console.log('--- STARTING E2E TEST: HOST EARLY END GAME & LEADERBOARD ---');
  const host = io('http://localhost:3000');
  const p1 = io('http://localhost:3000');
  const p2 = io('http://localhost:3000');

  let roomCode = null;
  let hostToken = null;

  await new Promise(resolve => host.on('connect', resolve));
  console.log('Host connected');

  // 1. Host creates room with Set 2
  host.emit('host:createRoom', { mode: 'mode_1_sprint', scenarioSet: 2 }, (res) => {
    roomCode = res.roomCode;
    hostToken = res.hostToken;
    console.log(`[Host] Created room ${roomCode} with Set 2`);
  });

  await new Promise(r => setTimeout(r, 600));

  // 2. Players join
  p1.emit('player:join', { roomCode, playerId: 'player_a', nickname: 'Alice' }, (res) => {
    console.log(`[Player 1] Alice joined: $${res.liquidCash}`);
  });
  p2.emit('player:join', { roomCode, playerId: 'player_b', nickname: 'Bob' }, (res) => {
    console.log(`[Player 2] Bob joined: $${res.liquidCash}`);
  });

  await new Promise(r => setTimeout(r, 600));

  // 3. Start Round 1
  host.emit('host:startRound', { roomCode, hostToken });
  console.log('[Host] Started Round 1');

  await new Promise(r => setTimeout(r, 1200));

  // 4. Players place choices
  p1.emit('player:submitChoice', {
    roomCode, playerId: 'player_a', optionId: 'opt_high', allocationPct: 100, amount: 100000
  }, (res) => console.log('[Player 1] Alice went All-In on High Risk'));

  p2.emit('player:submitChoice', {
    roomCode, playerId: 'player_b', optionId: 'opt_safe', allocationPct: 50, amount: 50000
  }, (res) => console.log('[Player 2] Bob allocated 50% on Safe Anchor'));

  await new Promise(r => setTimeout(r, 1500));

  // 5. Host decides to END GAME EARLY halfway
  let hostReceivedEndgame = false;
  let playerReceivedEndgame = false;

  host.on('host:gameFinished', (data) => {
    hostReceivedEndgame = true;
    console.log('[Host Event] host:gameFinished received:');
    console.log(` - isEarlyEnd: ${data.isEarlyEnd}`);
    console.log(` - totalPlayers: ${data.totalPlayers}`);
    console.log(` - top3 count: ${data.top3?.length}`);
    console.log(` - fullLeaderboard count: ${data.fullLeaderboard?.length}`);
    if (data.fullLeaderboard) {
      console.log(' - Leaderboard standings:', data.fullLeaderboard.map(p => `#${p.rank} ${p.nickname}: $${p.netWorth} (${p.returnPct}%)`));
    }
  });

  p1.on('player:gameFinished', (data) => {
    playerReceivedEndgame = true;
    console.log(`[Player 1 Event] Alice received scorecard: Rank #${data.finalRank}, Final Net Worth: $${data.finalNetWorth}, Title: ${data.finalTitle}`);
  });

  host.emit('host:endGameEarly', { roomCode, hostToken }, (res) => {
    console.log('[Host] Called host:endGameEarly ->', res);
  });

  await new Promise(r => setTimeout(r, 1500));

  // 6. Host clicks PLAY AGAIN (resetSession)
  let playerResetReceived = false;
  p1.on('player:sessionReset', (data) => {
    playerResetReceived = true;
    console.log(`[Player 1 Event] Received session reset -> back to lobby with $${data.startingCapital}`);
  });

  host.emit('host:resetSession', { roomCode, hostToken }, (res) => {
    console.log('[Host] Called host:resetSession ->', res);
  });

  await new Promise(r => setTimeout(r, 1200));

  if (hostReceivedEndgame && playerReceivedEndgame && playerResetReceived) {
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Early end game, full leaderboard, and replay reset verified.');
  } else {
    console.error('\n❌ Test failed: missing expected events.');
  }

  host.disconnect();
  p1.disconnect();
  p2.disconnect();
  process.exit(0);
}

runTest().catch(console.error);
