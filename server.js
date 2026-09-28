const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 10000,
  pingInterval: 5000
});

const PORT = process.env.PORT || 3000;

// Load Data Configurations (Supporting root or data/ directory)
function loadJsonConfig(filename) {
  const rootPath = path.join(__dirname, filename);
  const dataPath = path.join(__dirname, 'data', filename);
  if (fs.existsSync(rootPath)) return JSON.parse(fs.readFileSync(rootPath, 'utf-8'));
  if (fs.existsSync(dataPath)) return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  return null;
}

const personasConfig = (loadJsonConfig('personas.json')?.personas) || [];
const eventsData = (loadJsonConfig('events.json')?.rounds) || [];
const endingsConfig = loadJsonConfig('endings.json') || {};
const sectorsData = (loadJsonConfig('sectors.json')?.sectors) || [];
const quickTradeConfig = (loadJsonConfig('sectors.json')?.quickTrade) || {
  id: 'quickTrade',
  name: 'Overnight Liquidity',
  category: 'Money Market',
  type: 'instant',
  fixedReturnPct: 5,
  riskTier: 'medium',
  color: '#06b6d4',
  description: 'Instant same-round money market arbitrage (+5% / -5% random return, zero lockup).'
};
const roundsConfig = (loadJsonConfig('rounds.json')?.rounds) || [];
const mode1Config = loadJsonConfig('mode1_scenarios.json') || {};
const mode1Rounds = mode1Config.rounds || [];

// Initialize PostgreSQL schema
db.initDb().catch(err => console.warn('[DB] Schema init warning:', err.message));

// Serve static assets from public/ with zero-caching for instant hot reloading
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// Provide endpoint for downloading mode1 scenario template / default content
app.get('/api/template/mode1', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="mode1_custom_scenario_template.json"');
  res.send(JSON.stringify(mode1Config, null, 2));
});

// Provide local network IP for mobile connections on same Wi-Fi
const os = require('os');
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.get('/api/info', (req, res) => {
  const ip = getLocalNetworkIp();
  res.json({
    ip,
    port: PORT,
    playerUrl: `http://${ip}:${PORT}/player.html`,
    hostUrl: `http://${ip}:${PORT}/host.html`
  });
});

// In-Memory Room Store
const rooms = new Map();

// Allowed character set for unambiguous 4-character room codes (no 0, O, 1, I, L)
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      const idx = crypto.randomInt(0, CODE_CHARSET.length);
      code += CODE_CHARSET[idx];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  return 'R' + crypto.randomInt(100, 999);
}

// Room periodic cleanup (removes inactive rooms > 45min or finished > 10min)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const isHostInactive = !room.hostSocketId && (now - room.lastActiveAt > 45 * 60 * 1000);
    const isFinishedExpired = room.finishedAt && (now - room.finishedAt > 10 * 60 * 1000);

    if (isHostInactive || isFinishedExpired) {
      if (room.timerTimeoutId) {
        clearTimeout(room.timerTimeoutId);
      }
      rooms.delete(code);
      console.log(`[Memory Cleanup] Pruned room ${code} (Host inactive: ${isHostInactive}, Finished expired: ${isFinishedExpired})`);
    }
  }
}, 60 * 1000);

// Validate Mode 1 Custom Scenario JSON Schema
function validateMode1CustomScenarios(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Custom scenario content must be a valid JSON object.' };
  }
  if (!Array.isArray(data.rounds) || data.rounds.length === 0) {
    return { valid: false, error: 'Custom scenario must contain a non-empty "rounds" array.' };
  }

  const sanitizedRounds = [];
  for (let i = 0; i < data.rounds.length; i++) {
    const r = data.rounds[i];
    const roundNum = Number(r.round) || (i + 1);
    
    // Support either opportunity (new real-deal format) or business + options (legacy)
    const opp = r.opportunity || r.business || {};
    if (!opp.name || typeof opp.name !== 'string' || !opp.name.trim()) {
      return { valid: false, error: `Round ${roundNum} is missing a valid opportunity or business name ("opportunity.name" or "business.name").` };
    }

    const riskScore = Number(opp.riskScore) >= 1 && Number(opp.riskScore) <= 10 ? Number(opp.riskScore) : 5;
    const winRate = Number(opp.winRate) > 0 && Number(opp.winRate) <= 100 ? Number(opp.winRate) : Math.max(30, 100 - riskScore * 7);
    const win = opp.win !== undefined ? Number(opp.win) : Math.round(riskScore * 20);
    const fail = opp.fail !== undefined ? Number(opp.fail) : -Math.round(riskScore * 9);

    const opportunity = {
      id: opp.id || `deal_r${roundNum}`,
      name: opp.name.trim(),
      industry: (opp.industry || 'Commercial Enterprise').trim(),
      tagline: (opp.tagline || opp.description || 'Evaluate the risk and allocate your capital.').trim(),
      description: (opp.description || opp.tagline || 'Evaluate this opportunity and choose what percentage of your funds to invest.').trim(),
      riskScore,
      riskLabel: opp.riskLabel || (riskScore <= 3 ? 'Low Risk' : riskScore <= 6 ? 'Moderate Risk' : riskScore <= 8 ? 'High Risk' : 'Extreme Risk'),
      winRate,
      win,
      fail,
      winText: (opp.winText || `${opp.name.trim()} succeeded (+${win}%)!`).trim(),
      failText: (opp.failText || `${opp.name.trim()} struggled (${fail}%)!`).trim(),
      clue: (opp.clue || 'Review market indicators before investing.').trim(),
      analystFee: Number(opp.analystFee) >= 0 ? Number(opp.analystFee) : 5000,
      analystTip: (opp.analystTip || 'Insider tip: Market conditions look favorable.').trim()
    };

    const business = {
      name: opportunity.name,
      industry: opportunity.industry,
      tagline: opportunity.tagline,
      description: opportunity.description,
      clue: opportunity.clue,
      analystFee: opportunity.analystFee,
      analystTip: opportunity.analystTip,
      dossier: [
        `Market: ${opportunity.tagline}`,
        `Risk: ${opportunity.riskScore}/10 (${opportunity.riskLabel}) • Win: +${opportunity.win}% | Loss: ${opportunity.fail}%`,
        `Analyst Fee: $${opportunity.analystFee.toLocaleString()}`
      ]
    };

    // If options array is provided (legacy), sanitize it; otherwise generate standard 3-tier mapping
    let sanitizedOptions = [];
    if (Array.isArray(r.options) && r.options.length > 0) {
      sanitizedOptions = r.options.map((opt, optIdx) => {
        const id = opt.id || (optIdx === 0 ? 'opt_high' : optIdx === 1 ? 'opt_balanced' : 'opt_safe');
        const name = (opt.name || `Option ${optIdx + 1}`).trim();
        const oWin = opt.win !== undefined ? Number(opt.win) : 20;
        const oFail = opt.fail !== undefined ? Number(opt.fail) : -10;
        const riskTier = opt.riskTier || (id === 'opt_high' ? 'high' : id === 'opt_balanced' ? 'medium' : 'safe');
        return {
          id,
          name,
          badge: opt.badge || `${riskTier.toUpperCase()} (+${oWin}% / ${oFail}%)`,
          category: opt.category || opt.industry || opportunity.industry,
          industry: opt.industry || opt.category || opportunity.industry,
          imageUrl: opt.imageUrl || '',
          riskTier,
          riskScore: opt.riskScore || `${riskScore}/10`,
          winRate: opt.winRate || `${winRate}%`,
          shortDesc: (opt.shortDesc || opt.description || '').trim(),
          description: (opt.description || opt.shortDesc || '').trim(),
          win: oWin,
          fail: oFail,
          winText: opt.winText || `${name} succeeded (+${oWin}%).`,
          failText: opt.failText || `${name} struggled (${oFail}%).`
        };
      });
    } else {
      sanitizedOptions = [
        {
          id: opportunity.id,
          name: opportunity.name,
          badge: `⚡ RISK ${opportunity.riskScore}/10 (+${opportunity.win}% / ${opportunity.fail}%)`,
          category: opportunity.industry,
          riskTier: opportunity.riskScore >= 7 ? 'high' : opportunity.riskScore >= 4 ? 'medium' : 'safe',
          riskScore: `${opportunity.riskScore}/10`,
          winRate: `${opportunity.winRate}%`,
          shortDesc: opportunity.description,
          description: opportunity.description,
          win: opportunity.win,
          fail: opportunity.fail,
          winText: opportunity.winText,
          failText: opportunity.failText
        },
        {
          id: 'opt_safe',
          name: 'Safe Bank Reserve',
          badge: '🟢 SAFE (0% Risk)',
          category: 'Bank Deposit',
          riskTier: 'safe',
          riskScore: '1/10',
          winRate: '100%',
          shortDesc: 'Preserve 100% of your funds safe in the bank.',
          description: 'Preserve 100% of your funds safe in the bank.',
          win: 0,
          fail: 0,
          winText: 'Funds kept 100% safe in bank reserve.',
          failText: 'Funds kept 100% safe in bank reserve.'
        }
      ];
    }

    sanitizedRounds.push({
      round: roundNum,
      opportunity,
      business,
      options: sanitizedOptions
    });
  }

  const startingCapital = Number(data.startingCapital) > 0 ? Number(data.startingCapital) : 100000;
  const targetCapital = Number(data.targetCapital) > startingCapital ? Number(data.targetCapital) : 500000;
  const maxRounds = Number(data.maxRounds) > 0 ? Number(data.maxRounds) : sanitizedRounds.length;
  const timerSeconds = Number(data.timerSeconds) > 0 ? Number(data.timerSeconds) : 80;

  return {
    valid: true,
    sanitizedData: {
      mode: 'mode_1_sprint',
      name: (data.name || 'Custom Business Spotlight').trim(),
      description: (data.description || `Custom ${sanitizedRounds.length}-Round Sprint scenario.`).trim(),
      startingCapital,
      targetCapital,
      maxRounds,
      timerSeconds,
      rounds: sanitizedRounds
    }
  };
}

// Industry-specific distinct photo library
const sectorDistinctPhotos = {
  'Agriculture': {
    safe: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1536657464919-892534f60d6e?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&h=800&fit=crop'
  },
  'Auto / Parts': {
    safe: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&h=800&fit=crop'
  },
  'Biotechnology': {
    safe: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1559757175-7cb056fba93d?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=800&fit=crop'
  },
  'Business Products & Services': {
    safe: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&h=800&fit=crop'
  },
  'Chemicals': {
    safe: 'https://images.unsplash.com/photo-1615486364076-c2e1c8b4a99b?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=600&h=800&fit=crop'
  },
  'Food & Beverage': {
    safe: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&h=800&fit=crop'
  },
  'Education': {
    safe: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&h=800&fit=crop'
  },
  'Electronics': {
    safe: 'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=800&fit=crop'
  },
  'Gaming': {
    safe: 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=800&fit=crop'
  },
  'Health & Beauty': {
    safe: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&h=800&fit=crop',
    med: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=800&fit=crop',
    high: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=800&fit=crop'
  }
};

