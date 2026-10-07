import { clamp, hash } from './noise';
import { getAirport, terrainHeight } from './world';
import type { WorldMode } from './world';
import type { WeatherId } from './weather';
import { t2 } from './i18n';
import type { IconName } from '../components/Ico';

export type MissionKind =
  | 'ferry'
  | 'tour'
  | 'precision'
  | 'urgent'
  | 'sar'
  | 'survey'
  | 'trial'
  | 'carrierQual'
  | 'crosswind'
  | 'delivery';

export interface Gate {
  x: number;
  y: number;
  r: number;
  label: string;
  kind: 'gate' | 'beacon';
  /** if set, the gate only counts below this AGL (metres) — low level work */
  maxAgl?: number;
  passed: boolean;
}

export interface SarMeta {
  /** centre of the search datum broadcast on the radio */
  datumX: number;
  /** actual position of the raft / boat */
  targetX: number;
  /** radius of the datum uncertainty circle (metres) */
  searchRadius: number;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  difficulty: number; // 1..5
  titleEn: string;
  titleEs: string;
  briefEn: string;
  briefEs: string;
  gates: Gate[];
  /** airport id to land at, null = anywhere */
  landingAirport: number | null;
  mustTrap: boolean;
  trapsRequired: number;
  timeLimit: number | null;
  parTime: number | null;
  ceilAgl: number | null;
  money: number;
  xp: number;
  weather: WeatherId;
  /** generous sink limit for a "clean" landing, if the contract checks it */
  sinkLimit: number | null;
  /** landing inside this distance of the runway centre for precision work */
  zoneRadius: number | null;
  returnToStart: boolean;
  /** maritime SAR: datum + hidden raft, rendered as sea */
  sar?: SarMeta;
}

export interface MissionCtx {
  x: number;
  y: number;
  agl: number;
  ias: number;
  grounded: boolean;
  onDeck: boolean;
  alive: boolean;
  time: number;
}

export interface MissionEvent {
  en: string;
  es: string;
  subEn?: string;
  subEs?: string;
  kind: 'info' | 'good' | 'warn' | 'bad';
}

export interface LandingInfo {
  x: number;
  sink: number;
  airportId: number | null;
  onRunway: boolean;
  surface: string;
}

const TYPE_LABELS: Record<MissionKind, { en: string; es: string; icon: IconName }> = {
  ferry: { en: 'Ferry flight', es: 'Traslado', icon: 'prop' },
  delivery: { en: 'Cargo delivery', es: 'Transporte de carga', icon: 'crate' },
  tour: { en: 'Sightseeing tour', es: 'Vuelo turístico', icon: 'map' },
  precision: { en: 'Precision landing', es: 'Aterrizaje de precisión', icon: 'target' },
  urgent: { en: 'Urgent medevac', es: 'Evacuación urgente', icon: 'cross-med' },
  sar: { en: 'Search & rescue', es: 'Búsqueda y rescate', icon: 'radar' },
  survey: { en: 'Low level survey', es: 'Inspección a baja cota', icon: 'route' },
  trial: { en: 'Time trial', es: 'Contrarreloj', icon: 'clock' },
  carrierQual: { en: 'Carrier qualification', es: 'Cualificación en portaaviones', icon: 'anchor' },
  crosswind: { en: 'Crosswind check ride', es: 'Examen de viento cruzado', icon: 'crosswind' },
};

export const missionIcon = (k: MissionKind): string => TYPE_LABELS[k].icon;

function pickWeather(kind: MissionKind, difficulty: number, roll: number): WeatherId {
  if (kind === 'crosswind') return 'crosswind';
  if (kind === 'carrierQual') return roll < 0.5 ? 'breezy' : roll < 0.8 ? 'overcast' : 'rain';
  if (kind === 'sar') return roll < 0.35 ? 'overcast' : roll < 0.6 ? 'rain' : roll < 0.8 ? 'storm' : 'fog';
  if (kind === 'survey') return roll < 0.4 ? 'breezy' : roll < 0.7 ? 'overcast' : 'rain';
  if (kind === 'urgent') return roll < 0.4 ? 'rain' : roll < 0.7 ? 'overcast' : 'storm';
  if (difficulty >= 4) return roll < 0.4 ? 'storm' : roll < 0.7 ? 'rain' : roll < 0.85 ? 'fog' : 'snow';
  if (difficulty >= 3) return roll < 0.35 ? 'rain' : roll < 0.6 ? 'overcast' : roll < 0.8 ? 'breezy' : 'crosswind';
  return roll < 0.5 ? 'clear' : roll < 0.8 ? 'breezy' : 'overcast';
}

