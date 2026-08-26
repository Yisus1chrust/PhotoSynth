import { ImageMetrics, ImageStyleInfo, ImageStyleCategory, PatchParameters, SynthEngineType, TemporalEraInfo, EraYear, ImageAdvancedBackgroundMetrics } from '../types/synth';

/**
 * Deterministic 64-bit FNV-1a Hash Implementation for Pixel Buffer
 */
export function calculateFNV1a64(pixels: Uint8ClampedArray): { hashHex: string; seedBigInt: bigint } {
  // FNV-1a 64-bit constants in BigInt
  const FNV_PRIME = 1099511628211n;
  const FNV_OFFSET_BASIS = 14695981039346656037n;
  const MASK_64 = 0xFFFFFFFFFFFFFFFFn;

  let hash = FNV_OFFSET_BASIS;

  // Process sample points if image is huge to keep execution under 10ms while preserving determinism
  const step = Math.max(1, Math.floor(pixels.length / (10000 * 4))) * 4;

  for (let i = 0; i < pixels.length; i += step) {
    hash ^= BigInt(pixels[i]);
    hash = (hash * FNV_PRIME) & MASK_64;
    hash ^= BigInt(pixels[i + 1]);
    hash = (hash * FNV_PRIME) & MASK_64;
    hash ^= BigInt(pixels[i + 2]);
    hash = (hash * FNV_PRIME) & MASK_64;
  }

  const hashHex = '0x' + hash.toString(16).padStart(16, '0').toUpperCase();
  return { hashHex, seedBigInt: hash };
}

/**
 * SplitMix64 PRNG to generate normalized deterministic float [0, 1) from seed
 */
export class DeterministicRandom {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = seed === 0n ? 0x9E3779B97F4A7C15n : seed;
  }

  nextFloat(): number {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & 0xFFFFFFFFFFFFFFFFn;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & 0xFFFFFFFFFFFFFFFFn;
    z = (z ^ (z >> 31n)) & 0xFFFFFFFFFFFFFFFFn;
    return Number(z & 0x1FFFFFFFFFFFFFn) / 0x20000000000000;
  }

  nextRange(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }
}

/**
 * Detects 1 of 4 image categories based on visual characteristics:
 * 1. Modern Photographs (Realistic, High Dynamic Range & Detail)
 * 2. 3D Renders / CG Art (Geometric Precision & Smooth Gradients)
 * 3. Classical Paintings (Oil/Canvas Textures & Earthy Patinas)
 * 4. Modern Abstract / Digital Art (High Contrast, Flat Colors & Vectors)
 */
