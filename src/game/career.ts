import type { AircraftId, AircraftSpec } from './aircraft';
import type { Lang } from './i18n';
import type { WeatherId } from './weather';
import type { WorldMode } from './world';

export interface RankDef {
  xp: number;
  en: string;
  es: string;
}

export const RANKS: RankDef[] = [
  { xp: 0, en: 'Cadet', es: 'Cadete' },
  { xp: 700, en: 'Student Pilot', es: 'Alumno piloto' },
  { xp: 2200, en: 'Private Pilot', es: 'Piloto privado' },
  { xp: 5200, en: 'Commercial Pilot', es: 'Piloto comercial' },
  { xp: 11000, en: 'Senior Captain', es: 'Capitán sénior' },
  { xp: 21000, en: 'Commander', es: 'Comandante' },
  { xp: 36000, en: 'Wing Leader', es: 'Jefe de escuadrón' },
  { xp: 60000, en: 'Legend', es: 'Leyenda' },
];

export function rankFor(xp: number): { index: number; def: RankDef; next: RankDef | null; progress: number } {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  const def = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const progress = next ? (xp - def.xp) / (next.xp - def.xp) : 1;
  return { index, def, next, progress };
}

// ------------------------------------------------------------------ hangar
export interface AirframeDef {
  id: AircraftId;
  price: number;
  rank: number;
}

export const AIRFRAMES: Record<AircraftId, AirframeDef> = {
  sparrow: { id: 'sparrow', price: 0, rank: 0 },
  corsair: { id: 'corsair', price: 16000, rank: 2 },
  hornet: { id: 'hornet', price: 48000, rank: 4 },
  typhoon: { id: 'typhoon', price: 72000, rank: 5 },
  ef18: { id: 'ef18', price: 54000, rank: 4 },
  pc21: { id: 'pc21', price: 24000, rank: 2 },
  cn235: { id: 'cn235', price: 38000, rank: 3 },
};

export type UpgradeEffect = 'thrust' | 'drag' | 'brake' | 'deice' | 'radar' | 'fuel' | 'gear' | 'stab' | 'nav';

export interface UpgradeDef {
  id: string;
  effect: UpgradeEffect;
  icon: string;
  en: string;
  es: string;
  descEn: string;
  descEs: string;
  cost: number; // cost of level 1; level n costs cost * (n+1)
  max: number;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'engine', effect: 'thrust', icon: '🔧', max: 3, cost: 2600,
    en: 'Engine tune', es: 'Puesta a punto',
    descEn: '+7% thrust per level.', descEs: '+7% de empuje por nivel.',
  },
  {
    id: 'aero', effect: 'drag', icon: '✨', max: 3, cost: 3100,
    en: 'Aero clean-up', es: 'Limpieza aerodinámica',
    descEn: '-8% parasite drag per level.', descEs: '-8% de resistencia parásita por nivel.',
  },
  {
    id: 'brakes', effect: 'brake', icon: '🛞', max: 2, cost: 2200,
    en: 'Brakes & tyres', es: 'Frenos y neumáticos',
    descEn: '+25% braking action, less tyre wear.', descEs: '+25% de frenado, menos desgaste.',
  },
  {
    id: 'deice', effect: 'deice', icon: '🧊', max: 2, cost: 3400,
    en: 'De-ice system', es: 'Sistema antihielo',
    descEn: 'Removes 75% / 95% of airframe ice.', descEs: 'Elimina el 75% / 95% del hielo.',
  },
  {
    id: 'radar', effect: 'radar', icon: '📡', max: 2, cost: 2800,
    en: 'Weather radar', es: 'Radar meteorológico',
    descEn: 'Longer radar range and auto alerts.', descEs: 'Más alcance y avisos automáticos.',
  },
  {
    id: 'tanks', effect: 'fuel', icon: '⛽', max: 2, cost: 2500,
    en: 'Aux tanks', es: 'Depósitos auxiliares',
    descEn: '+18% fuel capacity per level.', descEs: '+18% de combustible por nivel.',
  },
  {
    id: 'gear', effect: 'gear', icon: '🦿', max: 2, cost: 3600,
    en: 'Reinforced gear', es: 'Tren reforzado',
    descEn: 'Tolerates a 25% harder touchdown per level.', descEs: 'Aguanta un 25% más de impacto por nivel.',
  },
  {
    id: 'stab', effect: 'stab', icon: '🎛️', max: 2, cost: 3900,
    en: 'Stability augmentation', es: 'Estabilizador de vuelo',
    descEn: 'Damps 30% / 50% of gust response.', descEs: 'Amortigua el 30% / 50% de las rachas.',
  },
  {
    id: 'nav', effect: 'nav', icon: '🧭', max: 1, cost: 4200,
    en: 'Nav computer', es: 'Computador de navegación',
    descEn: 'Shows wind-corrected heading and gate guidance (+10% pay).', descEs: 'Rumbo corregido por viento y guiado a puertas (+10% de paga).',
  },
];