export interface GenOpts {
  mode: WorldMode;
  x: number;
  seed: number;
  rankIndex: number;
  /** forced kind (e.g. daily contract) */
  kind?: MissionKind;
  weather?: WeatherId;
}

export function generateMission(o: GenOpts): Mission {
  const r = (n: number) => hash(o.seed * 1.37 + n * 3.11);
  const kind: MissionKind =
    o.kind ??
    (o.mode === 'carrier'
      ? 'carrierQual'
      : (['ferry', 'delivery', 'tour', 'precision', 'urgent', 'sar', 'survey', 'trial', 'crosswind'] as MissionKind[])[
          Math.floor(r(1) * 9) % 9
        ]);

  const difficulty = clamp(1 + Math.floor(r(2) * 3) + Math.floor(o.rankIndex / 2), 1, 5);
  const weather = o.weather ?? pickWeather(kind, difficulty, r(3));
  const gates: Gate[] = [];

  const groundAt = (x: number) => (o.mode === 'carrier' ? 0 : Math.max(0, terrainHeight(x, o.mode)));
  const dir = r(4) > 0.5 ? 1 : -1;

  const addGates = (count: number, spread: number, altMin: number, altMax: number, maxAgl?: number, kindG: Gate['kind'] = 'gate') => {
    for (let i = 0; i < count; i++) {
      const x = o.x + dir * (spread * (0.35 + i) + r(10 + i) * spread * 0.5);
      const g = groundAt(x);
      const y = g + altMin + r(20 + i) * (altMax - altMin);
      gates.push({ x, y, r: kindG === 'beacon' ? 420 : 190 + difficulty * 25, label: `WP${i + 1}`, kind: kindG, maxAgl, passed: false });
    }
  };

  // pick a destination airport a couple of sectors away
  const sector = Math.max(1, Math.round(1 + r(5) * 2 + o.rankIndex * 0.2));
  const dest = getAirport(Math.round(o.x / 16000) + dir * sector);
  const home = getAirport(Math.round(o.x / 16000));

  let landingAirport: number | null = dest.id;
  let mustTrap = false;
  let trapsRequired = 0;
  let timeLimit: number | null = null;
  let parTime: number | null = null;
  let ceilAgl: number | null = null;
  let sinkLimit: number | null = null;
  let zoneRadius: number | null = null;
  let returnToStart = false;
  let briefEn = '';
  let briefEs = '';
  let titleEn = TYPE_LABELS[kind].en;
  let titleEs = TYPE_LABELS[kind].es;

  const distKm = (Math.abs(dest.x - o.x) / 1000).toFixed(0);

  switch (kind) {
    case 'ferry':
      titleEn = `Ferry flight to ${dest.name}`;
      titleEs = `Traslado a ${dest.name}`;
      briefEn = `Reposition the aircraft. Fly ${distKm} km and land at ${dest.name}. Keep it smooth — nobody likes a bent aeroplane.`;
      briefEs = `Reposiciona el avión. Vuela ${distKm} km y aterriza en ${dest.name}. Sin sustos: a nadie le gustan los aviones doblados.`;
      break;
    case 'delivery':
      titleEn = `Cargo to ${dest.name}`;
      titleEs = `Carga a ${dest.name}`;
      briefEn = `Haul medical supplies ${distKm} km to ${dest.name} and land. Extra pay for arriving early.`;
      briefEs = `Lleva suministros médicos ${distKm} km hasta ${dest.name} y aterriza. Paga extra si llegas pronto.`;
      timeLimit = 420 + Math.abs(dest.x - o.x) / 55;
      break;
    case 'tour':
      addGates(3 + Math.floor(r(6) * 2), 2600, 260, 900);
      returnToStart = true;
      landingAirport = home.id;
      titleEn = 'Sightseeing tour';
      titleEs = 'Vuelo turístico';
      briefEn = 'Show the passengers the scenery: fly through every waypoint, then bring them home in one piece.';
      briefEs = 'Enseña el paisaje a los pasajeros: pasa por todas las balizas y vuelve a casa de una pieza.';
      break;
    case 'precision':
      sinkLimit = 1.4;
      zoneRadius = 130;
      titleEn = `Precision landing at ${dest.name}`;
      titleEs = `Aterrizaje de precisión en ${dest.name}`;
      briefEn = `Touch down inside the marked zone, softer than 1.4 m/s, on the centreline. You are being graded.`;
      briefEs = `Toma contacto dentro de la zona marcada, con menos de 1,4 m/s y sobre el eje. Te están evaluando.`;
      break;
    case 'urgent':
      timeLimit = 60 + Math.abs(dest.x - o.x) / 52;
      titleEn = `Medevac to ${dest.name}`;
      titleEs = `Evacuación a ${dest.name}`;
      briefEn = `A patient is waiting. Reach ${dest.name} within ${Math.round(timeLimit / 60)} minutes and land. Weather is not on your side.`;
      briefEs = `Hay un paciente esperando. Llega a ${dest.name} en ${Math.round(timeLimit / 60)} minutos y aterriza. El tiempo no ayuda.`;
      break;
    case 'sar': {
      // maritime search: datum is the last known position, the raft has drifted
      // somewhere inside the uncertainty circle. Two gates: a large DATUM disc
      // you have to enter to start the search, and the hidden RAFT beacon you
      // must overfly low to spot. The after-spot drop is handled by MissionRun.
      const baseDist = 7800 + r(7) * 5200; // 7.8–13 km from departure
      const datumX = o.x + dir * baseDist;
      const searchRadius = Math.round(1400 + difficulty * 320 + r(8) * 650);
      // raft drifts inside ~75 % of the datum circle
      const off = (r(9) - 0.5) * searchRadius * 1.35;
      const targetX = datumX + off;
      const datumGate: Gate = { x: datumX, y: 260, r: searchRadius, label: 'DATUM', kind: 'gate', maxAgl: 520, passed: false };
      const raftGate: Gate = { x: targetX, y: 10, r: 340, label: 'RAFT', kind: 'beacon', maxAgl: 380, passed: false };
      gates.push(datumGate, raftGate);
      returnToStart = true;
      landingAirport = home.id;
      timeLimit = 900 + Math.abs(targetX - o.x) / 48;
      titleEn = 'SAR: overdue boat';
      titleEs = 'SAR: embarcación perdida';
      briefEn = `A boat is missing. Last datum ${ (searchRadius/1000).toFixed(1)} km wide, ${Math.round(Math.abs(targetX-datumX)/1000*10)/10} km off datum. Enter DATUM, spot the raft below 380 m, drop the survival kit (D) and return to ${home.name}.`;
      briefEs = `Falta una embarcación. Último datum de ${(searchRadius/1000).toFixed(1)} km, balsa a ${Math.round(Math.abs(targetX-datumX)/1000*10)/10} km del centro. Entra en DATUM, localiza la balsa por debajo de 380 m, suelta el kit (D) y vuelve a ${home.name}.`;
      // stash for renderer / sea patch / drop scoring
      (globalThis as any).__sarTmp = { datumX, targetX, searchRadius };
      break;
    }
    case 'survey':
      addGates(3, 2200, 90, 160);
      ceilAgl = 320;
      landingAirport = home.id;
      titleEn = 'Pipeline survey';
      titleEs = 'Inspección de tubería';
      briefEn = 'Photograph the line: pass every waypoint below 320 m AGL. Climb above it and the contract is void.';
      briefEs = 'Fotografía la línea: pasa cada baliza por debajo de 320 m AGL. Si subes más, el contrato se anula.';
      break;
    case 'trial':
      addGates(4, 2000, 200, 700);
      parTime = 200 + Math.abs(gates[gates.length - 1].x - o.x) / 45;
      timeLimit = parTime * 1.6;
      returnToStart = true;
      landingAirport = home.id;
      titleEn = 'Timed navigation trial';
      titleEs = 'Prueba de navegación cronometrada';
      briefEn = `Beat the clock: ${Math.round(parTime)} s to clear the course, then land. Money for every second under par.`;
      briefEs = `Contra el reloj: ${Math.round(parTime)} s para completar el circuito y aterrizar. Paga por cada segundo bajo par.`;
      break;
    case 'crosswind':
      sinkLimit = 3.2;
      titleEn = `Crosswind check to ${dest.name}`;
      titleEs = `Examen con viento cruzado a ${dest.name}`;
      briefEn = 'A grumpy examiner wants to see a clean centreline landing in this crosswind. Rudder (J/L), small corrections.';
      briefEs = 'Un examinador gruñón quiere ver un aterrizaje limpio sobre el eje con este viento cruzado. Timón (J/L) y correcciones finas.';
      break;
    case 'carrierQual': {
      mustTrap = true;
      trapsRequired = o.rankIndex >= 3 ? 2 : 1;
      addGates(2, 2600, 180, 500);
      landingAirport = null;
      titleEn = 'Carrier qualification';
      titleEs = 'Cualificación en portaaviones';
      briefEn = `Launch from the cat, fly the pattern waypoints and trap ${trapsRequired} wire${trapsRequired > 1 ? 's' : ''}. The ship is doing 30 kt.`;
      briefEs = `Sal con la catapulta, pasa las balizas del circuito y engancha ${trapsRequired} cable${trapsRequired > 1 ? 's' : ''}. El buque va a 30 nudos.`;
      break;
    }
  }

  const missionDist = Math.abs((landingAirport !== null ? getAirport(landingAirport).x : o.x + 3000) - o.x) + gates.length * 2200;
  const wxFactor: Record<string, number> = { clear: 0.85, breezy: 1, crosswind: 1.25, overcast: 1.05, rain: 1.3, storm: 1.8, fog: 1.45, snow: 1.5, dynamic: 1.2 };
  const money = Math.round((900 + missionDist * 0.09 + difficulty * 550) * (wxFactor[weather] ?? 1));
  const xp = Math.round((120 + missionDist * 0.014 + difficulty * 85) * (wxFactor[weather] ?? 1));

  const sarTmp: SarMeta | undefined = (globalThis as any).__sarTmp ? { datumX: (globalThis as any).__sarTmp.datumX, targetX: (globalThis as any).__sarTmp.targetX, searchRadius: (globalThis as any).__sarTmp.searchRadius } : undefined;
  if ((globalThis as any).__sarTmp) delete (globalThis as any).__sarTmp;
  // SAR money is a bit richer: danger + precision drop
  let finalMoney = money;
  let finalXp = xp;
  if (sarTmp) {
    finalMoney = Math.round(money * 1.35 + 600);
    finalXp = Math.round(xp * 1.25 + 120);
  }
  return {
    id: `m${o.seed.toFixed(0)}-${kind}`,
    kind,
    difficulty,
    titleEn,
    titleEs,
    briefEn,
    briefEs,
    gates,
    landingAirport,
    mustTrap,
    trapsRequired,
    timeLimit: timeLimit ? Math.round(timeLimit) : null,
    parTime: parTime ? Math.round(parTime) : null,
    ceilAgl,
    money: finalMoney,
    xp: finalXp,
    weather,
    sinkLimit,
    zoneRadius,
    returnToStart,
    ...(sarTmp ? { sar: sarTmp } : {}),
  };
}

