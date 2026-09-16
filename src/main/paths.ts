import { app } from 'electron';
import { join } from 'node:path';

/**
 * Assets live outside `dist`, so their location differs between a dev run
 * (repository root) and a packaged app (inside `resources`, see the
 * `extraResources` entry in electron-builder.yml).
 */
export function assetPath(...segments: string[]): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'assets') : join(__dirname, '..', '..', 'assets');
  return join(base, ...segments);
}

/** The built renderer page, or the Vite dev server when running `npm run dev`. */
export function rendererEntry(): { url: string } | { file: string } {
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) return { url: devServer };
  return { file: join(__dirname, '..', 'renderer', 'index.html') };
}

export function preloadPath(): string {
  return join(__dirname, '..', 'preload', 'index.js');
}
