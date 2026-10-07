import { t2 } from '../game/i18n';

const ROWS: [string, string, string][] = [
  ['↑ / W   ↓ / S', 'Pitch up / down (elevator)', 'Morro arriba / abajo (profundidad)'],
  ['→ / D   ← / A', 'Throttle up / down (afterburner at the top on jets)', 'Acelerador (postcombustión arriba del todo en jets)'],
  ['J   L', 'Rudder left / right — de-crab and hold the centreline', 'Timón izquierda / derecha — quita la deriva y mantén el eje'],
  ['Z   X', 'Throttle idle / full', 'Acelerador a ralentí / a tope'],
  ['G', 'Landing gear', 'Tren de aterrizaje'],
  ['F', 'Flaps (up → takeoff → landing)', 'Flaps (arriba → despegue → aterrizaje)'],
  ['B (hold)', 'Wheel brakes / airbrake in flight', 'Frenos / aerofreno en vuelo'],
  ['C', 'Spoilers (air + ground braking, kill lift)', 'Spoilers (frenado aéreo y en tierra, matan sustentación)'],
  ['T (hold)', 'Turn around — hold it to keep reversing one turn after another', 'Girar 180°: mantén pulsado para encadenar giros'],
  ['H', 'Tailhook (carrier aircraft)', 'Gancho de apontaje'],
  ['SPACE', 'Fire the catapult / relaunch after a trap', 'Disparar la catapulta / relanzar tras un apontaje'],
  ['Y', 'Flight assist (auto-trim) on / off', 'Ayuda de vuelo (autotrim) on / off'],
  ['K', 'Autothrottle (holds airspeed)', 'Autothrottle (mantiene la velocidad)'],
  ['Q  E', 'Manual trim (assist off)', 'Trim manual (sin ayuda)'],
  ['O', 'Autopilot: hold this altitude', 'Piloto automático: mantener esta altitud'],
  ['N', 'Time warp ×1 → ×2 → ×4 (long flights)', 'Acelerar el tiempo ×1 → ×2 → ×4 (vuelos largos)'],
  ['D  /  SPACE', 'Drop SAR survival kit (when raft spotted)', 'Soltar el kit de supervivencia SAR (con la balsa a la vista)'],
  ['V', 'Aerobatic smoke trail on / off (PC-21 only)', 'Estela de humo acrobática on / off (solo PC-21)'],
  ['R', 'Respawn (nearest airfield or catapult)', 'Reaparecer (aeródromo o catapulta)'],
  ['TAB', 'Toggle the mission briefing panel', 'Mostrar/ocultar el panel de misión'],
  ['U', 'Sandbox environment tuner (wind, weather, time…)', 'Panel del entorno sandbox (viento, clima, hora…)'],
  ['+  −  /  wheel', 'Zoom', 'Zoom'],
  ['M', 'Mute', 'Silenciar'],
  ['P / ESC', 'Pause menu', 'Menú de pausa'],
];

/** The phone equivalent: two levers and a pad of chips. */
const TOUCH_ROWS: [string, string, string][] = [
  ['THR', 'Left lever: slide up or down to set the throttle. Absolute — it stays where you leave it.', 'Palanca izquierda: desliza arriba o abajo para dar gas. Es absoluta: se queda donde la dejas.'],
  ['PITCH', 'Right lever: the nose follows your thumb and springs back to neutral when you let go.', 'Palanca derecha: el morro sigue al pulgar y vuelve solo al centro al soltar.'],
  ['TAP', 'Gear, flaps, hook, spoilers, 180° turn, AP, time ×, smoke, respawn — tap to toggle.', 'Tren, flaps, gancho, spoilers, giro 180°, AP, tiempo ×, humo, reaparecer: toca para cambiar.'],
  ['HOLD', 'Brake and rudder chips: keep the thumb pressed while you need them.', 'Frenos y timón: mantén el pulgar pulsado mientras los necesites.'],
  ['PINCH', 'Pinch with two fingers anywhere on the sky to zoom in / out.', 'Pellizca con dos dedos en cualquier parte del cielo para acercar o alejar.'],
];

export default function Controls({ compact = false, touch = false }: { compact?: boolean; touch?: boolean }) {
  const rows = touch ? TOUCH_ROWS : ROWS;
  return (
    <div className={`grid gap-x-6 gap-y-1.5 ${compact ? 'text-xs' : 'text-sm'} sm:grid-cols-1`}>
      {rows.map(([k, en, es]) => (
        <div key={k + en} className="flex items-baseline gap-3">
          <span
            className={`shrink-0 bg-white/10 px-2 py-0.5 text-center font-mono text-[11px] font-semibold text-sky-100 ring-1 ring-white/10 ${
              touch ? 'w-16' : 'w-40'
            }`}
          >
            {k}
          </span>
          <span className="text-slate-300">{t2(en, es)}</span>
        </div>
      ))}
    </div>
  );
}
