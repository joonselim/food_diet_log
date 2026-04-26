export const BRIM = {
  ink: '#0B0B0E',
  ink2: '#3D3D44',
  mute: '#84848C',
  hair: 'rgba(11,11,14,0.08)',
  hair2: 'rgba(11,11,14,0.04)',
  paper: '#FAFAF7',
  card: '#FFFFFF',
  accent: '#3A7BDE',
  danger: '#B43A2E',
  liquid: '#8E9BA8',       // steel gray fill
  liquidFaint: '#B8C2CA',  // lighter for secondary macro jars
};

// Font family names — must match useFonts keys in App.tsx
export const F = {
  bold: 'Manrope_700Bold',
  semi: 'Manrope_600SemiBold',
  med: 'Manrope_500Medium',
  num: 'JetBrainsMono_500Medium',
  numSemi: 'JetBrainsMono_600SemiBold',
};

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtG = (n: number) => `${Math.round(n * 10) / 10}`;
