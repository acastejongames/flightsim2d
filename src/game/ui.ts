/**
 * Which interface is in charge.
 *
 * The game ships two GUIs and picks one automatically:
 *
 *   · handhelds (touch, no hover)  → the compact HUD + the bottom touch deck
 *   · desktops and laptops         → the full instrument HUD + the keyboard
 *
 * A narrow desktop window is *not* a phone, so width never decides on its own.
 * For hybrid machines (touch laptops, tablets with a keyboard) and for testing
 * the phone layout on a PC, `?ui=touch` / `?ui=desktop` / `?ui=auto` forces the
 * choice, and the same three-way switch lives in the pause menu. The choice is
 * remembered, like every other setting in the game.
 */
import { useSyncExternalStore } from 'react';

export type UiMode = 'auto' | 'touch' | 'desktop';

const KEY = 'skybound.ui';

/** `?ui=touch|desktop|auto`, or null when the URL says nothing useful. */
export function uiModeFromSearch(search: string): UiMode | null {
  try {
    const q = new URLSearchParams(search).get('ui');
    return q === 'touch' || q === 'desktop' || q === 'auto' ? q : null;
  } catch {
    return null;
  }
}

function read(): UiMode {
  const fromUrl = typeof window !== 'undefined' ? uiModeFromSearch(window.location.search) : null;
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'touch' || saved === 'desktop' || saved === 'auto') return saved;
  } catch {
    /* no storage */
  }
  return 'auto';
}

let current: UiMode = typeof window !== 'undefined' ? read() : 'auto';
const subs = new Set<() => void>();

export function getUiMode(): UiMode {
  return current;
}

export function setUiMode(m: UiMode): void {
  if (m === current) return;
  current = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

export function useUiMode(): UiMode {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    getUiMode,
    getUiMode,
  );
}

/** The media query list that decides the automatic case. */
export function handheldQueries(): MediaQueryList[] {
  if (typeof window === 'undefined' || !window.matchMedia) return [];
  return [window.matchMedia('(pointer: coarse)'), window.matchMedia('(hover: none)')];
}

/** A handheld: coarse pointer *and* no hover. A desktop with a mouse is neither. */
export function isHandheld(): boolean {
  const [coarse, noHover] = handheldQueries();
  return !!coarse?.matches && !!noHover?.matches;
}

/** Does the touch deck + compact HUD apply right now? */
export function wantsTouchUi(): boolean {
  const m = getUiMode();
  if (m === 'touch') return true;
  if (m === 'desktop') return false;
  return isHandheld();
}
