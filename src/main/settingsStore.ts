import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';
import { sanitize } from '../shared/settingsSchema';

/**
 * Settings live in a single JSON file in Electron's userData directory.
 * Every read is validated field by field, so a hand-edited or partially written
 * file degrades to defaults instead of crashing the app on launch.
 */
export class SettingsStore {
  private readonly file: string;
  private current: Settings;

  constructor(file = join(app.getPath('userData'), 'settings.json')) {
    this.file = file;
    this.current = this.read();
  }

  get(): Settings {
    return this.current;
  }

  /** Merges a partial update, validates the result and persists it. */
  update(patch: Partial<Settings>): Settings {
    this.current = sanitize({ ...this.current, ...patch });
    this.write(this.current);
    return this.current;
  }

  private read(): Settings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      return sanitize(raw);
    } catch {
      // Missing or corrupt file: start from defaults rather than failing to boot.
      return { ...DEFAULT_SETTINGS };
    }
  }

  private write(settings: Settings): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Write-then-rename so a crash mid-write cannot truncate the real file.
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(settings, null, 2), 'utf8');
      renameSync(temp, this.file);
    } catch (error) {
      console.error('Failed to persist settings', error);
    }
  }
}

export { sanitize } from '../shared/settingsSchema';
