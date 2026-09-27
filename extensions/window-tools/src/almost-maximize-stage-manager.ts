import { WindowManagement, showHUD } from "@raycast/api";

/** Almost Maximize's share of the work area; only its left inset is kept, clear of the strip. */
const ALMOST_MAXIMIZE_FRACTION = 0.9;

export type Rect = { x: number; y: number; width: number; height: number };

/** Tinycast reports each display's work area; Raycast reports only its size. */
type Desktop = WindowManagement.Desktop & {
  visibleFrame?: { position: { x: number; y: number }; size: { width: number; height: number } };
};

/** Almost Maximize's left edge, with the top, right and bottom edges at the work area's. */
export function stageManagerFrame(area: Rect): Rect {
  const inset = Math.round((area.width - Math.round(area.width * ALMOST_MAXIMIZE_FRACTION)) / 2);
  return {
    x: area.x + inset,
    y: area.y,
    width: Math.max(1, area.width - inset),
    height: area.height,
  };
}

export function workArea(desktop: Desktop): Rect {
  const visible = desktop.visibleFrame;
  if (visible) return { ...visible.position, ...visible.size };
  return { x: 0, y: 0, ...desktop.size };
}

export default async function Command() {
  const window = await WindowManagement.getActiveWindow();
  if (window.bounds === "fullscreen") {
    await showHUD("Leave full screen first");
    return;
  }
  const desktops: Desktop[] = await WindowManagement.getDesktops();
  const desktop =
    desktops.find((candidate) => candidate.id === window.desktopId) ?? desktops.find((candidate) => candidate.active);
  if (!desktop) {
    await showHUD("No display found for the window");
    return;
  }
  const frame = stageManagerFrame(workArea(desktop));
  await WindowManagement.setWindowBounds({
    id: window.id,
    bounds: {
      position: { x: frame.x, y: frame.y },
      size: { width: frame.width, height: frame.height },
    },
  });
}
