import { PatchParameters, ImageMetrics, PhysicalModelParameters, ImageEffectsState, TemporalEraInfo, EraYear } from '../types/synth';
import { hexToRgb, rgbToHex } from './colorBlending';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRound(a: number, b: number, t: number): number {
  return Math.round(lerp(a, b, t));
}

function lerpColorHex(hexA: string, hexB: string, t: number): string {
  const [rA, gA, bA] = hexToRgb(hexA || '#00F2FE');
  const [rB, gB, bB] = hexToRgb(hexB || '#4FACFE');
  const r = Math.round(lerp(rA, rB, t));
  const g = Math.round(lerp(gA, gB, t));
  const b = Math.round(lerp(bA, bB, t));
  return rgbToHex(r, g, b);
}

function interpolateTemporalEraInfo(
  eraA?: TemporalEraInfo,
  eraB?: TemporalEraInfo,
  t: number = 0.5
): TemporalEraInfo | undefined {
  if (!eraA && !eraB) return undefined;
  if (!eraA) return eraB;
  if (!eraB) return eraA;

  const clampT = Math.max(0, Math.min(1, t));
  const eraVal = Number(lerp(eraA.eraVal, eraB.eraVal, clampT).toFixed(3));

  const w1800s = Number(lerp(eraA.weights.era1800s, eraB.weights.era1800s, clampT).toFixed(3));
  const w1960s = Number(lerp(eraA.weights.era1960s, eraB.weights.era1960s, clampT).toFixed(3));
  const w1970s = Number(lerp(eraA.weights.era1970s, eraB.weights.era1970s, clampT).toFixed(3));
  const w1980s = Number(lerp(eraA.weights.era1980s, eraB.weights.era1980s, clampT).toFixed(3));
  const w2000s = Number(lerp(eraA.weights.era2000s, eraB.weights.era2000s, clampT).toFixed(3));

  let eraYear: EraYear = '1970s';
  let label = '1970s Discrete Analog';
  let architecture = 'Moog Ladder Monophonic & Rhodes';
  let description = 'Warm, fat discrete analog synths, ARP 2600 modular screams & electric pianos';

  if (eraVal < 0.16) {
    eraYear = '1800s & Prior';
    label = '1800s Physical & Cathedral';
    architecture = 'Harpsichord, Gut Lute & Cathedral Organ';
    description = 'Plucked harpsichords, gut-string lutes & cathedral pipe organ models with church acoustic impulse responses';
  } else if (eraVal < 0.38) {
    eraYear = '1960s';
    label = '1960s Drawbar & Combo Organ';
    architecture = 'Hammond/Vox Drawbar Organ & Spring Tape';
    description = 'Psychedelic drawbar tonewheel organs, tape-sands & spring-reverbed transistor combo organs';
  } else if (eraVal < 0.62) {
    eraYear = '1970s';
    label = '1970s Discrete Analog';
    architecture = 'Moog Ladder & Fender Rhodes';
    description = 'Warm, fat discrete analog synths, ARP 2600 modular screams & electric pianos';
  } else if (eraVal < 0.84) {
    eraYear = '1980s';
    label = '1980s Polyphonic OB-X & DX7';
    architecture = 'Oberheim OB-X & DX7 FM Bells';
    description = 'Sweeping polyphonic powerhouses, Roland Juno chorus pads & DX7 digital FM bells';
  } else {
    eraYear = '1990s-2000s+';
    label = '2000s Digital Wavetable & Sampler';
    architecture = 'Digital Wavetables & Modern Hybrid';
    description = 'Crisp digital wavetables, lo-fi sampler grit & high-fidelity modern hybrid pads';
  }

  return {
    eraVal,
    eraYear,
    label,
    architecture,
    description,
    weights: {
      era1800s: w1800s,
      era1960s: w1960s,
      era1970s: w1970s,
      era1980s: w1980s,
      era2000s: w2000s,
    },
  };
}