export function detectImageStyle(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  grayMatrix: Float32Array,
  brightness: number,
  saturation: number,
  complexity: number
): ImageStyleInfo {
  const totalPixels = width * height;

  let noiseSum = 0;
  let nonEdgeCount = 0;
  let flatColorCount = 0;
  let earthyCount = 0;

  const lumHist = new Int32Array(256);

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      const pixIdx = idx * 4;
      const r = pixels[pixIdx] / 255;
      const g = pixels[pixIdx + 1] / 255;
      const b = pixels[pixIdx + 2] / 255;
      const lum = grayMatrix[idx];

      const lumByte = Math.min(255, Math.max(0, Math.floor(lum * 255)));
      lumHist[lumByte]++;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const sat = max === 0 ? 0 : delta / max;

      let hue = 0;
      if (delta > 0.05) {
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue = Math.round(hue * 60);
        if (hue < 0) hue += 360;
      }

      // Earthy / Chiaroscuro check
      const isEarthyTone = (hue >= 10 && hue <= 60 && sat < 0.6) || (lum < 0.35 && sat < 0.4);
      if (isEarthyTone) earthyCount++;

      // Micro-noise sample in non-edge regions
      const rightLum = grayMatrix[idx + 1];
      const diff = Math.abs(lum - rightLum);

      if (diff < 0.15) {
        noiseSum += diff;
        nonEdgeCount++;
      }

      // Solid flat color check
      if (diff < 0.02 && sat > 0.3) {
        flatColorCount++;
      }
    }
  }

  const samples = Math.max(1, nonEdgeCount);
  const avgMicroNoise = noiseSum / samples;

  const microNoise = Math.min(1.0, avgMicroNoise * 30.0);
  const gradientSmoothness = Math.min(1.0, Math.max(0, 1.0 - microNoise * 1.5));
  const flatBlockRatio = Math.min(1.0, flatColorCount / (totalPixels / 4));
  const earthyMutedness = Math.min(1.0, earthyCount / (totalPixels / 4));

  // Dynamic range calculation (5th to 95th percentile)
  let count = 0;
  let p5 = 0;
  let p95 = 255;
  const target5 = Math.floor(samples * 0.05);
  const target95 = Math.floor(samples * 0.95);

  for (let i = 0; i < 256; i++) {
    count += lumHist[i];
    if (count >= target5 && p5 === 0) p5 = i;
    if (count >= target95) {
      p95 = i;
      break;
    }
  }
  const dynamicRange = Math.min(1.0, Math.max(0, (p95 - p5) / 255.0));
  const edgeSharpness = Math.min(1.0, complexity * 1.8);

  // Score 4 categories:
  const scorePhoto =
    dynamicRange * 0.35 +
    (microNoise > 0.15 && microNoise < 0.7 ? 0.35 : 0.1) +
    (1 - flatBlockRatio) * 0.15 +
    (1 - earthyMutedness) * 0.15;

  const scoreCgRender =
    gradientSmoothness * 0.35 +
    edgeSharpness * 0.25 +
    (saturation > 0.3 ? 0.25 : 0.1) +
    (1 - earthyMutedness) * 0.15;

  const scoreClassical =
    earthyMutedness * 0.40 +
    microNoise * 0.25 +
    (brightness < 0.55 ? 0.20 : 0.05) +
    (1 - saturation) * 0.15;

  const scoreAbstract =
    flatBlockRatio * 0.40 +
    (saturation > 0.45 ? 0.30 : 0.1) +
    edgeSharpness * 0.20 +
    gradientSmoothness * 0.10;

  // Normalized continuous style weight distribution for smooth multi-engine hybridization
  const totalScore = Math.max(0.001, scorePhoto + scoreCgRender + scoreClassical + scoreAbstract);
  const wPhoto = scorePhoto / totalScore;
  const wCgRender = scoreCgRender / totalScore;
  const wClassical = scoreClassical / totalScore;
  const wAbstract = scoreAbstract / totalScore;

  const weights = {
    photo: Number(wPhoto.toFixed(3)),
    cgRender: Number(wCgRender.toFixed(3)),
    classical: Number(wClassical.toFixed(3)),
    abstract: Number(wAbstract.toFixed(3)),
  };

  let category: ImageStyleCategory = 'modern_photo';
  let maxScore = scorePhoto;

  if (scoreCgRender > maxScore) {
    category = 'cg_render';
    maxScore = scoreCgRender;
  }
  if (scoreClassical > maxScore) {
    category = 'classical_painting';
    maxScore = scoreClassical;
  }
  if (scoreAbstract > maxScore) {
    category = 'modern_abstract';
    maxScore = scoreAbstract;
  }

  const features = {
    microNoise: Number(microNoise.toFixed(2)),
    gradientSmoothness: Number(gradientSmoothness.toFixed(2)),
    flatBlockRatio: Number(flatBlockRatio.toFixed(2)),
    earthyMutedness: Number(earthyMutedness.toFixed(2)),
    dynamicRange: Number(dynamicRange.toFixed(2)),
    edgeSharpness: Number(edgeSharpness.toFixed(2)),
  };

  if (category === 'modern_photo') {
    return {
      category: 'modern_photo',
      label: 'Modern Photograph',
      description: 'Realistic high dynamic range, natural frequency distribution & microscopic details',
      acousticResult: 'Balanced high-fidelity hybrid sound with clean wavetables, natural stereo imaging & crisp response',
      features,
      weights,
    };
  }

  if (category === 'cg_render') {
    return {
      category: 'cg_render',
      label: '3D Render / CG Art',
      description: 'Smooth mathematical gradients, sharp geometric edges & hyper-saturated clean color space',
      acousticResult: 'Futuristic sci-fi aesthetic with clean FM bells, precise square waves & synchronized rhythmic modulation',
      features,
      weights,
    };
  }

  if (category === 'classical_painting') {
    return {
      category: 'classical_painting',
      label: 'Classical Painting',
      description: 'Muted earthy patina, canvas weave / brush textures & dark chiaroscuro mid-tones',
      acousticResult: 'Warm organic vintage sound with soft low-pass filtering, rich tape saturation & massive room reverb',
      features,
      weights,
    };
  }

  return {
    category: 'modern_abstract',
    label: 'Modern Abstract / Digital Art',
    description: 'Solid flat hyper-saturated color blocks, stark vector lines & zero photographic noise',
    acousticResult: 'Bold punchy electronic sound with aggressive square/saw waves, biting distortion & fast glitchy LFO',
    features,
    weights,
  };
}

/**
 * Detects Temporal Era & Architecture Fingerprint from color grading, texture, grain, and compression artifacts
 */