export function missionBrief(m: Mission, lang: 'en' | 'es'): { title: string; brief: string } {
  return { title: lang === 'es' ? m.titleEs : m.titleEn, brief: lang === 'es' ? m.briefEs : m.briefEn };
}

export function sarDropGrade(dist: number): { en: string; es: string; bonus: number } {
  if (dist < 18) return { en: 'PERFECT DROP', es: 'LANZAMIENTO PERFECTO', bonus: 900 };
  if (dist < 48) return { en: 'GOOD DROP', es: 'BUEN LANZAMIENTO', bonus: 560 };
  if (dist < 90) return { en: 'FAIR DROP', es: 'LANZAMIENTO ACEPTABLE', bonus: 280 };
  if (dist < 160) return { en: 'POOR DROP', es: 'LANZAMIENTO FLOJO', bonus: 90 };
  return { en: 'MISS', es: 'FALLO', bonus: 0 };
}

export function objectiveText(m: Mission, gatesLeft: number, lang: 'en' | 'es'): string {
  const L = (en: string, es: string) => (lang === 'es' ? es : en);
  if (m.mustTrap) return L(`Trap the wire (${gatesLeft} waypoints left)`, `Engancha el cable (quedan ${gatesLeft} balizas)`);
  if (gatesLeft > 0) {
    if (m.ceilAgl) return L(`${gatesLeft} waypoints left · stay below ${m.ceilAgl} m`, `Quedan ${gatesLeft} balizas · por debajo de ${m.ceilAgl} m`);
    if (m.kind === 'sar' && m.sar) {
      const datumDone = m.gates[0]?.passed;
      const raftDone = m.gates[1]?.passed;
      if (!datumDone) return L('Reach DATUM — start the search', 'Llega a DATUM y empieza la búsqueda');
      if (!raftDone) return L('Search DATUM — spot the raft below 380 m', 'Rastrea DATUM: localiza la balsa por debajo de 380 m');
      return L('Raft spotted — drop the kit (D)', 'Balsa localizada: suelta el kit (D)');
    }
    if (m.kind === 'sar') return L('Find the boat (fly below 400 m)', 'Localiza la embarcación (por debajo de 400 m)');
    return L(`${gatesLeft} waypoints left`, `Quedan ${gatesLeft} balizas`);
  }
  if (m.landingAirport !== null) {
    const ap = getAirport(m.landingAirport);
    return L(`Land at ${ap.name}`, `Aterriza en ${ap.name}`);
  }
  return L('Complete the mission', 'Completa la misión');
}

