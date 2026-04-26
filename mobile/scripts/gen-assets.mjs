// Generates icon.png, splash-icon.png, adaptive-icon.png from SVG
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '../assets');

const BG = '#FAFAF7';
const INK = '#0B0B0E';
const LIQUID = '#6EC6E8';

function buildWave(innerL, innerR, innerB, liquidY, amp, freq, offset) {
  const segs = 24;
  let d = `M ${innerL} ${innerB} L ${innerL} ${liquidY}`;
  for (let i = 0; i <= segs; i++) {
    const x = innerL + (innerR - innerL) * (i / segs);
    const y = liquidY + Math.sin((i / segs) * Math.PI * 2 * freq + offset) * amp;
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  d += ` L ${innerR} ${innerB} Z`;
  return d;
}

// Builds the inner SVG content for the jar, in the 100×160 coordinate system
function jarContent(fillRatio) {
  const padX = 6, lipY = 6;
  const innerL = padX, innerR = 100 - padX;
  const innerT = lipY + 4;
  const innerB = 160 - 6;
  const innerH = innerB - innerT;
  const liquidY = innerB - innerH * Math.max(0, Math.min(1, fillRatio));

  const wave1 = buildWave(innerL, innerR, innerB, liquidY, 1.6, 1.4, 0.6);
  const wave2 = buildWave(innerL, innerR, innerB, liquidY, 1.0, 2.1, 1.9);
  const surf = `M ${innerL + 4} ${liquidY - 0.5} Q ${(innerL + innerR) / 2} ${liquidY - 2.5} ${innerR - 4} ${liquidY - 0.5}`;

  return `
    <defs>
      <clipPath id="jc">
        <rect x="${innerL}" y="${innerT}" width="${innerR - innerL}" height="${innerB - innerT}" rx="8" ry="8"/>
      </clipPath>
      <linearGradient id="jg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${LIQUID}" stop-opacity="0.62"/>
        <stop offset="100%" stop-color="${LIQUID}" stop-opacity="0.88"/>
      </linearGradient>
    </defs>
    <!-- glass outline -->
    <rect x="${padX - 2}" y="${lipY}" width="${100 - (padX - 2) * 2}" height="${160 - lipY - 2}"
      rx="10" ry="10" fill="none" stroke="${INK}" stroke-opacity="0.14" stroke-width="1.2"/>
    <!-- inner bg -->
    <rect x="${innerL}" y="${innerT}" width="${innerR - innerL}" height="${innerB - innerT}"
      rx="8" ry="8" fill="${BG}" stroke="${INK}" stroke-opacity="0.06" stroke-width="0.8"/>
    <!-- liquid -->
    <g clip-path="url(#jc)">
      <path d="${wave1}" fill="url(#jg)"/>
      <path d="${wave2}" fill="${LIQUID}" fill-opacity="0.2"/>
      <path d="${surf}" fill="none" stroke="white" stroke-opacity="0.45" stroke-width="0.7"/>
    </g>
    <!-- glass sheen -->
    <rect x="${innerL + 1.5}" y="${innerT + 4}" width="2" height="${innerH - 12}"
      fill="white" fill-opacity="0.55" rx="1"/>
    <!-- cap -->
    <rect x="${padX - 4}" y="${lipY - 4}" width="${100 - (padX - 4) * 2}" height="4"
      rx="2" fill="${INK}" opacity="0.5"/>`;
}

// Wraps jar content in a full-canvas SVG, centered with given scale
function makeSvg(canvasW, canvasH, jarScaleOfHeight, fillRatio) {
  const vW = 100, vH = 160;
  const scale = (canvasH * jarScaleOfHeight) / vH;
  const jarW = vW * scale;
  const jarH = vH * scale;
  const tx = (canvasW - jarW) / 2;
  const ty = (canvasH - jarH) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
  <rect width="${canvasW}" height="${canvasH}" fill="${BG}"/>
  <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${scale.toFixed(5)})">
    ${jarContent(fillRatio)}
  </g>
</svg>`;
}

function toPng(svg, outPath, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const img = resvg.render();
  writeFileSync(outPath, img.asPng());
  console.log(`✓  ${outPath}`);
}

// icon.png — 1024×1024, jar at 58% of canvas height, 62% fill
toPng(makeSvg(1024, 1024, 0.58, 0.62), join(ASSETS, 'icon.png'), 1024);

// splash-icon.png — 1024×1024, jar slightly smaller for breathing room
toPng(makeSvg(1024, 1024, 0.48, 0.62), join(ASSETS, 'splash-icon.png'), 1024);

// adaptive-icon.png — 1024×1024, jar smaller (fits in 66% safe circle)
toPng(makeSvg(1024, 1024, 0.40, 0.62), join(ASSETS, 'adaptive-icon.png'), 1024);

console.log('\nDone. All assets written to assets/');
