import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import electron from 'electron';

/**
 * Development runner.
 *
 * Starts the Vite dev server for the settings window, compiles the main and
 * preload processes in watch mode, and restarts Electron whenever the compiled
 * main output changes. The renderer hot-reloads through Vite without a restart.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESTART_DEBOUNCE_MS = 250;

const server = await createServer({ configFile: resolve(ROOT, 'vite.config.ts') });
await server.listen();
const url = server.resolvedUrls?.local?.[0];
if (!url) throw new Error('Vite dev server did not report a local URL');
console.log(`[dev] renderer at ${url}`);

// One blocking compile first, so Electron has something to run.
await run('npx', ['tsc', '-p', 'tsconfig.main.json']);
const tsc = spawn('npx', ['tsc', '-p', 'tsconfig.main.json', '--watch', '--preserveWatchOutput'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

let child = null;
let restartTimer = null;
let shuttingDown = false;

startElectron();

watch(resolve(ROOT, 'dist', 'main'), { recursive: true }, () => {
  // tsc writes many files per rebuild; collapse them into one restart.
  clearTimeout(restartTimer);
  restartTimer = setTimeout(startElectron, RESTART_DEBOUNCE_MS);
});

function startElectron() {
  if (child) {
    child.removeAllListeners('exit');
    child.kill();
  }
  console.log('[dev] starting electron');
  child = spawn(electron, [ROOT], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url, NODE_ENV: 'development' },
  });
  // Quitting the app from its tray menu should end the whole dev session.
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  child?.kill();
  tsc.kill();
  await server.close().catch(() => {});
  process.exit(code);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    proc.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}