export class MissionRun {
  mission: Mission;
  idx = 0;
  status: 'active' | 'done' | 'failed' = 'active';
  failEn = '';
  failEs = '';
  elapsed = 0;
  bonus = 0;
  gatesHit = 0;
  trapsDone = 0;
  violations = 0;
  private violationTimer = 0;
  private missTimer = new Map<number, number>();
  pending: MissionEvent[] = [];
  endReason = '';
  // SAR state: raft spotted = gates[1].passed, kit drop scoring
  sarSpotted = false;
  sarDropDone = false;
  sarDropDist: number | null = null;
  sarDropBonus = 0;
  sarDropGradeEn = '';
  sarDropGradeEs = '';

  constructor(m: Mission) {
    this.mission = m;
  }

  get objectiveIndex(): number {
    return this.idx;
  }

  get nextGate(): Gate | null {
    return this.mission.gates.find((g) => !g.passed) ?? null;
  }

  get timeLeft(): number | null {
    if (this.mission.timeLimit === null) return null;
    return Math.max(0, this.mission.timeLimit - this.elapsed);
  }

  private push(e: MissionEvent) {
    this.pending.push(e);
  }

  private fail(en: string, es: string) {
    this.status = 'failed';
    this.failEn = en;
    this.failEs = es;
    this.endReason = 'failed';
    this.push({ en, es, kind: 'bad' });
  }