// 5 Curated 10-Deal Scenario Packs (Dividing 50 Real-World Opportunities into 5 Sets)
function getScenarioPack(setNumber = 1) {
  const setNum = Math.max(1, Math.min(5, Number(setNumber) || 1));
  const setIdx = setNum - 1;

  const setNames = [
    'Set 1: AgriTech & Smart Mobility',
    'Set 2: BioTech & Enterprise B2B',
    'Set 3: Chemicals & Food Empire',
    'Set 4: EdTech & Deep Electronics',
    'Set 5: Gaming & Beauty Mogul'
  ];

  // Set 1 defaults to the fully curated 10-round 30-deal master deck
  if (setNum === 1 && mode1Rounds && mode1Rounds.length >= 10) {
    return {
      setNumber: 1,
      name: setNames[0],
      description: '10-Round Real-World Sprint (Agriculture & Auto / Parts).',
      startingCapital: 100000,
      targetCapital: 500000,
      maxRounds: 10,
      timerSeconds: 80,
      rounds: mode1Rounds
    };
  }

  const allOpps = mode1Config.allOpportunities || [];
  const setOpps = allOpps.slice(setIdx * 10, (setIdx + 1) * 10);

  const setRounds = setOpps.map((opp, idx) => {
    const roundNum = idx + 1;
    const ind = opp.industry || 'Business Products & Services';
    const photos = sectorDistinctPhotos[ind] || sectorDistinctPhotos['Business Products & Services'];

    const riskScore = Number(opp.riskScore) || (opp.riskTier === 'High Risk' ? 8 : opp.riskTier === 'Medium Risk' ? 5 : 2);
    const win = opp.win !== undefined ? Number(opp.win) : Math.round(riskScore * 20);
    const fail = opp.fail !== undefined ? Number(opp.fail) : -Math.round(riskScore * 9);
    const riskTier = opp.riskTier || (riskScore >= 7 ? 'High Risk' : riskScore >= 4 ? 'Medium Risk' : 'Safe');

    // Generate 3 unique opportunities per round with 3 distinct Unsplash images
    return {
      round: roundNum,
      business: {
        name: opp.name,
        industry: opp.industry,
        tagline: opp.description || 'Evaluate this opportunity and choose what percentage of your funds to invest.',
        description: opp.description || '',
        riskScore,
        riskLabel: riskTier,
        win,
        fail,
        analystFee: 5000,
        analystTip: `Industry Intel: ${opp.industry} market indicators are active this round.`
      },
      opportunity: {
        id: opp.id || `opp_s${setIdx + 1}_r${roundNum}`,
        name: opp.name,
        industry: opp.industry,
        riskScore,
        riskTier,
        win,
        fail,
        winText: `${opp.name} succeeded (+${win}%)!`,
        failText: `${opp.name} struggled (${fail}%)!`,
        description: opp.description || '',
        imageUrl: opp.imageUrl || photos.high
      },
      options: [
        {
          id: `opt_safe_s${setNum}_r${roundNum}`,
          name: `Safe ${opp.industry} Commercial Bond`,
          industry: opp.industry,
          riskTier: 'Safe',
          riskScore: 2,
          win: 12,
          fail: -4,
          imageUrl: photos.safe,
          description: `Guaranteed commercial debt yield with institutional capital protection in ${opp.industry}.`
        },
        {
          id: `opt_med_s${setNum}_r${roundNum}`,
          name: `Balanced ${opp.industry} Syndicate`,
          industry: opp.industry,
          riskTier: 'Medium Risk',
          riskScore: 5,
          win: 28,
          fail: -12,
          imageUrl: photos.med,
          description: `Diversified regional growth fund investing in mid-stage ${opp.industry} companies.`
        },
        {
          id: opp.id || `opp_s${setIdx + 1}_r${roundNum}`,
          name: opp.name,
          industry: opp.industry,
          riskTier: riskTier,
          riskScore: riskScore,
          win: win,
          fail: fail,
          imageUrl: opp.imageUrl || photos.high,
          description: opp.description || `Direct high-conviction equity deal in ${opp.name}.`
        }
      ]
    };
  });

  return {
    setNumber: setNum,
    name: setNames[setIdx] || `Set ${setNum}`,
    description: `10-Round Real-World Sprint (${setOpps.map(o => o.industry).filter((v, i, a) => a.indexOf(v) === i).join(' & ')}).`,
    startingCapital: 100000,
    targetCapital: 500000,
    maxRounds: 10,
    timerSeconds: 80,
    rounds: setRounds
  };
}

// Room State Serialization & Recovery Helpers
function serializeRoom(room) {
  return {
    roomCode: room.roomCode,
    hostToken: room.hostToken,
    startedAt: room.startedAt,
    lastActiveAt: room.lastActiveAt,
    status: room.status,
    mode: room.mode || 'mode_1_sprint',
    customScenarios: room.customScenarios || null,
    startingCapital: room.startingCapital || 100000,
    targetCapital: room.targetCapital || 500000,
    maxRounds: room.maxRounds || 10,
    roundIndex: room.roundIndex,
    currentEvent: room.currentEvent,
    timerEnd: room.timerEnd,
    roundOptions: room.roundOptions,
    lastResolutionStats: room.lastResolutionStats,
    finishedAt: room.finishedAt,
    players: Array.from(room.players.entries())
  };
}

function restoreRoomFromSnapshot(snapshot) {
  if (!snapshot) return null;
  const room = {
    ...snapshot,
    mode: snapshot.mode || 'mode_1_sprint',
    customScenarios: snapshot.customScenarios || null,
    startingCapital: snapshot.startingCapital || 100000,
    targetCapital: snapshot.targetCapital || 500000,
    maxRounds: snapshot.maxRounds || 10,
    hostSocketId: null,
    timerTimeoutId: null,
    players: new Map(snapshot.players || [])
  };
  rooms.set(room.roomCode, room);
  return room;
}

// Assign Title based on accumulated riskScore
function assignTitle(player) {
  const risk = player.riskScore || 0;
  if (risk > 15) {
    return 'The Gambler';
  } else if (risk < 5) {
    return 'The Cautious One';
  } else {
    return 'The Balanced Investor';
  }
}

// Helpers for Personas and Events
function getPersonaMetadata(personaId) {
  if (!personaId) {
    return {
      id: 'market_wire',
      name: 'Central Authority',
      role: 'Global Financial News',
      avatar: '🏛️',
      hintStyle: 'Evaluate market fundamentals before allocating capital.'
    };
  }
  const p = personasConfig.find(item => item.id === personaId);
  if (!p) {
    return { id: personaId, name: personaId, role: 'Market Insider', avatar: '📢', hintStyle: 'Market sentiment evolving.' };
  }
  const avatars = {
    victor_kane: '🚀',
    dr_eleanor_voss: '🏛️',
    iron_fund: '💼',
    dr_nadia_chen: '🔬'
  };
  return {
    ...p,
    avatar: avatars[personaId] || '📢'
  };
}

function getEventForRound(roundIndex) {
  const roundObj = eventsData.find(r => r.round === roundIndex) || eventsData[(roundIndex - 1) % eventsData.length];
  const rawEvent = roundObj && roundObj.events && roundObj.events[0] ? roundObj.events[0] : {
    id: `round_${roundIndex}_event`,
    persona: null,
    headline: 'MARKET WIRE: Capital lines are active across all 11 economic sectors.',
    affectedSectors: [],
    hintStrength: 'none'
  };

  const personaMeta = getPersonaMetadata(rawEvent.persona);
  return {
    ...rawEvent,
    roundIndex,
    persona: personaMeta,
    headlineText: rawEvent.headline,
    hintStrength: rawEvent.hintStrength || 'none',
    affectedSectorIds: rawEvent.affectedSectors || [],
    probabilisticHint: personaMeta.hintStyle || 'Evaluate sector fundamentals before allocating capital.'
  };
}

// Event Modifiers Engine for active positions
function getEventModifiersForRound(roundIndex) {
  const roundObj = eventsData.find(r => r.round === roundIndex);
  if (!roundObj || !roundObj.events) return {};

  const modifiers = {};

  for (const evt of roundObj.events) {
    const id = evt.id;
    const strength = evt.hintStrength || 'none';

    if (id === 'voss_leak_1' || id === 'voss_leak_2') {
      modifiers['business_products_services'] = (modifiers['business_products_services'] || 0) + 10;
      modifiers['crypto'] = (modifiers['crypto'] || 0) - 10;
    } else if (id === 'voss_announcement_1') {
      modifiers['crypto'] = (modifiers['crypto'] || 0) - 25;
      modifiers['business_products_services'] = (modifiers['business_products_services'] || 0) + 15;
    } else if (id === 'voss_announcement_2') {
      modifiers['business_products_services'] = (modifiers['business_products_services'] || 0) + 25;
      modifiers['crypto'] = (modifiers['crypto'] || 0) - 15;
    } else if (id === 'iron_fund_telegraph_1') {
      ['auto_parts', 'chemicals', 'agriculture'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) + 10;
      });
    } else if (id === 'iron_fund_move_1') {
      ['auto_parts', 'chemicals', 'agriculture'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) + 25;
      });
    } else if (id === 'iron_fund_telegraph_2') {
      ['auto_parts', 'chemicals', 'agriculture'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) + 15;
      });
    } else if (id === 'iron_fund_move_2') {
      ['auto_parts', 'chemicals', 'agriculture'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) + 35;
      });
    } else if (id === 'chen_breakthrough') {
      ['biotechnology', 'electronics', 'education'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) + 20;
      });
    } else if (id === 'chen_pullback') {
      ['biotechnology', 'electronics', 'education'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) - 20;
      });
    } else if (id === 'kane_hint_1') {
      ['crypto', 'electronics', 'gaming'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) + 10;
      });
    } else if (id === 'kane_hint_2') {
      ['crypto', 'electronics', 'gaming'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) + 15;
      });
    } else if (id === 'kane_reversal') {
      ['crypto', 'electronics', 'gaming'].forEach(s => {
        modifiers[s] = (modifiers[s] || 0) - 35;
      });
    } else if (evt.affectedSectors && evt.affectedSectors.length > 0) {
      let defaultMod = 0;
      if (strength === 'confirmed') defaultMod = 20;
      else if (strength === 'optimistic') defaultMod = 15;
      else if (strength === 'telegraph') defaultMod = 10;
      else if (strength === 'leak') defaultMod = 5;
      else if (strength === 'reversal') defaultMod = -20;
      for (const s of evt.affectedSectors) {
        modifiers[s] = (modifiers[s] || 0) + defaultMod;
      }
    }
  }

  return modifiers;
}

// Get Sector Options offered in a given round
function getRoundOptions(roundIndex) {
  const roundDef = roundsConfig.find(r => r.round === roundIndex);
  let offeredIds = roundDef ? roundDef.offeredSectorIds : 'all';
  let sectorsToOffer = sectorsData;

  if (Array.isArray(offeredIds)) {
    sectorsToOffer = sectorsData.filter(s => offeredIds.includes(s.id));
  }

  return sectorsToOffer.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    type: s.type, // 'locked' | 'recurring'
    totalReturnPct: s.totalReturnPct,
    maturityRounds: s.maturityRounds,
    riskTier: s.riskTier,
    volatilityPct: s.volatilityPct,
    expectedReturn: s.type === 'recurring'
      ? `+${s.totalReturnPct}% (${(s.totalReturnPct / s.maturityRounds).toFixed(1)}%/rd div)`
      : `+${s.totalReturnPct}% locked (${s.maturityRounds} rds)`,
    color: s.color,
    description: s.description
  }));
}

// Get Mode 1 (The Cash Sprint / Real Deal Arena) Archetype Options for Round
function getMode1RoundOptions(roomOrIndex, roundIndex) {
  let targetIndex = typeof roomOrIndex === 'number' ? roomOrIndex : roundIndex;
  let roundsList = (typeof roomOrIndex === 'object' && roomOrIndex?.customScenarios?.rounds)
    ? roomOrIndex.customScenarios.rounds
    : mode1Rounds;

  const roundObj = roundsList.find(r => r.round === targetIndex) || roundsList[(targetIndex - 1) % roundsList.length] || roundsList[0];

  if (roundObj && Array.isArray(roundObj.options) && roundObj.options.length > 1) {
    return roundObj.options.map(opt => ({
      id: opt.id,
      archetype: opt.archetype || (opt.id.includes('high') ? 'rocket' : opt.id.includes('balanced') ? 'balanced' : 'safe'),
      name: opt.name,
      badge: opt.badge || `${(opt.riskTier || 'SAFE').toUpperCase()} (+${opt.win}% / ${opt.fail}%)`,
      category: opt.industry || opt.category || (opt.id.includes('high') ? 'High Risk' : opt.id.includes('balanced') ? 'Medium Risk' : 'Safe Anchor'),
      industry: opt.industry || opt.category || 'Deal',
      imageUrl: opt.imageUrl || '',
      expectedReturn: opt.badge ? opt.badge.replace(/^[^()]*\((.*)\)[^()]*$/, '$1') : (opt.expectedReturn || (opt.win !== undefined ? `+${opt.win}% / ${opt.fail}%` : '+10%')),
      description: opt.description || opt.shortDesc || '',
      shortDesc: opt.shortDesc || opt.description || '',
      win: opt.win,
      fail: opt.fail,
      winText: opt.winText,
      failText: opt.failText,
      riskScore: opt.riskScore || (opt.id.includes('high') ? '8/10' : opt.id.includes('balanced') ? '5/10' : '2/10'),
      winRate: opt.winRate || (opt.id.includes('high') ? '75%' : opt.id.includes('balanced') ? '80%' : '100%'),
      riskTier: opt.riskTier || (opt.id.includes('high') ? 'high' : opt.id.includes('balanced') ? 'medium' : 'safe'),
      color: (opt.riskTier === 'High Risk' || opt.id.includes('high')) ? '#ef4444' : (opt.riskTier === 'Medium Risk' || opt.id.includes('balanced')) ? '#f59e0b' : '#10b981'
    }));
  }

  if (roundObj && roundObj.opportunity) {
    const opp = roundObj.opportunity;
    const riskScore = Number(opp.riskScore) || 5;
    return [
      {
        id: opp.id || `deal_r${targetIndex}`,
        name: opp.name,
        badge: `⚡ RISK ${riskScore}/10 (+${opp.win}% / ${opp.fail}%)`,
        category: opp.industry || 'Investment Deal',
        expectedReturn: `+${opp.win}% / ${opp.fail}%`,
        description: opp.description || opp.tagline || '',
        shortDesc: opp.description || opp.tagline || '',
        win: opp.win,
        fail: opp.fail,
        riskScore: `${riskScore}/10`,
        riskScoreNum: riskScore,
        winRate: `${opp.winRate || 75}%`,
        riskTier: riskScore >= 7 ? 'high' : riskScore >= 4 ? 'medium' : 'safe',
        color: riskScore >= 7 ? '#ef4444' : riskScore >= 4 ? '#f59e0b' : '#10b981',
        winText: opp.winText,
        failText: opp.failText
      }
    ];
  }

  return [
    { id: 'opt_high', archetype: 'rocket', name: 'High Risk Deal', badge: '🔴 HIGH RISK (+100% / -60%)', category: 'High Risk', expectedReturn: '+100% / -60%', description: 'High return or sharp loss.', shortDesc: 'High return or sharp loss.', riskTier: 'high', color: '#ef4444' },
    { id: 'opt_safe', archetype: 'safe', name: 'Keep Cash in Bank', badge: '🟢 SAFE ANCHOR (+4% Guaranteed)', category: 'Safe Anchor', expectedReturn: '+4.0% Guaranteed', description: 'Clean guaranteed bank interest.', shortDesc: 'Clean guaranteed bank interest.', riskTier: 'low', color: '#10b981' }
  ];
}

