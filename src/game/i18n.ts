import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'es';

const KEY = 'skybound.lang';
let current: Lang = 'en';
try {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (saved === 'es' || saved === 'en') current = saved;
} catch {
  /* ignore */
}

const subs = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** React hook — re-renders the component whenever the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Inline bilingual string: pick EN or ES from a literal pair. */
export function t2(en: string, es: string): string {
  return current === 'es' ? es : en;
}

type Entry = { en: string; es: string };

const DICT: Record<string, Entry> = {
  tagline: { en: '✈ Side-scrolling flight sim', es: '✈ Simulador de vuelo lateral' },
  blurb: {
    en: 'Real lift, drag, stall and thrust physics, live weather with wind, gusts and storms, an endless procedural world and carrier operations. Build a career, earn medals and upgrade your machines.',
    es: 'Física real de sustentación, resistencia, pérdida y empuje, clima vivo con viento, rachas y tormentas, un mundo procedural infinito y operaciones en portaaviones. Haz carrera, gana medallas y mejora tus máquinas.',
  },
  controls: { en: '⌨ Controls', es: '⌨ Controles' },
  hideControls: { en: 'Hide controls', es: 'Ocultar controles' },
  modeTitle: { en: '1 · Game mode', es: '1 · Modo de juego' },
  openWorld: { en: 'Open World', es: 'Mundo abierto' },
  openWorldText: {
    en: 'An endless procedural world of coastlines, mountain ranges, villages and airfields. Fly free, or take contracts and get paid for them.',
    es: 'Un mundo procedural infinito con costas, cordilleras, pueblos y aeródromos. Vuela libre o acepta contratos y cobra por ellos.',
  },
  carrierOps: { en: 'Carrier Ops', es: 'Operaciones en portaaviones' },
  carrierOpsText: {
    en: 'A 300 m carrier steaming at 30 knots. Launch off the catapult, then trap the 3-wire — guided by the optical landing system.',
    es: 'Un portaaviones de 300 m a 30 nudos. Lánzate con la catapulta y engacha el 3er cable, guiado por el sistema óptico de aterrizaje.',
  },
  selected: { en: 'SELECTED', es: 'ELEGIDO' },
  aircraftTitle: { en: '2 · Aircraft', es: '2 · Aeronaves' },
  locked: { en: 'LOCKED', es: 'BLOQUEADO' },
  owned: { en: 'IN YOUR HANGAR', es: 'EN TU HANGAR' },
  weatherTitle: { en: '3 · Weather', es: '3 · Clima' },
  weatherHint: {
    en: 'Weather drives wind, gusts, turbulence, icing and visibility. Fly a mission and the brief decides the sky.',
    es: 'El clima define el viento, las rachas, la turbulencia, el engelamiento y la visibilidad. En misión, la orden decide el cielo.',
  },
  todTitle: { en: '4 · Time of day', es: '4 · Hora del día' },
  startTitle: { en: '5 · Start', es: '5 · Comienzo' },
  onRunway: { en: 'On the runway', es: 'En pista' },
  inAir: { en: 'In the air', es: 'En vuelo' },
  onCat: { en: 'On the catapult', es: 'En la catapulta' },
  onFinal: { en: 'On final approach', es: 'En final' },
  startEngines: { en: 'START ENGINES', es: 'ARRANCAR MOTORES' },
  flyMission: { en: 'FLY CONTRACT', es: 'VOLAR CONTRATO' },
  freeFlight: { en: 'FREE FLIGHT', es: 'VUELO LIBRE' },
  todayMission: { en: "Today's contract", es: 'Contrato de hoy' },
  reroll: { en: 'New contract', es: 'Otro contrato' },
  hangar: { en: 'Hangar', es: 'Hangar' },
  medals: { en: 'Medals', es: 'Medallas' },
  career: { en: 'Career', es: 'Carrera' },
  rank: { en: 'Rank', es: 'Rango' },
  money: { en: 'Credits', es: 'Créditos' },
  xp: { en: 'XP', es: 'XP' },
  buy: { en: 'Buy', es: 'Comprar' },
  equip: { en: 'Select', es: 'Elegir' },
  equipped: { en: 'Selected', es: 'Elegido' },
  upgrades: { en: 'Upgrades', es: 'Mejoras' },
  level: { en: 'Lv', es: 'Nv' },
  maxed: { en: 'MAX', es: 'MÁX' },
  back: { en: 'Back', es: 'Volver' },
  toMenu: { en: 'Main menu', es: 'Menú principal' },
  resume: { en: 'Resume', es: 'Reanudar' },
  pause: { en: 'Pause', es: 'Pausa' },
  paused: { en: 'Paused', es: 'Pausa' },
  respawn: { en: 'Respawn', es: 'Reaparecer' },
  endFlight: { en: 'End flight', es: 'Terminar vuelo' },
  briefing: { en: 'Briefing', es: 'Informe de misión' },
  objective: { en: 'Objective', es: 'Objetivo' },
  reward: { en: 'Reward', es: 'Recompensa' },
  weather: { en: 'Weather', es: 'Clima' },
  difficulty: { en: 'Difficulty', es: 'Dificultad' },
  accept: { en: 'Accept & fly', es: 'Aceptar y volar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  debrief: { en: 'Debrief', es: 'Informe de vuelo' },
  missionComplete: { en: 'CONTRACT COMPLETE', es: 'CONTRATO COMPLETADO' },
  missionFailed: { en: 'CONTRACT FAILED', es: 'CONTRATO FALLIDO' },
  flightSummary: { en: 'Flight summary', es: 'Resumen del vuelo' },
  earned: { en: 'Earned', es: 'Ganado' },
  newMedals: { en: 'New medals', es: 'Nuevas medallas' },
  rankUp: { en: 'RANK UP!', es: '¡ASCENSO!' },
  unlocked: { en: 'Unlocked', es: 'Desbloqueado' },
  flyAgain: { en: 'Fly again', es: 'Volver a volar' },
  noMedals: { en: 'No medals yet — go earn some.', es: 'Aún no hay medallas: ve a ganarlas.' },
  stats: { en: 'Logbook', es: 'Libro de vuelo' },
  flights: { en: 'Flights', es: 'Vuelos' },
  hours: { en: 'Hours', es: 'Horas' },
  landings: { en: 'Landings', es: 'Aterrizajes' },
  traps: { en: 'Traps', es: 'Enganches' },
  distance: { en: 'Distance', es: 'Distancia' },
  bestLanding: { en: 'Best landing', es: 'Mejor aterrizaje' },
  crashed: { en: 'Crashes', es: 'Accidentes' },
  missionsDone: { en: 'Contracts done', es: 'Contratos hechos' },
  streak: { en: 'Streak', es: 'Racha' },
  langLabel: { en: 'Language', es: 'Idioma' },
  weatherPreset: { en: 'Weather preset', es: 'Preset de clima' },
  dynamic: { en: 'Dynamic front', es: 'Frente dinámico' },
  notEnough: { en: 'Not enough credits', es: 'Créditos insuficientes' },
  needRank: { en: 'Requires rank', es: 'Requiere rango' },
  buyAircraft: { en: 'Purchase', es: 'Comprar' },
  install: { en: 'Install', es: 'Instalar' },
  reset: { en: 'Reset career', es: 'Borrar carrera' },
  // --- sandbox / free play
  sandbox: { en: 'Sandbox', es: 'Sandbox' },
  sandboxTitle: { en: '6 · Sandbox (free play)', es: '6 · Sandbox (juego libre)' },
  sandboxText: {
    en: 'Everything is free: every aircraft and upgrade costs nothing, rank gates are ignored and you cannot die. In flight, open the tuner (U) to change wind, gusts, turbulence, clouds, rain, visibility, icing, temperature and time of day — live.',
    es: 'Todo es gratis: aviones y mejoras no cuestan nada, no hay requisitos de rango y no puedes morir. En vuelo, abre el panel (tecla U) para cambiar viento, rachas, turbulencia, nubes, lluvia, visibilidad, engelamiento, temperatura y hora del día, en directo.',
  },
  sandboxOn: { en: 'Sandbox ON', es: 'Sandbox ACTIVO' },
  sandboxOff: { en: 'Sandbox OFF', es: 'Sandbox INACTIVO' },
  free: { en: 'FREE', es: 'GRATIS' },
  tuner: { en: 'Environment tuner', es: 'Panel del entorno' },
  sbWind: { en: 'Wind (head + / tail −)', es: 'Viento (cara + / cola −)' },
  sbCross: { en: 'Crosswind', es: 'Viento cruzado' },
  sbGust: { en: 'Gusts', es: 'Rachas' },
  sbTurb: { en: 'Turbulence', es: 'Turbulencia' },
  sbCloud: { en: 'Clouds', es: 'Nubes' },
  sbPrecip: { en: 'Rain / snow', es: 'Lluvia / nieve' },
  sbVis: { en: 'Visibility', es: 'Visibilidad' },
  sbIce: { en: 'Icing', es: 'Engelamiento' },
  sbTemp: { en: 'Temperature', es: 'Temperatura' },
  sbGod: { en: 'God mode (no crashes)', es: 'Modo dios (sin accidentes)' },
  sbFuel: { en: 'Infinite fuel', es: 'Combustible infinito' },
  sbPreset: { en: 'Weather preset', es: 'Preset de clima' },
  sbReset: { en: 'Reset tuner', es: 'Reiniciar panel' },
  sbHint: {
    en: 'The sky changes as you move the sliders. Press U to hide the panel.',
    es: 'El cielo cambia mientras mueves los controles. Pulsa U para ocultar el panel.',
  },
  sbNoReward: {
    en: 'Sandbox flight — no credits, XP or medals. Everything is unlocked anyway.',
    es: 'Vuelo sandbox: sin créditos, XP ni medallas. De todos modos lo tienes todo desbloqueado.',
  },
  cheats: { en: 'Sandbox cheats', es: 'Trucos del sandbox' },
  // --- in-flight helpers
  altHold: { en: 'Alt hold', es: 'Altitud fija' },
  smoke: { en: 'Smoke', es: 'Humo' },
  timeWarp: { en: 'Time', es: 'Tiempo' },
  glideTitle: { en: 'GLIDEPATH', es: 'SENDA DE PLANEO' },
  glideHigh: { en: 'HIGH', es: 'ALTO' },
  glideLow: { en: 'LOW', es: 'BAJO' },
  glideOnPath: { en: 'ON PATH', es: 'EN SENDA' },
  glideHint: {
    en: 'Keep the diamond centred: 3° down, gear and flaps out, sink under 2 m/s.',
    es: 'Mantén el rombo centrado: 3° de descenso, tren y flaps fuera, descenso bajo 2 m/s.',
  },
  addMoney: { en: '+10.000 cr', es: '+10.000 cr' },
  addXp: { en: '+5.000 XP', es: '+5.000 XP' },
  unlockAll: { en: 'Unlock everything', es: 'Desbloquear todo' },
  confirmReset: { en: 'Tap again to erase everything', es: 'Toca otra vez para borrar todo' },
};

export function t(key: keyof typeof DICT | string): string {
  const e = DICT[key];
  if (!e) return String(key);
  return current === 'es' ? e.es : e.en;
}
