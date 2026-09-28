const { spawn } = require('child_process');

const PORT = 3098;
const env = {
  ...process.env,
  PORT: String(PORT),
  TEST_FAST_TIMERS: 'true',
  INTEL_DURATION: '100',
  DECISION_DURATION: '300',
  SERVER_URL: `http://localhost:${PORT}`
};

const path = require('path');
const rootDir = path.join(__dirname, '..');

console.log(`Starting isolated test server on port ${PORT}...`);
const serverProc = spawn('node', ['server.js'], {
  cwd: rootDir,
  env,
  stdio: 'pipe'
});

serverProc.stderr.on('data', data => {
  const str = data.toString();
  if (!str.includes('PostgreSQL connection not available')) {
    console.error(`[Server Err] ${str}`);
  }
});

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n======================================================`);
    console.log(`▶ RUNNING ${scriptName}`);
    console.log(`======================================================`);
    const p = spawn('node', [scriptName], {
      cwd: __dirname,
      env,
      stdio: 'inherit'
    });
    p.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} failed with exit code ${code}`));
    });
  });
}

setTimeout(async () => {
  try {
    await runScript('test-early-timer-cutoff.js');
    await runScript('test-slider-allocation.js');
    await runScript('test-mode1-sprint.js');
    await runScript('test-custom-scenario-upload.js');
    await runScript('test-presentation-layer.js');
    await runScript('test-player-portfolio.js');
    await runScript('test-engagement-features.js');
    await runScript('test-15round-engine.js');
    console.log(`\n🎉 ALL TEST SUITES PASSED FLAWLESSLY!`);
    serverProc.kill();
    process.exit(0);
  } catch (err) {
    console.error(`❌ Suite run error:`, err.message);
    serverProc.kill();
    process.exit(1);
  }
}, 2000);