// Get Mode 1 (Real Deal Investment Arena) Opportunity & Event for Round
function getMode1EventForRound(roomOrIndex, roundIndex) {
  let targetIndex = typeof roomOrIndex === 'number' ? roomOrIndex : roundIndex;
  let roundsList = (typeof roomOrIndex === 'object' && roomOrIndex?.customScenarios?.rounds)
    ? roomOrIndex.customScenarios.rounds
    : mode1Rounds;

  const roundObj = roundsList.find(r => r.round === targetIndex) || roundsList[(targetIndex - 1) % roundsList.length] || roundsList[0];
  const opp = roundObj?.opportunity || roundObj?.business || {};
  
  const riskScore = Number(opp.riskScore) >= 1 && Number(opp.riskScore) <= 10 ? Number(opp.riskScore) : 5;
  const winRate = Number(opp.winRate) > 0 && Number(opp.winRate) <= 100 ? Number(opp.winRate) : Math.max(20, Math.min(75, Math.round(85 - riskScore * 6.5)));
  const win = opp.win !== undefined ? Number(opp.win) : Math.round(riskScore * 25);
  const fail = opp.fail !== undefined ? Number(opp.fail) : -Math.round(riskScore * 9);
  
  const opportunity = {
    id: opp.id || `deal_r${targetIndex}`,
    name: opp.name || 'Featured Investment Deal',
    industry: opp.industry || 'Commercial Enterprise',
    tagline: opp.tagline || opp.description || 'Evaluate the risk and allocate your capital.',
    description: opp.description || opp.tagline || 'Evaluate this opportunity and choose what percentage of your funds to invest.',
    riskScore: riskScore,
    riskLabel: opp.riskLabel || (riskScore <= 3 ? 'Very Low Risk' : riskScore <= 6 ? 'Moderate Risk' : riskScore <= 8 ? 'High Risk' : 'Extreme Risk'),
    winRate: winRate,
    win: win,
    fail: fail,
    winText: opp.winText || `${opp.name || 'Deal'} succeeded (+${win}%)!`,
    failText: opp.failText || `${opp.name || 'Deal'} struggled (${fail}%)!`,
    clue: opp.clue || 'Review market indicators before investing.',
    analystFee: opp.analystFee !== undefined ? Number(opp.analystFee) : 5000,
    analystTip: opp.analystTip || 'Insider tip: High demand expected this round.',
    dossier: opp.dossier || [
      `Market: ${opp.tagline || 'Trending opportunity.'}`,
      `Risk: ${riskScore}/10 • Win: +${win}% | Loss: ${fail}%`,
      `Analyst Fee: $${(opp.analystFee !== undefined ? Number(opp.analystFee) : 5000).toLocaleString()}`
    ]
  };

  return {
    roundIndex: targetIndex,
    opportunity,
    business: opportunity, // backward compatibility
    headlineText: opportunity.name ? opportunity.name.toUpperCase() : 'INVESTMENT OPPORTUNITY',
    bodyText: opportunity.description,
    probabilisticHint: `Risk: ${opportunity.riskScore}/10 (${opportunity.riskLabel}) | Upside: +${opportunity.win}% | Downside: ${opportunity.fail}%`
  };
}

// Primary Driver Punchline Generator from endings.json
function generatePunchline(player, outcomeTierId, finalNetWorth) {
  const swing = player.biggestSwing || {};
  const templates = endingsConfig.primaryDriver?.templates || {};

  if (outcomeTierId === 'mogul') {
    const template = templates.mogul || "Primary driver: Timed the {eventLabel} to perfection.";
    return template.replace('{eventLabel}', swing.eventLabel || 'market pivot');
  } else if (outcomeTierId === 'survivor') {
    const template = templates.survivor || "Primary driver: Kept {cashPct}% in cash while the room caught fire.";
    const cashPct = finalNetWorth > 0 ? Math.min(100, Math.max(0, Math.round((player.liquidCash / finalNetWorth) * 100))) : 0;
    return template.replace('{cashPct}', cashPct);
  } else {
    const template = templates.cautionary_tale || "Primary driver: Bought {personaName}'s Round {round} {eventType} with {pct}% of net worth.";
    const pct = finalNetWorth > 0 ? Math.min(100, Math.max(0, Math.round((swing.amountInvested / finalNetWorth) * 100))) : 50;
    return template
      .replace('{personaName}', swing.personaName || 'Victor Kane')
      .replace('{round}', swing.round || 1)
      .replace('{eventType}', swing.eventType || 'post')
      .replace('{pct}', pct);
  }
}

// Track primary driver biggest swing
function updatePrimaryDriver(player, roundIndex, outcomeAmount, amountInvested, sectorId, eventLabel, personaName, eventType) {
  const abs = Math.abs(outcomeAmount);
  if (!player.biggestSwing || abs >= (player.biggestSwing.absAmount || 0)) {
    player.biggestSwing = {
      round: roundIndex,
      outcomeAmount,
      absAmount: abs,
      amountInvested: amountInvested || 0,
      sectorId: sectorId || '',
      eventLabel: eventLabel || sectorId || 'Market Trade',
      personaName: personaName || 'The Market',
      eventType: eventType || 'trade'
    };
  }
}

// Resolve Sector ID from client or legacy alias
function resolveSectorDef(optionId) {
  if (optionId === 'opt_safe') return sectorsData.find(s => s.id === 'agriculture') || sectorsData[0];
  if (optionId === 'opt_balanced') return sectorsData.find(s => s.id === 'biotechnology') || sectorsData[1];
  if (optionId === 'opt_high') return sectorsData.find(s => s.id === 'crypto') || sectorsData[2];
  if (optionId === 'opt_quick' || optionId === 'quickTrade') return quickTradeConfig;
  return sectorsData.find(s => s.id === optionId) || null;
}

function formatCash(amount) {
  return '$' + Number(amount || 0).toLocaleString('en-US');
}

// End Game & Trigger Batch Transactional Persistence
async function finishGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.status = 'FINISHED';
  room.finishedAt = Date.now();
  const playersList = Array.from(room.players.values());

  const isMode1 = room.mode === 'mode_1_sprint';

  if (!isMode1) {
    // 1. Mark-to-market for unmatured locked investments & return recurring principals (Legacy 15-round)
    for (const p of playersList) {
      p.lockedPortfolio = p.lockedPortfolio || [];
      p.activeRecurring = p.activeRecurring || [];

      for (const locked of p.lockedPortfolio) {
        const elapsed = Math.max(1, Math.min(locked.maturityRounds, 15 - locked.investedAtRound));
        const proratedPct = (locked.baseReturnPct || 0) * (elapsed / (locked.maturityRounds || 1));
        const totalPct = proratedPct + (locked.eventModifiers || 0);
        const returnAmount = Math.round(locked.amountInvested * (totalPct / 100));
        p.liquidCash += (locked.amountInvested + returnAmount);
        updatePrimaryDriver(p, 15, returnAmount, locked.amountInvested, locked.sectorId, `${locked.name} mark-to-market`, 'The Ledger', 'settlement');
      }
      p.lockedPortfolio = [];

      for (const rec of p.activeRecurring) {
        p.liquidCash += rec.amountInvested;
      }
      p.activeRecurring = [];

      p.netWorth = p.liquidCash;
      p.title = assignTitle(p);
    }
  } else {
    for (const p of playersList) {
      p.netWorth = p.liquidCash;
      p.title = assignTitle(p);
    }
  }

  // 2. Sort players for final rankings
  playersList.sort((a, b) => {
    if (b.netWorth !== a.netWorth) return b.netWorth - a.netWorth;
    return (a.riskScore || 0) - (b.riskScore || 0);
  });
  playersList.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  const denom = playersList.length > 0 ? playersList.length : 1;

  // 3. Compute Outcome Tier Distribution
  const targetCap = room.targetCapital || 500000;
  const startingCap = room.startingCapital || 100000;

  const tierDefinitions = isMode1 ? [
    {
      id: 'sprint_titan',
      badge: `🏆 SPRINT TITAN (${formatCash(targetCap)}+)`,
      title: 'The Sprint Titan',
      rankTier: 'top',
      description: `Crossed the ${formatCash(targetCap)} threshold or conquered the sprint floor.`,
      themeClass: 'tier-titan',
      minCash: targetCap,
      maxCash: Infinity
    },
    {
      id: 'sprint_survivor',
      badge: `💼 CAPITAL SURVIVOR (${formatCash(startingCap)}-${formatCash(targetCap - 1)})`,
      title: 'The Survivor',
      rankTier: 'middle',
      description: 'Preserved starting principal and generated healthy sprint returns.',
      themeClass: 'tier-capitalist',
      minCash: startingCap,
      maxCash: targetCap - 1
    },
    {
      id: 'sprint_distressed',
      badge: `⚡ WIPED OUT (<${formatCash(startingCap)})`,
      title: 'The Cautionary Tale',
      rankTier: 'bottom',
      description: 'Suffered heavy drawdown from speculative crashes and shocks.',
      themeClass: 'tier-distressed',
      minCash: -Infinity,
      maxCash: startingCap - 1
    }
  ] : [
    {
      id: 'mogul',
      badge: '👑 MOGUL TIER',
      title: 'The Mogul',
      rankTier: 'top',
      description: 'Dominant market performance (>150% initial capital). Strategic foresight and mastery of market cycles.',
      themeClass: 'tier-titan',
      minCash: 150000,
      maxCash: Infinity
    },
    {
      id: 'survivor',
      badge: '🏛️ SURVIVOR TIER',
      title: 'The Survivor',
      rankTier: 'middle',
      description: 'Disciplined capital preservation (70%-150% initial capital). Resilient balance sheet despite volatility.',
      themeClass: 'tier-capitalist',
      minCash: 70000,
      maxCash: 149999
    },
    {
      id: 'cautionary_tale',
      badge: '⚡ CAUTIONARY TALE',
      title: 'The Cautionary Tale',
      rankTier: 'bottom',
      description: 'Aggressive downside exposure (<70% initial capital). A harsh market lesson in speculative concentration.',
      themeClass: 'tier-distressed',
      minCash: -Infinity,
      maxCash: 69999
    }
  ];

  const tierDistribution = tierDefinitions.map(tier => {
    const matching = playersList.filter(p => p.netWorth >= tier.minCash && p.netWorth <= tier.maxCash);
    return {
      ...tier,
      count: matching.length,
      percentage: ((matching.length / denom) * 100).toFixed(1)
    };
  });

  // Top 3 Podium
  const top3 = playersList.slice(0, 3).map((p, idx) => ({
    rank: idx + 1,
    nickname: p.nickname,
    liquidCash: p.liquidCash,
    netWorth: p.netWorth,
    currentTitle: p.title,
    riskScore: p.riskScore || 0,
    isTied: false
  }));

  // Transactional batch persist to PostgreSQL
  try {
    await db.saveCompletedSession({
      roomCode,
      mode: room.mode,
      startedAt: room.startedAt || Date.now(),
      endedAt: Date.now(),
      totalRounds: room.roundIndex,
      playersList
    });
  } catch (err) {
    console.error(`[DB Error] Failed to persist finished session ${roomCode}:`, err.message);
  }

  io.to(`host:${roomCode}`).emit('host:gameFinished', {
    roomCode,
    mode: room.mode,
    totalRounds: room.roundIndex,
    tierDistribution,
    top3,
    fullLeaderboard: playersList.map((p, idx) => ({
      rank: idx + 1,
      nickname: p.nickname,
      liquidCash: p.liquidCash,
      netWorth: p.netWorth,
      currentTitle: p.title,
      riskScore: p.riskScore || 0,
      returnPct: startingCap > 0 ? (((p.netWorth - startingCap) / startingCap) * 100).toFixed(1) : '0.0'
    })),
    isEarlyEnd: !!room.isEarlyEnd,
    startingCapital: startingCap,
    targetCapital: targetCap,
    totalPlayers: playersList.length
  });

  for (const p of playersList) {
    const outcomeTier = tierDefinitions.find(t => p.netWorth >= t.minCash && p.netWorth <= t.maxCash) || tierDefinitions[1];
    const punchline = generatePunchline(p, outcomeTier.id, p.netWorth);

    io.to(`player:${p.id}`).emit('player:gameFinished', {
      finalCash: p.liquidCash,
      lockedValue: 0,
      finalNetWorth: p.netWorth,
      finalRank: p.rank,
      finalTitle: p.title,
      riskScore: p.riskScore || 0,
      totalPlayers: playersList.length,
      outcomeTier,
      primaryDriverPunchline: punchline,
      roomCode,
      mode: room.mode
    });
  }
}

// Helper to count submissions
function getSubmissionCounts(room) {
  let submitted = 0;
  let activeConnected = 0;
  for (const player of room.players.values()) {
    if (player.currentChoice !== null) {
      submitted++;
    }
    if (player.isConnected !== false) {
      activeConnected++;
    }
  }
  return { 
    submitted, 
    total: room.players.size,
    activeConnected: activeConnected > 0 ? activeConnected : room.players.size
  };
}