export function detectTemporalEra(
  brightness: number,
  saturation: number,
  complexity: number,
  features: {
    microNoise: number;
    gradientSmoothness: number;
    flatBlockRatio: number;
    earthyMutedness: number;
    dynamicRange: number;
    edgeSharpness: number;
  },
  rRatio: number,
  gRatio: number,
  bRatio: number,
  cRatio: number,
  mRatio: number,
  yRatio: number,
  darkRatio: number,
  colorEntropy: number,
  styleCategory?: ImageStyleCategory,
  styleWeights?: { photo: number; cgRender: number; classical: number; abstract: number }
): TemporalEraInfo {
  const { microNoise, flatBlockRatio, earthyMutedness, edgeSharpness, gradientSmoothness } = features;

  const isClassical = styleCategory === 'classical_painting' || (styleWeights?.classical || 0) > 0.3;
  const isAbstract = styleCategory === 'modern_abstract' || (styleWeights?.abstract || 0) > 0.3;
  const isCg = styleCategory === 'cg_render' || (styleWeights?.cgRender || 0) > 0.3;
  const isPhoto = styleCategory === 'modern_photo' || (styleWeights?.photo || 0) > 0.4;

  // 1. 1800s & Prior: Earthy patina, classical oil painting, canvas weave texture, low saturation, dark/chiaroscuro
  const score1800s = Math.max(0,
    (isClassical ? 0.55 : 0) +
    earthyMutedness * 0.45 +
    microNoise * 0.30 +
    (1 - saturation) * 0.25 +
    darkRatio * 0.20 +
    (yRatio * 0.15)
  );

  // 2. 1960s: Warm vintage film/tape grain, amber/yellow tones, soft organic feel
  const warmToneRatio = yRatio + rRatio * 0.4;
  const score1960s = Math.max(0,
    warmToneRatio * 0.40 +
    microNoise * 0.30 +
    (1 - Math.abs(saturation - 0.35)) * 0.25 +
    (brightness > 0.35 && brightness < 0.65 ? 0.20 : 0) +
    (!isAbstract && !isCg && !isClassical ? 0.15 : 0)
  );

  // 3. 1970s: Deep warm analog, rich red/brown tones, vintage photo saturation, mid dynamic range
  const score1970s = Math.max(0,
    rRatio * 0.35 +
    mRatio * 0.20 +
    (1 - Math.abs(saturation - 0.45)) * 0.25 +
    (isPhoto && microNoise > 0.12 ? 0.30 : 0) +
    (!isAbstract && !isClassical && !isCg ? 0.20 : 0)
  );

  // 4. 1980s: High neon saturation, vibrant multi-color pop art entropy, cyan/magenta/hot pink/neon primary pop
  const primarySecondaryPop = cRatio + mRatio + yRatio + Math.max(rRatio, gRatio, bRatio);
  const score1980s = Math.max(0,
    saturation * 0.50 +
    colorEntropy * 0.35 +
    primarySecondaryPop * 0.25 +
    (isAbstract && saturation > 0.35 ? 0.35 : 0) +
    (cRatio > 0.12 || mRatio > 0.12 ? 0.25 : 0)
  );

  // 5. 1990s-2000s+: Crisp digital, high edge sharpness, flat vector blocks, clean gradients, zero noise, CG render, grid art
  const score2000s = Math.max(0,
    edgeSharpness * 0.35 +
    flatBlockRatio * 0.40 +
    gradientSmoothness * 0.25 +
    (1 - microNoise) * 0.20 +
    (isCg ? 0.35 : 0) +
    (isAbstract && flatBlockRatio > 0.18 ? 0.35 : 0)
  );

  // Determine top winning era score to anchor era classification accurately
  const scores = [
    { year: '1800s & Prior' as EraYear, score: score1800s, center: 0.05 },
    { year: '1960s' as EraYear, score: score1960s, center: 0.25 },
    { year: '1970s' as EraYear, score: score1970s, center: 0.50 },
    { year: '1980s' as EraYear, score: score1980s, center: 0.75 },
    { year: '1990s-2000s+' as EraYear, score: score2000s, center: 0.95 },
  ];

  scores.sort((a, b) => b.score - a.score);
  const topEra = scores[0];
  const total = Math.max(0.001, score1800s + score1960s + score1970s + score1980s + score2000s);

  const w1800s = score1800s / total;
  const w1960s = score1960s / total;
  const w1970s = score1970s / total;
  const w1980s = score1980s / total;
  const w2000s = score2000s / total;

  let eraVal = (
    w1800s * 0.05 +
    w1960s * 0.25 +
    w1970s * 0.50 +
    w1980s * 0.75 +
    w2000s * 0.95
  );

  // Pull eraVal towards dominant era center when top score is distinct
  if (topEra.score > 0.35) {
    eraVal = eraVal * 0.35 + topEra.center * 0.65;
  }

  eraVal = Number(Math.min(1.0, Math.max(0.0, eraVal)).toFixed(3));

  let eraYear: EraYear = topEra.year;
  let label = '1970s Discrete Analog';
  let architecture = 'Moog Ladder Monophonic & Rhodes';
  let description = 'Warm, fat discrete analog synths, ARP 2600 modular screams & electric pianos';

  if (eraVal < 0.18) {
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
  } else if (eraVal < 0.82) {
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
      era1800s: Number(w1800s.toFixed(3)),
      era1960s: Number(w1960s.toFixed(3)),
      era1970s: Number(w1970s.toFixed(3)),
      era1980s: Number(w1980s.toFixed(3)),
      era2000s: Number(w2000s.toFixed(3)),
    },
  };
}

/**
 * Detects 5 Advanced Background Optical, Spatial, Geometric, Harmonic & Physical Features
 */
