/**
 * Rendering of XDG desktop entries, kept free of Electron imports so the
 * quoting and escaping rules can be unit-tested in plain Node.
 *
 * @see https://specifications.freedesktop.org/desktop-entry-spec/latest/
 */

export interface AutostartEntry {
  name: string;
  comment: string;
  /** Absolute path to the executable, unquoted. */
  exec: string;
  iconName: string;
  /** Seconds GNOME waits before launching, so the tray area exists first. */
  delaySeconds?: number;
}

/**
 * Quotes a path for an `Exec=` key.
 *
 * Not optional in practice: the packaged app installs to
 * `/opt/Ukraine Alarm Tray/…`, and an unquoted space would make the session
 * try to run `/opt/Ukraine` with `Alarm` as an argument.
 */
export function quoteForExec(path: string): string {
  const escaped = path
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  return `"${escaped}"`;
}

export function renderAutostartEntry(entry: AutostartEntry): string {
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${sanitizeValue(entry.name)}`,
    `Comment=${sanitizeValue(entry.comment)}`,
    `Exec=${quoteForExec(entry.exec)}`,
    `Icon=${sanitizeValue(entry.iconName)}`,
    'Terminal=false',
    // GNOME checks this key specifically; without it the entry can be ignored.
    'X-GNOME-Autostart-enabled=true',
    'Hidden=false',
  ];

  if (entry.delaySeconds !== undefined) {
    lines.push(`X-GNOME-Autostart-Delay=${Math.max(0, Math.round(entry.delaySeconds))}`);
  }

  lines.push('');
  return lines.join('\n');
}

/** Desktop entry values are single-line; a newline would corrupt the file. */
function sanitizeValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