export const upgradeEffect = (profile: Profile, effect: UpgradeEffect): number => {
  const def = UPGRADES.find((u) => u.effect === effect);
  if (!def) return 0;
  return profile.upgrades[def.id] ?? 0;
};

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.cost * (1 + level * 0.85));
}

// ------------------------------------------------------------------ medals
export interface MedalDef {
  id: string;
  icon: string;
  en: string;
  es: string;
  descEn: string;
  descEs: string;
}

export const MEDALS: MedalDef[] = [
  { id: 'first_flight', icon: '🎖️', en: 'First Flight', es: 'Primer vuelo', descEn: 'Complete your first flight.', descEs: 'Completa tu primer vuelo.' },
  { id: 'first_landing', icon: '🛬', en: 'Greased It', es: 'Mantequilla', descEn: 'Touch down with less than 1.3 m/s sink.', descEs: 'Toma contacto con menos de 1,3 m/s.' },
  { id: 'ten_landings', icon: '🏅', en: 'Ten Down', es: 'Diez abajo', descEn: 'Log 10 landings.', descEs: 'Suma 10 aterrizajes.' },
  { id: 'trap_ok', icon: '⚓', en: 'Trapped', es: 'Enganchado', descEn: 'Catch a wire on the carrier.', descEs: 'Engancha un cable en el portaaviones.' },
  { id: 'trap_perfect', icon: '🥇', en: 'OK 3-Wire', es: '3er cable OK', descEn: 'Grade a perfect 3-wire trap.', descEs: 'Consigue un enganche perfecto en el 3er cable.' },
  { id: 'ten_traps', icon: '🧲', en: 'Hook Master', es: 'Maestro del gancho', descEn: '10 successful traps.', descEs: '10 enganches con éxito.' },
  { id: 'crosswind', icon: '💨', en: 'Crabbed', es: 'Al viento', descEn: 'Land clean in a strong crosswind.', descEs: 'Aterriza limpio con viento cruzado fuerte.' },
  { id: 'storm', icon: '⛈️', en: 'Storm Rider', es: 'Jinete de tormentas', descEn: 'Fly and land in a thunderstorm.', descEs: 'Vuela y aterriza en una tormenta.' },
  { id: 'night', icon: '🌙', en: 'Night Owl', es: 'Nocturno', descEn: 'Land after dark.', descEs: 'Aterriza de noche.' },
  { id: 'fog', icon: '🌫️', en: 'Blind Luck', es: 'Suerte ciega', descEn: 'Land with less than 1 km visibility.', descEs: 'Aterriza con menos de 1 km de visibilidad.' },
  { id: 'ice', icon: '🧊', en: 'Icy Wings', es: 'Alas heladas', descEn: 'Land with airframe ice on the wings.', descEs: 'Aterriza con hielo en el avión.' },
  { id: 'mach1', icon: '🚀', en: 'Sound Barrier', es: 'Barrera del sonido', descEn: 'Exceed Mach 1.', descEs: 'Supera Mach 1.' },
  { id: 'g8', icon: '🌀', en: 'Eight G', es: 'Ocho G', descEn: 'Pull 8 g without breaking up.', descEs: 'Soporta 8 g sin romperte.' },
  { id: 'century', icon: '🗺️', en: 'Centurion', es: 'Centurión', descEn: 'Fly 100 km in one flight.', descEs: 'Vuela 100 km en un vuelo.' },
  { id: 'contractor', icon: '📋', en: 'Contractor', es: 'Contratista', descEn: 'Complete 10 contracts.', descEs: 'Completa 10 contratos.' },
  { id: 'ace', icon: '🏆', en: 'Ace', es: 'As', descEn: 'Complete 5 contracts in a row.', descEs: 'Completa 5 contratos seguidos.' },
  { id: 'jet', icon: '✈️', en: 'Jet Jockey', es: 'Piloto de jet', descEn: 'Buy the F/A-18 Hornet.', descEs: 'Compra el F/A-18 Hornet.' },
  { id: 'hardcore', icon: '🔥', en: 'No Assist', es: 'Sin ayudas', descEn: 'Land with flight assist off.', descEs: 'Aterriza con la ayuda de vuelo desactivada.' },
];

export const MEDAL_BY_ID: Record<string, MedalDef> = MEDALS.reduce((a, m) => ((a[m.id] = m), a), {} as Record<string, MedalDef>);

