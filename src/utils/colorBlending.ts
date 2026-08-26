import { PatchParameters, SelectedColorPoint } from '../types/synth';

export function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [128, 128, 128];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = [clamp(r), clamp(g), clamp(b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `#${hex}`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;

  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case nr:
        h = (ng - nb) / d + (ng < nb ? 6 : 0);
        break;
      case ng:
        h = (nb - nr) / d + 2;
        break;
      case nb:
        h = (nr - ng) / d + 4;
        break;
    }
    h /= 6;
  }

  return [Math.round(h * 360), s, l];
}

export function sampleGradientColor(
  palette: string[],
  pct: number
): { hex: string; rgb: [number, number, number] } {
  if (!palette || palette.length === 0) {
    return { hex: '#00F2FE', rgb: [0, 242, 254] };
  }

  if (palette.length === 1) {
    const rgb = hexToRgb(palette[0]);
    return { hex: palette[0], rgb };
  }

  const clampedPct = Math.max(0, Math.min(100, pct));
  const pos = (clampedPct / 100) * (palette.length - 1);
  const idx1 = Math.floor(pos);
  const idx2 = Math.min(palette.length - 1, Math.ceil(pos));
  const t = pos - idx1;

  const rgb1 = hexToRgb(palette[idx1]);
  const rgb2 = hexToRgb(palette[idx2]);

  const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t);
  const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t);
  const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t);

  const hex = rgbToHex(r, g, b);
  return { hex, rgb: [r, g, b] };
}

export function calculateBlendedPatch(
  baselinePatch: PatchParameters,
  selectedPoints: SelectedColorPoint[]
): PatchParameters {
  if (selectedPoints.length === 0) {
    return { ...baselinePatch };
  }

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  selectedPoints.forEach((p) => {
    totalR += p.rgb[0];
    totalG += p.rgb[1];
    totalB += p.rgb[2];
  });

  const count = selectedPoints.length;
  const avgR = Math.round(totalR / count);
  const avgG = Math.round(totalG / count);
  const avgB = Math.round(totalB / count);

  const [avgH, avgS, avgL] = rgbToHsl(avgR, avgG, avgB);

  // Hue variance between selected colors
  let hueVariance = 0;
  if (count > 1) {
    const hues = selectedPoints.map((p) => rgbToHsl(p.rgb[0], p.rgb[1], p.rgb[2])[0]);
    const avgHue = hues.reduce((a, b) => a + b, 0) / count;
    hueVariance = Math.sqrt(
      hues.reduce((sum, h) => sum + Math.pow(h - avgHue, 2), 0) / count
    );
  }

  // 1. Cutoff Offset driven by Lightness and Hue
  const cutoffMod = 0.5 + avgL * 0.8 + (avgH / 360) * 0.4;
  const cutoffOffset = Math.min(
    18000,
    Math.max(150, Math.round(baselinePatch.cutoffOffset * cutoffMod))
  );

  // 2. Resonance driven by Saturation
  const resonanceMod = 0.6 + avgS * 0.8;
  const resonance = Math.min(
    10.0,
    Math.max(0.1, Number((baselinePatch.resonance * resonanceMod).toFixed(2)))
  );

  // 3. Detune driven by Saturation & Multi-color blending
  const detuneShift = (avgS - 0.5) * 15 + (count - 1) * 6 + (hueVariance / 180) * 8;
  const detuneCents = Math.min(
    50,
    Math.max(-50, Number((baselinePatch.detuneCents + detuneShift).toFixed(1)))
  );

  // 4. LFO Rate & Depth
  const lfoRateMod = 0.7 + (avgH / 360) * 0.8 + (count - 1) * 0.25;
  const lfoRate = Math.min(
    20.0,
    Math.max(0.1, Number((baselinePatch.lfoRate * lfoRateMod).toFixed(2)))
  );

  const lfoDepthMod = 0.7 + avgS * 0.6;
  const lfoDepth = Math.min(
    1.0,
    Math.max(0.0, Number((baselinePatch.lfoDepth * lfoDepthMod).toFixed(2)))
  );

  // 5. Engine-specific FM / Sub parameters
  let fmAmount = baselinePatch.fmAmount;
  let fmRatio = baselinePatch.fmRatio;
  let subOscLevel = baselinePatch.subOscLevel;

  if (baselinePatch.engineType === 'digital_fm_bells') {
    fmAmount = Math.min(
      1.0,
      Math.max(0.0, Number((baselinePatch.fmAmount * (0.7 + avgS * 0.7)).toFixed(2)))
    );
    fmRatio = Math.min(
      8.0,
      Math.max(0.5, Number((baselinePatch.fmRatio + (avgH / 60 - 3) * 0.4).toFixed(1)))
    );
  } else if (baselinePatch.engineType === 'analog_brass') {
    subOscLevel = Math.min(
      1.0,
      Math.max(0.0, Number((baselinePatch.subOscLevel * (0.8 + (1 - avgL) * 0.5)).toFixed(2)))
    );
  }

  // 6. Envelope modulation driven by lightness & hue variance
  const attackMod = 0.8 + (1 - avgL) * 0.5;
  const attackTime = Math.min(
    5.0,
    Math.max(0.001, Number((baselinePatch.attackTime * attackMod).toFixed(3)))
  );

  const decayMod = 0.85 + avgS * 0.3 + (count - 1) * 0.15;
  const decayTime = Math.min(
    10.0,
    Math.max(0.01, Number((baselinePatch.decayTime * decayMod).toFixed(3)))
  );

  const releaseMod = 0.85 + (hueVariance / 180) * 0.4 + (count - 1) * 0.2;
  const releaseTime = Math.min(
    8.0,
    Math.max(0.01, Number((baselinePatch.releaseTime * releaseMod).toFixed(3)))
  );

  // 7. Reverb & Delay Mix modulation driven by selected colors
  const reverbMixMod = 0.8 + (1 - avgL) * 0.4 + (hueVariance / 180) * 0.3;
  const reverbMix = Math.min(
    1.0,
    Math.max(0.0, Number((baselinePatch.reverbMix * reverbMixMod).toFixed(2)))
  );

  const delayMixMod = 0.8 + avgS * 0.4 + (count - 1) * 0.15;
  const delayMix = Math.min(
    1.0,
    Math.max(0.0, Number((baselinePatch.delayMix * delayMixMod).toFixed(2)))
  );

  return {
    ...baselinePatch,
    cutoffOffset,
    resonance,
    detuneCents,
    lfoRate,
    lfoDepth,
    attackTime,
    decayTime,
    releaseTime,
    fmAmount,
    fmRatio,
    subOscLevel,
    reverbMix,
    delayMix,
  };
}