export function interpolatePatchParameters(
  patchA: PatchParameters,
  patchB: PatchParameters,
  t: number
): PatchParameters {
  const clampT = Math.max(0, Math.min(1, t));

  // Custom LFO profile interpolation
  let customLfoProfile: number[] | undefined;
  if (patchA.customLfoProfile && patchB.customLfoProfile) {
    const len = Math.min(patchA.customLfoProfile.length, patchB.customLfoProfile.length);
    customLfoProfile = [];
    for (let i = 0; i < len; i++) {
      customLfoProfile.push(
        Number(lerp(patchA.customLfoProfile[i], patchB.customLfoProfile[i], clampT).toFixed(3))
      );
    }
  } else {
    customLfoProfile = patchA.customLfoProfile || patchB.customLfoProfile;
  }

  // Physical Model interpolation
  let physicalModel: PhysicalModelParameters | undefined;
  if (patchA.physicalModel && patchB.physicalModel) {
    const pmA = patchA.physicalModel;
    const pmB = patchB.physicalModel;

    const freqsA = pmA.bodyResonanceFreqs || [180, 520, 1400];
    const freqsB = pmB.bodyResonanceFreqs || [180, 520, 1400];

    physicalModel = {
      materialType: clampT < 0.5 ? pmA.materialType : pmB.materialType,
      bodyResonanceFreqs: [
        Math.round(lerp(freqsA[0], freqsB[0], clampT)),
        Math.round(lerp(freqsA[1], freqsB[1], clampT)),
        Math.round(lerp(freqsA[2], freqsB[2], clampT)),
      ],
      bodyDamping: Number(lerp(pmA.bodyDamping, pmB.bodyDamping, clampT).toFixed(2)),
      acousticWeight: Number(lerp(pmA.acousticWeight, pmB.acousticWeight, clampT).toFixed(2)),
      tapeFlutterSpeed: Number(lerp(pmA.tapeFlutterSpeed, pmB.tapeFlutterSpeed, clampT).toFixed(2)),
      tapeFlutterDepth: Number(lerp(pmA.tapeFlutterDepth, pmB.tapeFlutterDepth, clampT).toFixed(2)),
      analogSaturationWarmth: Number(
        lerp(pmA.analogSaturationWarmth, pmB.analogSaturationWarmth, clampT).toFixed(2)
      ),
      transientProfile: {
        type: clampT < 0.5 ? pmA.transientProfile.type : pmB.transientProfile.type,
        hardness: Number(lerp(pmA.transientProfile.hardness, pmB.transientProfile.hardness, clampT).toFixed(2)),
        noiseBurst: Number(
          lerp(pmA.transientProfile.noiseBurst, pmB.transientProfile.noiseBurst, clampT).toFixed(2)
        ),
      },
      spatialReflection: {
        roomSizeSeconds: Number(
          lerp(pmA.spatialReflection.roomSizeSeconds, pmB.spatialReflection.roomSizeSeconds, clampT).toFixed(2)
        ),
        absorption: Number(
          lerp(pmA.spatialReflection.absorption, pmB.spatialReflection.absorption, clampT).toFixed(2)
        ),
        diffusion: Number(
          lerp(pmA.spatialReflection.diffusion, pmB.spatialReflection.diffusion, clampT).toFixed(2)
        ),
        luminanceDepth: Number(
          lerp(pmA.spatialReflection.luminanceDepth, pmB.spatialReflection.luminanceDepth, clampT).toFixed(2)
        ),
      },
    };
  } else {
    physicalModel = patchA.physicalModel || patchB.physicalModel;
  }

  // Effects interpolation
  let effects: ImageEffectsState | undefined;
  if (patchA.effects && patchB.effects) {
    const effA = patchA.effects;
    const effB = patchB.effects;
    const keys: (keyof ImageEffectsState)[] = ['delay', 'reverb', 'chorus', 'phaser', 'flanger', 'distortion'];
    effects = { ...effA };
    keys.forEach((k) => {
      effects![k] = {
        ...effA[k],
        enabled: clampT < 0.5 ? effA[k].enabled : effB[k].enabled,
        intensity: Number(lerp(effA[k].intensity, effB[k].intensity, clampT).toFixed(2)),
      };
    });
  } else {
    effects = patchA.effects || patchB.effects;
  }

  return {
    engineType: clampT < 0.5 ? patchA.engineType : patchB.engineType,
    cutoffOffset: Math.round(lerp(patchA.cutoffOffset, patchB.cutoffOffset, clampT)),
    resonance: Number(lerp(patchA.resonance, patchB.resonance, clampT).toFixed(2)),
    lfoRate: Number(lerp(patchA.lfoRate, patchB.lfoRate, clampT).toFixed(2)),
    lfoDepth: Number(lerp(patchA.lfoDepth, patchB.lfoDepth, clampT).toFixed(2)),
    masterVolume: Number(lerp(patchA.masterVolume, patchB.masterVolume, clampT).toFixed(1)),
    limiterEnabled: clampT < 0.5 ? patchA.limiterEnabled : patchB.limiterEnabled,
    threshold: Number(lerp(patchA.threshold, patchB.threshold, clampT).toFixed(1)),
    attackTime: Number(lerp(patchA.attackTime, patchB.attackTime, clampT).toFixed(3)),
    decayTime: Number(lerp(patchA.decayTime, patchB.decayTime, clampT).toFixed(3)),
    sustainLevel: Number(lerp(patchA.sustainLevel, patchB.sustainLevel, clampT).toFixed(2)),
    releaseTime: Number(lerp(patchA.releaseTime, patchB.releaseTime, clampT).toFixed(3)),
    detuneCents: Number(lerp(patchA.detuneCents, patchB.detuneCents, clampT).toFixed(1)),
    unisonVoices: lerpRound(patchA.unisonVoices, patchB.unisonVoices, clampT),
    fmRatio: Number(lerp(patchA.fmRatio, patchB.fmRatio, clampT).toFixed(2)),
    fmAmount: Number(lerp(patchA.fmAmount, patchB.fmAmount, clampT).toFixed(2)),
    subOscLevel: Number(lerp(patchA.subOscLevel, patchB.subOscLevel, clampT).toFixed(2)),
    reverbMix: Number(lerp(patchA.reverbMix, patchB.reverbMix, clampT).toFixed(2)),
    delayMix: Number(lerp(patchA.delayMix, patchB.delayMix, clampT).toFixed(2)),
    customLfoProfile,
    physicalModel,
    effects,
    temporalEraVal: Number(
      lerp(
        patchA.temporalEraVal ?? patchA.temporalEra?.eraVal ?? 0.5,
        patchB.temporalEraVal ?? patchB.temporalEra?.eraVal ?? 0.5,
        clampT
      ).toFixed(3)
    ),
    temporalEra: interpolateTemporalEraInfo(patchA.temporalEra, patchB.temporalEra, clampT),
    opticalFocusDepth: Number(lerp(patchA.opticalFocusDepth ?? 0.5, patchB.opticalFocusDepth ?? 0.5, clampT).toFixed(3)),
    gridSymmetryDensity: Number(lerp(patchA.gridSymmetryDensity ?? 0.5, patchB.gridSymmetryDensity ?? 0.5, clampT).toFixed(3)),
    lightAzimuthAngle: Math.round(lerp(patchA.lightAzimuthAngle ?? 180, patchB.lightAzimuthAngle ?? 180, clampT)),
    lightElevationAngle: Math.round(lerp(patchA.lightElevationAngle ?? 45, patchB.lightElevationAngle ?? 45, clampT)),
    chromaticClash: Number(lerp(patchA.chromaticClash ?? 0.2, patchB.chromaticClash ?? 0.2, clampT).toFixed(3)),
    semanticDensityWeight: Number(lerp(patchA.semanticDensityWeight ?? 0.5, patchB.semanticDensityWeight ?? 0.5, clampT).toFixed(3)),
  };
}

