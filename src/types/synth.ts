export type SynthEngineType =
  | 'analog_brass'
  | 'digital_fm_bells'
  | 'hybrid_wavetable'
  | 'acoustic_piano_organ'
  | 'overdriven_saw_stack'
  | 'fm_square_bell';

export type ImageStyleCategory =
  | 'modern_photo'
  | 'cg_render'
  | 'classical_painting'
  | 'modern_abstract';

export type EraYear = '1800s & Prior' | '1960s' | '1970s' | '1980s' | '1990s-2000s+';

export interface TemporalEraInfo {
  eraVal: number;        // 0.0 to 1.0 continuous position
  eraYear: EraYear;
  label: string;
  architecture: string;
  description: string;
  weights: {
    era1800s: number;    // 0.0 to 1.0
    era1960s: number;    // 0.0 to 1.0
    era1970s: number;    // 0.0 to 1.0
    era1980s: number;    // 0.0 to 1.0
    era2000s: number;    // 0.0 to 1.0
  };
}

export interface ImageStyleInfo {
  category: ImageStyleCategory;
  label: string;
  description: string;
  acousticResult: string;
  features: {
    microNoise: number;        // 0.0 to 1.0 (photographic grain / canvas texture)
    gradientSmoothness: number;// 0.0 to 1.0 (mathematical render smoothness)
    flatBlockRatio: number;    // 0.0 to 1.0 (solid vector color blocks)
    earthyMutedness: number;   // 0.0 to 1.0 (muted earthy patinas)
    dynamicRange: number;      // 0.0 to 1.0 (shadow to highlight range)
    edgeSharpness: number;     // 0.0 to 1.0 (geometric edge step contrast)
  };
  weights?: {
    photo: number;             // 0.0 to 1.0 continuous normalized blend weight
    cgRender: number;          // 0.0 to 1.0 continuous normalized blend weight
    classical: number;         // 0.0 to 1.0 continuous normalized blend weight
    abstract: number;          // 0.0 to 1.0 continuous normalized blend weight
  };
}

export interface ImageAdvancedBackgroundMetrics {
  opticalFocusDepth: number;      // 0.0 (soft haze/blur wash) to 1.0 (razor-sharp micro-contrast)
  gridSymmetryDensity: number;    // 0.0 (organic/chaotic) to 1.0 (mathematically symmetrical grid)
  lightAzimuthAngle: number;      // 0 to 360 degrees
  lightElevationAngle: number;    // 0 to 90 degrees (0 = low sunset, 90 = overhead)
  chromaticClash: number;         // 0.0 (monochromatic/consonant) to 1.0 (complementary hue friction)
  semanticDensityWeight: number;  // 0.0 (glass/water/light) to 1.0 (heavy stone/earth)
  detectedMaterial: 'stone' | 'water' | 'glass' | 'wood' | 'electricity';
}

export interface ImageMetrics {
  hash64: string;           // 64-bit hex hash (e.g. "0x7F2A3B8C1D9E40A5")
  seedNumber: bigint;       // BigInt seed derived from FNV-1a hash
  brightness: number;       // 0.0 to 1.0
  saturation: number;       // 0.0 to 1.0
  complexity: number;       // 0.0 to 1.0 (Sobel edge density)
  timbreDna: number;        // 0.0 to 1.0 (Hue spread & spectral balance)
  dominantHue: number;      // 0 to 360 degrees
  archetype: SynthEngineType;
  colorPalette?: string[];  // 6 cinematic dominant colors (hex codes)
  detectedStyle?: ImageStyleInfo; // Visual style analysis & sound mapping
  temporalEra?: TemporalEraInfo;  // Historical era fingerprint & hardware emulation mapping
  backgroundFeatures?: ImageAdvancedBackgroundMetrics; // Optical depth, grid symmetry, lighting azimuth, chromatic clash & material physics
}