// ------------------------------------------------------------------ profile
export interface Profile {
  v: number;
  xp: number;
  money: number;
  owned: AircraftId[];
  upgrades: Record<string, number>;
  medals: string[];
  weather: WeatherId;
  mode: WorldMode;
  aircraft: AircraftId;
  lang: Lang;
  stats: {
    flights: number;
    seconds: number;
    distance: number;
    landings: number;
    softLandings: number;
    traps: number;
    crashes: number;
    missions: number;
    missionsFailed: number;
    streak: number;
    bestStreak: number;
    bestSink: number;
    maxG: number;
    maxMach: number;
    cats: number;
    stormFlights: number;
    nightLandings: number;
    crosswindLandings: number;
  };
}

export const emptyProfile = (): Profile => ({
  v: 1,
  xp: 0,
  money: 3500,
  owned: ['sparrow'],
  upgrades: {},
  medals: [],
  weather: 'clear',
  mode: 'open',
  aircraft: 'sparrow',
  lang: 'en',
  stats: {
    flights: 0,
    seconds: 0,
    distance: 0,
    landings: 0,
    softLandings: 0,
    traps: 0,
    crashes: 0,
    missions: 0,
    missionsFailed: 0,
    streak: 0,
    bestStreak: 0,
    bestSink: 99,
    maxG: 0,
    maxMach: 0,
    cats: 0,
    stormFlights: 0,
    nightLandings: 0,
    crosswindLandings: 0,
  },
});

const KEY = 'skybound.profile.v1';

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProfile();
    const p = JSON.parse(raw) as Profile;
    const base = emptyProfile();
    return {
      ...base,
      ...p,
      stats: { ...base.stats, ...(p.stats ?? {}) },
      upgrades: { ...(p.upgrades ?? {}) },
      medals: Array.isArray(p.medals) ? p.medals : [],
      owned: Array.isArray(p.owned) && p.owned.length ? p.owned : ['sparrow'],
    };
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function resetProfile(): Profile {
  const p = emptyProfile();
  saveProfile(p);
  return p;
}

// ------------------------------------------------------------------ upgrades applied to a spec
export function applyUpgrades(spec: AircraftSpec, profile: Profile): AircraftSpec {
  const lv = (e: UpgradeEffect) => upgradeEffect(profile, e);
  const thrust = 1 + lv('thrust') * 0.07;
  const fuel = 1 + lv('fuel') * 0.18;
  const out: AircraftSpec = {
    ...spec,
    thrustMil: spec.thrustMil * thrust,
    thrustAB: spec.thrustAB * thrust,
    thrustStatic: spec.thrustStatic * thrust,
    power: spec.power * thrust,
    Cd0: spec.Cd0 * (1 - lv('drag') * 0.08),
    fuelMax: spec.fuelMax * fuel,
    stats: { ...spec.stats },
    brakeBonus: 1 + lv('brake') * 0.25,
    deIce: lv('deice') === 0 ? 0 : lv('deice') === 1 ? 0.75 : 0.95,
    radarKm: 6 + lv('radar') * 6,
    turbDamp: lv('stab') === 0 ? 0 : lv('stab') === 1 ? 0.3 : 0.5,
    gearTol: 1 + lv('gear') * 0.25,
    navAssist: lv('nav') > 0,
    upgraded: true,
  };
  return out;
}

// ------------------------------------------------------------------ flight results
export interface FlightSummary {
  mode: WorldMode;
  aircraft: AircraftId;
  weatherId: WeatherId;
  missionTitleEn: string | null;
  missionTitleEs: string | null;
  missionRewardMoney: number;
  missionRewardXp: number;
  missionDone: boolean;
  missionFailed: boolean;
  missionFailReason: string;
  score: number;
  distance: number;
  seconds: number;
  landings: number;
  traps: number;
  bestSink: number;
  cats: number;
  crashes: number;
  maxG: number;
  maxMach: number;
  night: boolean;
  minVis: number;
  maxIce: number;
  maxCrosswind: number;
  assist: boolean;
  events: string[];
  notes: string[];
}

export interface AwardResult {
  xp: number;
  money: number;
  score: number;
  multiplier: number;
  newMedals: MedalDef[];
  rankUp: boolean;
  newRank: RankDef;
  progress: number;
  breakdown: { en: string; es: string; value: number }[];
}