  update(dt: number, ctx: MissionCtx): void {
    if (this.status !== 'active') return;
    this.elapsed += dt;
    const m = this.mission;

    // time limit
    if (m.timeLimit !== null && this.elapsed > m.timeLimit) {
      this.fail('Out of time', 'Se acabó el tiempo');
      return;
    }
    if (!ctx.alive) return;

    // gate capture
    for (const g of m.gates) {
      if (g.passed) continue;
      const dx = ctx.x - g.x;
      const dy = ctx.y - g.y;
      const inRange = dx * dx + dy * dy < g.r * g.r;
      const lowEnough = g.maxAgl === undefined || ctx.agl < g.maxAgl;
      if (inRange && lowEnough) {
        g.passed = true;
        this.idx++;
        this.gatesHit++;
        const isLast = m.gates.every((q) => q.passed);
        if (g.kind === 'beacon') {
          if (m.kind === 'sar' && m.sar) {
            // raft spotted — this is the maritime search
            this.sarSpotted = true;
            this.bonus += 550;
            this.push({
              en: 'RAFT SPOTTED', es: 'BALSA LOCALIZADA',
              subEn: 'Drop the survival kit (press D) then return to base', subEs: 'Suelta el kit de supervivencia (pulsa D) y vuelve a la base',
              kind: 'good',
            });
          } else {
            this.bonus += 400;
            this.push({
              en: 'TARGET FOUND', es: 'OBJETIVO LOCALIZADO',
              subEn: 'Beacon confirmed. Return to base and land.', subEs: 'Baliza confirmada. Vuelve a la base y aterriza.',
              kind: 'good',
            });
          }
        } else {
          if (m.kind === 'sar' && g.label === 'DATUM') {
            this.bonus += 180;
            this.push({
              en: 'DATUM REACHED — SEARCH THE AREA', es: 'DATUM ALCANZADO: RASTREA LA ZONA',
              subEn: 'Raft is somewhere inside the circle — stay below 380 m', subEs: 'La balsa está dentro del círculo: mantente por debajo de 380 m',
              kind: 'good',
            });
          } else {
            this.bonus += 120;
            this.push({
              en: `WAYPOINT ${this.idx} CLEAR`, es: `BALIZA ${this.idx} SUPERADA`,
              subEn: isLast && m.landingAirport !== null ? 'Now head for the airfield' : '',
              subEs: isLast && m.landingAirport !== null ? 'Ahora dirígete al aeródromo' : '',
              kind: 'good',
            });
          }
        }
      } else if (!inRange && !lowEnough) {
        // flew over the beacon too high
        const key = g.x;
        const t = (this.missTimer.get(key) ?? 0) + dt;
        this.missTimer.set(key, t);
        if (t > 2.5 && t - dt <= 2.5 && g.kind === 'beacon') {
          this.push({
            en: 'TOO HIGH TO SPOT IT', es: 'DEMASIADO ALTO PARA VERLO',
            subEn: 'Descend below 400 m and try again', subEs: 'Baja por debajo de 400 m e inténtalo otra vez',
            kind: 'warn',
          });
        }
      }
    }

    // ceiling violation (survey)
    if (m.ceilAgl !== null && this.gatesHit < m.gates.length) {
      if (ctx.agl > m.ceilAgl) {
        this.violationTimer += dt;
        if (this.violationTimer > 6) {
          this.fail('Climbed above the survey ceiling', 'Subiste por encima del techo de la inspección');
          return;
        }
      } else this.violationTimer = Math.max(0, this.violationTimer - dt * 2);
    }

    // all gates done and no landing target → complete (SAR still needs the drop + landing)
    if (m.gates.length > 0 && this.gatesHit >= m.gates.length && m.landingAirport === null && !m.mustTrap) {
      if (m.kind === 'sar' && m.sar) {
        if (!this.sarDropDone) return; // must drop the kit first
      }
      this.complete();
    }
    // SAR hint: raft spotted but no drop yet — nudge the player
    if (m.kind === 'sar' && this.sarSpotted && !this.sarDropDone && Math.floor(this.elapsed) % 20 === 0 && Math.floor((this.elapsed - dt) % 20) !== 0) {
      // throttled hint handled elsewhere; keep lightweight
    }
  }