export interface EffectConfig {
  id: 'delay' | 'reverb' | 'chorus' | 'phaser' | 'flanger' | 'distortion';
  name: string;
  category: string;
  visualTrigger: string;
  audioMapping: string;
  enabled: boolean;
  valueDisplay: string;
  intensity: number; // 0.0 to 1.0
  param1?: number;   // 0.0 to 1.0 (individual Parameter 1, e.g. Time / Wet Mix / Voices / Rate)
  param2?: number;   // 0.0 to 1.0 (individual Parameter 2, e.g. Feedback / Decay / Width / Sweep)
}

export interface ImageEffectsState {
  delay: EffectConfig;
  reverb: EffectConfig;
  chorus: EffectConfig;
  phaser: EffectConfig;
  flanger: EffectConfig;
  distortion: EffectConfig;
}

export function createDefaultEffects(): ImageEffectsState {
  return {
    delay: {
      id: 'delay',
      name: 'Delay',
      category: 'Motion Blur / Strobe',
      visualTrigger: 'Directional pixel smearing & low edge sharpness across axes',
      audioMapping: 'Sets echo delay time & feedback making notes trail off',
      enabled: true,
      valueDisplay: '350 ms | 42% FB',
      intensity: 0.5,
      param1: 0.4,  // 350 ms
      param2: 0.47, // 42% FB
    },
    reverb: {
      id: 'reverb',
      name: 'Reverb',
      category: 'Glow / Soft Focus / Haze',
      visualTrigger: 'High luminance diffusion & soft atmospheric mist',
      audioMapping: 'Cranks up wet mix & decay time into a massive pad',
      enabled: true,
      valueDisplay: '65% Wet | 2.8s Decay',
      intensity: 0.6,
      param1: 0.65, // 65% Wet
      param2: 0.42, // 2.8s Decay
    },
    chorus: {
      id: 'chorus',
      name: 'Chorus',
      category: 'Multiple Exposures',
      visualTrigger: 'Overlapping semi-transparent subjects & ghosted layers',
      audioMapping: 'Adds lush width, detuning & multi-voiced richness',
      enabled: true,
      valueDisplay: '3 Voices | +14 Cents Width',
      intensity: 0.45,
      param1: 0.4,  // 3 Voices
      param2: 0.47, // +14 Cents Width
    },
    phaser: {
      id: 'phaser',
      name: 'Phaser',
      category: 'Split-Toning / Gradient',
      visualTrigger: 'Distinct shifting color temperature gradients across frame',
      audioMapping: 'Sweeps frequency spectrum up/down via color LFO',
      enabled: true,
      valueDisplay: '0.85 Hz | 60% Sweep Depth',
      intensity: 0.5,
      param1: 0.19, // 0.85 Hz
      param2: 0.60, // 60% Sweep Depth
    },
    flanger: {
      id: 'flanger',
      name: 'Flanger',
      category: 'Chromatic Aberration',
      visualTrigger: 'Color separation & rainbow fringing along high-contrast edges',
      audioMapping: 'Introduces metallic sweeping comb-filter swoosh',
      enabled: true,
      valueDisplay: '3.2 ms | 48% Comb FB',
      intensity: 0.4,
      param1: 0.28, // 3.2 ms
      param2: 0.53, // 48% Comb FB
    },
    distortion: {
      id: 'distortion',
      name: 'Distortion',
      category: 'Grain / Noise / Glitch',
      visualTrigger: 'High pixel noise, film grain & severe histogram clipping',
      audioMapping: 'Drive & soft-clipping for digital grit & harmonic warmth',
      enabled: true,
      valueDisplay: '+12 dB Drive | Soft Clip',
      intensity: 0.35,
      param1: 0.40, // +12 dB
      param2: 0.30, // Soft Clip
    },
  };
}

export interface PatchParameters {
  // Screen 2 Upper Section
  cutoffOffset: number;     // 20 Hz to 20000 Hz
  resonance: number;        // 0.0 to 10.0
  lfoRate: number;          // 0.1 Hz to 20 Hz
  lfoDepth: number;         // 0.0 to 1.0