// Resolve Round Engine
function resolveRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'IN_ROUND') return;

  if (room.timerTimeoutId) {
    clearTimeout(room.timerTimeoutId);
    room.timerTimeoutId = null;
  }

  room.status = 'RESOLVED';
  room.timerEnd = null;

  const counts = {
    opt_safe: 0,
    opt_balanced: 0,
    opt_high: 0,
    inactive: 0
  };

  const playersList = Array.from(room.players.values());
  const totalPlayers = playersList.length;

  // -----------------------------------------------------------------
  // MODE 1: REAL-WORLD INVESTMENT ARENA / CASH SPRINT (SLIDER ENGINE)
  // -----------------------------------------------------------------
  if (room.mode === 'mode_1_sprint') {
    const oppEvent = getMode1EventForRound(room, room.roundIndex);
    const opp = oppEvent.opportunity;
    const business = opp;

    // Determine deal win/loss based on its riskScore / winRate
    const winRate = (opp.winRate !== undefined && Number(opp.winRate) > 0) ? Number(opp.winRate) : Math.max(20, Math.min(75, Math.round(85 - opp.riskScore * 6.5)));
    const didWin = (Math.random() * 100) < winRate;
    const returnPct = didWin ? (opp.win !== undefined ? Number(opp.win) : 25) : (opp.fail !== undefined ? Number(opp.fail) : -15);
    const dominantHeadline = didWin
      ? `${opp.name}: Investment Succeeded (+${returnPct}%)`
      : `⚡ ${opp.name}: Market Headwinds Faced (${returnPct}%)`;

    const analystTip = opp.analystTip || 'Insider tip: High demand expected this round.';

    let hiredAnalystCount = 0;
    let totalRoomInvested = 0;
    let totalAllocationPctSum = 0;

    for (const player of playersList) {
      if (player.hiredAnalyst) hiredAnalystCount++;
      const oldCash = player.liquidCash;
      let chosenOption = player.currentChoice;
      let deltaCash = 0;
      let percentChange = 0;
      let outcomeSummary = '';
      let narrativeReceipt = '';
      let autoAssigned = false;
      let isSwan = !didWin && (opp.riskScore >= 7);

      if (chosenOption === null || chosenOption === undefined) {
        // Inactivity timeout: 3% penalty on total cash, 0% invested (funds kept in bank)
        autoAssigned = true;
        counts.inactive++;
        const afterPenalty = Math.max(0, Math.round(oldCash * 0.97));
        player.liquidCash = afterPenalty;
        deltaCash = player.liquidCash - oldCash;
        percentChange = oldCash > 0 ? Number(((deltaCash / oldCash) * 100).toFixed(1)) : 0;
        outcomeSummary = `Missed deadline (-3.0% penalty). Funds held in bank reserve.`;
        narrativeReceipt = `⚠️ TIMEOUT PENALTY (-3%): You did not allocate in time. Remaining funds held safe in bank reserve.`;
        player.riskScore = (player.riskScore || 0) + 1;
        updatePrimaryDriver(player, room.roundIndex, deltaCash, oldCash, 'opt_safe', 'Inactivity Penalty', 'The Bank', 'timeout');
      } else {
        // Player submitted allocation
        let allocPct = 100;
        let allocatedAmount = oldCash;

        if (player.currentAllocationPct !== undefined && player.currentAllocationPct !== null) {
          allocPct = Math.max(0, Math.min(100, Number(player.currentAllocationPct)));
          allocatedAmount = Math.round(oldCash * (allocPct / 100));
        } else if (player.currentAmount !== undefined && player.currentAmount !== null) {
          allocatedAmount = Math.max(0, Math.min(oldCash, Math.round(Number(player.currentAmount))));
          allocPct = oldCash > 0 ? Math.round((allocatedAmount / oldCash) * 100) : 0;
        }

        const reserveAmount = oldCash - allocatedAmount;
        totalRoomInvested += allocatedAmount;
        totalAllocationPctSum += allocPct;

        if (allocatedAmount === 0) {
          deltaCash = 0;
          player.liquidCash = oldCash;
          percentChange = 0;
          outcomeSummary = "Chose not to invest (100% kept safe in bank).";
          narrativeReceipt = `🛡️ You chose to pass this round and kept 100% of your money safe in the bank ($0 invested).`;
          counts.opt_safe++;
          player.riskScore = (player.riskScore || 0) + 1;
          updatePrimaryDriver(player, room.roundIndex, 0, oldCash, 'opt_safe', 'Bank Safe Reserve', 'The Bank', 'trade');
        } else {
          let profit = Math.round(allocatedAmount * (returnPct / 100));
          if (profit < 0) profit = -Math.min(allocatedAmount, Math.abs(profit)); // Capped at invested amount
          player.liquidCash = Math.max(0, reserveAmount + allocatedAmount + profit);
          deltaCash = profit;
          percentChange = oldCash > 0 ? Number(((deltaCash / oldCash) * 100).toFixed(1)) : 0;
          outcomeSummary = didWin ? opp.winText : opp.failText;
          narrativeReceipt = `Invested $${allocatedAmount.toLocaleString()} (${allocPct}% of cash): ` + (didWin ? opp.winText : opp.failText);
          
          if (allocPct >= 75) counts.opt_high++;
          else if (allocPct >= 25) counts.opt_balanced++;
          else counts.opt_safe++;

          const riskWeight = ((opp.riskScore || 5) / 10) * (allocPct / 100);
          player.riskScore = (player.riskScore || 0) + Number((riskWeight * 5).toFixed(1));
          updatePrimaryDriver(player, room.roundIndex, deltaCash, oldCash, opp.id, opp.name, opp.industry || 'Market', isSwan ? 'black_swan' : 'trade');
        }
      }

      // Analyst evaluation for player
      let analystVerdict = null;
      if (player.hiredAnalyst) {
        analystVerdict = {
          hired: true,
          reliable: didWin,
          text: analystTip,
          truth: analystTip
        };
        narrativeReceipt += ` 🕵️ [Analyst Intel] ${analystTip}`;
      }

      player.lockedPortfolio = [];
      player.activeRecurring = [];
      player.netWorth = player.liquidCash;
      player.title = assignTitle(player);

      player.decisionHistory = player.decisionHistory || [];
      const investedAmt = (player.currentAmount !== undefined) ? player.currentAmount : Math.round(oldCash * ((player.currentAllocationPct || 100) / 100));
      player.decisionHistory.push({
        roundIndex: room.roundIndex,
        sectorId: opp.id,
        amountInvested: investedAmt,
        outcomeAmount: deltaCash
      });

      player.lastOutcome = {
        liquidCash: player.liquidCash,
        lockedValue: 0,
        netWorth: player.netWorth,
        lockedPortfolio: [],
        deltaCash,
        percentChange,
        outcomeSummary,
        narrativeReceipt,
        isBlackSwan: isSwan,
        hostHeadline: dominantHeadline,
        chosenOption: opp.id,
        autoAssigned,
        roundIndex: room.roundIndex,
        title: player.title,
        riskScore: player.riskScore,
        opportunity: opp,
        business: opp,
        analystVerdict,
        maturedNotifications: []
      };

      io.to(`player:${player.id}`).emit('player:roundResolved', player.lastOutcome);
    }

    const denom = totalPlayers > 0 ? totalPlayers : 1;
    const percentages = {
      opt_safe: ((counts.opt_safe / denom) * 100).toFixed(1),
      opt_balanced: ((counts.opt_balanced / denom) * 100).toFixed(1),
      opt_high: ((counts.opt_high / denom) * 100).toFixed(1),
      inactive: ((counts.inactive / denom) * 100).toFixed(1)
    };

    const targetGoal = room.targetCapital || 500000;
    const startCap = room.startingCapital || 100000;
    const b1 = Math.round(startCap * 0.75);
    const b2 = Math.round(startCap * 1.5);
    const b3 = Math.round(startCap + (targetGoal - startCap) * 0.5);

    const wealthBuckets = [
      { label: `Bottom (< ${formatCash(b1)})`, count: 0, percentage: '0.0' },
      { label: `Lower Mid (${formatCash(b1)}-${formatCash(b2)})`, count: 0, percentage: '0.0' },
      { label: `Mid Tier (${formatCash(b2)}-${formatCash(b3)})`, count: 0, percentage: '0.0' },
      { label: `Upper Mid (${formatCash(b3)}-${formatCash(targetGoal - 1)})`, count: 0, percentage: '0.0' },
      { label: `Top Wealth (≥ ${formatCash(targetGoal)})`, count: 0, percentage: '0.0' }
    ];

    for (const p of playersList) {
      const worth = p.liquidCash;
      if (worth < b1) wealthBuckets[0].count++;
      else if (worth < b2) wealthBuckets[1].count++;
      else if (worth < b3) wealthBuckets[2].count++;
      else if (worth < targetGoal) wealthBuckets[3].count++;
      else wealthBuckets[4].count++;
    }
    wealthBuckets.forEach(b => {
      b.percentage = ((b.count / denom) * 100).toFixed(1);
    });

    const sortedPlayers = [...playersList].sort((a, b) => {
      if (b.liquidCash !== a.liquidCash) return b.liquidCash - a.liquidCash;
      return (a.riskScore || 0) - (b.riskScore || 0);
    });

    sortedPlayers.forEach((p, idx) => {
      p.rank = idx + 1;
      p.title = assignTitle(p);
    });

    const top3 = sortedPlayers.slice(0, 3).map((p, idx) => ({
      rank: idx + 1,
      nickname: p.nickname,
      liquidCash: p.liquidCash,
      netWorth: p.liquidCash,
      currentTitle: p.title,
      riskScore: p.riskScore || 0,
      isTied: false
    }));

    // Check outliers for Mode 1
    let outlierPlayer = null;
    const mode1ChoiceCounts = {};
    for (const p of playersList) {
      const ch = p.currentChoice || 'opt_safe';
      mode1ChoiceCounts[ch] = (mode1ChoiceCounts[ch] || 0) + 1;
    }
    const mode1RareChoices = Object.entries(mode1ChoiceCounts)
      .map(([id, count]) => ({ id, count, pct: (count / denom) * 100 }))
      .filter(o => o.pct <= 10.0 && o.count > 0);

    if (mode1RareChoices.length > 0) {
      const minPct = Math.min(...mode1RareChoices.map(o => o.pct));
      const tied = mode1RareChoices.filter(o => Math.abs(o.pct - minPct) < 0.001);
      const qualifying = playersList.filter(p => tied.some(o => o.id === p.currentChoice));
      if (qualifying.length > 0) {
        const picked = qualifying[crypto.randomInt(0, qualifying.length)];
        const optDef = roundScenario.options.find(o => o.id === picked.currentChoice);
        outlierPlayer = {
          nickname: picked.nickname,
          optionLabel: optDef ? optDef.name : picked.currentChoice,
          percentage: Number(minPct.toFixed(1))
        };
      }
    }

    const winners = sortedPlayers.slice(0, 1);
    const maxRounds = room.maxRounds || (room.customScenarios?.rounds?.length) || 10;
    const isGameOver = room.roundIndex >= maxRounds;

    const dramaFeed = [];
    for (const p of playersList) {
      if (p.lastOutcome?.autoAssigned) {
        dramaFeed.push(`📢 ${p.nickname} panicked and timed out (-3%)!`);
      } else if (p.lastOutcome?.deltaCash > 0) {
        dramaFeed.push(`📢 ${p.nickname} wagered ${p.currentAllocationPct || 100}% and won BIG on ${p.lastOutcome.opportunity?.name || 'Deal'} (+${p.lastOutcome.percentChange}%)!`);
      } else if (p.lastOutcome?.deltaCash < 0) {
        dramaFeed.push(`📢 ${p.nickname} wagered ${p.currentAllocationPct || 100}% and took a hit on ${p.lastOutcome.opportunity?.name || 'Deal'} (${p.lastOutcome.percentChange}%)!`);
      } else {
        dramaFeed.push(`🛡️ ${p.nickname} kept cash safe in bank reserves.`);
      }
    }

    room.lastResolutionStats = {
      roundIndex: room.roundIndex,
      mode: 'mode_1_sprint',
      totalPlayers,
      counts,
      percentages,
      wealthDistribution: wealthBuckets,
      outlierPlayer,
      top3,
      hostHeadline: dominantHeadline,
      targetGoal,
      startingCapital: startCap,
      business: {
        name: business.name,
        industry: business.industry,
        tagline: business.tagline
      },
      analystHiredCount: hiredAnalystCount,
      analystMemoTruth: analystTip,
      analystReliable: true,
      winners: winners.map(w => ({ nickname: w.nickname, liquidCash: w.liquidCash })),
      dramaFeed,
      isGameOver
    };

    if (room.roundIndex % 2 === 0) {
      db.saveSnapshot(roomCode, serializeRoom(room)).catch(err => {
        console.warn(`[Snapshot] Could not save round ${room.roundIndex} snapshot:`, err.message);
      });
    }

    if (room.hostSocketId) {
      io.to(`host:${roomCode}`).emit('host:roundResolved', room.lastResolutionStats);
    }

    console.log(`[Mode 1 Business Spotlight Resolved] Room ${roomCode} Round ${room.roundIndex} - Total: ${totalPlayers}, Safe: ${counts.opt_safe}, Balanced: ${counts.opt_balanced}, Rocket: ${counts.opt_high}, Inactive: ${counts.inactive}, Analysts Hired: ${hiredAnalystCount}, Winners: ${winners.length}`);

    if (isGameOver) {
      finishGame(roomCode);
    }
    return;
  }

  // -----------------------------------------------------------------
  // LEGACY MODE: 15-ROUND MACROECONOMIC ENGINE
  // -----------------------------------------------------------------
  const eventMods = getEventModifiersForRound(room.roundIndex);
  const currentEvent = room.currentEvent || getEventForRound(room.roundIndex);

  for (const player of playersList) {
    player.lockedPortfolio = player.lockedPortfolio || [];
    player.activeRecurring = player.activeRecurring || [];
    player.maturedNotifications = [];

    // 1. Apply event modifiers to existing active positions
    for (const locked of player.lockedPortfolio) {
      if (eventMods[locked.sectorId]) {
        locked.eventModifiers = (locked.eventModifiers || 0) + eventMods[locked.sectorId];
      }
    }
    for (const rec of player.activeRecurring) {
      if (eventMods[rec.sectorId]) {
        rec.eventModifiers = (rec.eventModifiers || 0) + eventMods[rec.sectorId];
      }
    }

    // 2. Process maturing locked investments
    const remainingLocked = [];
    for (const asset of player.lockedPortfolio) {
      if (asset.maturesAtRound <= room.roundIndex) {
        const principal = asset.amountInvested || 0;
        const baseReturn = asset.baseReturnPct || 0;
        const mod = asset.eventModifiers || 0;
        const volRange = asset.volatilityPct || 0;
        const volatility = volRange * (Math.random() * 2 - 1);
        const totalPct = baseReturn + mod + volatility;
        const profit = Math.round(principal * (totalPct / 100));
        const totalPayout = Math.max(0, principal + profit);
        player.liquidCash += totalPayout;

        updatePrimaryDriver(player, room.roundIndex, profit, principal, asset.sectorId, `${asset.name} maturity`, currentEvent.persona?.name, 'maturity');

        player.maturedNotifications.push({
          id: asset.id || crypto.randomUUID(),
          assetName: asset.name,
          principal,
          profit,
          totalPayout,
          maturesAtRound: room.roundIndex,
          message: `${asset.name} matured! Principal ${formatCash(principal)} + Return ${formatCash(profit)} (${totalPct.toFixed(1)}%) credited.`
        });
      } else {
        remainingLocked.push(asset);
      }
    }
    player.lockedPortfolio = remainingLocked;

    // 3. Process recurring dividend payouts
    for (const rec of player.activeRecurring) {
      if (room.roundIndex <= rec.maturesAtRound) {
        const baseDiv = (rec.baseReturnPct || 0) / (rec.maturityRounds || 1);
        const modDiv = (rec.eventModifiers || 0) / (rec.maturityRounds || 1);
        const divPct = Math.max(0, baseDiv + modDiv);
        const dividend = Math.round(rec.amountInvested * (divPct / 100));
        player.liquidCash += dividend;

        updatePrimaryDriver(player, room.roundIndex, dividend, rec.amountInvested, rec.sectorId, `${rec.name} dividend`, currentEvent.persona?.name, 'dividend');

        player.maturedNotifications.push({
          id: crypto.randomUUID(),
          assetName: rec.name,
          principal: rec.amountInvested,
          dividend,
          message: `${rec.name} distributed round dividend: +${formatCash(dividend)}.`
        });
      }
    }

    // 4. Process current round decision
    const oldCash = player.liquidCash;
    let chosenOption = player.currentChoice;
    let investAmount = player.currentAmount !== undefined && player.currentAmount !== null ? Number(player.currentAmount) : oldCash;
    if (isNaN(investAmount) || investAmount < 0 || investAmount > oldCash) {
      investAmount = oldCash;
    }

    let deltaCash = 0;
    let percentChange = 0;
    let outcomeSummary = '';
    let autoAssigned = false;

    if (!chosenOption) {
      // Inaction policy: Auto-assign lowest-risk option with 3% cash penalty (cash * 0.97)
      autoAssigned = true;
      chosenOption = 'agriculture';
      player.currentChoice = 'agriculture';
      player.riskScore = (player.riskScore || 0) + 1;
      const penaltyAmount = Math.round(oldCash * 0.03);
      player.liquidCash = Math.max(0, oldCash - penaltyAmount);
      deltaCash = -penaltyAmount;
      percentChange = -3.0;
      outcomeSummary = 'Missed Deadline: Incurred 3.0% inactivity liquidity penalty and auto-assigned to Agriculture.';
      counts.inactive++;
      updatePrimaryDriver(player, room.roundIndex, -penaltyAmount, oldCash, 'agriculture', 'Inactivity Penalty', 'The Floor', 'timeout');
    } else if (chosenOption === 'opt_quick' || chosenOption === 'quickTrade') {
      // Quick Trade: Instant +5% / -5% random return, zero lockup
      player.riskScore = (player.riskScore || 0) + 0.5;
      const isGain = Math.random() >= 0.5;
      percentChange = isGain ? 5.0 : -5.0;
      deltaCash = Math.round(investAmount * (percentChange / 100));
      player.liquidCash = Math.max(0, oldCash + deltaCash);
      outcomeSummary = isGain
        ? `Overnight Liquidity arbitrage executed successfully! +5.0% (${formatCash(deltaCash)}) profit realized.`
        : `Overnight Liquidity overnight spread compressed! -5.0% (${formatCash(deltaCash)}) drawdown incurred.`;
      counts.opt_safe++;
      updatePrimaryDriver(player, room.roundIndex, deltaCash, investAmount, 'quickTrade', 'Overnight Liquidity', 'Money Market', 'arbitrage');
    } else {
      const sectorDef = resolveSectorDef(chosenOption);
      const isRecurring = sectorDef && sectorDef.type === 'recurring';
      const riskIncrement = sectorDef?.riskTier === 'high' ? 3 : sectorDef?.riskTier === 'medium' ? 2 : 1;
      player.riskScore = (player.riskScore || 0) + riskIncrement;

      // Track sector counts for host aggregate
      if (sectorDef?.riskTier === 'high') counts.opt_high++;
      else if (sectorDef?.riskTier === 'medium') counts.opt_balanced++;
      else counts.opt_safe++;

      if (isRecurring) {
        player.activeRecurring.push({
          id: crypto.randomUUID(),
          sectorId: sectorDef.id,
          name: sectorDef.name,
          category: sectorDef.category,
          amountInvested: investAmount,
          baseReturnPct: sectorDef.totalReturnPct,
          maturityRounds: sectorDef.maturityRounds,
          investedAtRound: room.roundIndex,
          maturesAtRound: room.roundIndex + sectorDef.maturityRounds,
          eventModifiers: 0
        });
        outcomeSummary = `Allocated ${formatCash(investAmount)} into ${sectorDef.name}. Royalty dividends will distribute across ${sectorDef.maturityRounds} rounds.`;
        updatePrimaryDriver(player, room.roundIndex, 0, investAmount, sectorDef.id, `${sectorDef.name} entry`, currentEvent.persona?.name, 'entry');
      } else {
        const lockRounds = sectorDef ? sectorDef.maturityRounds : 3;
        player.liquidCash = Math.max(0, oldCash - investAmount);
        player.lockedPortfolio.push({
          id: crypto.randomUUID(),
          sectorId: sectorDef ? sectorDef.id : chosenOption,
          name: sectorDef ? sectorDef.name : chosenOption,
          category: sectorDef ? sectorDef.category : 'Market Asset',
          amountInvested: investAmount,
          baseReturnPct: sectorDef ? sectorDef.totalReturnPct : 20,
          maturityRounds: lockRounds,
          volatilityPct: sectorDef ? sectorDef.volatilityPct : 10,
          investedAtRound: room.roundIndex,
          maturesAtRound: room.roundIndex + lockRounds,
          eventModifiers: 0
        });
        outcomeSummary = `Allocated ${formatCash(investAmount)} into ${sectorDef?.name || chosenOption}. Capital locked until Round ${room.roundIndex + lockRounds}.`;
        updatePrimaryDriver(player, room.roundIndex, 0, investAmount, sectorDef?.id || chosenOption, `${sectorDef?.name || chosenOption} allocation`, currentEvent.persona?.name, 'lock');
      }
    }

    const lockedTotal = player.lockedPortfolio.reduce((sum, item) => sum + (item.amountInvested || 0), 0);
    const recurringTotal = player.activeRecurring.reduce((sum, item) => sum + (item.amountInvested || 0), 0);
    const totalLockedValue = lockedTotal + recurringTotal;
    player.netWorth = player.liquidCash + totalLockedValue;
    player.title = assignTitle(player);

    player.decisionHistory = player.decisionHistory || [];
    player.decisionHistory.push({
      roundIndex: room.roundIndex,
      sectorId: chosenOption,
      amountInvested: investAmount,
      outcomeAmount: deltaCash
    });

    player.lastOutcome = {
      liquidCash: player.liquidCash,
      lockedValue: totalLockedValue,
      netWorth: player.netWorth,
      lockedPortfolio: [...player.lockedPortfolio, ...player.activeRecurring],
      deltaCash,
      percentChange,
      outcomeSummary,
      chosenOption,
      autoAssigned,
      roundIndex: room.roundIndex,
      title: player.title,
      riskScore: player.riskScore,
      maturedNotifications: [...player.maturedNotifications]
    };

    io.to(`player:${player.id}`).emit('player:roundResolved', player.lastOutcome);
  }

  const denom = totalPlayers > 0 ? totalPlayers : 1;
  const percentages = {
    opt_safe: ((counts.opt_safe / denom) * 100).toFixed(1),
    opt_balanced: ((counts.opt_balanced / denom) * 100).toFixed(1),
    opt_high: ((counts.opt_high / denom) * 100).toFixed(1),
    inactive: ((counts.inactive / denom) * 100).toFixed(1)
  };

  const wealthBuckets = [
    { label: 'Bottom 20% (< $95k)', count: 0, percentage: '0.0' },
    { label: 'Lower Mid ($95k-$105k)', count: 0, percentage: '0.0' },
    { label: 'Mid Tier ($105k-$120k)', count: 0, percentage: '0.0' },
    { label: 'Upper Mid ($120k-$140k)', count: 0, percentage: '0.0' },
    { label: 'Top 20% (≥ $140k)', count: 0, percentage: '0.0' }
  ];

  for (const p of playersList) {
    const worth = p.netWorth || p.liquidCash;
    if (worth < 95000) wealthBuckets[0].count++;
    else if (worth < 105000) wealthBuckets[1].count++;
    else if (worth < 120000) wealthBuckets[2].count++;
    else if (worth < 140000) wealthBuckets[3].count++;
    else wealthBuckets[4].count++;
  }
  wealthBuckets.forEach(b => {
    b.percentage = ((b.count / denom) * 100).toFixed(1);
  });

  let outlierPlayer = null;
  const optionLabels = {
    opt_safe: 'Sovereign Bonds',
    opt_balanced: 'Logistics Fleet',
    opt_high: 'Crypto Venture',
    agriculture: 'Agriculture',
    auto_parts: 'Auto/Parts',
    biotechnology: 'Biotechnology',
    business_products_services: 'Business Services',
    chemicals: 'Chemicals',
    food_beverage: 'Food & Beverage',
    education: 'Education',
    electronics: 'Electronics',
    gaming: 'Gaming',
    health_beauty: 'Health & Beauty',
    crypto: 'Crypto Venture',
    quickTrade: 'Overnight Liquidity'
  };

  const choiceCounts = {};
  for (const p of playersList) {
    if (p.lastOutcome && p.lastOutcome.autoAssigned) continue;
    const ch = p.currentChoice;
    if (ch) {
      choiceCounts[ch] = (choiceCounts[ch] || 0) + 1;
    }
  }

  const rareChoices = Object.entries(choiceCounts)
    .map(([id, count]) => ({ id, count, pct: (count / denom) * 100 }))
    .filter(o => o.pct <= 5.0 && o.count > 0);

  if (rareChoices.length > 0) {
    const minPct = Math.min(...rareChoices.map(o => o.pct));
    const tied = rareChoices.filter(o => Math.abs(o.pct - minPct) < 0.001);
    const qualifying = playersList.filter(p => !p.lastOutcome?.autoAssigned && tied.some(o => o.id === p.currentChoice));
    if (qualifying.length > 0) {
      const picked = qualifying[crypto.randomInt(0, qualifying.length)];
      outlierPlayer = {
        nickname: picked.nickname,
        optionLabel: optionLabels[picked.currentChoice] || picked.currentChoice,
        percentage: Number(minPct.toFixed(1))
      };
    }
  }

  const sortedPlayers = [...playersList].sort((a, b) => {
    if ((b.netWorth || b.liquidCash) !== (a.netWorth || a.liquidCash)) {
      return (b.netWorth || b.liquidCash) - (a.netWorth || a.liquidCash);
    }
    return (a.riskScore || 0) - (b.riskScore || 0);
  });

  sortedPlayers.forEach((p, idx) => {
    p.rank = idx + 1;
    p.title = assignTitle(p);
  });

  const top3 = sortedPlayers.slice(0, 3).map((p, idx) => ({
    rank: idx + 1,
    nickname: p.nickname,
    liquidCash: p.liquidCash,
    netWorth: p.netWorth || p.liquidCash,
    currentTitle: p.title,
    riskScore: p.riskScore || 0,
    isTied: false
  }));

  room.lastResolutionStats = {
    roundIndex: room.roundIndex,
    totalPlayers,
    counts,
    percentages,
    wealthDistribution: wealthBuckets,
    outlierPlayer,
    top3
  };

  if (room.roundIndex % 2 === 0) {
    db.saveSnapshot(roomCode, serializeRoom(room)).catch(err => {
      console.warn(`[Snapshot] Could not save round ${room.roundIndex} snapshot:`, err.message);
    });
  }

  if (room.hostSocketId) {
    io.to(`host:${roomCode}`).emit('host:roundResolved', room.lastResolutionStats);
  }

  console.log(`[Round Resolved] Room ${roomCode} Round ${room.roundIndex} - Total: ${totalPlayers}, Safe: ${counts.opt_safe}, Balanced: ${counts.opt_balanced}, High: ${counts.opt_high}, Inactive: ${counts.inactive}`);

  if (room.roundIndex >= 15) {
    finishGame(roomCode);
  }
}

