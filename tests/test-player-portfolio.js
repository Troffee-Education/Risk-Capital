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

async function runPlayerPortfolioTests() {
  console.log('===============================================================');
  console.log('🧪 TESTING PLAYER PORTFOLIO, HUD, QUICK TRADE & SHAREABLE CARD');
  console.log('===============================================================');

  // 1. Connect Host & Create Room
  const hostSocket = createClientSocket();
  await new Promise(resolve => hostSocket.on('connect', resolve));

  const createRes = await new Promise(resolve => {
    hostSocket.emit('host:createRoom', { mode: 'mode_macro_15' }, resolve);
  });
  assert(createRes.success, 'Host room creation must succeed');
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;
  console.log(`✅ [1/6] Created room ${roomCode}`);

  // 2. Connect Player & Verify Initial HUD State
  const playerSocket = createClientSocket();
  const playerUuid = `test-player-hud-${Date.now()}`;
  const nickname = 'SatoshiTrader';

  await new Promise(resolve => playerSocket.on('connect', resolve));
  const joinRes = await new Promise(resolve => {
    playerSocket.emit('player:join', { roomCode, playerId: playerUuid, nickname }, resolve);
  });

  assert(joinRes.success, 'Player join must succeed');
  assert.strictEqual(joinRes.liquidCash, 100000, 'Starting cash must be $100,000');
  assert.strictEqual(joinRes.netWorth, 100000, 'Starting net worth must be $100,000');
  assert.strictEqual(joinRes.lockedValue, 0, 'Starting locked value must be $0');
  assert.strictEqual(joinRes.title, 'The Cautious One', 'Initial title must be The Cautious One');
  assert(Array.isArray(joinRes.lockedPortfolio), 'lockedPortfolio must be an array');
  console.log(`✅ [2/6] Player joined with full HUD data: Cash $${joinRes.liquidCash}, NetWorth $${joinRes.netWorth}, Title "${joinRes.title}"`);

  // 3. Start Round 1 (MARKET_INTEL -> IN_ROUND)
  const intelPromise = new Promise(resolve => hostSocket.once('host:phaseChange', resolve));
  hostSocket.emit('host:startRound', { roomCode, hostToken });
  await intelPromise;

  const roundStartedPromise = new Promise(resolve => playerSocket.once('round:started', resolve));
  const roundData = await roundStartedPromise;
  assert(roundData.endTimestamp > Date.now(), 'End timestamp must be valid');

  // 4. Test Server-Side Amount Validation (Over-allocation rejection)
  console.log('🧪 Testing server-side over-allocation validation ($150,000 > $100,000)...');
  const overAllocRes = await new Promise(resolve => {
    playerSocket.emit('player:submitChoice', {
      roomCode,
      playerId: playerUuid,
      optionId: 'opt_safe',
      amount: 150000 // Exceeds liquidCash
    }, resolve);
  });
  assert.strictEqual(overAllocRes.success, false, 'Server must reject allocation exceeding liquidCash');
  console.log(`✅ [3/6] Server independently rejected over-allocation: "${overAllocRes.error}"`);

  // 5. Test Quick Trade Submission
  console.log('🧪 Submitting valid Quick Trade (Overnight Liquidity $50,000)...');
  const quickTradeRes = await new Promise(resolve => {
    playerSocket.emit('player:submitChoice', {
      roomCode,
      playerId: playerUuid,
      optionId: 'opt_quick',
      amount: 50000
    }, resolve);
  });
  assert(quickTradeRes.success, 'Quick trade submission must succeed');
  assert.strictEqual(quickTradeRes.optionId, 'opt_quick');
  assert.strictEqual(quickTradeRes.amount, 50000);
  console.log(`✅ [4/6] Quick Trade confirmed: optionId "${quickTradeRes.optionId}", amount $${quickTradeRes.amount}`);

  // 6. Wait for Resolution & Verify Payout & Notifications
  const resolvedPromise = new Promise(resolve => playerSocket.once('player:roundResolved', resolve));
  const outcome = await resolvedPromise;

  // Quick trade returns +5.0% or -5.0% on $50,000 = +$2,500 or -$2,500
  assert.strictEqual(Math.abs(outcome.deltaCash), 2500, 'Quick trade delta cash magnitude must be $2,500 (+/- 5%)');
  assert([97500, 102500].includes(outcome.liquidCash), 'Liquid cash must be $97,500 or $102,500');
  assert.strictEqual(outcome.title, 'The Cautious One', 'Title matches risk threshold');
  console.log(`✅ [5/6] Round 1 resolved: New Liquid Cash $${outcome.liquidCash} (Delta: ${outcome.deltaCash >= 0 ? '+' : ''}$${outcome.deltaCash}), Title: ${outcome.title}`);

  // 7. Test Game End & Shareable Scorecard Payload
  const gameFinishedPromise = new Promise(resolve => playerSocket.once('player:gameFinished', resolve));
  hostSocket.emit('host:finishGame', { roomCode, hostToken });
  const endGameData = await gameFinishedPromise;

  assert([97500, 102500].includes(endGameData.finalNetWorth));
  assert.strictEqual(endGameData.roomCode, roomCode);
  assert(endGameData.outcomeTier, 'outcomeTier must be present');
  assert(endGameData.outcomeTier.badge, 'outcomeTier must have badge');
  assert(endGameData.finalTitle, 'finalTitle must be present');
  console.log(`✅ [6/6] Final Shareable Scorecard payload verified: Net Worth $${endGameData.finalNetWorth}, Title "${endGameData.finalTitle}", Tier "${endGameData.outcomeTier.badge}"`);

  // Cleanup
  playerSocket.disconnect();
  hostSocket.disconnect();

  console.log('===============================================================');
  console.log('🎉 ALL PLAYER PORTFOLIO & ENGAGEMENT TESTS PASSED PERFECTLY!');
  console.log('===============================================================');
  process.exit(0);
}

runPlayerPortfolioTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
