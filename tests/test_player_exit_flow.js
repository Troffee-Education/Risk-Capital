const io = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';

async function runTest() {
  console.log('--- TESTING PLAYER EXIT GAME & NEW GAME FLOW ---');

  // 1. Connect Host Socket
  const host = io(SERVER_URL, { forceNew: true });
  let roomCode = null;
  let hostToken = null;

  await new Promise((resolve, reject) => {
    host.on('connect', () => {
      host.emit('host:createRoom', { mode: 'mode_1_sprint', scenarioSet: 1 }, (res) => {
        assert(res.success, 'Host room creation must succeed');
        roomCode = res.roomCode;
        hostToken = res.hostToken;
        console.log(`[Host] Created Room ${roomCode}`);
        resolve();
      });
    });
    host.on('connect_error', reject);
  });

  // 2. Connect Player Socket
  const player = io(SERVER_URL, { forceNew: true });
  const playerId = 'test-player-exit-123';

  await new Promise((resolve) => {
    player.on('connect', () => {
      player.emit('player:join', {
        roomCode,
        playerId,
        nickname: 'ExitTester'
      }, (res) => {
        assert(res.success, 'Player join must succeed');
        assert.strictEqual(res.liquidCash, 100000);
        console.log(`[Player] Joined Room ${roomCode} with $100,000`);
        resolve();
      });
    });
  });

  // 3. Host starts round 1
  await new Promise((resolve) => {
    host.emit('host:startRound', { roomCode, hostToken }, (res) => {
      assert(res.success, 'Start round 1 must succeed');
      console.log('[Host] Started Round 1');
      resolve();
    });
  });

  // 4. Host ends game early
  const gameFinishedPromise = new Promise((resolve) => {
    player.on('player:gameFinished', (data) => {
      console.log('[Player] Received player:gameFinished ->', {
        finalNetWorth: data.finalNetWorth,
        finalRank: data.finalRank,
        outcomeTier: data.outcomeTier?.id
      });
      assert(data.finalNetWorth !== undefined, 'Must provide final net worth');
      assert(data.finalRank !== undefined, 'Must provide final rank');
      resolve(data);
    });
  });

  await new Promise((resolve) => {
    host.emit('host:endGameEarly', { roomCode, hostToken }, (res) => {
      assert(res.success, 'Host end game early must succeed');
      console.log('[Host] Ended game early');
      resolve();
    });
  });

  await gameFinishedPromise;

  // 5. Player clicks Exit Game
  await new Promise((resolve) => {
    player.emit('player:leaveRoom', { roomCode, playerId }, (res) => {
      assert(res.success, 'Leave room must succeed');
      console.log('[Player] Successfully exited Room', roomCode);
      resolve();
    });
  });

  // 6. Host creates a brand new Room
  let newRoomCode = null;
  let newHostToken = null;

  await new Promise((resolve) => {
    host.emit('host:createRoom', { mode: 'mode_1_sprint', scenarioSet: 2 }, (res) => {
      assert(res.success, 'New room creation must succeed');
      newRoomCode = res.roomCode;
      newHostToken = res.hostToken;
      console.log(`[Host] Created Brand New Room ${newRoomCode}`);
      resolve();
    });
  });

  // 7. Player joins the new room cleanly
  await new Promise((resolve) => {
    player.emit('player:join', {
      roomCode: newRoomCode,
      playerId,
      nickname: 'ExitTester'
    }, (res) => {
      assert(res.success, 'Player join new room must succeed');
      assert.strictEqual(res.roomCode, newRoomCode);
      assert.strictEqual(res.liquidCash, 100000);
      console.log(`[Player] Successfully joined new Room ${newRoomCode} fresh!`);
      resolve();
    });
  });

  console.log('\n✅ ALL PLAYER EXIT AND NEW GAME TESTS PASSED PERFECTLY!');
  player.disconnect();
  host.disconnect();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
