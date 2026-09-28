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

const SAMPLE_CUSTOM_SCENARIO = {
  mode: 'mode_1_sprint',
  name: '🍣 Neo-Tokyo Startup Sprint',
  description: 'High-tech food and robotics startups in futuristic Neo-Tokyo.',
  startingCapital: 50000,
  targetCapital: 250000,
  maxRounds: 3,
  timerSeconds: 15,
  rounds: [
    {
      round: 1,
      business: {
        name: '🍣 CyberSushi Conveyor',
        industry: 'Robotics & Gastronomy',
        tagline: 'AI-guided sushi bots slicing toro at Mach 2.',
        clue: 'Insiders report a secret recipe viral campaign on TikTok.',
        analystFee: 3000,
        analystTip: 'Super Insider: The Michelin guide is secretly filming tonight!'
      },
      options: [
        {
          id: 'opt_high',
          name: 'Open 10 Tokyo Outlets',
          badge: '🔴 HIGH RISK (+120% / -70%)',
          riskTier: 'high',
          win: 120,
          fail: -70,
          winText: 'Line around Shibuya crossing! You made +120%!',
          failText: 'Robot knife glitch caused kitchen fire (-70%).'
        },
        {
          id: 'opt_balanced',
          name: 'Supply Wasabi Sensors',
          badge: '🟡 MEDIUM RISK (+30% / -10%)',
          riskTier: 'medium',
          win: 30,
          fail: -10,
          winText: 'Clean delivery contracts signed (+30%).',
          failText: 'Supply chain soy sauce spill (-10%).'
        },
        {
          id: 'opt_safe',
          name: 'Treasury Vault Anchor',
          badge: '🟢 SAFE ANCHOR (+5% Guaranteed)',
          riskTier: 'safe',
          win: 5,
          fail: 5,
          winText: 'Zero robot drama, secured +5% yield.',
          failText: 'Zero robot drama, secured +5% yield.'
        }
      ]
    },
    {
      round: 2,
      business: {
        name: '🤖 RoboBarista AI',
        industry: 'Autonomous Retail',
        tagline: 'Precision latte art poured in 3 seconds.',
        clue: 'A major software update is dropping at midnight.',
        analystFee: 4000,
        analystTip: 'Insider: Update passed safety tests with flying colors!'
      },
      options: [
        {
          id: 'opt_high',
          name: 'Exclusive Airport Kiosks',
          badge: '🔴 HIGH RISK (+100% / -50%)',
          riskTier: 'high',
          win: 100,
          fail: -50,
          winText: 'Every commuter bought a cappuccino (+100%).',
          failText: 'Steam nozzle overheated (-50%).'
        },
        {
          id: 'opt_balanced',
          name: 'Bean Roasting Supplier',
          badge: '🟡 MEDIUM RISK (+20% / -5%)',
          riskTier: 'medium',
          win: 20,
          fail: -5,
          winText: 'Dark roast sales peaked (+20%).',
          failText: 'Bean shipment delayed (-5%).'
        },
        {
          id: 'opt_safe',
          name: 'Keep Cash in Bank',
          badge: '🟢 SAFE (+4% Guaranteed)',
          riskTier: 'safe',
          win: 4,
          fail: 4,
          winText: 'Guaranteed interest banked (+4%).',
          failText: 'Guaranteed interest banked (+4%).'
        }
      ]
    }
  ]
};

