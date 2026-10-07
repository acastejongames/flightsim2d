import sharp from 'sharp';
import fs from 'fs';

const seatPart = `
  <g id="seat" transform="translate(27,110)">
    <rect x="24" y="8" width="28" height="8" rx="2.5" fill="#5b5e66" stroke="#363940" stroke-width="0.7"/>
    <rect x="28" y="14" width="10" height="30" rx="2" fill="#3c4046" stroke="#2a2d32" stroke-width="0.7"/>
    <rect x="28" y="40" width="34" height="10" rx="2.2" fill="#4c5058" stroke="#2a2d32" stroke-width="0.7"/>
    <rect x="28" y="49" width="34" height="2" rx="1" fill="#6a6e76"/>
    <rect x="29" y="20" width="7" height="16" rx="1.2" fill="#d0d3d8" stroke="#9aa0aa" stroke-width="0.5"/>
    <rect x="37" y="24" width="15" height="18" rx="2" fill="#6e7d3a" stroke="#3d4a1e" stroke-width="0.7"/>
    <line x1="40" y1="27" x2="49" y2="27" stroke="#1e2214" stroke-width="1.1" opacity="0.9"/>
    <line x1="40" y1="33" x2="49" y2="33" stroke="#1e2214" stroke-width="1.1" opacity="0.9"/>
    <rect x="42" y="28" width="12" height="6" rx="2" fill="#6e7d3a" stroke="#3d4a1e" stroke-width="0.5"/>
    <rect x="38" y="42" width="20" height="5.5" rx="1.8" fill="#6e7d3a" stroke="#3d4a1e" stroke-width="0.5"/>
    <rect x="56" y="42" width="6" height="5.5" rx="1" fill="#2f3336"/>
    <rect x="58" y="44" width="7" height="4" rx="1" fill="#1a1d20" stroke="#0f1113" stroke-width="0.4"/>
    <circle cx="45" cy="16.5" r="6" fill="#f3f3f7" stroke="#c2c4cc" stroke-width="0.6"/>
    <ellipse cx="45" cy="16.5" rx="4.8" ry="5.2" fill="#fafafc"/>
    <rect x="39" y="15.5" width="12" height="2.2" rx="0.7" fill="#2b2e34"/>
    <path d="M45 15 L52.5 15.8 L52.3 19.2 L45 18.6 Z" fill="#0e1113"/>
    <ellipse cx="48.2" cy="17.2" rx="3.8" ry="1.6" fill="#1c2126" opacity="0.95"/>
    <path d="M41 19.5 Q37 22 39 27" fill="none" stroke="#2b2e34" stroke-width="1.3" stroke-linecap="round"/>
    <rect x="45" y="39" width="8" height="2.8" rx="1" fill="#d4a017" stroke="#7a5a00" stroke-width="0.4"/>
  </g>
`;

function parachuteGores(cx, cy, rx, ry, apexX, apexY){
  let g='';
  for(let i=0;i<8;i++){
    const th0 = Math.PI - i*Math.PI/8;
    const th1 = Math.PI - (i+1)*Math.PI/8;
    const x0 = cx + rx*Math.cos(th0);
    const y0 = cy - ry*Math.sin(th0);
    const x1 = cx + rx*Math.cos(th1);
    const y1 = cy - ry*Math.sin(th1);
    const fill = i%2===1 ? '#ff7a28' : '#fafafc';
    g+=`<path d="M${apexX} ${apexY} L${x0.toFixed(2)} ${y0.toFixed(2)} A${rx} ${ry} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${fill}" stroke="#252830" stroke-width="0.65"/>\n`;
  }
  return g;
}

// Dome wider (rx 62) to get ~7 m canopy when combined height is ~7.5 m (aspect ~0.82)
const parachutePart = parachuteGores(70, 44, 62, 42, 70, 3) + `
  <path d="M8 44 A62 42 0 0 1 132 44" fill="none" stroke="#1a1e24" stroke-width="1.6"/>
  <ellipse cx="70" cy="3" rx="4.1" ry="2.5" fill="#0f1214" stroke="#2b2e36" stroke-width="0.7"/>
  <ellipse cx="70" cy="3" rx="1.7" ry="1.0" fill="#2a2e38"/>
`;

// Combined SVG: wider dome (124) + seat closer to reduce total height → aspect ~0.82 (≈7 m / 8.25 m)
const combinedSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="700" height="850" viewBox="0 0 140 170" xmlns="http://www.w3.org/2000/svg">
  <!-- parachute dome at top -->
  <g id="parachute">
    ${parachutePart}
  </g>
  <!-- suspension lines from canopy skirt to harness -->
  <!-- canopy skirt y=44, harness y ~122 (seat shoulders at 110+12) — lines start exactly at skirt -->
  <g stroke="#1e2026" stroke-width="1.2" stroke-linecap="round" opacity="0.98">
    <line x1="22" y1="44" x2="66" y2="122"/>
    <line x1="38" y1="44" x2="68" y2="122"/>
    <line x1="54" y1="44" x2="69" y2="122"/>
    <line x1="86" y1="44" x2="71" y2="122"/>
    <line x1="102" y1="44" x2="72" y2="122"/>
    <line x1="118" y1="44" x2="74" y2="122"/>
  </g>
  <!-- confluence point -->
  <ellipse cx="70" cy="122" rx="2.2" ry="1.6" fill="#1e2026"/>
  <!-- seat at bottom -->
  ${seatPart}
</svg>`;

async function gen(){
  await sharp(Buffer.from(combinedSVG)).png().toFile('public/images/eject_combined.png.tmp');
  await sharp('public/images/eject_combined.png.tmp').trim().png({compressionLevel:9}).toFile('public/images/eject_combined.png');
  console.log('combined', (await sharp('public/images/eject_combined.png').metadata()).width, (await sharp('public/images/eject_combined.png').metadata()).height, fs.statSync('public/images/eject_combined.png').size);
  try{fs.unlinkSync('public/images/eject_combined.png.tmp');}catch{}
}
gen().catch(e=>{console.error(e);process.exit(1);});
