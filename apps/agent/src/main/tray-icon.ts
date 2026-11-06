/** Tray icon: the novice monk (resources/novice.svg), pre-rendered at 16 and 32 px (HiDPI) by tools/rasterize-icon.cjs. */
import { nativeImage, type NativeImage } from "electron";
import tray16 from "../../resources/tray-16.png?asset";
import tray32 from "../../resources/tray-32.png?asset";

export function trayIcon(): NativeImage {
  const img = nativeImage.createFromPath(tray16);
  img.addRepresentation({ scaleFactor: 2, dataURL: nativeImage.createFromPath(tray32).toDataURL() });
  return img;
}