export function interpolateImageMetrics(
  metricsA: ImageMetrics,
  metricsB: ImageMetrics,
  t: number
): ImageMetrics {
  const clampT = Math.max(0, Math.min(1, t));

  // Blend colorPalette array
  let colorPalette: string[] | undefined;
  if (metricsA.colorPalette && metricsB.colorPalette) {
    const len = Math.max(metricsA.colorPalette.length, metricsB.colorPalette.length);
    colorPalette = [];
    for (let i = 0; i < len; i++) {
      const colA = metricsA.colorPalette[i % metricsA.colorPalette.length];
      const colB = metricsB.colorPalette[i % metricsB.colorPalette.length];
      colorPalette.push(lerpColorHex(colA, colB, clampT));
    }
  } else {
    colorPalette = metricsA.colorPalette || metricsB.colorPalette;
  }

  return {
    hash64: clampT < 0.5 ? metricsA.hash64 : metricsB.hash64,
    seedNumber: clampT < 0.5 ? metricsA.seedNumber : metricsB.seedNumber,
    timbreDna: Number(lerp(metricsA.timbreDna, metricsB.timbreDna, clampT).toFixed(3)),
    brightness: Number(lerp(metricsA.brightness, metricsB.brightness, clampT).toFixed(3)),
    saturation: Number(lerp(metricsA.saturation, metricsB.saturation, clampT).toFixed(3)),
    complexity: Number(lerp(metricsA.complexity, metricsB.complexity, clampT).toFixed(3)),
    dominantHue: Math.round(lerp(metricsA.dominantHue, metricsB.dominantHue, clampT)),
    archetype: clampT < 0.5 ? metricsA.archetype : metricsB.archetype,
    colorPalette,
    detectedStyle: clampT < 0.5 ? metricsA.detectedStyle : metricsB.detectedStyle,
    temporalEra: interpolateTemporalEraInfo(metricsA.temporalEra, metricsB.temporalEra, clampT),
    backgroundFeatures: (metricsA.backgroundFeatures && metricsB.backgroundFeatures) ? {
      opticalFocusDepth: Number(lerp(metricsA.backgroundFeatures.opticalFocusDepth, metricsB.backgroundFeatures.opticalFocusDepth, clampT).toFixed(3)),
      gridSymmetryDensity: Number(lerp(metricsA.backgroundFeatures.gridSymmetryDensity, metricsB.backgroundFeatures.gridSymmetryDensity, clampT).toFixed(3)),
      lightAzimuthAngle: Math.round(lerp(metricsA.backgroundFeatures.lightAzimuthAngle, metricsB.backgroundFeatures.lightAzimuthAngle, clampT)),
      lightElevationAngle: Math.round(lerp(metricsA.backgroundFeatures.lightElevationAngle, metricsB.backgroundFeatures.lightElevationAngle, clampT)),
      chromaticClash: Number(lerp(metricsA.backgroundFeatures.chromaticClash, metricsB.backgroundFeatures.chromaticClash, clampT).toFixed(3)),
      semanticDensityWeight: Number(lerp(metricsA.backgroundFeatures.semanticDensityWeight, metricsB.backgroundFeatures.semanticDensityWeight, clampT).toFixed(3)),
      detectedMaterial: clampT < 0.5 ? metricsA.backgroundFeatures.detectedMaterial : metricsB.backgroundFeatures.detectedMaterial,
    } : (metricsA.backgroundFeatures || metricsB.backgroundFeatures),
  };
}
