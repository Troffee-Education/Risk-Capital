const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '..', 'deepseek_markdown_20260924_18964d.md');
const md = fs.readFileSync(mdPath, 'utf8');

const items = [];
const sections = md.split(/###\s+/);

for (let i = 1; i < sections.length; i++) {
  const block = sections[i];
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const titleLine = lines[0]; // e.g. '1.1 Harvest Spring Studio'
  const title = titleLine.replace(/^[\d.]+\s*/, '').trim();

  let industry = '';
  let riskTier = '';
  let win = 10;
  let fail = -5;
  let description = '';
  let imageUrl = '';

  for (const line of lines) {
    if (line.startsWith('- **Industry:**')) {
      industry = line.replace('- **Industry:**', '').trim();
    } else if (line.startsWith('- **Risk Tier:**')) {
      riskTier = line.replace('- **Risk Tier:**', '').trim();
    } else if (line.startsWith('- **Return:**')) {
      const retStr = line.replace('- **Return:**', '').trim();
      const winMatch = retStr.match(/Win\s*\*\*?\+?(\d+)%\*\*?/i);
      const loseMatch = retStr.match(/Lose\s*\*\*?-?(\d+)%\*\*?/i);
      const posMatch = retStr.match(/\*\*?\+?(\d+)%\*\*?/);

      if (winMatch && loseMatch) {
        win = parseInt(winMatch[1], 10);
        fail = -Math.abs(parseInt(loseMatch[1], 10));
      } else if (posMatch) {
        win = parseInt(posMatch[1], 10);
        fail = 0;
      }
    } else if (line.startsWith('- **Opportunity Info:**')) {
      description = line.replace('- **Opportunity Info:**', '').replace(/\*\*/g, '').trim();
    } else if (line.startsWith('- **Image URL:**')) {
      const urlMatch = line.match(/`([^`]+)`/);
      if (urlMatch) imageUrl = urlMatch[1];
    }
  }

  let riskScore = 2;
  let cleanTier = 'Safe';
  if (riskTier.toLowerCase().includes('high')) {
    cleanTier = 'High Risk';
    riskScore = 8;
  } else if (riskTier.toLowerCase().includes('med')) {
    cleanTier = 'Medium Risk';
    riskScore = 5;
    if (fail === 0) fail = -Math.round(win * 0.4);
  } else {
    cleanTier = 'Safe';
    riskScore = 2;
    if (fail === 0) fail = -Math.round(win * 0.3);
  }

  const id = 'opp_' + title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  items.push({
    id,
    name: title,
    industry: industry || 'Business',
    riskTier: cleanTier,
    riskScore,
    win,
    fail,
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600',
    description
  });
}

console.log('Total Parsed Opportunities:', items.length);

const safeList = items.filter(o => o.riskTier === 'Safe');
const medList = items.filter(o => o.riskTier === 'Medium Risk');
const highList = items.filter(o => o.riskTier === 'High Risk');

console.log(`Distribution: Safe (${safeList.length}), Medium (${medList.length}), High Risk (${highList.length})`);

const rounds = [];
const maxRounds = 10;
for (let r = 1; r <= maxRounds; r++) {
  const safeItem = safeList[(r - 1) % safeList.length];
  const medItem = medList[(r - 1) % medList.length];
  const highItem = highList[(r - 1) % highList.length];

  rounds.push({
    round: r,
    options: [
      { ...safeItem, id: 'r' + r + '_safe' },
      { ...medItem, id: 'r' + r + '_balanced' },
      { ...highItem, id: 'r' + r + '_high' }
    ]
  });
}

const finalConfig = {
  mode: 'mode_1_sprint',
  name: 'Quick Cash — Race to the Moon',
  description: 'Fast-paced financial sprint. 80-second rounds. 3 Business deals per round. First trader to reach $500,000 wins!',
  startingCapital: 100000,
  targetCapital: 500000,
  maxRounds: 10,
  timerSeconds: 80,
  rounds: rounds,
  allOpportunities: items
};

const outPath = path.join(__dirname, '..', 'data', 'mode1_scenarios.json');
fs.writeFileSync(outPath, JSON.stringify(finalConfig, null, 2), 'utf8');
console.log('Successfully written to data/mode1_scenarios.json!');
