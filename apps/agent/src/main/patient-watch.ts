/**
 * While an alert about patient X is on screen, watch the HOSxP form it came from.
 * When the form shows another HN (the user moved to the next patient) or the form is
 * closed, the alert no longer applies and is withdrawn.
 *
 * Reads the screen only while an alert is visible, once per second.
 */
import { currentHn } from "./hosxp";
import type { Hwnd } from "./win32";

const INTERVAL_MS = 1000;
/** A form being redrawn can briefly show no HN; require a few misses in a row. */
const MISSES_BEFORE_CHANGE = 3;

export class PatientWatch {
  private timer: NodeJS.Timeout | null = null;

  /**
   * @param isAlertVisible stop watching once the user dismissed the alert
   * @param onPatientChanged called once when the alert's patient is no longer on screen
   */
  start(form: Hwnd, hn: string, isAlertVisible: () => boolean, onPatientChanged: (nowHn: string | null) => void) {
    this.stop();
    let misses = 0;
    this.timer = setInterval(() => {
      if (!isAlertVisible()) return this.stop();
      let now: string | null;
      try {
        now = currentHn(form);
      } catch {
        now = null;
      }
      if (now === hn) {
        misses = 0;
        return;
      }
      // a different HN is conclusive at once; "no HN" needs to persist (form closed or redrawing)
      if (now === null && ++misses < MISSES_BEFORE_CHANGE) return;
      this.stop();
      onPatientChanged(now);
    }, INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