async function runCustomScenarioTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING CUSTOM SCENARIO JSON UPLOAD & REPLAY TEST SUITE');
  console.log('===============================================================');

  const hostSocket = createClientSocket();
  await new Promise(resolve => hostSocket.on('connect', resolve));

  // 1. Validation Rejection Test: Malformed JSON scenarios
  const invalidRes = await new Promise(resolve => {
    hostSocket.emit('host:createRoom', {
      mode: 'mode_1_sprint',
      customScenarios: { name: 'Broken', rounds: [{ round: 1, options: [] }] } // missing business.name and options
    }, resolve);
  });
  assert(!invalidRes.success, 'Malformed scenario must be rejected');
  assert(invalidRes.error, 'Rejection error message must be provided');
  console.log(`✅ [1/6] Server rejected invalid JSON scenario: "${invalidRes.error}"`);

  // 2. Room Creation with Valid Custom Scenario
  const createRes = await new Promise(resolve => {
    hostSocket.emit('host:createRoom', {
      mode: 'mode_1_sprint',
      customScenarios: SAMPLE_CUSTOM_SCENARIO
    }, resolve);
  });
  assert(createRes.success, 'Custom scenario room creation must succeed');
  assert.strictEqual(createRes.startingCapital, 50000, 'Starting capital must be $50,000 from JSON');
  assert.strictEqual(createRes.targetCapital, 250000, 'Target capital must be $250,000 from JSON');
  assert.strictEqual(createRes.customScenarios.name, '🍣 Neo-Tokyo Startup Sprint', 'Custom scenario name preserved');
  const roomCode = createRes.roomCode;
  const hostToken = createRes.hostToken;
  console.log(`✅ [2/6] Created room ${roomCode} with custom scenario "${createRes.customScenarios.name}" (Starting: $50k, Target: $250k)`);

  // 3. Player Joins and Receives Custom Starting Cash & Scenario Metadata
  const player1 = { id: 'custom-p1-uuid', name: 'Kenji', socket: createClientSocket() };
  await new Promise(resolve => player1.socket.on('connect', resolve));

  const joinRes = await new Promise(resolve => {
    player1.socket.emit('player:join', { roomCode, playerId: player1.id, nickname: player1.name }, resolve);
  });
  assert(joinRes.success, 'Player join must succeed');
  assert.strictEqual(joinRes.liquidCash, 50000, 'Player starting cash must be $50,000');
  assert.strictEqual(joinRes.targetCapital, 250000, 'Player receives $250k target capital');
  assert.strictEqual(joinRes.scenarioName, '🍣 Neo-Tokyo Startup Sprint', 'Player receives custom scenario name');
  console.log(`✅ [3/6] Player ${player1.name} joined with custom starting cash: $${joinRes.liquidCash.toLocaleString()}`);

  // 4. Test In-Lobby Custom Scenario Upload / Replacement
  const REPLACEMENT_SCENARIO = {
    ...SAMPLE_CUSTOM_SCENARIO,
    name: '🚀 SpaceTech Pioneers',
    startingCapital: 75000,
    targetCapital: 300000
  };

  const uploadPromise = new Promise(resolve => {
    player1.socket.on('player:scenarioUpdated', resolve);
  });

  const uploadRes = await new Promise(resolve => {
    hostSocket.emit('host:uploadCustomScenarios', {
      roomCode,
      hostToken,
      customScenarios: REPLACEMENT_SCENARIO
    }, resolve);
  });
  assert(uploadRes.success, 'Mid-lobby custom scenario upload must succeed');
  assert.strictEqual(uploadRes.scenarioName, '🚀 SpaceTech Pioneers');
  assert.strictEqual(uploadRes.startingCapital, 75000);

  const updatedPlayerEvent = await uploadPromise;
  assert.strictEqual(updatedPlayerEvent.liquidCash, 75000, 'Lobby player liquidCash updated to new starting capital');
  console.log(`✅ [4/6] Mid-lobby JSON update broadcast: "${uploadRes.scenarioName}" -> Player cash dynamically updated to $75,000`);

  // 5. Start Round 1 with Custom Scenario (Intel + Decision + Custom Analyst Fee)
  const intelPromise = new Promise(resolve => {
    hostSocket.on('host:phaseChange', data => {
      if (data.phase === 'MARKET_INTEL') resolve(data);
    });
  });

  hostSocket.emit('host:startRound', { roomCode, hostToken });
  const intelData = await intelPromise;
  assert(intelData.event.business.name.includes('CyberSushi'), 'Custom business name broadcast in Market Intel');
  assert.strictEqual(intelData.event.business.analystFee, 3000, 'Custom analyst fee $3,000 delivered');

  // Wait for Decision Phase
  const roundStartedPromise = new Promise(resolve => {
    hostSocket.on('host:roundStarted', resolve);
  });
  const roundData = await roundStartedPromise;
  assert.strictEqual(roundData.business.name, '🍣 CyberSushi Conveyor');
  assert.strictEqual(roundData.options[0].name, 'Open 10 Tokyo Outlets');
  console.log(`✅ [5/6] Round 1 started with custom business "${roundData.business.name}" & options: "${roundData.options[0].name}"`);

  // Player hires custom analyst ($3,000 fee)
  const hireRes = await new Promise(resolve => {
    player1.socket.emit('player:hireAnalyst', { roomCode, playerId: player1.id }, resolve);
  });
  assert(hireRes.success, 'Player hiring custom analyst must succeed');
  assert.strictEqual(hireRes.analystFee, 3000, 'Analyst fee deducted was $3,000');
  assert.strictEqual(hireRes.liquidCash, 72000, 'Player cash after $3,000 fee is $72,000');
  assert(hireRes.analystMemo.text.includes('Michelin'), 'Custom analyst insider tip received');

  // 6. Test Play-Again Session Reset with Custom Scenario
  const resetRes = await new Promise(resolve => {
    hostSocket.emit('host:resetSession', {
      roomCode,
      hostToken,
      customScenarios: SAMPLE_CUSTOM_SCENARIO // Reset back to Neo-Tokyo ($50k)
    }, resolve);
  });
  assert(resetRes.success, 'Play again resetSession with custom JSON must succeed');
  console.log(`✅ [6/6] Play-Again session reset with custom JSON scenario verified`);

  hostSocket.disconnect();
  player1.socket.disconnect();

  console.log('===============================================================');
  console.log('🎉 ALL CUSTOM JSON SCENARIO UPLOAD & REPLAY TESTS PASSED!');
  console.log('===============================================================');
}

if (require.main === module) {
  runCustomScenarioTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runCustomScenarioTests };
