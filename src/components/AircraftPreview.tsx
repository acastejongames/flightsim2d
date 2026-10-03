import { useEffect, useRef } from 'react';
import type { AircraftSpec } from '../game/aircraft';
import { drawAircraft } from '../game/sprites';

export default function AircraftPreview({ spec, className = '' }: { spec: AircraftSpec; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 260;
    const h = 120;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const s = (w * 0.78) / spec.length;
    ctx.save();
    ctx.translate(w / 2 + 6, h / 2 + 8);
    ctx.rotate(-0.06);
    ctx.scale(s, -s);
    drawAircraft(ctx, spec, {
      gear: 1,
      flaps: 0,
      hook: 0,
      thrust: 0.35,
      phase: 0.7,
      time: 0.4,
      night: false,
      light: [1, 1, 1],
      crashed: false,
    });
    ctx.restore();
  }, [spec]);

  return <canvas ref={ref} className={className} style={{ width: 260, height: 120 }} />;
}