export function detectAdvancedBackgroundFeatures(
  pixels: Uint8ClampedArray,
  grayMatrix: Float32Array,
  w: number,
  h: number,
  hues: number[],
  features: {
    microNoise: number;
    gradientSmoothness: number;
    flatBlockRatio: number;
    earthyMutedness: number;
    dynamicRange: number;
    edgeSharpness: number;
  },
  rRatio: number,
  gRatio: number,
  bRatio: number,
  cRatio: number,
  mRatio: number,
  yRatio: number,
  darkRatio: number
): ImageAdvancedBackgroundMetrics {
  const totalPixels = w * h;

  // 1. Spatial Frequency & "Image Focus" Grain (Optical Depth Engine)
  let localEdgeEnergy = 0;
  let blurRegionCount = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const idx = y * w + x;
      const diff = Math.abs(grayMatrix[idx] - grayMatrix[idx + 1]) + Math.abs(grayMatrix[idx] - grayMatrix[idx + w]);
      if (diff > 0.15) {
        localEdgeEnergy += diff;
      } else {
        blurRegionCount++;
      }
    }
  }
  const focusRatio = (localEdgeEnergy / (totalPixels * 0.25)) * (1 - (blurRegionCount / (totalPixels * 0.25)) * 0.4);
  const opticalFocusDepth = Math.max(0.02, Math.min(0.98, Number((features.edgeSharpness * 0.5 + focusRatio * 0.5).toFixed(3))));

  // 2. Symmetry, Geometry & Fractal Grid Density (Architectural Sequencer)
  let symDiffH = 0;
  let symDiffV = 0;
  const sampleStep = 4;
  let sampleCount = 0;

  for (let y = 0; y < h; y += sampleStep) {
    for (let x = 0; x < w / 2; x += sampleStep) {
      const idxLeft = y * w + x;
      const idxRight = y * w + (w - 1 - x);
      symDiffH += Math.abs(grayMatrix[idxLeft] - grayMatrix[idxRight]);

      const idxTop = x * w + y;
      const idxBottom = (h - 1 - x) * w + y;
      if (idxBottom < totalPixels) {
        symDiffV += Math.abs(grayMatrix[idxTop] - grayMatrix[idxBottom]);
      }
      sampleCount++;
    }
  }

  const avgSymDiff = sampleCount > 0 ? (symDiffH + symDiffV) / (sampleCount * 2) : 0.5;
  const symmetryScore = Math.max(0, 1 - avgSymDiff * 2.2);
  const gridSymmetryDensity = Math.max(0.02, Math.min(0.98, Number((symmetryScore * 0.6 + features.flatBlockRatio * 0.4).toFixed(3))));

  // 3. Lighting Angle & Shadow Azimuth (Virtual Soundstage Panner)
  let topLum = 0, bottomLum = 0, leftLum = 0, rightLum = 0;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const idx = y * w + x;
      const l = grayMatrix[idx];
      if (y < h / 2) topLum += l; else bottomLum += l;
      if (x < w / 2) leftLum += l; else rightLum += l;
    }
  }

  const dx = rightLum - leftLum;
  const dy = bottomLum - topLum;
  let angleRad = Math.atan2(dy, dx);
  let lightAzimuthAngle = Math.round(((angleRad * 180) / Math.PI + 360) % 360);

  const vertAsymmetry = Math.abs(topLum - bottomLum) / Math.max(1, topLum + bottomLum);
  const lightElevationAngle = Math.round(Math.max(10, Math.min(85, 85 - vertAsymmetry * 70)));

  // 4. Color Contrast Saturation & Complementary Hue Clash (Harmonic Tension Generator)
  let complementaryClashSum = 0;
  let clashPairs = 0;
  if (hues.length > 10) {
    const step = Math.max(1, Math.floor(hues.length / 30));
    for (let i = 0; i < hues.length; i += step) {
      for (let j = i + step; j < hues.length; j += step * 2) {
        let diff = Math.abs(hues[i] - hues[j]);
        if (diff > 180) diff = 360 - diff;
        if (diff > 120) {
          complementaryClashSum += (diff - 120) / 60;
        }
        clashPairs++;
      }
    }
  }
  const rawClash = clashPairs > 0 ? complementaryClashSum / clashPairs : 0.2;
  const chromaticClash = Math.max(0.02, Math.min(0.98, Number((rawClash * 0.7 + (cRatio + mRatio + yRatio) * 0.3).toFixed(3))));

  // 5. Semantic Object "Weight" & Density (Material Physics Matrix)
  let detectedMaterial: 'stone' | 'water' | 'glass' | 'wood' | 'electricity' = 'stone';
  let semanticDensityWeight = 0.5;

  if (cRatio > 0.25 || (bRatio > 0.3 && features.gradientSmoothness > 0.5)) {
    detectedMaterial = 'water';
    semanticDensityWeight = 0.25;
  } else if (features.flatBlockRatio > 0.4 && features.edgeSharpness > 0.6) {
    detectedMaterial = 'glass';
    semanticDensityWeight = 0.20;
  } else if (features.earthyMutedness > 0.5 || yRatio > 0.3) {
    detectedMaterial = 'wood';
    semanticDensityWeight = 0.55;
  } else if (darkRatio > 0.35 || features.microNoise > 0.4) {
    detectedMaterial = 'stone';
    semanticDensityWeight = 0.85;
  } else if (mRatio > 0.25 || cRatio > 0.2) {
    detectedMaterial = 'electricity';
    semanticDensityWeight = 0.35;
  }

  return {
    opticalFocusDepth,
    gridSymmetryDensity,
    lightAzimuthAngle,
    lightElevationAngle,
    chromaticClash,
    semanticDensityWeight,
    detectedMaterial,
  };
}

/**
 * Analyze HTMLImageElement or HTMLCanvasElement to extract metrics and generate patch
 */
