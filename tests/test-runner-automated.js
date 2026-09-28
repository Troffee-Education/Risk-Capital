const { spawn } = require('child_process');
const path = require('path');

const PORT = 3099;
const env = {
  ...process.env,
  PORT: String(PORT),
  INTEL_DURATION: '300',
  DECISION_DURATION: '600',
  SERVER_URL: `http://localhost:${PORT}`
};

console.log(`Starting isolated test server on port ${PORT}...`);
const serverProc = spawn('node', ['server.js'], {
  cwd: __dirname,
  env,
  stdio: 'pipe'
});

serverProc.stdout.on('data', data => {
  // console.log(`[Server] ${data}`);
});

serverProc.stderr.on('data', data => {
  console.error(`[Server Err] ${data}`);
});

setTimeout(() => {
  console.log('Spawning 15-round test runner...');
  const testProc = spawn('node', ['test-15round-engine.js'], {
    cwd: __dirname,
    env,
    stdio: 'inherit'
  });

  testProc.on('exit', (code) => {
    console.log(`Test exited with code: ${code}`);
    serverProc.kill();
    process.exit(code);
  });
}, 2000);