// -------------------------------------------------------------
// LIQUIDITY BOMB (HOT POTATO) MINI-GAME ENGINE
// -------------------------------------------------------------

function startLiquidityBomb(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.timerTimeoutId) {
    clearTimeout(room.timerTimeoutId);
    room.timerTimeoutId = null;
  }

  room.status = 'LIQUIDITY_BOMB';
  const activePlayers = Array.from(room.players.values()).filter(p => p.isConnected !== false);
  const totalPlayers = activePlayers.length > 0 ? activePlayers.length : room.players.size;

  // Bomb count is 25% of active participants (min 1 bomb)
  const totalBombs = Math.max(1, Math.floor(totalPlayers * 0.25));

  // Randomly select totalBombs unique player IDs
  const shuffled = [...activePlayers].sort(() => 0.5 - Math.random());
  const initialHolders = new Set(shuffled.slice(0, totalBombs).map(p => p.id));

  // Initialize bomb tracking per player (for anti-ping-pong and fresh distribution)
  for (const p of activePlayers) {
    p.lastBombFrom = null;
    p.bombHoldCount = initialHolders.has(p.id) ? 1 : 0;
  }

  const durationMs = 10000; // 10-second high-intensity sprint
  const timerEnd = Date.now() + durationMs;

  room.bombState = {
    active: true,
    holders: initialHolders,
    passCount: 0,
    timerEnd,
    durationSeconds: 10,
    totalBombs,
    totalPlayers,
    penaltyAmount: 10000,
    panicPenalty: 500
  };

  // Broadcast to Host Display
  io.to(`host:${roomCode}`).emit('host:bombMinigameStarted', {
    timerEnd,
    durationSeconds: 10,
    totalBombs,
    totalPlayers,
    roundIndex: room.roundIndex,
    penaltyAmount: 10000,
    panicPenalty: 500
  });

  // Unicast to each individual player for zero-lag mobile responsiveness
  for (const player of room.players.values()) {
    const hasBomb = initialHolders.has(player.id);
    io.to(`player:${player.id}`).emit('player:bombState', {
      hasBomb,
      timerEnd,
      durationSeconds: 10,
      totalBombs,
      penaltyAmount: 10000,
      panicPenalty: 500,
      liquidCash: player.liquidCash
    });
  }

  console.log(`[Liquidity Bomb Started] Room ${roomCode}: ${totalBombs} bombs distributed among ${totalPlayers} players. Duration: 10s.`);

  room.timerTimeoutId = setTimeout(() => {
    resolveLiquidityBomb(roomCode);
  }, durationMs);
}

