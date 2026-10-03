/**
 * Icon set.
 *
 * The UI used to lean on emoji, which look different on every platform (and are
 * missing entirely on some Windows installs). These are flat line icons drawn in
 * the same aviation-instrument style as the rest of the game: 1.6 px strokes on a
 * 24×24 grid, coloured with `currentColor` so they follow the panel palette.
 */
import type { CSSProperties } from 'react';

export type IconName =
  | 'sun' | 'cloud' | 'overcast' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind' | 'crosswind' | 'front'
  | 'dawn' | 'dusk' | 'night' | 'plane' | 'jet' | 'prop' | 'carrier' | 'hangar' | 'podium' | 'book'
  | 'wrench' | 'cart' | 'coin' | 'lock' | 'unlock' | 'target' | 'crate' | 'map' | 'chute' | 'cross-med'
  | 'radar' | 'sliders' | 'shield' | 'check' | 'times' | 'pause' | 'play' | 'stop' | 'sound' | 'mute'
  | 'refresh' | 'left' | 'right' | 'gauge' | 'flame' | 'ice' | 'star' | 'medal' | 'trophy' | 'fuel'
  | 'tune' | 'eye' | 'clock' | 'swap' | 'route' | 'wing' | 'anchor' | 'contract' | 'menu';

const P: Record<IconName, string> = {
  sun: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
  cloud: 'M7 18h10a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.6 10 4 4 0 0 0 7 18Z',
  overcast: 'M6.5 15.5h11a3 3 0 0 0 .3-6 4.5 4.5 0 0 0-8.4-1A3.5 3.5 0 0 0 6.5 15.5ZM4 19h16',
  rain: 'M7 14h10a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.6 6 4 4 0 0 0 7 14ZM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  storm: 'M7 13h10a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.6 5 4 4 0 0 0 7 13ZM12 14l-2.5 5h3l-1 3 4-6h-3l1.5-2Z',
  snow: 'M12 3v18M4 7.5l16 9M20 7.5l-16 9M9.5 5 12 7.5 14.5 5M9.5 19 12 16.5 14.5 19',
  fog: 'M6 9h12M4 12h16M7 15h10M5 18h14',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7',
  crosswind: 'M3 8h12M3 12h16M3 16h9M18 6l3 3-3 3',
  front: 'M4 7h16M4 12h16M4 17h10M19 15l2 2-2 2',
  dawn: 'M4 18h16M7.5 18a4.5 4.5 0 0 1 9 0M12 5v3M6 10l1.5 1.5M18 10l-1.5 1.5',
  dusk: 'M4 18h16M7.5 18a4.5 4.5 0 0 1 9 0M12 3v3M5.5 8.5 7 10M18.5 8.5 17 10',
  night: 'M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  plane: 'M3 13.5 21 5l-6 8 4.5 6-3.5-.6-2.5-3.4-3.4 1.6-.6 3-1.6-.4.3-2.6Z',
  jet: 'M2 13h13l6-2-6-2H9L6 5H4l1.5 4H2l1 2-1 2ZM15 15h4M9 15h3',
  prop: 'M12 12v6M9 18h6M12 12 8 6M12 12l4-6M12 12V3',
  carrier: 'M3 17h18M5 14h14l-2-3H7l-2 3ZM12 8V4M9 6h6',
  hangar: 'M3 19V9l9-5 9 5v10M7 19v-6h10v6M3 19h18',
  podium: 'M9 20h6M12 16v4M7 12h3l1-3 1 6 1-6 1 3h3M12 3v3',
  book: 'M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4ZM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6Z',
  wrench: 'M14.5 5a4 4 0 1 0 4.4 6.4L21 13l-2 2-1.6-1.6A4 4 0 0 1 10 8.6L5 3.6 3.6 5l5 5A4 4 0 0 0 14.5 5Z',
  cart: 'M3 5h2.5l2.2 9.5H18L20 8H6.6M9 19a1.4 1.4 0 1 0 0-.1M17 19a1.4 1.4 0 1 0 0-.1',
  coin: 'M12 4c4.4 0 8 1.6 8 3.5S16.4 11 12 11 4 9.4 4 7.5 7.6 4 12 4ZM4 7.5v9c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-9',
  lock: 'M6 11h12v9H6ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6ZM8.5 11V8a3.5 3.5 0 0 1 6.8-1.6',
  target: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  crate: 'M4 8 12 4l8 4v8l-8 4-8-4ZM4 8l8 4 8-4M12 12v8',
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20ZM9 4v13.5M15 6.5V20',
  chute: 'M12 3a9 6 0 0 0-9 6h18a9 6 0 0 0-9-6ZM12 9v7M9.5 20a2.5 2.5 0 0 0 5 0',
  'cross-med': 'M4 7h16v12H4ZM12 9v8M8 13h8',
  radar: 'M12 12 19 6M12 21a9 9 0 1 0-9-9M12 17a5 5 0 1 0-5-5',
  sliders: 'M4 7h10M17 7h3M4 12h4M11 12h9M4 17h13M19 17h1M14 5v4M9 10v4M17 15v4',
  shield: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6Z',
  check: 'M5 13l4.5 4.5L19 7',
  times: 'M6 6l12 12M18 6 6 18',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 4.5 19 12 7 19.5Z',
  stop: 'M6 6h12v12H6Z',
  sound: 'M4 9h3l5-4v14l-5-4H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9h3l5-4v14l-5-4H4ZM16 10l5 5M21 10l-5 5',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4',
  left: 'M13 6l-6 6 6 6',
  right: 'M11 6l6 6-6 6',
  gauge: 'M4 17a8 8 0 1 1 16 0M12 17l4-5',
  flame: 'M12 3s4 5 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-2.5 0 2 1 3 1.5 3 .5-2 .5-6 1.5-8.5Z',
  ice: 'M12 3v18M6.5 6.5 12 12l5.5-5.5M6.5 17.5 12 12l5.5 5.5',
  star: 'M12 4l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 17.4 6.7 20.1l1.1-5.8L3.5 10.2l5.9-.8Z',
  medal: 'M8 3l2 6M16 3l-2 6M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 12.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0ZM8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 13v4M9 20h6M10 17h4',
  fuel: 'M6 21V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16M4 21h12M7 9h6M16 8l3 3v7a2 2 0 0 0 2-2V9l-2.5-2.5',
  tune: 'M5 20V9M5 5.5V4M12 20v-8M12 8V4M19 20v-4M19 12V4M3 9h4M10 8h4M17 16h4',
  eye: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 13V7a2 2 0 0 1 2-2h3M18 11v6a2 2 0 0 1-2 2h-4',
  wing: 'M3 15 21 5l-7 9 5 6-4-.7-2.5-3.3-3.5 1.7-.7 3.3-1.8-.5.5-3Z',
  anchor: 'M9.5 5.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0ZM12 8v12M7.5 11H4a8 8 0 0 0 8 9 8 8 0 0 0 8-9h-3.5',
  contract: 'M7 3h7l4 4v14H7ZM14 3v4h4M10 12h6M10 16h4',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export default function Ico({
  name,
  size = 16,
  className = '',
  style,
  filled = false,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={P[name] ?? P.plane} />
    </svg>
  );
}
