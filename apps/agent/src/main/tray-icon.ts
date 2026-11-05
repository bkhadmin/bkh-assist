/** Tray icon (16 px + 32 px for HiDPI) from the shared drawing in tray-png.ts. */
import { nativeImage, type NativeImage } from "electron";
import { drawIcon, type TrayTone } from "./tray-png";

export type { TrayTone };

export function trayIcon(tone: TrayTone): NativeImage {
  const img = nativeImage.createFromBuffer(drawIcon(16, tone), { scaleFactor: 1 });
  img.addRepresentation({ scaleFactor: 2, buffer: drawIcon(32, tone) });
  return img;
}
