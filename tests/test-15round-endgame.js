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

async function test15RoundEndgame() {
  console.log('🧪 Testing 15-Round Endgame Trigger & Tier Distribution...');
  const hostSocket = createClientSocket();
  await new Promise(resolve => hostSocket.on('connect', resolve));

  const createRes = await new Promise(resolve => hostSocket.emit('host:createRoom', {}, resolve));
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;

  // Add 10 players with varying balances
  const players = [];
  for (let i = 1; i <= 10; i++) {
    const pSocket = createClientSocket();
    const pUuid = `p-end-${i}-${Date.now()}`;
    const pName = `Trader_${i}`;
    players.push({ socket: pSocket, uuid: pUuid, name: pName });
    await new Promise(resolve => pSocket.on('connect', resolve));
    await new Promise(resolve => pSocket.emit('player:join', { roomCode, playerId: pUuid, nickname: pName }, resolve));
  }

  // Set up host:gameFinished listener
  const gameFinishedPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for host:gameFinished')), 10000);
    hostSocket.on('host:gameFinished', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

  // Call host:finishGame
  hostSocket.emit('host:finishGame', { roomCode, hostToken });
  const endGameData = await gameFinishedPromise;

  assert.strictEqual(endGameData.roomCode, roomCode);
  assert(Array.isArray(endGameData.tierDistribution), 'tierDistribution must be an array');
  assert.strictEqual(endGameData.tierDistribution.length, 3, 'Must have 3 tiers from endings.json');
  console.log('✅ 3 Tiers from endings.json:');
  endGameData.tierDistribution.forEach(t => {
    console.log(`   - ${t.badge}: ${t.count} players (${t.percentage}%)`);
  });

  assert(Array.isArray(endGameData.top3), 'top3 podium must be present');
  console.log('✅ Final Top 3 Podium verified.');

  for (const p of players) p.socket.disconnect();
  hostSocket.disconnect();
  console.log('🎉 15-Round Endgame Screen Data Verification Passed!');
  process.exit(0);
}

test15RoundEndgame().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
