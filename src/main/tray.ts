import { Menu, Tray, type MenuItemConstructorOptions } from 'electron';
import { alertTypeLabel, formatDuration, formatTime, t } from '../shared/i18n';
import type { AlertSnapshot, Settings } from '../shared/types';
import { iconFor } from './trayIcon';

export interface TrayActions {
  openSettings(): void;
  refreshNow(): void;
  toggleMute(): void;
  quit(): void;
  isMuted(): boolean;
}

/** Cap on how many regions are spelled out before collapsing into a count. */
const MAX_DETAIL_LINES = 8;

/**
 * Owns the tray icon, its hover tooltip and its context menu.
 *
 * The same detail text is used for both: `setToolTip` only works on Windows and
 * macOS (Linux app indicators have no hover event at all), so on Linux the
 * detail lines are mirrored into the top of the context menu as disabled items.
 * That way the information is always one interaction away, whatever the
 * platform supports.
 */
export class TrayController {
  private readonly tray: Tray;

  constructor(
    private settings: Settings,
    private snapshot: AlertSnapshot,
    private readonly actions: TrayActions,
  ) {
    this.tray = new Tray(iconFor(snapshot.status, settings.colorIcon));
    this.tray.on('click', () => this.actions.openSettings());
    this.tray.on('double-click', () => this.actions.openSettings());
    this.render();
  }

  update(snapshot: AlertSnapshot, settings: Settings): void {
    this.snapshot = snapshot;
    this.settings = settings;
    this.render();
  }

  destroy(): void {
    this.tray.destroy();
  }

  private render(): void {
    this.tray.setImage(iconFor(this.snapshot.status, this.settings.colorIcon));
    this.tray.setToolTip(this.tooltip());
    this.tray.setContextMenu(Menu.buildFromTemplate(this.menu()));
  }

  /** Multi-line hover text: headline, then one line per active alert. */
  private tooltip(): string {
    const { language } = this.settings;
    const lines = [`${t(language, 'appName')} — ${this.headline()}`];

    for (const line of this.detailLines()) lines.push(line);

    if (this.snapshot.error) {
      lines.push(`${t(language, 'error')}: ${this.snapshot.error}`);
    }
    lines.push(`${t(language, 'lastUpdated')}: ${formatTime(language, this.snapshot.lastUpdated)}`);
    return lines.join('\n');
  }

  private headline(): string {
    const { language } = this.settings;
    if (this.settings.regions.length === 0) return t(language, 'noRegions');

    switch (this.snapshot.status) {
      case 'alert':
        return t(language, 'statusAlert');
      case 'clear':
        return t(language, 'statusClear');
      default:
        return t(language, 'statusUnknown');
    }
  }

  /** One line per active alert: type, region and how long it has been running. */
  private detailLines(): string[] {
    const { language } = this.settings;
    const { alerts } = this.snapshot;
    if (alerts.length === 0) return [];

    const lines = alerts.slice(0, MAX_DETAIL_LINES).map((alert) => {
      const type = alertTypeLabel(language, alert.type);
      const elapsed = alert.since ? ` (${t(language, 'since')} ${formatDuration(language, alert.since)})` : '';
      // Naming the feed matters when only one of two sources sees an alert.
      const from = alert.sources.length > 0 ? ` [${alert.sources.join('+')}]` : '';
      return `• ${type} — ${alert.regionName}${elapsed}${from}`;
    });

    const remaining = alerts.length - lines.length;
    if (remaining > 0) {
      lines.push(language === 'uk' ? `• …та ще ${remaining}` : `• …and ${remaining} more`);
    }
    return lines;
  }

  private menu(): MenuItemConstructorOptions[] {
    const { language } = this.settings;
    const items: MenuItemConstructorOptions[] = [
      { label: this.headline(), enabled: false },
    ];

    const details = this.detailLines();
    if (details.length > 0) {
      items.push({ type: 'separator' });
      for (const line of details) items.push({ label: line, enabled: false });
    }

    if (this.snapshot.error) {
      items.push({ label: `${t(language, 'error')}: ${this.snapshot.error}`, enabled: false });
    }

    items.push(
      { type: 'separator' },
      {
        label: `${t(language, 'countrywide')}: ${this.snapshot.countrywideCount}`,
        enabled: false,
      },
      {
        label: `${t(language, 'lastUpdated')}: ${formatTime(language, this.snapshot.lastUpdated)}`,
        enabled: false,
      },
      { type: 'separator' },
      { label: t(language, 'refreshNow'), click: () => this.actions.refreshNow() },
      {
        label: t(language, this.actions.isMuted() ? 'unmute' : 'muteFor'),
        type: 'checkbox',
        checked: this.actions.isMuted(),
        click: () => this.actions.toggleMute(),
      },
      { label: t(language, 'settings'), click: () => this.actions.openSettings() },
      { type: 'separator' },
      { label: t(language, 'quit'), click: () => this.actions.quit() },
    );

    return items;
  }
}
