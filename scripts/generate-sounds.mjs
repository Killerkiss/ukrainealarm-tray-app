import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Synthesises the two notification sounds as 16-bit mono WAV files.
 *
 * Generating them keeps the repository free of opaque binary audio and makes
 * the sounds easy to tune: `alert` is a two-tone siren sweep, `clear` is a
 * short rising two-note chime.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'sounds');
const RATE = 44_100;

write('alert.wav', siren());
write('clear.wav', chime());
console.log('Sounds written to assets/sounds');

function write(name, samples) {
  const file = join(OUT, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodeWav(samples));
}

/** Three cycles of a rising/falling two-tone siren, ~2.4 s. */
function siren() {
  const duration = 2.4;
  const total = Math.floor(RATE * duration);
  const samples = new Float32Array(total);
  let phase = 0;

  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    // Sweep between 620 Hz and 1000 Hz, three times over the clip.
    const sweep = (Math.sin((2 * Math.PI * t * 3) / duration - Math.PI / 2) + 1) / 2;
    const frequency = 620 + sweep * 380;
    phase += (2 * Math.PI * frequency) / RATE;

    // Slight sawtooth colouring makes it cut through better than a pure sine.
    const tone = 0.78 * Math.sin(phase) + 0.22 * Math.sin(2 * phase);
    samples[i] = tone * envelope(t, duration, 0.06, 0.25);
  }
  return samples;
}

/** Two short ascending notes, ~0.7 s, deliberately gentler than the siren. */
function chime() {
  const duration = 0.7;
  const total = Math.floor(RATE * duration);
  const samples = new Float32Array(total);
  const notes = [
    { frequency: 660, start: 0.0, length: 0.3 },
    { frequency: 880, start: 0.28, length: 0.4 },
  ];

  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    let value = 0;
    for (const note of notes) {
      const local = t - note.start;
      if (local < 0 || local > note.length) continue;
      // Exponential decay gives a bell-like tail.
      const decay = Math.exp(-local * 6);
      value += Math.sin(2 * Math.PI * note.frequency * local) * decay * 0.5;
    }
    samples[i] = value * envelope(t, duration, 0.005, 0.05);
  }
  return samples;
}

/** Linear attack/release so clips never start or end on a click. */
function envelope(t, duration, attack, release) {
  if (t < attack) return t / attack;
  const remaining = duration - t;
  if (remaining < release) return Math.max(0, remaining / release);
  return 1;
}

function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clamped * 32_767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}