export function award(profile: Profile, s: FlightSummary): AwardResult {
  const wxBonus: Record<string, number> = {
    clear: 0, breezy: 0.05, crosswind: 0.2, overcast: 0.1, rain: 0.25, storm: 0.55, fog: 0.4, snow: 0.3, dynamic: 0.2,
  };
  const wb = wxBonus[s.weatherId] ?? 0;
  const breakdown: { en: string; es: string; value: number }[] = [];
  const add = (en: string, es: string, v: number) => {
    if (v !== 0) breakdown.push({ en, es, value: Math.round(v) });
    return v;
  };

  let money = 0;
  let xp = 0;

  // flight score converted into pay
  money += add('Flight score', 'Puntuación de vuelo', s.score * 0.5);
  xp += add('Flight score', 'Puntuación de vuelo', s.score * 0.55);
  money += add('Distance flown', 'Distancia volada', (s.distance / 1000) * 20);
  xp += add('Distance flown', 'Distancia volada', (s.distance / 1000) * 12);
  xp += add('Airborne time', 'Tiempo en vuelo', (s.seconds / 60) * 9);

  if (s.missionDone) {
    money += add('Contract', 'Contrato', s.missionRewardMoney);
    xp += add('Contract', 'Contrato', s.missionRewardXp);
  } else if (s.missionFailed) {
    xp = xp * 0.35;
    breakdown.push({ en: 'Contract failed', es: 'Contrato fallido', value: 0 });
  }

  const weatherPay = (money * wb) | 0;
  money += add('Weather bonus', 'Prima meteorológica', weatherPay);
  if (s.night) money += add('Night bonus', 'Prima nocturna', money * 0.12);
  if (s.crashes > 0) money += add('Repairs', 'Reparaciones', -Math.min(money * 0.35, s.crashes * 900));
  if (s.assist) xp *= 0.92;

  const streak = s.missionDone ? profile.stats.streak + 1 : profile.stats.streak;
  const streakMult = 1 + Math.min(0.5, Math.max(0, streak - 1) * 0.1);
  money = Math.max(0, Math.round(money * (s.missionDone ? streakMult : 1)));
  xp = Math.max(0, Math.round(xp * (s.missionDone ? streakMult : 1)));

  const before = rankFor(profile.xp);

  // ---- stats + medals
  profile.xp += xp;
  profile.money = Math.max(0, profile.money + money);
  profile.stats.flights += 1;
  profile.stats.seconds += s.seconds;
  profile.stats.distance += s.distance;
  profile.stats.landings += s.landings;
  profile.stats.traps += s.traps;
  profile.stats.crashes += s.crashes;
  profile.stats.cats += s.cats;
  profile.stats.maxG = Math.max(profile.stats.maxG, s.maxG);
  profile.stats.maxMach = Math.max(profile.stats.maxMach, s.maxMach);
  if (s.bestSink < profile.stats.bestSink) profile.stats.bestSink = s.bestSink;
  if (s.landings > 0 && s.bestSink < 1.4) profile.stats.softLandings += 1;
  if (s.weatherId === 'storm') profile.stats.stormFlights += 1;
  if (s.night && s.landings > 0) profile.stats.nightLandings += 1;
  if (s.maxCrosswind > 8 && s.landings > 0) profile.stats.crosswindLandings += 1;
  if (s.missionDone) {
    profile.stats.missions += 1;
    profile.stats.streak += 1;
    profile.stats.bestStreak = Math.max(profile.stats.bestStreak, profile.stats.streak);
  } else if (s.missionFailed) {
    profile.stats.missionsFailed += 1;
    profile.stats.streak = 0;
  }

  const ev = new Set(s.events);
  const st = profile.stats;
  const candidate = (id: string, ok: boolean) => {
    if (!ok) return;
    ev.add(id);
  };
  candidate('first_flight', st.flights >= 1);
  candidate('first_landing', s.landings > 0 && s.bestSink < 1.3);
  candidate('ten_landings', st.landings >= 10);
  candidate('trap_ok', st.traps >= 1);
  candidate('trap_perfect', ev.has('perfect_trap'));
  candidate('ten_traps', st.traps >= 10);
  candidate('crosswind', s.maxCrosswind > 8 && s.landings > 0 && s.crashes === 0);
  candidate('storm', s.weatherId === 'storm' && s.landings > 0);
  candidate('night', s.night && s.landings > 0);
  candidate('fog', s.minVis < 1000 && s.landings > 0);
  candidate('ice', s.maxIce > 0.25 && s.landings > 0);
  candidate('mach1', s.maxMach >= 1);
  candidate('g8', s.maxG >= 8);
  candidate('century', s.distance >= 100000);
  candidate('contractor', st.missions >= 10);
  candidate('ace', st.bestStreak >= 5);
  candidate('jet', profile.owned.includes('hornet'));
  candidate('hardcore', !s.assist && s.landings > 0);

  const newMedals: MedalDef[] = [];
  for (const id of ev) {
    if (!MEDAL_BY_ID[id]) continue;
    if (profile.medals.includes(id)) continue;
    profile.medals.push(id);
    newMedals.push(MEDAL_BY_ID[id]);
  }

  const after = rankFor(profile.xp);
  saveProfile(profile);
  return {
    xp,
    money,
    score: s.score,
    multiplier: s.missionDone ? streakMult : 1,
    newMedals,
    rankUp: after.index > before.index,
    newRank: after.def,
    progress: after.progress,
    breakdown,
  };
}