  /** SAR kit drop scoring */
  onDrop(dist: number): void {
    if (this.status !== 'active' || this.sarDropDone) return;
    if (!this.sarSpotted) {
      this.push({ en: 'Nothing to drop yet — find the raft first', es: 'Nada que lanzar: primero localiza la balsa', kind: 'warn' });
      return;
    }
    const g = sarDropGrade(dist);
    this.sarDropDone = true;
    this.sarDropDist = dist;
    this.sarDropBonus = g.bonus;
    this.sarDropGradeEn = g.en;
    this.sarDropGradeEs = g.es;
    this.bonus += g.bonus;
    const kind: MissionEvent['kind'] = g.bonus >= 500 ? 'good' : g.bonus >= 250 ? 'good' : g.bonus > 0 ? 'info' : 'warn';
    this.push({
      en: g.en, es: g.es,
      subEn: `${dist.toFixed(0)} m from the raft · +${g.bonus} bonus`, subEs: `a ${dist.toFixed(0)} m de la balsa · +${g.bonus} bonus`,
      kind,
    });
    // once the kit is down the contract is essentially the return leg
    if (this.gatesHit >= this.mission.gates.length) {
      this.push({ en: 'Kit on the water — RTB and land', es: 'Kit en el agua: vuelve y aterriza', subEn: '', subEs: '', kind: 'good' });
    }
  }

