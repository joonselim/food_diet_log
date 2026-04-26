import React, { useEffect, useRef, useState } from 'react';
import Svg, { Rect, Path, G, Defs, ClipPath, LinearGradient, Stop, Ellipse } from 'react-native-svg';
import { BRIM } from '../theme';

interface Props {
  progress?: number;
  width?: number;
  height?: number;
  color?: string;       // glass outline color
  liquidColor?: string; // liquid fill color (defaults to color)
  bg?: string;
  animateKey?: unknown;
  showWaves?: boolean;
  cap?: boolean;
  speed?: number;
}

export function GlassJar({
  progress = 0.5,
  width = 220,
  height = 320,
  color = BRIM.ink,
  liquidColor,
  bg = BRIM.paper,
  animateKey,
  showWaves = true,
  cap = false,
  speed = 1,
}: Props) {
  const fill = liquidColor ?? color;
  const p = Math.max(0, Math.min(1.05, progress));
  const [animP, setAnimP] = useState(0);
  const [phase, setPhase] = useState(0);

  // Unique IDs per instance so multiple jars on screen don't share clip/gradient
  const uid = React.useId().replace(/:/g, '');
  const clipId = `jc${uid}`;
  const gradId = `jg${uid}`;

  // Fill animation
  useEffect(() => {
    const start = performance.now();
    const dur = 1400;
    let raf: number;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setAnimP(p * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animateKey, p]);

  // Wave phase loop (only when waves enabled)
  useEffect(() => {
    if (!showWaves) return;
    let raf: number;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      setPhase((ph) => ph + dt * 0.0012 * speed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showWaves, speed]);

  // SVG geometry (in 100×160 viewBox units)
  const W = 100, H = 160;
  const padX = 6;
  const lipY = 6;
  const innerL = padX, innerR = W - padX;
  const innerT = lipY + 4;
  const innerB = H - 6;
  const innerH = innerB - innerT;

  const fillRatio = Math.min(1, animP);
  const liquidY = innerB - innerH * fillRatio;

  const buildWave = (amp: number, freq: number, offset: number) => {
    const segs = 24;
    let d = `M ${innerL} ${innerB} L ${innerL} ${liquidY}`;
    for (let i = 0; i <= segs; i++) {
      const x = innerL + (innerR - innerL) * (i / segs);
      const y = liquidY + Math.sin((i / segs) * Math.PI * 2 * freq + phase + offset) * amp;
      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    d += ` L ${innerR} ${innerB} Z`;
    return d;
  };

  const wave1 = buildWave(1.6, 1.4, 0);
  const wave2 = buildWave(1.0, 2.1, Math.PI / 2);
  const overflow = animP > 1;

  const surfacePath = fillRatio > 0
    ? `M ${innerL + 4} ${liquidY - 0.5} Q ${(innerL + innerR) / 2} ${liquidY - 2.5} ${innerR - 4} ${liquidY - 0.5}`
    : '';

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width={width} height={height}>
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={innerL} y={innerT} width={innerR - innerL} height={innerB - innerT} rx={8} ry={8} />
        </ClipPath>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={fill} stopOpacity={0.65} />
          <Stop offset="100%" stopColor={fill} stopOpacity={0.88} />
        </LinearGradient>
      </Defs>

      {/* Glass outline */}
      <Rect
        x={padX - 2} y={lipY}
        width={W - (padX - 2) * 2} height={H - lipY - 2}
        rx={10} ry={10}
        fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={1.2}
      />
      {/* Inner bg */}
      <Rect
        x={innerL} y={innerT}
        width={innerR - innerL} height={innerB - innerT}
        rx={8} ry={8}
        fill={bg} stroke={color} strokeOpacity={0.08} strokeWidth={0.8}
      />

      {/* Liquid */}
      {fillRatio > 0 && (
        <G clipPath={`url(#${clipId})`}>
          <Path d={wave1} fill={`url(#${gradId})`} />
          {showWaves && <Path d={wave2} fill={fill} fillOpacity={0.22} />}
          {surfacePath ? (
            <Path d={surfacePath} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.7} />
          ) : null}
        </G>
      )}

      {/* Glass highlight sheen */}
      <Rect x={innerL + 1.5} y={innerT + 4} width={2} height={innerH - 12} fill="#fff" fillOpacity={0.5} rx={1} />

      {/* Cap */}
      {cap && (
        <Rect x={padX - 4} y={lipY - 4} width={W - (padX - 4) * 2} height={4} rx={2} fill={color} opacity={0.8} />
      )}

      {/* Overflow ring */}
      {overflow && (
        <Ellipse
          cx={W / 2} cy={lipY - 2}
          rx={(W / 2) - padX + 2} ry={1.5}
          fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={0.6}
        />
      )}
    </Svg>
  );
}