function handleBombPass(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'LIQUIDITY_BOMB' || !room.bombState || !room.bombState.active) return;

  const player = room.players.get(playerId);
  if (!player) return;

  // If player does NOT have the bomb -> Misclick / Panic Penalty (-$500)
  if (!room.bombState.holders.has(playerId)) {
    const penalty = room.bombState.panicPenalty || 500;
    player.liquidCash = Math.max(0, player.liquidCash - penalty);
    player.netWorth = player.liquidCash;
    io.to(`player:${playerId}`).emit('player:panicPenaltyApplied', {
      penalty,
      liquidCash: player.liquidCash,
      message: `Misclick Panic Penalty! (-$${penalty.toLocaleString()})`
    });
    return;
  }

  // Player DOES have the bomb -> Transfer immediately
  room.bombState.holders.delete(playerId);

  const activePlayers = Array.from(room.players.values()).filter(p => p.isConnected !== false);
  
  // 1. Candidate Pool: Active players who do not currently hold a bomb AND are not the current passer
  let safeCandidates = activePlayers.filter(p => !room.bombState.holders.has(p.id) && p.id !== playerId);

  // 2. Anti-Ping-Pong: Do not pass back to the player who just passed it to you (if other options exist)
  if (player.lastBombFrom && safeCandidates.length > 1) {
    const nonPingPong = safeCandidates.filter(p => p.id !== player.lastBombFrom);
    if (nonPingPong.length > 0) {
      safeCandidates = nonPingPong;
    }
  }

  // 3. Fair Room Circulation: Prioritize candidates with the lowest bombHoldCount (fresh targets first)
  let targetPlayer = null;
  if (safeCandidates.length > 0) {
    const minHoldCount = Math.min(...safeCandidates.map(p => p.bombHoldCount || 0));
    const lowestHoldCandidates = safeCandidates.filter(p => (p.bombHoldCount || 0) === minHoldCount);
    targetPlayer = lowestHoldCandidates[crypto.randomInt(0, lowestHoldCandidates.length)];
  } else {
    const otherPlayers = activePlayers.filter(p => p.id !== playerId);
    if (otherPlayers.length > 0) {
      targetPlayer = otherPlayers[crypto.randomInt(0, otherPlayers.length)];
    }
  }

  if (targetPlayer) {
    targetPlayer.lastBombFrom = playerId;
    targetPlayer.bombHoldCount = (targetPlayer.bombHoldCount || 0) + 1;
    room.bombState.holders.add(targetPlayer.id);
    room.bombState.passCount++;

    // Unicast to previous holder: now SAFE
    io.to(`player:${playerId}`).emit('player:bombState', {
      hasBomb: false,
      timerEnd: room.bombState.timerEnd,
      passedTo: targetPlayer.nickname
    });

    // Unicast to new holder: received BOMB
    io.to(`player:${targetPlayer.id}`).emit('player:bombState', {
      hasBomb: true,
      timerEnd: room.bombState.timerEnd,
      passedFrom: player.nickname
    });

    // Notify Host for live passing ticker feed
    io.to(`host:${roomCode}`).emit('host:bombPassUpdate', {
      passCount: room.bombState.passCount,
      passer: player.nickname,
      receiver: targetPlayer.nickname
    });
  }
}

function handlePanicTap(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'LIQUIDITY_BOMB' || !room.bombState || !room.bombState.active) return;

  const player = room.players.get(playerId);
  if (!player || room.bombState.holders.has(playerId)) return;

  const penalty = room.bombState.panicPenalty || 500;
  player.liquidCash = Math.max(0, player.liquidCash - penalty);
  player.netWorth = player.liquidCash;
  io.to(`player:${playerId}`).emit('player:panicPenaltyApplied', {
    penalty,
    liquidCash: player.liquidCash,
    message: `Misclick Panic Penalty! (-$${penalty.toLocaleString()})`
  });
}

function resolveLiquidityBomb(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'LIQUIDITY_BOMB' || !room.bombState) return;

  if (room.timerTimeoutId) {
    clearTimeout(room.timerTimeoutId);
    room.timerTimeoutId = null;
  }

  room.bombState.active = false;
  room.status = 'BOMB_RESOLVED';

  const penaltyAmount = room.bombState.penaltyAmount || 10000;
  const explodedPlayers = [];
  const survivedPlayers = [];

  for (const player of room.players.values()) {
    const isHolder = room.bombState.holders.has(player.id);
    if (isHolder) {
      player.liquidCash = Math.max(0, player.liquidCash - penaltyAmount);
      player.netWorth = player.liquidCash;
      player.riskScore = (player.riskScore || 0) + 1;
      explodedPlayers.push({
        id: player.id,
        nickname: player.nickname,
        penalty: penaltyAmount,
        liquidCash: player.liquidCash
      });
      io.to(`player:${player.id}`).emit('player:bombResolved', {
        exploded: true,
        penalty: penaltyAmount,
        liquidCash: player.liquidCash
      });
    } else {
      survivedPlayers.push({
        id: player.id,
        nickname: player.nickname,
        liquidCash: player.liquidCash
      });
      io.to(`player:${player.id}`).emit('player:bombResolved', {
        exploded: false,
        penalty: 0,
        liquidCash: player.liquidCash
      });
    }
  }

  const resultStats = {
    totalBombs: room.bombState.totalBombs,
    totalPasses: room.bombState.passCount,
    explodedCount: explodedPlayers.length,
    survivedCount: survivedPlayers.length,
    explodedPlayers,
    totalBurntCash: explodedPlayers.length * penaltyAmount,
    nextRoundIndex: room.roundIndex + 1,
    maxRounds: room.maxRounds || 10
  };

  io.to(`host:${roomCode}`).emit('host:bombResolved', resultStats);
  console.log(`[Liquidity Bomb Resolved] Room ${roomCode}: ${explodedPlayers.length} exploded (-$${penaltyAmount} each), ${survivedPlayers.length} survived. Total Passes: ${room.bombState.passCount}`);
}

// -------------------------------------------------------------
// GAME PHASES / LIFECYCLE
// -------------------------------------------------------------

function advanceOrTriggerBomb(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const maxRounds = room.mode === 'mode_1_sprint' ? (room.maxRounds || room.customScenarios?.rounds?.length || 10) : 15;
  if (room.roundIndex >= maxRounds) {
    finishGame(roomCode);
    return;
  }
  // Auto-trigger Liquidity Bomb after Round 3 and after Round 7 if not already triggered for this round
  if ((room.roundIndex === 3 || room.roundIndex === 7) && room.lastBombRound !== room.roundIndex) {
    room.lastBombRound = room.roundIndex;
    console.log(`[Auto-Trigger Minigame] Launching Liquidity Bomb after Round ${room.roundIndex} for Room ${roomCode}!`);
    startLiquidityBomb(roomCode);
    return;
  }
  startMarketIntelPhase(roomCode);
}

function startMarketIntelPhase(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.timerTimeoutId) {
    clearTimeout(room.timerTimeoutId);
    room.timerTimeoutId = null;
  }

  const isMode1 = room.mode === 'mode_1_sprint';
  const maxRounds = isMode1 ? (room.maxRounds || room.customScenarios?.rounds?.length || 10) : 15;

  if (room.roundIndex >= maxRounds) {
    finishGame(roomCode);
    return;
  }

  room.roundIndex++;
  room.status = 'MARKET_INTEL';

  if (isMode1) {
    room.currentEvent = getMode1EventForRound(room, room.roundIndex);
    room.roundOptions = getMode1RoundOptions(room, room.roundIndex);
  } else {
    room.currentEvent = getEventForRound(room.roundIndex);
    room.roundOptions = getRoundOptions(room.roundIndex);
  }

  // Configurable intel window (Fast in tests, 5s default in production)
  const isFastTimers = process.env.TEST_FAST_TIMERS === 'true' || !!process.env.DECISION_DURATION || !!process.env.INTEL_DURATION;
  const intelDuration = isFastTimers ? Number(process.env.INTEL_DURATION || 100) : 5000;
  room.timerEnd = Date.now() + intelDuration;

  const payload = {
    phase: 'MARKET_INTEL',
    roundIndex: room.roundIndex,
    maxRounds,
    event: room.currentEvent,
    timerEnd: room.timerEnd,
    endTimestamp: room.timerEnd,
    mode: room.mode
  };

  io.to(`host:${roomCode}`).emit('host:phaseChange', payload);
  io.to(`host:${roomCode}`).emit('host:marketIntelPhase', payload);
  io.to(`room:${roomCode}`).emit('room:phaseChange', payload);
  io.to(`room:${roomCode}`).emit('player:marketIntelPhase', payload);

  console.log(`[Market Intel Phase] Room ${roomCode} Round ${room.roundIndex} (Mode: ${room.mode})`);

  room.timerTimeoutId = setTimeout(() => {
    openDecisionPhase(roomCode);
  }, intelDuration);
}