  // Screen 2 Lower Section (Performance / Dynamics)
  masterVolume: number;     // -60 dB to +6 dB
  attackTime: number;       // 0.001s to 5.0s
  decayTime: number;        // 0.01s to 10.0s
  sustainLevel: number;     // 0.0 to 1.0
  releaseTime: number;      // 0.01s to 8.0s
  limiterEnabled: boolean;  // boolean toggle
  threshold: number;        // -30 dB to 0 dB

  // Sound Engine Character
  engineType: SynthEngineType;
  detuneCents: number;      // -50 to +50 cents
  unisonVoices: number;     // 1 to 7 voices
  fmRatio: number;          // 0.5 to 8.0
  fmAmount: number;         // 0.0 to 1.0
  subOscLevel: number;      // 0.0 to 1.0
  reverbMix: number;        // 0.0 to 1.0
  delayMix: number;         // 0.0 to 1.0

  // Image-Driven 6 Effects Matrix
  effects?: ImageEffectsState;

  // Procedural Image-Texture LFO Waveform Profile (Harmonic DFT Contour)
  customLfoProfile?: number[];

  // Physical Modeling & Acoustic Resonance Parameters
  physicalModel?: PhysicalModelParameters;

  // Temporal Era & Architecture Emulation Mapping
  temporalEraVal?: number;
  temporalEra?: TemporalEraInfo;

  // Background Optical & Rhythmic Physics Engine Parameters
  opticalFocusDepth?: number;     // 0.0 (soft haze/blur wash) to 1.0 (razor-sharp micro-contrast)
  gridSymmetryDensity?: number;   // 0.0 (organic/chaotic) to 1.0 (mathematically symmetrical grid)
  lightAzimuthAngle?: number;     // 0 to 360 degrees
  lightElevationAngle?: number;   // 0 to 90 degrees (0 = low sunset, 90 = overhead)
  chromaticClash?: number;        // 0.0 (monochromatic/consonant) to 1.0 (complementary hue friction)
  semanticDensityWeight?: number; // 0.0 (glass/water/light) to 1.0 (heavy stone/earth)
}

export interface PhysicalModelParameters {
  materialType: 'wood' | 'metal' | 'glass' | 'felt_string' | 'hollow_chamber';
  bodyResonanceFreqs: [number, number, number]; // e.g. 3 primary body cavity frequencies in Hz
  bodyDamping: number;                           // 0.05 to 0.95 (Q factor modulation)
  acousticWeight: number;                        // 0.0 to 1.0 (body impulse intensity)
  tapeFlutterSpeed: number;                      // 0.1 Hz to 3.0 Hz
  tapeFlutterDepth: number;                      // 0.0 to 1.0 (micro pitch drift)
  analogSaturationWarmth: number;               // 0.0 to 1.0 (tube hysteresis curve drive)
  transientProfile: {
    type: 'hammer' | 'pluck' | 'strike' | 'bow_swell';
    hardness: number;                            // 0.0 to 1.0
    noiseBurst: number;                          // 0.0 to 1.0
  };
  spatialReflection: {
    roomSizeSeconds: number;                     // 0.2s to 6.0s
    absorption: number;                          // 0.05 to 0.95
    diffusion: number;                           // 0.1 to 0.95
    luminanceDepth: number;                      // 0.0 to 1.0
  };
}

export interface PresetPhoto {
  id: string;
  title: string;
  description: string;
  category: string;
  dataUrl: string;
  slotA?: {
    id: string;
    title: string;
    dataUrl: string;
    metrics: ImageMetrics;
    patch: PatchParameters;
  };
  slotB?: {
    id: string;
    title: string;
    dataUrl: string;
    metrics: ImageMetrics;
    patch: PatchParameters;
  };
  morphValue?: number;
  bpm?: number;
  customPatch?: PatchParameters;
  customMetrics?: ImageMetrics;
  selectedColorPoints?: SelectedColorPoint[];
  isUserPreset?: boolean;
}

export interface ActiveNote {
  note: number;
  frequency: number;
  velocity: number;
}

export interface SelectedColorPoint {
  id: string;
  pct: number;
  hex: string;
  rgb: [number, number, number];
}
