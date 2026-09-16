import { Notification } from 'electron';
import { alertLevelLabel, alertTypeLabel, t, threatSummary } from '../shared/i18n';
import { worstLevel } from '../shared/alertLevel';
import type { ActiveAlert, Settings } from '../shared/types';
import type { AlertTransition } from './alerts/poller';
import { appIcon } from './trayIcon';
import type { SoundPlayer } from './soundPlayer';

/**
 * Turns alert transitions into desktop notifications and sound.
 *
 * Notifications and sound are independent toggles, and each has its own
 * "also on all-clear" switch, so a user can have a loud siren on alert and a
 * silent, notification-only all-clear.
 */
export class Notifier {
  /** Set from the tray menu; survives until the user unmutes. */
  private muted = false;

  constructor(private readonly sound: SoundPlayer) {}

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) void this.sound.stop();
  }

  handle(transition: AlertTransition, settings: Settings): void {
    if (transition.started.length > 0) {
      this.announce('alert', transition.started, settings);
    }
    // An all-clear is only meaningful if nothing else is still active; the
    // poller reports per-region transitions, so check the remaining alerts.
    if (transition.ended.length > 0 && transition.started.length === 0) {
      this.announce('clear', transition.ended, settings);
    }
  }

  private announce(kind: 'alert' | 'clear', alerts: ActiveAlert[], settings: Settings): void {
    const wantsNotification = kind === 'alert' ? settings.notifications : settings.notifications && settings.notifyOnClear;
    const wantsSound = kind === 'alert' ? settings.sound : settings.sound && settings.soundOnClear;

    if (wantsSound && !this.muted) {
      void this.sound.play(kind, settings.soundVolume);
    }

    if (wantsNotification && Notification.isSupported()) {
      const level = worstLevel(alerts.map((alert) => alert.level));
      const title =
        kind === 'clear'
          ? t(settings.language, 'alertEnded')
          : t(settings.language, level === 'yellow' ? 'statusAlertYellow' : 'alertStarted');

      new Notification({
        title,
        body: describeAlerts(alerts, settings, kind),
        icon: appIcon(),
        // A yellow-level threat should not demand the same attention as a
        // declared raid, which on most desktops stays on screen until dismissed.
        urgency: kind === 'alert' && level !== 'yellow' ? 'critical' : 'normal',
        silent: true, // The app plays its own sound; avoid a doubled chime.
      }).show();
    }
  }
}

function describeAlerts(alerts: ActiveAlert[], settings: Settings, kind: 'alert' | 'clear'): string {
  const lines = alerts.slice(0, 4).map((alert) => {
    const level =
      kind === 'alert' && alert.level !== 'unknown'
        ? ` (${alertLevelLabel(settings.language, alert.level)})`
        : '';
    const type = kind === 'alert' ? `${alertTypeLabel(settings.language, alert.type)}${level}: ` : '';
    // "drones" or "ballistic missiles" is the part worth reading first.
    const threats = kind === 'alert' ? threatSummary(settings.language, alert.threats) : '';
    const detail = threats ? ` — ${threats}` : '';
    return `${type}${alert.regionName}${detail}`;
  });

  const remaining = alerts.length - lines.length;
  if (remaining > 0) lines.push(settings.language === 'uk' ? `…та ще ${remaining}` : `…and ${remaining} more`);
  return lines.join('\n');
}
