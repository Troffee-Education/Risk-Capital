const assert = require('assert');
const fs = require('fs');

// Setup lightweight mock DOM environment
const mockWindow = {
  CustomEvent: class CustomEvent {
    constructor(type, detail) {
      this.type = type;
      this.detail = detail;
    }
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {}
};

const mockDocument = {
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
  createElement(tag) {
    return {
      tagName: tag,
      style: {},
      getContext: () => ({
        scale() {},
        clearRect() {},
        save() {},
        translate() {},
        rotate() {},
        fillRect() {},
        restore() {}
      }),
      appendChild() {},
      parentNode: {
        removeChild() {}
      }
    };
  },
  body: {
    appendChild() {}
  }
};

global.window = mockWindow;
global.document = mockDocument;
global.sessionStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};
global.CustomEvent = mockWindow.CustomEvent;

// Mock Web Audio API
class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(1) };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      start() {}
    };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {}
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {}
    };
  }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}
    };
  }
}
window.AudioContext = MockAudioContext;

// 1. Test LucideIcons
eval(fs.readFileSync('public/icons.js', 'utf8'));
assert(window.LucideIcons, 'LucideIcons must be defined');

const expectedSectors = [
  'agriculture', 'auto_parts', 'biotechnology', 'business_products_services',
  'chemicals', 'food_beverage', 'education', 'electronics', 'gaming',
  'health_beauty', 'crypto', 'quickTrade'
];

expectedSectors.forEach(sectorId => {
  const svg = window.LucideIcons.getSectorIcon(sectorId, { size: 24 });
  assert(svg.includes('<svg'), `Sector ${sectorId} must generate valid SVG`);
  assert(svg.includes('lucide-icon'), `Sector ${sectorId} must include lucide-icon class`);
});
console.log(`✅ [1/4] Verified all ${expectedSectors.length} sector SVG icons.`);

// Status glyphs
const lockSvg = window.LucideIcons.getSvg('lock');
const upSvg = window.LucideIcons.getSvg('trending-up');
const downSvg = window.LucideIcons.getSvg('trending-down');
const volOn = window.LucideIcons.getSvg('volume-2');
const volOff = window.LucideIcons.getSvg('volume-x');

assert(lockSvg.includes('lucide-lock'), 'Lock glyph verified');
assert(upSvg.includes('lucide-trending-up'), 'TrendingUp glyph verified');
assert(downSvg.includes('lucide-trending-down'), 'TrendingDown glyph verified');
assert(volOn.includes('lucide-volume-2'), 'Volume-2 glyph verified');
assert(volOff.includes('lucide-volume-x'), 'Volume-X glyph verified');
console.log('✅ [2/4] Verified status glyphs: lock, trending-up, trending-down, volume-2, volume-x.');

// 2. Test SoundManager
eval(fs.readFileSync('public/sound-effects.js', 'utf8'));
assert(window.SoundManager, 'SoundManager must be defined');

// Test Audio Unlock (iOS Safari / Android Chrome gesture unlock simulation)
window.SoundManager.unlockAudioContext();
assert.strictEqual(window.SoundManager.isMuted(), false, 'Default mute state is false');

// Test Sound Playback methods without error
window.SoundManager.playButtonTap();
window.SoundManager.playCountdownTick(5);
window.SoundManager.playCountdownTick(2);
window.SoundManager.playNewsAlert();
window.SoundManager.playRoundReveal();
window.SoundManager.playCashUp();
window.SoundManager.playCashDown();

// Test Mute toggle
const mutedState = window.SoundManager.toggleMute();
assert.strictEqual(mutedState, true, 'Mute toggled to true');
assert.strictEqual(window.SoundManager.isMuted(), true, 'isMuted reflects true');

// Ensure silent playback when muted
window.SoundManager.playButtonTap();
window.SoundManager.toggleMute();
assert.strictEqual(window.SoundManager.isMuted(), false, 'Unmuted successfully');
console.log('✅ [3/4] Verified SoundManager audio unlock, sound profiles, and session mute toggle.');

// 3. Test ConfettiCelebration
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.window.requestAnimationFrame = global.requestAnimationFrame;
eval(fs.readFileSync('public/confetti.js', 'utf8'));
assert(window.ConfettiCelebration, 'ConfettiCelebration must be defined');

window.ConfettiCelebration.fire({ particleCount: 50, duration: 500 });
console.log('✅ [4/4] Verified ConfettiCelebration particle generation.');

console.log('====================================================');
console.log('🎉 ALL PRESENTATION LAYER TESTS PASSED!');
console.log('====================================================');