export async function analyzeImage(imageSource: HTMLImageElement | HTMLCanvasElement): Promise<{
  metrics: ImageMetrics;
  baselinePatch: PatchParameters;
}> {
  const canvas = document.createElement('canvas');
  const maxDimension = 256; // Standardized evaluation size
  let w = imageSource.width || 256;
  let h = imageSource.height || 256;

  if (w > maxDimension || h > maxDimension) {
    if (w > h) {
      h = Math.round((h * maxDimension) / w);
      w = maxDimension;
    } else {
      w = Math.round((w * maxDimension) / h);
      h = maxDimension;
    }
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context for image analysis');

  ctx.drawImage(imageSource, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;

  // 1. Calculate Deterministic 64-bit Pixel Seed
  const { hashHex, seedBigInt } = calculateFNV1a64(pixels);
  const rng = new DeterministicRandom(seedBigInt);

  // 2. Metrics calculation: Luminance, Saturation, Hue Spectrum, Complexity
  let totalLuminance = 0;
  let totalSaturation = 0;
  const hues: number[] = [];

  const totalPixels = w * h;
  const grayMatrix = new Float32Array(totalPixels);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += lum;
    grayMatrix[i / 4] = lum;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const sat = max === 0 ? 0 : delta / max;
    totalSaturation += sat;

    if (delta > 0.05) {
      let hue = 0;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;
      hues.push(hue);
    }
  }

  const brightness = Math.min(1, Math.max(0, totalLuminance / totalPixels));
  const saturation = Math.min(1, Math.max(0, totalSaturation / totalPixels));

  let timbreDna = 0.5;
  let dominantHue = 180;
  if (hues.length > 0) {
    const sumHue = hues.reduce((a, b) => a + b, 0);
    dominantHue = Math.round(sumHue / hues.length);
    const variance = hues.reduce((a, b) => a + Math.pow(b - dominantHue, 2), 0) / hues.length;
    timbreDna = Math.min(1, Math.sqrt(variance) / 180);
  }

  // Sobel Edge Density
  let edgeSum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        -1 * grayMatrix[idx - w - 1] + 1 * grayMatrix[idx - w + 1] +
        -2 * grayMatrix[idx - 1] + 2 * grayMatrix[idx + 1] +
        -1 * grayMatrix[idx + w - 1] + 1 * grayMatrix[idx + w + 1];

      const gy =
        -1 * grayMatrix[idx - w - 1] - 2 * grayMatrix[idx - w] - 1 * grayMatrix[idx - w + 1] +
         1 * grayMatrix[idx + w - 1] + 2 * grayMatrix[idx + w] + 1 * grayMatrix[idx + w + 1];

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 0.2) edgeSum += mag;
    }
  }
  const complexity = Math.min(1, edgeSum / (totalPixels * 0.4));

  // 3. Procedural Topological Mapping Engine
  // Spatial Center of Mass (cxNorm, cyNorm) & Variance (spreadX, spreadY)
  let sumX = 0;
  let sumY = 0;
  let sumLum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const l = grayMatrix[idx];
      sumX += x * l;
      sumY += y * l;
      sumLum += l;
    }
  }
  const cxNorm = sumLum > 0 ? (sumX / sumLum) / w : 0.5;
  const cyNorm = sumLum > 0 ? (sumY / sumLum) / h : 0.5;
  const centerDist = Math.hypot(cxNorm - 0.5, cyNorm - 0.5);

  let varX = 0;
  let varY = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const idx = y * w + x;
      const l = grayMatrix[idx];
      varX += Math.pow(x / w - cxNorm, 2) * l;
      varY += Math.pow(y / h - cyNorm, 2) * l;
    }
  }
  const spreadX = sumLum > 0 ? Math.sqrt(varX / (sumLum / 4)) : 0.25;
  const spreadY = sumLum > 0 ? Math.sqrt(varY / (sumLum / 4)) : 0.25;

  // 4. Color Histogram & Channel Ratios
  let countR = 0, countG = 0, countB = 0;
  let countC = 0, countM = 0, countY = 0;
  let countDark = 0, countBright = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (max < 0.2) countDark++;
    if (min > 0.8) countBright++;

    if (delta > 0.08) {
      let hue = 0;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;

      // Primary & Secondary color categorization by Hue degree ranges
      if (hue >= 345 || hue < 25) countR++;
      else if (hue >= 25 && hue < 65) countY++;
      else if (hue >= 65 && hue < 160) countG++;
      else if (hue >= 160 && hue < 210) countC++;
      else if (hue >= 210 && hue < 275) countB++;
      else if (hue >= 275 && hue < 345) countM++;
    }
  }

  const nPix = totalPixels;
  const rRatio = countR / nPix;
  const gRatio = countG / nPix;
  const bRatio = countB / nPix;
  const cRatio = countC / nPix;
  const mRatio = countM / nPix;
  const yRatio = countY / nPix;
  const darkRatio = countDark / nPix;

  const colorBins = [rRatio, gRatio, bRatio, cRatio, mRatio, yRatio, darkRatio].map(v => Math.max(0.0001, v));
  const colorEntropy = Math.min(1.0, -colorBins.reduce((acc, p) => acc + p * Math.log2(p), 0) / Math.log2(7));

  // 5. Image Texture to Custom LFO Waveform Profile (32-point Spatial DFT Path)
  const customLfoProfile: number[] = [];
  const numLfoSamples = 32;
  let lfoMean = 0;

  for (let i = 0; i < numLfoSamples; i++) {
    const t = i / numLfoSamples;
    const angle = t * Math.PI * 4;
    const radius = t * 0.45;
    const sampleX = Math.min(w - 1, Math.max(0, Math.floor((cxNorm + Math.cos(angle) * radius) * w)));
    const sampleY = Math.min(h - 1, Math.max(0, Math.floor((cyNorm + Math.sin(angle) * radius) * h)));
    const pixIdx = sampleY * w + sampleX;
    const val = grayMatrix[pixIdx] || 0.5;
    customLfoProfile.push(val);
    lfoMean += val;
  }

  lfoMean /= numLfoSamples;
  const normalizedLfoProfile = customLfoProfile.map(v =>
    Number((Math.min(1.0, Math.max(-1.0, (v - lfoMean) * 2.5))).toFixed(3))
  );

  // Detect Style Weights for archetype routing
  const detectedStyle = detectImageStyle(pixels, w, h, grayMatrix, brightness, saturation, complexity);
  const { flatBlockRatio, microNoise, gradientSmoothness, earthyMutedness, edgeSharpness } = detectedStyle.features;

  // Detect Temporal Era & Architecture Fingerprint
  const temporalEra = detectTemporalEra(
    brightness,
    saturation,
    complexity,
    detectedStyle.features,
    rRatio,
    gRatio,
    bRatio,
    cRatio,
    mRatio,
    yRatio,
    darkRatio,
    colorEntropy,
    detectedStyle.category,
    detectedStyle.weights
  );

  let archetype: SynthEngineType = 'hybrid_wavetable';
  if (
    detectedStyle.category === 'modern_abstract' ||
    flatBlockRatio > 0.28 ||
    (edgeSharpness > 0.40 && gradientSmoothness < 0.35)
  ) {
    archetype = 'fm_square_bell';
  } else if (
    (microNoise > 0.30 && complexity > 0.35) ||
    (saturation > 0.40 && microNoise > 0.20) ||
    (complexity > 0.50 && flatBlockRatio < 0.25)
  ) {
    archetype = 'overdriven_saw_stack';
  } else if (
    detectedStyle.category === 'classical_painting' ||
    earthyMutedness > 0.30 ||
    (brightness < 0.45 && saturation < 0.40)
  ) {
    archetype = 'acoustic_piano_organ';
  } else {
    archetype = 'hybrid_wavetable';
  }

  // Detect 5 Advanced Background Optical, Spatial, Geometric, Harmonic & Physical Features
  const backgroundFeatures = detectAdvancedBackgroundFeatures(
    pixels,
    grayMatrix,
    w,
    h,
    hues,
    detectedStyle.features,
    rRatio,
    gRatio,
    bRatio,
    cRatio,
    mRatio,
    yRatio,
    darkRatio
  );

  const metrics: ImageMetrics = {
    hash64: hashHex,
    seedNumber: seedBigInt,
    brightness,
    saturation,
    complexity,
    timbreDna,
    dominantHue,
    archetype,
    colorPalette: extractColorPalette(pixels, 6),
    detectedStyle,
    temporalEra,
    backgroundFeatures,
  };

  // 6. Procedural Envelopes from Center of Mass & Edge Density
  const attackTime = Number((
    Math.max(0.001, Math.min(3.5, 0.001 + Math.pow(1.0 - complexity, 2.5) * (0.20 + cyNorm * 3.0) + (1.0 - edgeSharpness) * 0.5))
  ).toFixed(3));

  const decayTime = Number((
    Math.max(0.05, Math.min(6.0, 0.08 + (1.0 - complexity * 0.6) * (0.3 + cxNorm * 4.0) + spreadX * 1.5))
  ).toFixed(3));

  const sustainLevel = Number((
    Math.max(0.05, Math.min(0.95, 0.15 + (1.0 - complexity * 0.8) * (0.2 + (1.0 - centerDist) * 0.6)))
  ).toFixed(2));

  const releaseTime = Number((
    Math.max(0.05, Math.min(8.0, 0.08 + (1.0 - complexity) * (0.5 + centerDist * 5.0) + spreadY * 2.0))
  ).toFixed(3));

  // 7. Procedural Harmonic Series & Additive Modulation
  const fmRatio = Number((Math.min(12.0, Math.max(0.5, 1.0 + gRatio * 5.0 + yRatio * 3.5 + cRatio * 2.5 + colorEntropy * 2.0))).toFixed(2));
  const fmAmount = Number((Math.min(1.0, Math.max(0.0, rRatio * 0.75 + mRatio * 0.55 + saturation * 0.40))).toFixed(2));
  const detuneCents = Number((Math.min(50, Math.max(1, 2.0 + bRatio * 38.0 + colorEntropy * 12.0 + (rng.nextFloat() - 0.5) * 4.0))).toFixed(1));
  const unisonVoices = Math.min(7, Math.max(1, Math.round(1 + bRatio * 4.0 + colorEntropy * 3.0 + spreadX * 2.0)));
  const subOscLevel = Number((Math.min(1.0, Math.max(0.0, 0.05 + darkRatio * 0.75 + rRatio * 0.20))).toFixed(2));

  const cutoffOffset = Math.min(19500, Math.max(120, Math.round(150 + Math.pow(brightness, 1.8) * 16000 + complexity * 3200)));
  const resonance = Number((Math.min(10.0, Math.max(0.1, 0.5 + saturation * 6.5 + colorEntropy * 2.5))).toFixed(2));

  const lfoRate = Number((Math.min(20.0, Math.max(0.1, 0.2 + complexity * 12.0 + spreadY * 5.0))).toFixed(2));
  const lfoDepth = Number((Math.min(1.0, Math.max(0.0, 0.15 + saturation * 0.55 + colorEntropy * 0.30))).toFixed(2));

  const reverbMix = Number((Math.min(1.0, Math.max(0.0, 0.10 + (1.0 - brightness) * 0.50 + earthyMutedness * 0.30))).toFixed(2));
  const delayMix = Number((Math.min(1.0, Math.max(0.0, 0.10 + complexity * 0.45 + cRatio * 0.25))).toFixed(2));

  // 8. 6 Effects matrix intensities & displays
  const delayIntensity = delayMix;
  const reverbIntensity = reverbMix;
  const chorusIntensity = Number((Math.min(1.0, Math.max(0.1, 0.2 + bRatio * 0.6 + colorEntropy * 0.3))).toFixed(2));
  const phaserIntensity = Number((Math.min(1.0, Math.max(0.1, 0.15 + gRatio * 0.6 + yRatio * 0.3))).toFixed(2));
  const flangerIntensity = Number((Math.min(1.0, Math.max(0.1, 0.1 + cRatio * 0.7 + edgeSharpness * 0.3))).toFixed(2));
  const distortionIntensity = Number((Math.min(1.0, Math.max(0.1, rRatio * 0.8 + mRatio * 0.4))).toFixed(2));

  // 9. Physical Modeling & Acoustic Resonance Parameters
  let materialType: 'wood' | 'metal' | 'glass' | 'felt_string' | 'hollow_chamber' = 'wood';
  let baseFreqs: [number, number, number] = [140, 480, 1250];

  if (edgeSharpness > 0.45 && (bRatio > 0.25 || cRatio > 0.20)) {
    materialType = 'metal';
    baseFreqs = [820, 2450, 5600];
  } else if (saturation > 0.45 && (rRatio > 0.25 || yRatio > 0.25)) {
    materialType = 'glass';
    baseFreqs = [1750, 3900, 7800];
  } else if (earthyMutedness > 0.35 || (gRatio > 0.30)) {
    materialType = 'wood';
    baseFreqs = [140, 480, 1250];
  } else if (gradientSmoothness > 0.40 && complexity < 0.35) {
    materialType = 'felt_string';
    baseFreqs = [220, 680, 1900];
  } else if (darkRatio > 0.40 || brightness < 0.35) {
    materialType = 'hollow_chamber';
    baseFreqs = [85, 340, 980];
  } else {
    materialType = 'wood';
    baseFreqs = [180, 520, 1400];
  }

  // Micro detune/shift of physical body resonance frequencies based on seed and topology
  const bodyFreqShift = (rng.nextFloat() - 0.5) * 40;
  const bodyResonanceFreqs: [number, number, number] = [
    Math.round(Math.max(40, baseFreqs[0] + bodyFreqShift + (cxNorm - 0.5) * 60)),
    Math.round(Math.max(150, baseFreqs[1] + bodyFreqShift * 1.8 + (cyNorm - 0.5) * 120)),
    Math.round(Math.max(400, baseFreqs[2] + bodyFreqShift * 3.5 + (spreadX - 0.25) * 300)),
  ];

  const bodyDamping = Number((Math.max(0.05, Math.min(0.95, 0.15 + flatBlockRatio * 0.5 + gradientSmoothness * 0.3))).toFixed(2));
  const acousticWeight = Number((Math.max(0.1, Math.min(0.95, 0.25 + microNoise * 0.4 + complexity * 0.35))).toFixed(2));

  const tapeFlutterSpeed = Number((Math.max(0.1, Math.min(3.0, 0.2 + spreadY * 1.8 + (rng.nextFloat() * 0.8)))).toFixed(2));
  const tapeFlutterDepth = Number((Math.max(0.02, Math.min(0.85, 0.05 + colorEntropy * 0.40 + microNoise * 0.35))).toFixed(2));
  const analogSaturationWarmth = Number((Math.max(0.05, Math.min(0.95, 0.10 + saturation * 0.55 + rRatio * 0.35))).toFixed(2));

  // Dynamic Transient Profile
  let transientType: 'hammer' | 'pluck' | 'strike' | 'bow_swell' = 'pluck';
  if (edgeSharpness > 0.50 && flatBlockRatio > 0.25) {
    transientType = 'strike';
  } else if (earthyMutedness > 0.30 || archetype === 'acoustic_piano_organ') {
    transientType = 'hammer';
  } else if (gradientSmoothness > 0.45 && complexity < 0.35) {
    transientType = 'bow_swell';
  } else {
    transientType = 'pluck';
  }

  const transientHardness = Number((Math.max(0.05, Math.min(0.98, edgeSharpness * 0.70 + complexity * 0.30))).toFixed(2));
  const transientNoiseBurst = Number((Math.max(0.01, Math.min(0.85, microNoise * 0.60 + (1.0 - gradientSmoothness) * 0.35))).toFixed(2));

  // True-to-Life Spatial Diffusion (convolution reflection room parameters)
  const roomSizeSeconds = Number((Math.max(0.2, Math.min(5.5, 0.3 + cyNorm * 3.2 + (1.0 - brightness) * 2.0))).toFixed(2));
  const absorption = Number((Math.max(0.05, Math.min(0.95, 0.10 + earthyMutedness * 0.55 + darkRatio * 0.30))).toFixed(2));
  const diffusion = Number((Math.max(0.10, Math.min(0.95, 0.20 + colorEntropy * 0.50 + complexity * 0.30))).toFixed(2));
  const luminanceDepth = Number((Math.max(0.05, Math.min(0.95, Math.abs(brightness - 0.5) * 1.5 + (1.0 - flatBlockRatio) * 0.25))).toFixed(2));

  const physicalModel = {
    materialType,
    bodyResonanceFreqs,
    bodyDamping,
    acousticWeight,
    tapeFlutterSpeed,
    tapeFlutterDepth,
    analogSaturationWarmth,
    transientProfile: {
      type: transientType,
      hardness: transientHardness,
      noiseBurst: transientNoiseBurst,
    },
    spatialReflection: {
      roomSizeSeconds,
      absorption,
      diffusion,
      luminanceDepth,
    },
  };

  const delayConfig = {
    id: 'delay' as const,
    name: 'Delay',
    category: 'Motion Blur',
    visualTrigger: 'Spatial depth & pixel trails',
    audioMapping: 'Sets echo delay time & feedback',
    enabled: delayIntensity > 0.15,
    valueDisplay: `${Math.round(200 + delayMix * 250)} ms | ${Math.round(20 + delayMix * 50)}% Continuous Echo`,
    intensity: Number(delayIntensity.toFixed(2)),
  };

  const reverbConfig = {
    id: 'reverb' as const,
    name: 'Reverb',
    category: 'Acoustic Space',
    visualTrigger: 'Atmospheric light diffusion',
    audioMapping: 'Room reverb wet mix & decay',
    enabled: reverbIntensity > 0.15,
    valueDisplay: `${Math.round(reverbMix * 100)}% Wet | ${(1.5 + reverbMix * 3.5).toFixed(1)}s Space`,
    intensity: Number(reverbIntensity.toFixed(2)),
  };

  const chorusConfig = {
    id: 'chorus' as const,
    name: 'Chorus',
    category: 'Stereo Width',
    visualTrigger: 'Detail frequency spread',
    audioMapping: 'Natural stereo width & detuning',
    enabled: chorusIntensity > 0.25,
    valueDisplay: `${unisonVoices} Voices | ${Math.round(detuneCents)} Cents Width`,
    intensity: Number(chorusIntensity.toFixed(2)),
  };

  const phaserConfig = {
    id: 'phaser' as const,
    name: 'Phaser',
    category: 'Split-Toning',
    visualTrigger: 'Color temperature gradient',
    audioMapping: 'Spectrum frequency sweeping',
    enabled: phaserIntensity > 0.30,
    valueDisplay: `${lfoRate.toFixed(1)} Hz | ${Math.round(lfoDepth * 100)}% Sweep`,
    intensity: Number(phaserIntensity.toFixed(2)),
  };

  const flangerConfig = {
    id: 'flanger' as const,
    name: 'Flanger',
    category: 'Comb Filter',
    visualTrigger: 'Micro edge sharpness',
    audioMapping: 'Metallic comb filter swoosh',
    enabled: flangerIntensity > 0.35,
    valueDisplay: `${(2.0 + complexity * 3.0).toFixed(1)} ms | Comb Filter`,
    intensity: Number(flangerIntensity.toFixed(2)),
  };

  const distortionConfig = {
    id: 'distortion' as const,
    name: 'Distortion',
    category: 'Drive / Saturation',
    visualTrigger: 'Pixel grain & edge clipping',
    audioMapping: 'Drive & soft-clipping warmth',
    enabled: distortionIntensity > 0.35,
    valueDisplay: `+${Math.round(4 + distortionIntensity * 20)} dB Drive`,
    intensity: Number(distortionIntensity.toFixed(2)),
  };

  const baselinePatch: PatchParameters = {
    cutoffOffset,
    resonance,
    lfoRate,
    lfoDepth,

    masterVolume: -3.0,
    attackTime,
    decayTime,
    sustainLevel,
    releaseTime,
    limiterEnabled: true,
    threshold: -3.0,

    engineType: archetype,
    detuneCents,
    unisonVoices,
    fmRatio,
    fmAmount,
    subOscLevel,
    reverbMix,
    delayMix,

    effects: {
      delay: delayConfig,
      reverb: reverbConfig,
      chorus: chorusConfig,
      phaser: phaserConfig,
      flanger: flangerConfig,
      distortion: distortionConfig,
    },
    customLfoProfile: normalizedLfoProfile,
    physicalModel,
    temporalEraVal: temporalEra.eraVal,
    temporalEra,
    opticalFocusDepth: backgroundFeatures.opticalFocusDepth,
    gridSymmetryDensity: backgroundFeatures.gridSymmetryDensity,
    lightAzimuthAngle: backgroundFeatures.lightAzimuthAngle,
    lightElevationAngle: backgroundFeatures.lightElevationAngle,
    chromaticClash: backgroundFeatures.chromaticClash,
    semanticDensityWeight: backgroundFeatures.semanticDensityWeight,
  };

  return { metrics, baselinePatch };
}

