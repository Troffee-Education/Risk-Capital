// Sound Effects Engine for Risk Capital (Kenney.nl CC0 Audio Design via Web Audio API)
// Provides instant, zero-latency, zero-404, offline-ready sound effects without heavy asset payloads.
window.SoundManager = (function() {
  let audioCtx = null;
  let isUnlocked = false;
  let isMuted = sessionStorage.getItem('rc_muted') === 'true';

  // Initialize Web Audio Context
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    return audioCtx;
  }

  // iOS Safari & Mobile Audio Unlock Mechanism
  // Mobile browsers require an explicit synchronous user gesture to resume AudioContext
  function unlockAudioContext() {
    if (isUnlocked) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        isUnlocked = true;
      }).catch(() => {});
    } else if (ctx.state === 'running') {
      isUnlocked = true;
    }

    // Play a 1-sample silent buffer to permanently unlock iOS audio hardware pipeline
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      isUnlocked = true;
    } catch (e) {}
  }

  // Attach global unlock listeners on page load
  const unlockEvents = ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown', 'click'];
  function setupUnlockListeners() {
    function onFirstGesture() {
      unlockAudioContext();
      unlockEvents.forEach(evt => {
        document.removeEventListener(evt, onFirstGesture, true);
      });
    }
    unlockEvents.forEach(evt => {
      document.addEventListener(evt, onFirstGesture, { capture: true, passive: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUnlockListeners);
  } else {
    setupUnlockListeners();
  }

  // Mute Management
  function setMuted(muted) {
    isMuted = !!muted;
    sessionStorage.setItem('rc_muted', isMuted ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('rc:muteChanged', { detail: { isMuted } }));
  }

  function toggleMute() {
    setMuted(!isMuted);
    return isMuted;
  }

  function canPlay() {
    if (isMuted) return false;
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return true;
  }

  // -------------------------------------------------------------
  // SOUND GENERATORS (Kenney.nl UI / Interface Sound Profiles)
  // -------------------------------------------------------------

  // 1. Button Tap (Kenney UI click1: 950Hz crisp transient drop)
  function playButtonTap() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.035);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  // 2. Countdown Tick (Kenney UI woodblock: 900Hz resonant click, last 5s only)
  function playCountdownTick(remainingSec) {
    if (remainingSec !== undefined && remainingSec > 5) return; // Strict: last 5 seconds only
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const baseFreq = (remainingSec !== undefined && remainingSec <= 2) ? 1100 : 880;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.04);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  // 3. Breaking News Alert (Kenney UI fanfare / stinger: G4 -> C5 -> E5 -> G5)
  function playNewsAlert() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const notes = [392.00, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
    const noteDuration = 0.09;

    notes.forEach((freq, idx) => {
      const startTime = now + (idx * noteDuration);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + noteDuration + 0.08);
    });
  }

  // 4. Round Reveal Sting (Kenney UI metallic switch chord)
  function playRoundReveal() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const chord = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    });
  }

  // 5. Cash-Up Chime (Kenney UI coin sparkle: C6 -> E6 -> G6 -> C7 shimmer)
  function playCashUp() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const notes = [1046.50, 1318.51, 1567.98, 2093.00]; // C6, E6, G6, C7
    notes.forEach((freq, idx) => {
      const startTime = now + (idx * 0.06);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }

  // 6. Cash-Down Buzz (Kenney UI error buzz: detuned low sawtooth with lowpass sweep)
  function playCashDown() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const freqs = [130, 138]; // Detuned low buzz
    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(90, now + 0.3);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.3);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  // 7. Accelerating Bomb Tick (tan-tan-tan fast tempo rhythm)
  function playBombTick(tempoMultiplier) {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const mult = Math.min(3.5, Math.max(1.0, tempoMultiplier || 1.0));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    const baseFreq = 650 + (mult * 180);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + (0.04 / mult));

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (0.04 / mult));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + (0.04 / mult));
  }

  // 8. Bomb Pass Whoosh (Laser toss sound)
  function playBombPass() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // 9. Bomb Explosion Boom (Deep low-frequency rumble + noise shock)
  function playBombExplode() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Sub-bass sine drop
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);

    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);

    // Filtered noise crackle
    try {
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.4);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.4);
    } catch (e) {}
  }

  // 10. Panic Penalty Buzz (-$500 misclick fee)
  function playPanicPenalty() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(180, now + 0.06);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // 11. Cash Frenzy Coin Clink (Crisp 1200Hz-1800Hz dual chime)
  function playFrenzyCoin() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.05);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // 12. Golden Bull / Coin Sparkle
  function playFrenzyGolden() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    [1046.5, 1318.5, 1567.98, 2093.0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.03);
      gain.gain.setValueAtTime(0.25, now + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.03);
      osc.stop(now + i * 0.03 + 0.12);
    });
  }

  // 13. Toxic Asset Shock / Zap
  function playFrenzyToxic() {
    if (!canPlay()) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  return {
    unlockAudioContext,
    toggleMute,
    setMuted,
    isMuted: () => isMuted,
    playButtonTap,
    playCountdownTick,
    playNewsAlert,
    playRoundReveal,
    playCashUp,
    playCashDown,
    playBombTick,
    playBombPass,
    playBombExplode,
    playPanicPenalty,
    playFrenzyCoin,
    playFrenzyGolden,
    playFrenzyToxic
  };
})();
