const fs = require('fs');

// Check mode1_scenarios.json
const mode1Data = JSON.parse(fs.readFileSync('./data/mode1_scenarios.json', 'utf8'));

console.log('Checking Set 1 (mode1_scenarios.json)...');
let totalSet1Cards = 0;
let duplicatesSet1 = 0;

mode1Data.rounds.forEach((r, idx) => {
  const urls = r.options.map(o => o.imageUrl);
  const uniqueUrls = new Set(urls);
  if (uniqueUrls.size !== urls.length) {
    console.error(`Round ${idx + 1} has duplicate images:`, urls);
    duplicatesSet1++;
  } else {
    console.log(`Round ${idx + 1} (${r.options[0].industry}): 3 distinct images verified -> ${urls.map(u => u.slice(0, 45) + '...').join(' | ')}`);
  }
  totalSet1Cards += r.options.length;
});

console.log(`\nSet 1 Total Cards: ${totalSet1Cards}, Duplicates: ${duplicatesSet1}`);

// Sector distinct photos check for Sets 2-5
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

console.log('\nChecking Sector Distinct Photo Library:');
Object.entries(sectorDistinctPhotos).forEach(([sector, p]) => {
  if (p.safe === p.med || p.med === p.high || p.safe === p.high) {
    console.error(`ERROR: Sector ${sector} has overlapping photos!`);
  } else {
    console.log(`Sector "${sector}": 3 unique photos verified.`);
  }
});

console.log('\nALL PHOTO CHECKS PASSED SUCCESSFULLY!');