/**
 * Extract 6 dominant representative colors for movie-style palette
 */
export function extractColorPalette(pixels: Uint8ClampedArray, count = 6): string[] {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const step = Math.max(1, Math.floor(pixels.length / (2000 * 4))) * 4;

  for (let i = 0; i < pixels.length; i += step) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const qr = Math.floor(r / 32) * 32;
    const qg = Math.floor(g / 32) * 32;
    const qb = Math.floor(b / 32) * 32;
    const key = `${qr},${qg},${qb}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const palette: string[] = [];

  for (const item of sorted) {
    if (palette.length >= count) break;
    const avgR = Math.round(item.r / item.count);
    const avgG = Math.round(item.g / item.count);
    const avgB = Math.round(item.b / item.count);
    const hex = '#' + [avgR, avgG, avgB].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();

    const isDuplicate = palette.some((existingHex) => {
      const er = parseInt(existingHex.slice(1, 3), 16);
      const eg = parseInt(existingHex.slice(3, 5), 16);
      const eb = parseInt(existingHex.slice(5, 7), 16);
      return Math.hypot(avgR - er, avgG - eg, avgB - eb) < 35;
    });

    if (!isDuplicate || sorted.length < count) {
      palette.push(hex);
    }
  }

  const fallbackColors = ['#0F172A', '#1E293B', '#0284C7', '#38BDF8', '#A855F7', '#EC4899'];
  while (palette.length < count) {
    palette.push(fallbackColors[palette.length] || '#000000');
  }

  return palette;
}