function openDecisionPhase(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.timerTimeoutId) {
    clearTimeout(room.timerTimeoutId);
    room.timerTimeoutId = null;
  }

  room.status = 'IN_ROUND';

  // Reset players' choices & analyst status for this round
  for (const player of room.players.values()) {
    player.currentChoice = null;
    player.currentAmount = null;
    player.hiredAnalyst = false;
  }

  const isMode1 = room.mode === 'mode_1_sprint';
  const isFastTimers = process.env.TEST_FAST_TIMERS === 'true' || !!process.env.DECISION_DURATION;
  const customTimer = room.customScenarios?.timerSeconds ? room.customScenarios.timerSeconds * 1000 : null;
  const defaultDuration = customTimer || (isMode1 ? 80000 : 25000);
  const durationMs = isFastTimers ? Number(process.env.DECISION_DURATION || 300) : defaultDuration;
  room.timerEnd = Date.now() + durationMs;
  const maxRounds = isMode1 ? (room.maxRounds || room.customScenarios?.rounds?.length || 10) : 15;

  const standings = Array.from(room.players.values())
    .map(p => ({
      id: p.id,
      nickname: p.nickname,
      liquidCash: p.liquidCash,
      netWorth: p.netWorth || p.liquidCash,
      deltaCash: p.lastOutcome?.deltaCash || 0,
      title: p.title || 'Investor'
    }))
    .sort((a, b) => (b.liquidCash || b.netWorth) - (a.liquidCash || a.netWorth));

  const startPayload = {
    phase: 'IN_ROUND',
    roundIndex: room.roundIndex,
    maxRounds,
    timerEnd: room.timerEnd,
    endTimestamp: room.timerEnd,
    durationSeconds: Math.round(durationMs / 1000),
    options: room.roundOptions,
    event: room.currentEvent,
    business: room.currentEvent?.business || null,
    playerCount: room.players.size,
    standings,
    mode: room.mode
  };

  io.to(`host:${roomCode}`).emit('host:roundStarted', startPayload);
  io.to(`room:${roomCode}`).emit('round:started', startPayload);
  io.to(`room:${roomCode}`).emit('room:roundStarted', startPayload);
  io.to(`room:${roomCode}`).emit('player:roundStarted', startPayload);

  console.log(`[Round Started] Room ${roomCode} Round ${room.roundIndex} - Timer: ${durationMs}ms`);

  room.timerTimeoutId = setTimeout(() => {
    resolveRound(roomCode);
  }, durationMs);
}

// -------------------------------------------------------------
// SOCKET.IO CONNECTION & HANDLERS
// -------------------------------------------------------------

