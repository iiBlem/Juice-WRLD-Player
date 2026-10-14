const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');

(async () => {
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.electron.json'], { stdio: 'inherit' });
  const { createServer } = await import('vite');
  const server = await createServer();
  await server.listen();
  server.printUrls();
  const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = spawn(require('electron'), [path.resolve(__dirname, '..'), ...process.argv.slice(2)], { env, stdio: 'inherit' });
  let stopping = false;
  async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    electron.kill();
    await server.close();
    process.exit(code);
  }
  electron.on('error', error => {console.error(error); void stop(1);});
  electron.on('exit', code => void stop(code ?? 1));
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  // shortcut: main/preload changes require restarting dev; add watching when that slows development.
})().catch(error => {console.error(error); process.exit(1);});
