import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

/**
 * Renders the tray and application icons.
 *
 * The mark is a rounded warning triangle with an exclamation cut out of it, so
 * the silhouette alone reads as "alert" even where the colour is unavailable
 * (monochrome mode, low-colour indicator themes). State is carried by fill
 * colour: red on alert, green when clear, amber when the status is unknown.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'icons');

/**
 * One colour per tray state. `unknown` is deliberately grey rather than amber:
 * amber now means a yellow-level alert, and "no data" must not look like a
 * live threat.
 */
const STATES = {
  alert: '#e5383b',
  warn: '#f59f00',
  clear: '#2f9e44',
  unknown: '#868e96',
  mono: '#9aa0a6',
};

const TRAY_SIZES = [16, 18, 20, 22, 24, 32, 48, 64];
const APP_SIZES = [256, 512];
const SUPERSAMPLE = 4;

for (const [state, color] of Object.entries(STATES)) {
  for (const size of TRAY_SIZES) {
    write(join(OUT, 'tray', `${state}-${size}.png`), render(size, color));
  }
}

for (const size of APP_SIZES) {
  write(join(OUT, 'app', `icon-${size}.png`), render(size, STATES.alert, { padding: 0.09 }));
}
// electron-builder picks this up as the application icon.
write(join(OUT, 'icon.png'), render(512, STATES.alert, { padding: 0.09 }));

console.log('Icons written to assets/icons');

function write(file, buffer) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);
}

/** Renders one icon by supersampling the shape and box-filtering it down. */
function render(size, hex, { padding = 0.075 } = {}) {
  const fill = hexToRgb(hex);
  const hi = size * SUPERSAMPLE;
  const coverage = new Float32Array(size * size);
  const punch = new Float32Array(size * size);

  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      // Sample at pixel centres in a 0..1 unit square.
      const u = (x + 0.5) / hi;
      const v = (y + 0.5) / hi;
      const index = Math.floor(y / SUPERSAMPLE) * size + Math.floor(x / SUPERSAMPLE);

      if (inTriangle(u, v, padding)) coverage[index] += 1;
      if (inExclamation(u, v)) punch[index] += 1;
    }
  }

  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const shape = coverage[i] / samples;
    const hole = punch[i] / samples;
    // The exclamation is punched out of the triangle, so the desktop wallpaper
    // shows through it and the mark stays legible on any background.
    const alpha = Math.max(0, shape - hole);
    rgba[i * 4] = fill.r;
    rgba[i * 4 + 1] = fill.g;
    rgba[i * 4 + 2] = fill.b;
    rgba[i * 4 + 3] = Math.round(alpha * 255);
  }
  return encodePng(size, size, rgba);
}

/** A triangle with corners rounded by testing distance to an inset triangle. */
function inTriangle(u, v, padding) {
  const radius = 0.1;
  const a = { x: 0.5, y: padding + radius * 0.55 };
  const b = { x: 1 - padding - radius * 0.35, y: 1 - padding - radius * 0.3 };
  const c = { x: padding + radius * 0.35, y: 1 - padding - radius * 0.3 };
  return distanceToTriangle(u, v, a, b, c) <= radius * 0.42;
}

/** Vertical bar plus a dot, centred in the lower two thirds of the triangle. */
function inExclamation(u, v) {
  const cx = 0.5;
  const halfWidth = 0.062;
  const barTop = 0.40;
  const barBottom = 0.655;
  const dotCenter = 0.765;

  if (Math.abs(u - cx) <= halfWidth && v >= barTop && v <= barBottom) return true;
  return Math.hypot(u - cx, v - dotCenter) <= halfWidth * 1.08;
}

/** Signed-ish distance: 0 inside the triangle, otherwise distance to its edge. */
function distanceToTriangle(px, py, a, b, c) {
  if (sign(px, py, a, b) >= 0 && sign(px, py, b, c) >= 0 && sign(px, py, c, a) >= 0) return 0;
  return Math.min(
    distanceToSegment(px, py, a, b),
    distanceToSegment(px, py, b, c),
    distanceToSegment(px, py, c, a),
  );
}

function sign(px, py, p, q) {
  return (q.x - p.x) * (py - p.y) - (q.y - p.y) * (px - p.x);
}

function distanceToSegment(px, py, p, q) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - p.x) * dx + (py - p.y) * dy) / lengthSq));
  return Math.hypot(px - (p.x + t * dx), py - (p.y + t * dy));
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}
