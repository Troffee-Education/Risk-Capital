const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const files = [
  'public/icons.js',
  'public/sound-effects.js',
  'public/confetti.js'
];

console.log('====================================================');
console.log('📊 CLIENT ADDED ASSET PAYLOAD BREAKDOWN');
console.log('====================================================');

let totalRaw = 0;
let totalGzip = 0;

for (const f of files) {
  const content = fs.readFileSync(f);
  const rawSize = content.length;
  const gzipSize = zlib.gzipSync(content).length;
  totalRaw += rawSize;
  totalGzip += gzipSize;
  console.log(`• ${f.padEnd(25)}: ${(rawSize / 1024).toFixed(2)} KB (gzipped: ${(gzipSize / 1024).toFixed(2)} KB)`);
}

console.log('----------------------------------------------------');
console.log(`TOTAL ADDED PAYLOAD (Uncompressed): ${(totalRaw / 1024).toFixed(2)} KB`);
console.log(`TOTAL ADDED PAYLOAD (Gzipped):      ${(totalGzip / 1024).toFixed(2)} KB`);
console.log('====================================================');