  /** Call when the aircraft touches down. */
  onLanding(info: LandingInfo): void {
    if (this.status !== 'active') return;
    const m = this.mission;
    // SAR needs the kit on the water before you can close the contract
    if (m.kind === 'sar' && m.sar) {
      if (!this.sarSpotted) {
        this.push({ en: 'Raft not yet spotted — keep searching DATUM', es: 'Balsa aún no localizada: sigue en DATUM', kind: 'warn' });
        return;
      }
      if (!this.sarDropDone) {
        this.push({ en: 'Drop the survival kit before landing (D)', es: 'Suelta el kit antes de aterrizar (D)', kind: 'warn' });
        return;
      }
    }
    const gatesDone = m.gates.length === 0 || this.gatesHit >= m.gates.length;
    if (!gatesDone) {
      this.push({ en: 'Landing early — waypoints still pending', es: 'Aterrizaje prematuro: faltan balizas', kind: 'warn' });
      return;
    }
    if (m.landingAirport !== null && info.airportId !== m.landingAirport) {
      this.push({
        en: 'Wrong airfield', es: 'Aeródromo equivocado',
        subEn: `You must land at ${getAirport(m.landingAirport).name}`, subEs: `Debes aterrizar en ${getAirport(m.landingAirport).name}`,
        kind: 'warn',
      });
      return;
    }
    if (m.landingAirport !== null && !info.onRunway) {
      this.push({ en: 'Off the runway — go around', es: 'Fuera de pista: vuelve a intentarlo', kind: 'warn' });
      return;
    }
    if (m.sinkLimit !== null && info.sink > m.sinkLimit) {
      this.fail(`Landing too hard (${info.sink.toFixed(1)} m/s)`, `Aterrizaje demasiado duro (${info.sink.toFixed(1)} m/s)`);
      return;
    }
    if (m.zoneRadius !== null && m.landingAirport !== null) {
      const ap = getAirport(m.landingAirport);
      if (Math.abs(info.x - ap.x) > m.zoneRadius + 260) {
        this.fail('Missed the touchdown zone', 'Fallaste la zona de toma');
        return;
      }
      if (Math.abs(info.x - ap.x) <= m.zoneRadius) this.bonus += 500;
    }
    this.complete();
  }

  onTrap(grade: string): void {
    if (this.status !== 'active') return;
    if (!this.mission.mustTrap) {
      this.bonus += 300;
      this.push({ en: 'Nice trap', es: 'Buen enganche', kind: 'good' });
      return;
    }
    this.trapsDone++;
    this.bonus += 350;
    this.push({ en: `Trap ${this.trapsDone}/${this.mission.trapsRequired}`, es: `Enganche ${this.trapsDone}/${this.mission.trapsRequired}`, subEn: grade, subEs: grade, kind: 'good' });
    const gatesDone = this.mission.gates.length === 0 || this.gatesHit >= this.mission.gates.length;
    if (this.trapsDone >= this.mission.trapsRequired && gatesDone) this.complete();
  }

  private complete(): void {
    this.status = 'done';
    this.endReason = 'done';
    const m = this.mission;
    let timeBonus = 0;
    if (m.parTime !== null && this.elapsed < m.parTime) timeBonus = Math.round((m.parTime - this.elapsed) * 9);
    this.bonus += timeBonus;
    this.push({
      en: 'MISSION COMPLETE', es: 'MISIÓN COMPLETADA',
      subEn: `+${m.money + this.bonus} credits · +${m.xp} XP${timeBonus ? ` · ${timeBonus} time bonus` : ''}`,
      subEs: `+${m.money + this.bonus} créditos · +${m.xp} XP${timeBonus ? ` · ${timeBonus} de bonus` : ''}`,
      kind: 'good',
    });
  }

  totalMoney(): number {
    return Math.max(0, this.mission.money + (this.status === 'done' ? this.bonus : 0));
  }

  /** HUD text for the current objective */
  objective(lang: 'en' | 'es'): string {
    const m = this.mission;
    if (m.kind === 'sar' && m.sar) {
      if (this.status === 'active') {
        if (!m.gates[0].passed) return objectiveText(m, 2, lang);
        if (!m.gates[1].passed) return objectiveText(m, 1, lang);
        if (!this.sarDropDone) return lang === 'es' ? 'Balsa localizada: suelta el kit (D)' : 'Raft spotted — drop the kit (D)';
        if (m.landingAirport !== null) {
          const ap = getAirport(m.landingAirport);
          return lang === 'es' ? `Vuelve a ${ap.name} y aterriza` : `Return to ${ap.name} and land`;
        }
      }
    }
    const left = this.mission.gates.filter((g) => !g.passed).length;
    if (this.status === 'active') return objectiveText(this.mission, left, lang);
    if (this.status === 'done') return lang === 'es' ? 'Misión completada' : 'Mission complete';
    return lang === 'es' ? this.failEs || 'Misión fallida' : this.failEn || 'Mission failed';
  }
}

export const missionKindLabel = (k: MissionKind): string => t2(TYPE_LABELS[k].en, TYPE_LABELS[k].es);