io.on('connection', (socket) => {
  // Sync server clock with client immediately upon connect
  socket.emit('server:time', { serverTime: Date.now() });

  // -------------------------------------------------------------
  // HOST HANDLERS
  // -------------------------------------------------------------

  socket.on('host:createRoom', ({ mode, customScenarios, scenarioSet }, callback) => {
    const code = generateRoomCode();
    const hostToken = crypto.randomUUID();
    const selectedMode = mode || 'mode_1_sprint';

    let validatedScenarios = null;
    let startingCapital = 100000;
    let targetCapital = 500000;
    let maxRounds = 10;
    let selectedSet = Math.max(1, Math.min(5, Number(scenarioSet) || 1));

    if (customScenarios && selectedMode === 'mode_1_sprint') {
      const validation = validateMode1CustomScenarios(customScenarios);
      if (!validation.valid) {
        const errResp = { success: false, error: validation.error };
        if (typeof callback === 'function') callback(errResp);
        return socket.emit('host:createRoomError', errResp);
      }
      validatedScenarios = validation.sanitizedData;
      startingCapital = validatedScenarios.startingCapital;
      targetCapital = validatedScenarios.targetCapital;
      maxRounds = validatedScenarios.maxRounds;
    } else if (selectedMode === 'mode_1_sprint') {
      validatedScenarios = getScenarioPack(selectedSet);
    }

    const room = {
      roomCode: code,
      hostToken,
      hostSocketId: socket.id,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      status: 'LOBBY',
      mode: selectedMode,
      customScenarios: validatedScenarios,
      startingCapital,
      targetCapital,
      maxRounds,
      roundIndex: 0,
      currentEvent: null,
      roundOptions: null,
      timerEnd: null,
      timerTimeoutId: null,
      lastResolutionStats: null,
      finishedAt: null,
      players: new Map()
    };

    rooms.set(code, room);
    socket.join(`host:${code}`);

    const resp = {
      success: true,
      roomCode: code,
      hostToken,
      mode: selectedMode,
      status: room.status,
      playerCount: 0,
      startingCapital,
      targetCapital,
      maxRounds,
      customScenarios: validatedScenarios ? {
        name: validatedScenarios.name,
        description: validatedScenarios.description,
        roundsCount: validatedScenarios.rounds.length,
        startingCapital,
        targetCapital,
        maxRounds
      } : null
    };

    if (typeof callback === 'function') callback(resp);
    socket.emit('host:roomCreated', resp);
    console.log(`[Room Created] Code: ${code} (Mode: ${selectedMode}, Custom: ${validatedScenarios ? validatedScenarios.name : 'Default'})`);
  });

  socket.on('host:uploadCustomScenarios', ({ roomCode, hostToken, customScenarios }, callback) => {
    if (!roomCode || !hostToken || !customScenarios) {
      const resp = { success: false, error: 'Missing roomCode, hostToken, or customScenarios.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    if (room.status !== 'LOBBY' && room.status !== 'FINISHED') {
      const resp = { success: false, error: 'Cannot modify custom scenarios during an active game.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    const validation = validateMode1CustomScenarios(customScenarios);
    if (!validation.valid) {
      const resp = { success: false, error: validation.error };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    room.customScenarios = validation.sanitizedData;
    room.startingCapital = validation.sanitizedData.startingCapital;
    room.targetCapital = validation.sanitizedData.targetCapital;
    room.maxRounds = validation.sanitizedData.maxRounds;

    // Update starting cash for players if still in lobby
    if (room.status === 'LOBBY') {
      for (const player of room.players.values()) {
        player.liquidCash = room.startingCapital;
        player.netWorth = room.startingCapital;
        io.to(`player:${player.id}`).emit('player:scenarioUpdated', {
          scenarioName: room.customScenarios.name,
          startingCapital: room.startingCapital,
          targetCapital: room.targetCapital,
          liquidCash: player.liquidCash,
          netWorth: player.netWorth
        });
      }
    }

    const resp = {
      success: true,
      scenarioName: room.customScenarios.name,
      description: room.customScenarios.description,
      roundsCount: room.customScenarios.rounds.length,
      startingCapital: room.startingCapital,
      targetCapital: room.targetCapital,
      maxRounds: room.maxRounds
    };

    if (typeof callback === 'function') callback(resp);
    io.to(`host:${code}`).emit('host:customScenariosUpdated', resp);
    console.log(`[Custom Scenarios] Room ${code} loaded "${room.customScenarios.name}" (${room.customScenarios.rounds.length} rounds)`);
  });

  socket.on('host:reconnect', async ({ roomCode, hostToken }, callback) => {
    if (!roomCode || !hostToken) {
      const resp = { success: false, error: 'Room code and Host Token are required.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    const code = roomCode.toUpperCase().trim();
    let room = rooms.get(code);

    if (!room) {
      const snapshot = await db.getSnapshot(code);
      if (snapshot) {
        room = restoreRoomFromSnapshot(snapshot);
      }
    }

    if (!room) {
      const resp = { success: false, error: 'Room not found.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    if (room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized: Invalid Host Token.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    room.hostSocketId = socket.id;
    room.lastActiveAt = Date.now();
    socket.join(`host:${code}`);

    const subCounts = getSubmissionCounts(room);
    const resp = {
      success: true,
      roomCode: code,
      hostToken: room.hostToken,
      status: room.status,
      mode: room.mode || 'mode_1_sprint',
      roundIndex: room.roundIndex,
      currentEvent: room.currentEvent,
      timerEnd: room.timerEnd,
      options: room.roundOptions,
      playerCount: room.players.size,
      submissionCounts: subCounts,
      lastResolutionStats: room.lastResolutionStats,
      startingCapital: room.startingCapital || 100000,
      targetCapital: room.targetCapital || 500000,
      maxRounds: room.maxRounds || (room.mode === 'mode_1_sprint' ? 10 : 15),
      customScenarios: room.customScenarios ? {
        name: room.customScenarios.name,
        description: room.customScenarios.description,
        roundsCount: room.customScenarios.rounds.length,
        startingCapital: room.startingCapital,
        targetCapital: room.targetCapital,
        maxRounds: room.maxRounds
      } : null,
      serverTime: Date.now()
    };

    if (typeof callback === 'function') callback(resp);
    socket.emit('host:reconnected', resp);
    console.log(`[Host Reconnected] Room ${code} restored state: ${room.status}, Mode: ${room.mode}`);
  });

  socket.on('host:startRound', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    startMarketIntelPhase(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:nextRound', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    advanceOrTriggerBomb(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:advanceRound', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    advanceOrTriggerBomb(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:finishGame', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    finishGame(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:startMarketIntel', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    startMarketIntelPhase(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:openRound', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    openDecisionPhase(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:triggerAdvance', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    advanceOrTriggerBomb(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:resetSession', ({ roomCode, hostToken, customScenarios }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    if (room.timerTimeoutId) {
      clearTimeout(room.timerTimeoutId);
      room.timerTimeoutId = null;
    }

    if (customScenarios) {
      const validation = validateMode1CustomScenarios(customScenarios);
      if (validation.valid) {
        room.customScenarios = validation.sanitizedData;
        room.startingCapital = validation.sanitizedData.startingCapital;
        room.targetCapital = validation.sanitizedData.targetCapital;
        room.maxRounds = validation.sanitizedData.maxRounds;
      }
    }

    room.status = 'LOBBY';
    room.roundIndex = 0;
    room.currentEvent = null;
    room.roundOptions = null;
    room.timerEnd = null;
    room.lastResolutionStats = null;
    room.lastBombRound = null;
    room.finishedAt = null;
    const startCash = room.startingCapital || 100000;
    for (const p of room.players.values()) {
      p.liquidCash = startCash;
      p.netWorth = startCash;
      p.lockedPortfolio = [];
      p.activeRecurring = [];
      p.riskScore = 0;
      p.currentChoice = null;
      p.currentAmount = null;
      p.lastOutcome = null;
      p.hiredAnalyst = false;
      p.maturedNotifications = [];
    }
    io.to(`host:${code}`).emit('host:sessionReset', {
      roomCode: code,
      playerCount: room.players.size,
      startingCapital: startCash,
      targetCapital: room.targetCapital || 500000,
      customScenarios: room.customScenarios ? {
        name: room.customScenarios.name,
        roundsCount: room.customScenarios.rounds.length,
        startingCapital: room.startingCapital,
        targetCapital: room.targetCapital,
        maxRounds: room.maxRounds
      } : null
    });
    io.to(`room:${code}`).emit('player:sessionReset', {
      roomCode: code,
      startingCapital: startCash,
      targetCapital: room.targetCapital || 500000
    });
    if (typeof callback === 'function') callback({ success: true });
  });

  // -------------------------------------------------------------
  // PLAYER HANDLERS
  // -------------------------------------------------------------

  socket.on('player:join', async ({ roomCode, playerId, nickname }, callback) => {
    if (!roomCode || !playerId) {
      const resp = { success: false, error: 'Room code and Player UUID are required.' };
      if (typeof callback === 'function') callback(resp);
      return socket.emit('player:joinError', resp);
    }

    const code = roomCode.toUpperCase().trim();
    let room = rooms.get(code);

    // Crash recovery: Attempt to restore from DB snapshot if not in memory
    if (!room) {
      const snapshot = await db.getSnapshot(code);
      if (snapshot) {
        room = restoreRoomFromSnapshot(snapshot);
      }
    }

    if (!room) {
      const resp = { success: false, error: 'Room not found. Check the code on the screen.' };
      if (typeof callback === 'function') callback(resp);
      return socket.emit('player:joinError', resp);
    }

    // Put player socket in dedicated private UUID room and room broadcast channel
    socket.join(`player:${playerId}`);
    socket.join(`room:${code}`);

    let player = room.players.get(playerId);
    const sanitizedNick = (nickname || '').trim().substring(0, 16) || 'Investor ' + playerId.substring(0, 4);
    const initialCash = room.startingCapital || 100000;

    if (player) {
      // Existing player reconnecting / refreshing
      player.socketId = socket.id;
      player.isConnected = true;
      if (nickname && nickname.trim()) {
        player.nickname = sanitizedNick;
      }
    } else {
      // New player
      player = {
        id: playerId,
        nickname: sanitizedNick,
        socketId: socket.id,
        liquidCash: initialCash,
        lockedPortfolio: [],
        riskScore: 0,
        joinedAt: Date.now(),
        currentChoice: null,
        isConnected: true,
        lastOutcome: null
      };
      room.players.set(playerId, player);
    }

    // Notify host of updated player count
    io.to(`host:${code}`).emit('host:playerCountUpdate', {
      count: room.players.size,
      recentJoin: player.nickname
    });

    const lockedTotal = (player.lockedPortfolio || []).reduce((s, i) => s + (i.amountInvested || 0), 0);
    const netWorth = player.liquidCash + lockedTotal;
    player.title = player.title || assignTitle(player);

    const responsePayload = {
      success: true,
      roomCode: code,
      serverTime: Date.now(),
      playerId: player.id,
      nickname: player.nickname,
      liquidCash: player.liquidCash,
      lockedValue: lockedTotal,
      netWorth: netWorth,
      lockedPortfolio: player.lockedPortfolio || [],
      title: player.title,
      riskScore: player.riskScore || 0,
      status: room.status,
      mode: room.mode || 'mode_1_sprint',
      startingCapital: room.startingCapital || 100000,
      targetCapital: room.targetCapital || 500000,
      scenarioName: room.customScenarios?.name || 'The Business Spotlight',
      roundIndex: room.roundIndex,
      timerEnd: room.timerEnd,
      options: room.status === 'IN_ROUND' ? room.roundOptions : null,
      currentChoice: player.currentChoice,
      lastOutcome: player.lastOutcome
    };

    if (typeof callback === 'function') callback(responsePayload);
    socket.emit('player:joined', responsePayload);
    console.log(`[Player Joined] ${player.nickname} (${player.id}) joined Room ${code}. Total: ${room.players.size}`);
  });

  socket.on('player:leaveRoom', ({ roomCode, playerId }, callback) => {
    if (roomCode) {
      const code = roomCode.toUpperCase().trim();
      socket.leave(`room:${code}`);
      const room = rooms.get(code);
      if (room && playerId) {
        const player = room.players.get(playerId);
        if (player) {
          player.isConnected = false;
        }
        io.to(`host:${code}`).emit('host:playerCountUpdate', {
          count: room.players.size,
          recentLeave: player ? player.nickname : 'Trader'
        });
      }
    }
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('player:hireAnalyst', ({ roomCode, playerId }, callback) => {
    if (!roomCode || !playerId) {
      const resp = { success: false, error: 'Room code and Player ID are required' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room || room.status !== 'IN_ROUND') {
      const resp = { success: false, error: 'Analyst is only available during active decision window' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // 1. Check timer expiration
    if (room.timerEnd && Date.now() > room.timerEnd + 500) {
      const resp = { success: false, error: 'Trading window has closed' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    const player = room.players.get(playerId);
    if (!player) {
      const resp = { success: false, error: 'Player not registered in this room' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // 2. Reject if player already submitted choice
    if (player.currentChoice !== null) {
      const resp = { success: false, error: 'Cannot hire analyst after submitting investment choice' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // 3. Check if already hired this round
    const roundsList = (room.customScenarios && room.customScenarios.rounds) ? room.customScenarios.rounds : mode1Rounds;
    const roundScenario = roundsList.find(r => r.round === room.roundIndex) || roundsList[(room.roundIndex - 1) % roundsList.length] || roundsList[0];
    const business = roundScenario?.business || {};
    const analystFee = business.analystFee !== undefined ? business.analystFee : 5000;
    const analystTip = business.analystTip || business.analystMemo?.text || 'Insider tip: High demand expected this round.';

    if (player.hiredAnalyst) {
      const resp = {
        success: true,
        alreadyHired: true,
        analystFee,
        liquidCash: player.liquidCash,
        analystMemo: {
          reliable: true,
          text: analystTip,
          truth: analystTip
        }
      };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // 4. Reject if liquidCash < analystFee
    if (player.liquidCash < analystFee) {
      const resp = { success: false, error: `Insufficient liquid cash ($${analystFee.toLocaleString()} required)` };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // Deduct fee & register purchase
    player.liquidCash -= analystFee;
    player.netWorth = player.liquidCash;
    player.hiredAnalyst = true;

    // Count room-wide analyst hires
    let hiredCount = 0;
    for (const p of room.players.values()) {
      if (p.hiredAnalyst) hiredCount++;
    }

    io.to(`host:${code}`).emit('host:analystHiredUpdate', {
      hiredCount,
      totalPlayers: room.players.size
    });

    const successResp = {
      success: true,
      analystFee,
      liquidCash: player.liquidCash,
      analystMemo: {
        reliable: true,
        text: analystTip,
        truth: analystTip
      }
    };

    if (typeof callback === 'function') callback(successResp);
    io.to(`player:${playerId}`).emit('player:analystUnlocked', successResp);
    console.log(`[Analyst Hired] ${player.nickname} hired analyst for $${analystFee} in Room ${code}. New Cash: $${player.liquidCash}`);
  });

  socket.on('player:submitChoice', ({ roomCode, playerId, optionId, amount, allocationPct }, callback) => {
    if (!roomCode || !playerId) {
      const resp = { success: false, error: 'Invalid submission payload' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room || room.status !== 'IN_ROUND') {
      const resp = { success: false, error: 'No active round accepting investments' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // Check timer expiration with a small 500ms network grace
    if (room.timerEnd && Date.now() > room.timerEnd + 500) {
      const resp = { success: false, error: 'Market window has closed' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    const player = room.players.get(playerId);
    if (!player) {
      const resp = { success: false, error: 'Player not registered in this room' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // IDEMPOTENCY / NO DOUBLE SUBMISSIONS: Only first valid submission per round is processed
    if (player.currentChoice !== null) {
      const resp = { success: false, error: 'Investment choice already locked for this round' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    // Calculate allocated amount and percentage
    let parsedAmount = player.liquidCash;
    let parsedPct = 100;

    if (allocationPct !== undefined && allocationPct !== null) {
      const pctNum = Number(allocationPct);
      if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
        const resp = { success: false, error: 'Invalid allocation percentage (must be 0–100%)' };
        if (typeof callback === 'function') callback(resp);
        return;
      }
      parsedPct = Math.round(pctNum);
      parsedAmount = Math.round(player.liquidCash * (parsedPct / 100));
    } else if (amount !== undefined && amount !== null) {
      const num = Number(amount);
      if (isNaN(num) || num < 0 || num > player.liquidCash) {
        const resp = { success: false, error: 'Insufficient liquid cash for allocation' };
        if (typeof callback === 'function') callback(resp);
        return;
      }
      parsedAmount = Math.round(num);
      parsedPct = player.liquidCash > 0 ? Math.round((parsedAmount / player.liquidCash) * 100) : 0;
    }

    const selectedOptionId = optionId || (room.mode === 'mode_1_sprint' ? 'opportunity' : 'opt_safe');
    player.currentChoice = selectedOptionId;
    player.currentAmount = parsedAmount;
    player.currentAllocationPct = parsedPct;

    const subCounts = getSubmissionCounts(room);

    // Calculate Live Crowd Sentiment Breakdown
    let safeCount = 0;
    let medCount = 0;
    let highCount = 0;
    let totalLockedCapital = 0;

    const currentOptions = room.roundOptions || [];
    const chosenOptDef = currentOptions.find(o => o.id === selectedOptionId) || { name: selectedOptionId };

    for (const p of room.players.values()) {
      if (p.currentChoice) {
        totalLockedCapital += (p.currentAmount || 0);
        const opt = currentOptions.find(o => o.id === p.currentChoice);
        const tier = (opt?.riskTier || p.currentChoice || '').toLowerCase();
        if (tier.includes('high') || tier.includes('rocket')) highCount++;
        else if (tier.includes('med') || tier.includes('balanced')) medCount++;
        else safeCount++;
      }
    }

    const totalSubmitted = safeCount + medCount + highCount;
    const denomSub = totalSubmitted > 0 ? totalSubmitted : 1;
    const sentiment = {
      safePct: Math.round((safeCount / denomSub) * 100),
      medPct: Math.round((medCount / denomSub) * 100),
      highPct: Math.round((highCount / denomSub) * 100),
      safeCount,
      medCount,
      highCount,
      totalSubmitted,
      totalLockedCapital
    };

    // Build Live Standings with Wagers & Streaks
    const liveStandings = Array.from(room.players.values())
      .sort((a, b) => (b.liquidCash || 0) - (a.liquidCash || 0))
      .map((p, idx) => ({
        rank: idx + 1,
        nickname: p.nickname,
        liquidCash: p.liquidCash,
        wagerPct: p.currentAllocationPct !== undefined ? p.currentAllocationPct : null,
        wagerAmount: p.currentAmount !== undefined ? p.currentAmount : null,
        currentChoice: p.currentChoice,
        deltaCash: p.lastOutcome?.deltaCash || 0
      }));

    // Notify Host of live submission progress, sentiment & drama event
    const dramaHeadline = parsedPct === 100
      ? `📢 ${player.nickname} went ALL-IN (100% — $${parsedAmount.toLocaleString()}) on ${chosenOptDef.name}!`
      : parsedPct === 0
      ? `🛡️ ${player.nickname} PASSED and kept 100% in safe bank reserves.`
      : `⚡ ${player.nickname} locked in ${parsedPct}% ($${parsedAmount.toLocaleString()}) on ${chosenOptDef.name}.`;

    io.to(`host:${code}`).emit('host:submissionUpdate', {
      submittedCount: subCounts.submitted,
      totalPlayers: subCounts.total,
      sentiment,
      standings: liveStandings,
      dramaEvent: {
        text: dramaHeadline,
        timestamp: Date.now()
      }
    });

    const successResp = {
      success: true,
      optionId: selectedOptionId,
      amount: parsedAmount,
      allocationPct: parsedPct,
      submittedCount: subCounts.submitted,
      totalPlayers: subCounts.total
    };

    if (typeof callback === 'function') callback(successResp);
    io.to(`player:${playerId}`).emit('player:choiceConfirmed', successResp);

    // EARLY TIMER CUTOFF: If all players have locked in their choices, cut the timer and resolve immediately
    const targetCount = subCounts.activeConnected > 0 ? subCounts.activeConnected : subCounts.total;
    if (subCounts.submitted >= targetCount && subCounts.submitted > 0) {
      if (room.timerTimeoutId) {
        clearTimeout(room.timerTimeoutId);
        room.timerTimeoutId = null;
      }
      console.log(`[Fast Resolution] All ${subCounts.submitted}/${targetCount} players locked in choices for Room ${code} Round ${room.roundIndex}. Cutting timer & resolving immediately.`);
      setTimeout(() => {
        if (room.status === 'IN_ROUND') {
          resolveRound(code);
        }
      }, 300);
    }
  });

  // -------------------------------------------------------------
  // LIQUIDITY BOMB (HOT POTATO) MINI-GAME SOCKET HANDLERS
  // -------------------------------------------------------------

  socket.on('player:passBomb', ({ roomCode, playerId }) => {
    if (!roomCode || !playerId) return;
    const code = roomCode.toUpperCase().trim();
    handleBombPass(code, playerId);
  });

  socket.on('player:panicTap', ({ roomCode, playerId }) => {
    if (!roomCode || !playerId) return;
    const code = roomCode.toUpperCase().trim();
    handlePanicTap(code, playerId);
  });

  socket.on('host:startBombMinigame', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    startLiquidityBomb(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('host:continueAfterBomb', ({ roomCode, hostToken }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    const maxRounds = room.mode === 'mode_1_sprint' ? (room.maxRounds || room.customScenarios?.rounds?.length || 10) : 15;
    if (room.roundIndex >= maxRounds) {
      finishGame(code);
    } else {
      startMarketIntelPhase(code);
    }
    if (typeof callback === 'function') callback({ success: true });
  });

  // -------------------------------------------------------------
  // HOST EARLY GAME END & SCENARIO PACK SELECTOR
  // -------------------------------------------------------------

  socket.on('host:selectScenarioSet', ({ roomCode, hostToken, setIndex }, callback) => {
    if (!roomCode || !hostToken) {
      const resp = { success: false, error: 'Missing roomCode or hostToken.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    const setNum = Math.max(1, Math.min(5, Number(setIndex) || 1));
    const pack = getScenarioPack(setNum);
    room.customScenarios = pack;
    room.selectedSet = setNum;
    room.maxRounds = 10;

    const resp = {
      success: true,
      selectedSet: setNum,
      scenarioName: pack.name,
      description: pack.description,
      roundsCount: 10,
      startingCapital: room.startingCapital,
      targetCapital: room.targetCapital
    };

    if (typeof callback === 'function') callback(resp);
    io.to(`host:${code}`).emit('host:setUpdated', resp);
    console.log(`[Set Selected] Room ${code} selected ${pack.name} (Set ${setNum})`);
  });

  socket.on('host:endGameEarly', ({ roomCode, hostToken }, callback) => {
    if (!roomCode || !hostToken) {
      const resp = { success: false, error: 'Missing roomCode or hostToken.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.hostToken !== hostToken) {
      const resp = { success: false, error: 'Unauthorized or room not found.' };
      if (typeof callback === 'function') callback(resp);
      return;
    }

    console.log(`[Host Early End] Host terminated Room ${code} early at round ${room.roundIndex}.`);
    room.isEarlyEnd = true;
    finishGame(code);
    if (typeof callback === 'function') callback({ success: true });
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    // Check if a host disconnected
    for (const [code, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = null;
        room.lastActiveAt = Date.now();
        console.log(`[Host Disconnected] Room ${code} - Host socket dropped. Session preserved for reconnect.`);
        break;
      }
      // Check if a player disconnected
      for (const player of room.players.values()) {
        if (player.socketId === socket.id) {
          player.isConnected = false;
          break;
        }
      }
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
    console.error(`💡 Tip: Run 'npm run stop' or kill the existing process using port ${PORT} before starting.\n`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Risk Capital Server listening on port ${PORT}`);
  console.log(`📺 Host Display:   http://localhost:${PORT}/host.html`);
  console.log(`📱 Player View:    http://localhost:${PORT}/player.html`);
  console.log(`====================================================`);
});
