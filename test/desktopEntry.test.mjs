import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteForExec, renderAutostartEntry } from '../dist/shared/desktopEntry.js';

test('a path containing spaces is quoted', () => {
  // The real install path: an unquoted space would make the session try to run
  // /opt/Ukraine with "Alarm" as an argument.
  assert.equal(
    quoteForExec('/opt/Ukraine Alarm Tray/ukrainealarm-tray-app'),
    '"/opt/Ukraine Alarm Tray/ukrainealarm-tray-app"',
  );
});

test('shell-significant characters are escaped inside the quotes', () => {
  assert.equal(quoteForExec('/opt/a"b'), '"/opt/a\\"b"');
  assert.equal(quoteForExec('/opt/a\\b'), '"/opt/a\\\\b"');
  assert.equal(quoteForExec('/opt/$HOME/app'), '"/opt/\\$HOME/app"');
  assert.equal(quoteForExec('/opt/`whoami`'), '"/opt/\\`whoami\\`"');
});

test('the entry declares the keys a desktop session needs', () => {
  const entry = renderAutostartEntry({
    name: 'Ukraine Alarm Tray',
    comment: 'Ukrainian air-raid alerts in your system tray',
    exec: '/opt/Ukraine Alarm Tray/ukrainealarm-tray-app',
    iconName: 'ukrainealarm-tray-app',
    delaySeconds: 5,
  });

  assert.ok(entry.startsWith('[Desktop Entry]\n'));
  assert.match(entry, /^Type=Application$/m);
  assert.match(entry, /^Name=Ukraine Alarm Tray$/m);
  assert.match(entry, /^Exec="\/opt\/Ukraine Alarm Tray\/ukrainealarm-tray-app"$/m);
  assert.match(entry, /^Terminal=false$/m);
  // GNOME ignores autostart entries without this key.
  assert.match(entry, /^X-GNOME-Autostart-enabled=true$/m);
  assert.match(entry, /^Hidden=false$/m);
  assert.match(entry, /^X-GNOME-Autostart-Delay=5$/m);
  assert.ok(entry.endsWith('\n'));
});

test('the delay key is omitted when no delay is requested', () => {
  const entry = renderAutostartEntry({
    name: 'A',
    comment: 'B',
    exec: '/usr/bin/a',
    iconName: 'a',
  });
  assert.ok(!entry.includes('X-GNOME-Autostart-Delay'));
});

test('a newline in a value cannot corrupt the file', () => {
  const entry = renderAutostartEntry({
    name: 'Evil\nExec=/usr/bin/rm',
    comment: 'x',
    exec: '/usr/bin/a',
    iconName: 'a',
  });
  const execLines = entry.split('\n').filter((line) => line.startsWith('Exec='));
  assert.equal(execLines.length, 1);
  assert.equal(execLines[0], 'Exec="/usr/bin/a"');
});

test('a fractional or negative delay is normalised', () => {
  assert.match(
    renderAutostartEntry({ name: 'a', comment: 'b', exec: '/x', iconName: 'i', delaySeconds: 4.6 }),
    /^X-GNOME-Autostart-Delay=5$/m,
  );
  assert.match(
    renderAutostartEntry({ name: 'a', comment: 'b', exec: '/x', iconName: 'i', delaySeconds: -3 }),
    /^X-GNOME-Autostart-Delay=0$/m,
  );
});
