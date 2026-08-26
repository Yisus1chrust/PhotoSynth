import { PatchParameters } from '../types/synth';

export interface PolyVoice {
  note: number;
  velocity: number;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  subOsc?: OscillatorNode;
  fmModulator?: OscillatorNode;
  fmGain?: GainNode;
  hammerClick?: OscillatorNode;
  hammerGain?: GainNode;
  shaperNode?: WaveShaperNode;
  filter: BiquadFilterNode;
  ampGain: GainNode;
  startTime: number;
}

export class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayMixGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbMixGain: GainNode | null = null;
  private chorusMixGain: GainNode | null = null;
  private phaserMixGain: GainNode | null = null;
  private flangerMixGain: GainNode | null = null;
  private distortionMixGain: GainNode | null = null;
  private masterSoftClipper: WaveShaperNode | null = null;
  private dcBlockerNode: IIRFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private globalLfo: OscillatorNode | null = null;
  private globalLfoGain: GainNode | null = null;
  private lastReverbDecay: number = 2.5;

  // Physical Modeling & Acoustic Resonance Nodes
  private bodyFilter1: BiquadFilterNode | null = null;
  private bodyFilter2: BiquadFilterNode | null = null;
  private bodyFilter3: BiquadFilterNode | null = null;
  private bodyMixGain: GainNode | null = null;
  private tapeFlutterDelay: DelayNode | null = null;
  private tapeFlutterLfo: OscillatorNode | null = null;
  private tapeFlutterGain: GainNode | null = null;
  private saturationShaper: WaveShaperNode | null = null;

  // Advanced Background Audio Engines (Panner, Ring Mod, Optical Depth, Sequencer & Physics)
  private pannerNode: StereoPannerNode | null = null;
  private ringModOsc: OscillatorNode | null = null;
  private ringModGain: GainNode | null = null;

  private activeVoices: Map<number, PolyVoice> = new Map();
  private fadingVoices: Set<PolyVoice> = new Set();
  private patchParams: PatchParameters | null = null;
  private isInitialized = false;

  constructor() {
    // AudioContext created lazily on user interaction
  }

  public async initAudio(): Promise<void> {
    if (this.isInitialized && this.ctx && this.ctx.state === 'running') return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // 1. Analyser Node
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;

    // 2. Master Gain & Limiter & Master Soft-Clipper
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3.0; // dB
    this.limiter.knee.value = 2.0;       // Smooth soft knee
    this.limiter.ratio.value = 20.0;     // Lookahead brickwall limiter ratio
    this.limiter.attack.value = 0.0005;  // 0.5ms ultra-fast attack
    this.limiter.release.value = 0.08;   // 80ms fast recovery

    this.masterSoftClipper = this.ctx.createWaveShaper();
    this.masterSoftClipper.curve = this.makeMasterSoftClipCurve() as unknown as Float32Array<ArrayBuffer>;
    this.masterSoftClipper.oversample = '2x';

    // 3. Effects: Delay & Reverb
    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.35; // 350ms delay
    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.value = 0.35;
    this.delayMixGain = this.ctx.createGain();
    this.delayMixGain.gain.value = 0.2;

    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.delayMixGain);

    // Synthetic Reverb Impulse
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this.createReverbImpulse(2.5, 2.0);
    this.reverbMixGain = this.ctx.createGain();
    this.reverbMixGain.gain.value = 0.3;

    // Additional Effect Mix Gains (Chorus, Phaser, Flanger, Distortion)
    this.chorusMixGain = this.ctx.createGain();
    this.chorusMixGain.gain.value = 0.2;

    this.phaserMixGain = this.ctx.createGain();
    this.phaserMixGain.gain.value = 0.2;

    this.flangerMixGain = this.ctx.createGain();
    this.flangerMixGain.gain.value = 0.2;

    this.distortionMixGain = this.ctx.createGain();
    this.distortionMixGain.gain.value = 0.15;

    // Body Resonance Filters (Physical Cavity Resonators)
    this.bodyFilter1 = this.ctx.createBiquadFilter();
    this.bodyFilter1.type = 'bandpass';
    this.bodyFilter1.frequency.value = 180;
    this.bodyFilter1.Q.value = 4.0;

    this.bodyFilter2 = this.ctx.createBiquadFilter();
    this.bodyFilter2.type = 'bandpass';
    this.bodyFilter2.frequency.value = 520;
    this.bodyFilter2.Q.value = 4.0;

    this.bodyFilter3 = this.ctx.createBiquadFilter();
    this.bodyFilter3.type = 'bandpass';
    this.bodyFilter3.frequency.value = 1400;
    this.bodyFilter3.Q.value = 4.0;

    this.bodyMixGain = this.ctx.createGain();
    this.bodyMixGain.gain.value = 0.15; // Controlled acoustic resonance blend

    // Tape Flutter & Micro Pitch Drift
    this.tapeFlutterDelay = this.ctx.createDelay(0.1);
    this.tapeFlutterDelay.delayTime.value = 0.01;
    this.tapeFlutterLfo = this.ctx.createOscillator();
    this.tapeFlutterLfo.type = 'sine';
    this.tapeFlutterLfo.frequency.value = 0.8;
    this.tapeFlutterGain = this.ctx.createGain();
    this.tapeFlutterGain.gain.value = 0.0003;
    this.tapeFlutterLfo.connect(this.tapeFlutterGain);
    this.tapeFlutterGain.connect(this.tapeFlutterDelay.delayTime);
    this.tapeFlutterLfo.start();

    // Analog Tube Hysteresis Saturation WaveShaper
    this.saturationShaper = this.ctx.createWaveShaper();
    this.saturationShaper.curve = this.makeAnalogSaturationCurve(0.3) as unknown as Float32Array<ArrayBuffer>;
    this.saturationShaper.oversample = '2x';

    // Global LFO for filter modulation
    this.globalLfo = this.ctx.createOscillator();
    this.globalLfo.type = 'sine';
    this.globalLfo.frequency.value = 2.0;
    this.globalLfoGain = this.ctx.createGain();
    this.globalLfoGain.gain.value = 300.0;
    this.globalLfo.connect(this.globalLfoGain);
    this.globalLfo.start();

    // DC-Blocking Filter: y[n] = x[n] - x[n-1] + 0.995 * y[n-1]
    const feedforward = [1, -1];
    const feedback = [1, -0.995];
    if (this.ctx.createIIRFilter) {
      this.dcBlockerNode = this.ctx.createIIRFilter(feedforward, feedback);
    }

    // Signal Routing Chain:
    // Voices -> MasterGain -> DCBlocker -> Parallel Body Cavity Resonators / Tape Flutter -> Analog Saturation -> (Limiter/FX) -> MasterSoftClipper -> Analyser -> Destination
    if (this.dcBlockerNode) {
      this.masterGain.connect(this.dcBlockerNode);

      this.dcBlockerNode.connect(this.tapeFlutterDelay);
      this.dcBlockerNode.connect(this.bodyFilter1);
      this.dcBlockerNode.connect(this.bodyFilter2);
      this.dcBlockerNode.connect(this.bodyFilter3);
    } else {
      this.masterGain.connect(this.tapeFlutterDelay);
      this.masterGain.connect(this.bodyFilter1);
      this.masterGain.connect(this.bodyFilter2);
      this.masterGain.connect(this.bodyFilter3);
    }

    this.bodyFilter1.connect(this.bodyMixGain);
    this.bodyFilter2.connect(this.bodyMixGain);
    this.bodyFilter3.connect(this.bodyMixGain);
    this.bodyMixGain.connect(this.tapeFlutterDelay);

    this.tapeFlutterDelay.connect(this.saturationShaper);

    this.saturationShaper.connect(this.limiter);
    this.saturationShaper.connect(this.delayNode);
    this.saturationShaper.connect(this.reverbNode);

    this.delayMixGain.connect(this.limiter);
    this.reverbNode.connect(this.reverbMixGain);
    this.reverbMixGain.connect(this.limiter);

    // Stereo Soundstage Panner Node
    if (this.ctx.createStereoPanner) {
      this.pannerNode = this.ctx.createStereoPanner();
      this.pannerNode.pan.value = 0.0;
    }

    // Ring Modulation / Harmonic Tension Generator
    this.ringModOsc = this.ctx.createOscillator();
    this.ringModOsc.type = 'sine';
    this.ringModOsc.frequency.value = 180;
    this.ringModGain = this.ctx.createGain();
    this.ringModGain.gain.value = 0.0;
    this.ringModOsc.connect(this.ringModGain);
    this.ringModGain.connect(this.masterGain);
    this.ringModOsc.start();

    if (this.pannerNode) {
      this.limiter.connect(this.pannerNode);
      this.pannerNode.connect(this.masterSoftClipper);
    } else {
      this.limiter.connect(this.masterSoftClipper);
    }
    this.masterSoftClipper.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.isInitialized = true;
  }

  private makeMasterSoftClipCurve(): Float32Array {
    const samples = 65536;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      // Hyperbolic tangent (tanh) soft-clipper:
      // Exact 1:1 linear gain near 0, smooth analog saturation approaching 1.0 without hard clipping
      curve[i] = Math.tanh(x);
    }
    return curve;
  }

  private createSpatialImpulse(duration: number, absorption: number, diffusion: number, luminanceDepth: number): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext missing');
    const sampleRate = this.ctx.sampleRate;
    const dur = Math.max(0.1, Math.min(6.0, duration));
    const length = Math.floor(sampleRate * dur);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // Early reflections (first 20-80ms)
    const earlyCount = Math.floor(8 + diffusion * 16);
    const earlyMaxSamples = Math.floor(sampleRate * (0.02 + luminanceDepth * 0.06));

    for (let e = 0; e < earlyCount; e++) {
      const pos = Math.floor((Math.random() * 0.9 + 0.1) * earlyMaxSamples);
      if (pos < length) {
        const amp = (1 - absorption * 0.7) * (1 - pos / earlyMaxSamples);
        left[pos] += (Math.random() * 2 - 1) * amp;
        right[pos] += (Math.random() * 2 - 1) * amp;
      }
    }

    // Diffuse tail decay with absorption damping
    const decayFactor = 1.2 + absorption * 4.0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decayFactor);
      const lpFilter = Math.exp(-t * (2.5 + absorption * 5.0));
      left[i] += (Math.random() * 2 - 1) * env * lpFilter;
      right[i] += (Math.random() * 2 - 1) * env * lpFilter;
    }

    return impulse;
  }

  private makeAnalogSaturationCurve(warmth: number): Float32Array {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const drive = 1.0 + warmth * 3.5;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const asymX = x > 0 ? x : x * (1 - warmth * 0.18);
      curve[i] = Math.tanh(asymX * drive) / Math.tanh(drive);
    }
    return curve;
  }

  private createReverbImpulse(duration: number, decay: number): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext missing');
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const env = Math.pow(1 - n, decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = typeof amount === 'number' && !isNaN(amount) ? amount : 20;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      const raw = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      // Normalize to prevent wild clipping spikes
      curve[i] = Math.max(-0.85, Math.min(0.85, raw * 0.45));
    }
    return curve;
  }

  public updateParameters(params: PatchParameters): void {
    this.patchParams = params;
    if (!this.ctx || !this.isInitialized) return;

    const now = this.ctx.currentTime;

    // Dynamic Gain Staging & Automatic Headroom Compensation
    const resonanceScaling = 1.0 / (1.0 + Math.pow(Math.max(0, params.resonance) / 3.5, 1.2) * 0.35);
    const fmScaling = 1.0 / (1.0 + (params.fmAmount || 0) * 0.45);
    const unisonScaling = 1.0 / Math.sqrt(Math.max(1, params.unisonVoices || 1));
    const bodyScaling = params.physicalModel
      ? 1.0 / (1.0 + (params.physicalModel.acousticWeight || 0) * 0.5)
      : 1.0;
    const saturationScaling = params.physicalModel
      ? 1.0 / (1.0 + (params.physicalModel.analogSaturationWarmth || 0) * 0.35)
      : 1.0;

    const autoHeadroomFactor = Math.min(
      1.0,
      Math.max(0.40, resonanceScaling * fmScaling * unisonScaling * bodyScaling * saturationScaling)
    );

    // Master volume (convert dB to linear gain with auto-headroom scaling)
    if (this.masterGain) {
      const volDb = Math.max(-60.0, Math.min(6.0, typeof params.masterVolume === 'number' && !isNaN(params.masterVolume) ? params.masterVolume : -3.0));
      const userMasterGain = Math.pow(10, volDb / 20);
      const totalMasterGain = Math.max(0.15, userMasterGain * autoHeadroomFactor * 0.55);
      this.masterGain.gain.setTargetAtTime(totalMasterGain, now, 0.02);
    }

    // Limiter toggle & threshold
    if (this.limiter) {
      const threshDb = Math.max(-30.0, Math.min(0.0, typeof params.threshold === 'number' && !isNaN(params.threshold) ? params.threshold : -3.0));
      const targetThreshold = params.limiterEnabled ? threshDb : -0.5;
      this.limiter.threshold.setTargetAtTime(targetThreshold, now, 0.02);
      this.limiter.ratio.setTargetAtTime(params.limiterEnabled ? 20.0 : 12.0, now, 0.02);
      this.limiter.attack.setTargetAtTime(0.001, now, 0.02);
      this.limiter.release.setTargetAtTime(0.05, now, 0.02);
    }

    // LFO Rate & Depth
    if (this.globalLfo && this.globalLfoGain) {
      this.globalLfo.frequency.setTargetAtTime(params.lfoRate, now, 0.05);
      // LFO Depth maps to filter cutoff modulation range (0 to 3000 Hz)
      const modAmount = params.lfoDepth * 2500;
      this.globalLfoGain.gain.setTargetAtTime(modAmount, now, 0.05);

      // Custom Periodic Wave for LFO constructed via DFT of image's spatial line profile
      if (params.customLfoProfile && params.customLfoProfile.length > 0) {
        const profile = params.customLfoProfile;
        const N = profile.length;
        const numHarmonics = Math.min(16, Math.floor(N / 2));
        const real = new Float32Array(numHarmonics);
        const imag = new Float32Array(numHarmonics);
        real[0] = 0;
        imag[0] = 0;
        for (let k = 1; k < numHarmonics; k++) {
          let sumR = 0;
          let sumI = 0;
          for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            sumR += profile[n] * Math.cos(angle);
            sumI += profile[n] * Math.sin(angle);
          }
          real[k] = sumR / N;
          imag[k] = sumI / N;
        }
        try {
          const customWave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
          this.globalLfo.setPeriodicWave(customWave);
        } catch {
          this.globalLfo.type = 'sine';
        }
      }
    }

    // FX Mix and 6-Effect Matrix toggles & Parameter Updates
    const fx = params.effects;

    if (this.delayMixGain && this.delayNode && this.delayFeedbackGain) {
      const isDelayOn = fx?.delay ? fx.delay.enabled : true;
      const p1 = fx?.delay?.param1 ?? fx?.delay?.intensity ?? 0.5;
      const p2 = fx?.delay?.param2 ?? fx?.delay?.intensity ?? 0.5;
      const timeSec = 0.05 + p1 * 0.75; // 50ms to 800ms
      const fbVal = isDelayOn ? p2 * 0.85 : 0.0;
      const mixVal = isDelayOn ? Math.max(params.delayMix || 0, p1 * 0.5) : 0.0;

      this.delayNode.delayTime.setTargetAtTime(timeSec, now, 0.05);
      this.delayFeedbackGain.gain.setTargetAtTime(fbVal, now, 0.05);
      this.delayMixGain.gain.setTargetAtTime(mixVal, now, 0.05);
    }

    if (this.reverbMixGain && this.reverbNode) {
      const isReverbOn = fx?.reverb ? fx.reverb.enabled : true;
      const p1 = fx?.reverb?.param1 ?? fx?.reverb?.intensity ?? 0.6;
      const p2 = fx?.reverb?.param2 ?? fx?.reverb?.intensity ?? 0.6;
      const wetVal = isReverbOn ? Math.max(params.reverbMix || 0, p1 * 0.8) : 0.0;
      this.reverbMixGain.gain.setTargetAtTime(wetVal, now, 0.05);

      const targetDecay = 0.5 + p2 * 5.5; // 0.5s to 6.0s
      if (Math.abs(targetDecay - this.lastReverbDecay) > 0.3) {
        this.lastReverbDecay = targetDecay;
        try {
          this.reverbNode.buffer = this.createReverbImpulse(targetDecay, 2.0);
        } catch {
          // Reverb impulse fallback
        }
      }
    }

    if (this.chorusMixGain) {
      const isChorusOn = fx?.chorus ? fx.chorus.enabled : true;
      const p2 = fx?.chorus?.param2 ?? fx?.chorus?.intensity ?? 0.45;
      const val = isChorusOn ? p2 * 0.45 : 0.0;
      this.chorusMixGain.gain.setTargetAtTime(val, now, 0.05);
    }

    if (this.phaserMixGain) {
      const isPhaserOn = fx?.phaser ? fx.phaser.enabled : true;
      const p2 = fx?.phaser?.param2 ?? fx?.phaser?.intensity ?? 0.5;
      const val = isPhaserOn ? p2 * 0.45 : 0.0;
      this.phaserMixGain.gain.setTargetAtTime(val, now, 0.05);
    }

    if (this.flangerMixGain) {
      const isFlangerOn = fx?.flanger ? fx.flanger.enabled : true;
      const p2 = fx?.flanger?.param2 ?? fx?.flanger?.intensity ?? 0.4;
      const val = isFlangerOn ? p2 * 0.45 : 0.0;
      this.flangerMixGain.gain.setTargetAtTime(val, now, 0.05);
    }

    if (this.distortionMixGain) {
      const isDistortionOn = fx?.distortion ? fx.distortion.enabled : true;
      const p1 = fx?.distortion?.param1 ?? fx?.distortion?.intensity ?? 0.35;
      const val = isDistortionOn ? p1 * 0.4 : 0.0;
      this.distortionMixGain.gain.setTargetAtTime(val, now, 0.05);
    }

    // Physical Modeling & Temporal Era Acoustic Modulation Updates
    const eraVal = typeof params.temporalEraVal === 'number'
      ? params.temporalEraVal
      : (params.temporalEra?.eraVal ?? 0.5);

    if (params.physicalModel) {
      const pm = params.physicalModel;

      if (this.bodyFilter1 && this.bodyFilter2 && this.bodyFilter3 && this.bodyMixGain) {
        const freqs = pm.bodyResonanceFreqs || [200, 600, 1800];
        const qVal = Math.max(0.5, 12.0 * (1 - pm.bodyDamping));
        this.bodyFilter1.frequency.setTargetAtTime(freqs[0], now, 0.05);
        this.bodyFilter1.Q.setTargetAtTime(qVal, now, 0.05);
        this.bodyFilter2.frequency.setTargetAtTime(freqs[1], now, 0.05);
        this.bodyFilter2.Q.setTargetAtTime(qVal, now, 0.05);
        this.bodyFilter3.frequency.setTargetAtTime(freqs[2], now, 0.05);
        this.bodyFilter3.Q.setTargetAtTime(qVal, now, 0.05);
        this.bodyMixGain.gain.setTargetAtTime(pm.acousticWeight * 0.25, now, 0.05);
      }

      if (this.tapeFlutterLfo && this.tapeFlutterGain) {
        const eraFlutterSpeed = eraVal < 0.38 ? 1.8 + (0.38 - eraVal) * 2.5 : 0.8;
        const eraFlutterDepth = eraVal < 0.38 ? 0.35 + (0.38 - eraVal) * 0.45 : 0.05;
        this.tapeFlutterLfo.frequency.setTargetAtTime(pm.tapeFlutterSpeed ?? eraFlutterSpeed, now, 0.05);
        const depthMs = (pm.tapeFlutterDepth ?? eraFlutterDepth) * 0.0006;
        this.tapeFlutterGain.gain.setTargetAtTime(depthMs, now, 0.05);
      }

      if (this.saturationShaper) {
        const eraWarmth = eraVal < 0.62 ? 0.5 + (0.62 - eraVal) * 0.6 : 0.2;
        this.saturationShaper.curve = this.makeAnalogSaturationCurve(pm.analogSaturationWarmth ?? eraWarmth) as unknown as Float32Array<ArrayBuffer>;
      }

      if (this.reverbNode && pm.spatialReflection) {
        try {
          const sr = pm.spatialReflection;
          this.reverbNode.buffer = this.createSpatialImpulse(
            sr.roomSizeSeconds,
            sr.absorption,
            sr.diffusion,
            sr.luminanceDepth
          );
        } catch {
          // Reverb impulse fallback
        }
      }
    }

    // 1. Spatial Frequency & "Image Focus" Grain (The Optical Depth Engine)
    const focusDepth = typeof params.opticalFocusDepth === 'number' ? params.opticalFocusDepth : 0.5;
    if (this.reverbMixGain && focusDepth < 0.38) {
      const washMix = (0.38 - focusDepth) * 0.45;
      this.reverbMixGain.gain.setTargetAtTime(Math.min(0.85, (params.reverbMix || 0.3) + washMix), now, 0.05);
    }

    // 2. Symmetry, Geometry & Fractal Grid Density (The Architectural Sequencer)
    const gridSymmetry = typeof params.gridSymmetryDensity === 'number' ? params.gridSymmetryDensity : 0.5;
    if (this.globalLfo && this.globalLfoGain) {
      if (gridSymmetry > 0.5) {
        const seqRate = 2.0 * Math.pow(2, Math.floor((gridSymmetry - 0.5) * 4)); // 2Hz, 4Hz, 8Hz, 16Hz
        this.globalLfo.frequency.setTargetAtTime(seqRate, now, 0.05);
        this.globalLfoGain.gain.setTargetAtTime(250.0 + gridSymmetry * 450.0, now, 0.05);
      } else {
        const droneRate = 0.1 + gridSymmetry * 0.8;
        this.globalLfo.frequency.setTargetAtTime(droneRate, now, 0.05);
        this.globalLfoGain.gain.setTargetAtTime(140.0, now, 0.05);
      }
    }

    // 3. Lighting Angle & Shadow Azimuth (The Virtual Soundstage Panner)
    const azimuth = typeof params.lightAzimuthAngle === 'number' ? params.lightAzimuthAngle : 180;
    const elevation = typeof params.lightElevationAngle === 'number' ? params.lightElevationAngle : 45;
    if (this.pannerNode) {
      let panX = Math.cos((azimuth * Math.PI) / 180);
      if (elevation > 65) {
        panX *= 0.25;
      }
      this.pannerNode.pan.setTargetAtTime(Math.max(-0.92, Math.min(0.92, panX * 0.75)), now, 0.05);
    }

    // 4. Color Contrast Saturation & Complementary Hue Clash (The Harmonic Tension Generator)
    const chromaticClash = typeof params.chromaticClash === 'number' ? params.chromaticClash : 0.2;
    if (this.ringModGain && this.ringModOsc) {
      if (chromaticClash > 0.35) {
        const clashFreq = 120 + chromaticClash * 180;
        this.ringModOsc.frequency.setTargetAtTime(clashFreq, now, 0.05);
        this.ringModGain.gain.setTargetAtTime((chromaticClash - 0.35) * 0.16, now, 0.05);
      } else {
        this.ringModGain.gain.setTargetAtTime(0.0, now, 0.05);
      }
    }

    // 5. Semantic Object "Weight" & Density (The Material Physics Matrix)
    const densityWeight = typeof params.semanticDensityWeight === 'number' ? params.semanticDensityWeight : 0.5;
    if (this.bodyFilter1 && this.bodyFilter2 && this.bodyFilter3) {
      if (densityWeight > 0.6) {
        this.bodyFilter1.frequency.setTargetAtTime(45, now, 0.05);
        this.bodyFilter2.frequency.setTargetAtTime(95, now, 0.05);
        this.bodyFilter3.frequency.setTargetAtTime(220, now, 0.05);
      } else if (densityWeight < 0.35) {
        this.bodyFilter1.frequency.setTargetAtTime(1150, now, 0.05);
        this.bodyFilter2.frequency.setTargetAtTime(2400, now, 0.05);
        this.bodyFilter3.frequency.setTargetAtTime(3600, now, 0.05);
      }
    }

    // Update ongoing active voice filters
    this.activeVoices.forEach((voice) => {
      voice.filter.frequency.setTargetAtTime(params.cutoffOffset, now, 0.05);
      voice.filter.Q.setTargetAtTime(params.resonance, now, 0.05);
    });
  }

  private killVoiceImmediately(voice: PolyVoice, fadeSec = 0.002): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      voice.ampGain.gain.cancelScheduledValues(now);
      const currentVal = voice.ampGain.gain.value;
      voice.ampGain.gain.setValueAtTime(Math.max(0.0001, currentVal), now);
      voice.ampGain.gain.linearRampToValueAtTime(0.00001, now + fadeSec);
    } catch {
      // ignore scheduling errors if already inactive
    }

    const cleanupDelayMs = Math.ceil((fadeSec + 0.003) * 1000);
    setTimeout(() => {
      this.cleanupVoiceNodes(voice);
    }, cleanupDelayMs);
  }

  private cleanupVoiceNodes(voice: PolyVoice): void {
    try { voice.osc1.stop(); voice.osc1.disconnect(); } catch {}
    try { voice.osc2.stop(); voice.osc2.disconnect(); } catch {}
    try { if (voice.subOsc) { voice.subOsc.stop(); voice.subOsc.disconnect(); } } catch {}
    try { if (voice.fmModulator) { voice.fmModulator.stop(); voice.fmModulator.disconnect(); } } catch {}
    try { if (voice.fmGain) voice.fmGain.disconnect(); } catch {}
    try { if (voice.hammerClick) { voice.hammerClick.stop(); voice.hammerClick.disconnect(); } } catch {}
    try { if (voice.hammerGain) voice.hammerGain.disconnect(); } catch {}
    try { if (voice.shaperNode) voice.shaperNode.disconnect(); } catch {}
    try { voice.filter.disconnect(); } catch {}
    try { voice.ampGain.disconnect(); } catch {}
  }

  public noteOn(midiNote: number, velocity = 0.8): void {
    if (!this.isInitialized || !this.ctx || !this.patchParams) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // 1. Immediate Voice Retriggering & Fast Voice Stealing (2ms crossfade)
    if (this.activeVoices.has(midiNote)) {
      const activeVoice = this.activeVoices.get(midiNote)!;
      this.killVoiceImmediately(activeVoice, 0.002);
      this.activeVoices.delete(midiNote);
    }

    // Instantly kill any fading release tails for this note so rapid inputs do not smear
    this.fadingVoices.forEach((v) => {
      if (v.note === midiNote) {
        this.killVoiceImmediately(v, 0.002);
        this.fadingVoices.delete(v);
      }
    });

    // Max Polyphony Hard Stealing (steal oldest voice if >= 10 active)
    if (this.activeVoices.size >= 10) {
      let oldestNote: number | null = null;
      let oldestTime = Infinity;
      this.activeVoices.forEach((v, note) => {
        if (v.startTime < oldestTime) {
          oldestTime = v.startTime;
          oldestNote = note;
        }
      });
      if (oldestNote !== null) {
        const oldestVoice = this.activeVoices.get(oldestNote)!;
        this.killVoiceImmediately(oldestVoice, 0.002);
        this.activeVoices.delete(oldestNote);
      }
    }

    // Limit fading release tails to prevent audio choke during fast runs
    if (this.fadingVoices.size >= 8) {
      let oldestFading: PolyVoice | null = null;
      let oldestTime = Infinity;
      this.fadingVoices.forEach((v) => {
        if (v.startTime < oldestTime) {
          oldestTime = v.startTime;
          oldestFading = v;
        }
      });
      if (oldestFading) {
        this.killVoiceImmediately(oldestFading, 0.002);
        this.fadingVoices.delete(oldestFading);
      }
    }

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const params = this.patchParams;
    const now = this.ctx.currentTime;

    // Dynamic Physical Transient Exciter (Hammer / Pluck / Strike / Bow)
    const tp = params.physicalModel?.transientProfile;

    // 2. Voice Amp Gain Envelope (Guaranteed 2ms micro-attack floor for zero-latency response)
    const ampGain = this.ctx.createGain();
    ampGain.gain.setValueAtTime(0, now);

    let engineGainBoost = 1.0;
    if (params.engineType === 'acoustic_piano_organ') {
      engineGainBoost = 1.85; // Triangle/sine waves have lower RMS energy
    } else if (params.engineType === 'overdriven_saw_stack' || params.engineType === 'analog_brass') {
      engineGainBoost = 1.35; // Waveshaper compensation
    } else if (params.engineType === 'fm_square_bell' || params.engineType === 'digital_fm_bells') {
      engineGainBoost = 1.25;
    } else {
      engineGainBoost = 1.20;
    }

    const activeVoiceCount = Math.max(1, this.activeVoices.size + 1);
    const polyphonicScale = Math.max(0.70, 1.0 / Math.pow(activeVoiceCount, 0.15));
    const unisonScale = 1.0 / Math.sqrt(Math.max(1, params.unisonVoices || 1));
    const peakAmp = Math.min(0.45, Math.max(0.10, velocity * 0.35 * unisonScale * polyphonicScale * engineGainBoost));

    // ADSR Envelope: 2ms micro-attack floor gives instant transient response
    const microAttackFloor = 0.002;
    const safeAttack = Math.max(microAttackFloor, Math.min(5.0, params.attackTime || 0.005));
    const safeDecay = Math.max(0.01, Math.min(10.0, params.decayTime || 0.8));
    const safeSustain = Math.max(0.35, Math.min(1.0, params.sustainLevel ?? 0.7));

    const attackEnd = now + safeAttack;
    ampGain.gain.linearRampToValueAtTime(peakAmp, attackEnd);
    ampGain.gain.setTargetAtTime(
      peakAmp * safeSustain,
      attackEnd,
      safeDecay
    );

    // 3. Resonant Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const safeCutoff = Math.max(350, Math.min(20000, params.cutoffOffset || 2500));
    const safeRes = Math.max(0.1, Math.min(10.0, params.resonance || 1.0));
    filter.frequency.setValueAtTime(safeCutoff, now);
    filter.Q.setValueAtTime(safeRes, now);

    // Filter Envelope Sweep with healthy cutoff floor so fundamental frequencies are never muffled out
    filter.frequency.cancelScheduledValues(now);
    const startCutoff = Math.max(350, safeCutoff * 0.6);
    const targetCutoff = Math.min(20000, Math.max(1200, safeCutoff * 2.0));
    filter.frequency.setValueAtTime(startCutoff, now);
    filter.frequency.exponentialRampToValueAtTime(
      targetCutoff,
      now + safeAttack * 1.5
    );

    // Dynamic Physical Transient Exciter (Hammer / Pluck / Strike / Bow)
    if (tp) {
      const exciter = this.ctx.createOscillator();
      const exciterGain = this.ctx.createGain();
      const exciterFilter = this.ctx.createBiquadFilter();

      if (tp.type === 'hammer' || tp.type === 'strike' || tp.type === 'pluck') {
        exciter.type = tp.type === 'strike' ? 'square' : 'triangle';
        const mult = tp.type === 'strike' ? 5.5 : tp.type === 'hammer' ? 3.2 : 2.5;
        exciter.frequency.setValueAtTime(freq * mult, now);

        exciterFilter.type = tp.type === 'pluck' ? 'highpass' : 'bandpass';
        exciterFilter.frequency.setValueAtTime(freq * (1.8 + tp.hardness * 2.5), now);

        const peakGain = velocity * (0.15 + tp.hardness * 0.30) * unisonScale;
        const dur = tp.type === 'strike' ? 0.015 : tp.type === 'hammer' ? 0.035 : 0.025;

        const exciterRamp = 0.003; // 3ms micro fade-in
        exciterGain.gain.setValueAtTime(0, now);
        exciterGain.gain.linearRampToValueAtTime(peakGain, now + exciterRamp);
        exciterGain.gain.exponentialRampToValueAtTime(0.0001, now + exciterRamp + dur);

        exciter.connect(exciterFilter);
        exciterFilter.connect(exciterGain);
        exciterGain.connect(filter);

        exciter.start(now);
        exciter.stop(now + dur + exciterRamp + 0.01);
      }
    }

    // Connect LFO to Filter
    if (this.globalLfoGain) {
      this.globalLfoGain.connect(filter.frequency);
    }

    // 4. Oscillators & Synthesis Engine Topological Swapping
    let osc1: OscillatorNode;
    let osc2: OscillatorNode;
    let subOsc: OscillatorNode | undefined;
    let fmModulator: OscillatorNode | undefined;
    let fmGain: GainNode | undefined;
    let hammerClick: OscillatorNode | undefined;
    let hammerGain: GainNode | undefined;
    let shaperNode: WaveShaperNode | undefined;

    const detuneVal = params.detuneCents || 5.0;

    if (params.engineType === 'acoustic_piano_organ') {
      osc1 = this.ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);

      osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * Math.max(1.0, params.fmRatio || 2.0), now);

      subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq / 2, now);

      const subGain = this.ctx.createGain();
      subGain.gain.value = (params.subOscLevel || 0.4) * 0.7;
      subOsc.connect(subGain);
      subGain.connect(filter);
      subOsc.start(now);

      hammerClick = this.ctx.createOscillator();
      hammerClick.type = 'sine';
      hammerClick.frequency.setValueAtTime(freq * 3.8, now);
      hammerGain = this.ctx.createGain();
      const hammerRamp = 0.003;
      hammerGain.gain.setValueAtTime(0, now);
      hammerGain.gain.linearRampToValueAtTime(velocity * 0.8, now + hammerRamp);
      hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + hammerRamp + 0.025);
      hammerClick.connect(hammerGain);
      hammerGain.connect(filter);
      hammerClick.start(now);
      hammerClick.stop(now + hammerRamp + 0.03);

      osc1.connect(filter);
      osc2.connect(filter);

    } else if (params.engineType === 'overdriven_saw_stack' || params.engineType === 'analog_brass') {
      osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.detune.setValueAtTime(-detuneVal * 1.5, now);

      osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq, now);
      osc2.detune.setValueAtTime(detuneVal * 1.5, now);

      subOsc = this.ctx.createOscillator();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(freq * 1.008, now);

      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.5;
      subOsc.connect(subGain);

      shaperNode = this.ctx.createWaveShaper();
      shaperNode.curve = this.makeDistortionCurve(30 + (params.fmAmount || 0.3) * 50) as unknown as Float32Array<ArrayBuffer>;
      shaperNode.oversample = '4x';

      osc1.connect(shaperNode);
      osc2.connect(shaperNode);
      subGain.connect(shaperNode);
      shaperNode.connect(filter);

      subOsc.start(now);

    } else if (params.engineType === 'fm_square_bell' || params.engineType === 'digital_fm_bells') {
      osc1 = this.ctx.createOscillator();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(freq, now);

      osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * Math.max(1, Math.round(params.fmRatio || 2.0)), now);
      osc2.detune.setValueAtTime(detuneVal, now);

      fmModulator = this.ctx.createOscillator();
      fmModulator.type = 'sine';
      fmModulator.frequency.setValueAtTime(freq * (params.fmRatio || 3.0), now);

      fmGain = this.ctx.createGain();
      const fmModDepth = freq * (params.fmAmount || 0.4) * 5.0;
      const fmRamp = 0.003;
      fmGain.gain.setValueAtTime(0, now);
      fmGain.gain.linearRampToValueAtTime(fmModDepth, now + fmRamp);
      fmGain.gain.exponentialRampToValueAtTime(0.001, now + fmRamp + Math.max(0.05, params.decayTime * 0.8));

      fmModulator.connect(fmGain);
      fmGain.connect(osc1.frequency);
      fmModulator.start(now);

      subOsc = this.ctx.createOscillator();
      subOsc.type = 'square';
      subOsc.frequency.setValueAtTime(freq / 2, now);
      const subGain = this.ctx.createGain();
      subGain.gain.value = (params.subOscLevel || 0.3) * 0.5;
      subOsc.connect(subGain);
      subGain.connect(filter);
      subOsc.start(now);

      osc1.connect(filter);
      osc2.connect(filter);

    } else {
      osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);

      osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq, now);
      osc2.detune.setValueAtTime(detuneVal * 1.5, now);

      subOsc = this.ctx.createOscillator();
      subOsc.type = 'square';
      subOsc.frequency.setValueAtTime(freq / 2, now);
      const subGain = this.ctx.createGain();
      subGain.gain.value = params.subOscLevel;
      subOsc.connect(subGain);
      subGain.connect(filter);
      subOsc.start(now);

      osc1.connect(filter);
      osc2.connect(filter);
    }

    // Connect Filter -> AmpGain -> Master
    filter.connect(ampGain);

    if (this.masterGain) {
      ampGain.connect(this.masterGain);
    }

    osc1.start(now);
    osc2.start(now);

    this.activeVoices.set(midiNote, {
      note: midiNote,
      velocity,
      osc1,
      osc2,
      subOsc,
      fmModulator,
      fmGain,
      hammerClick,
      hammerGain,
      shaperNode,
      filter,
      ampGain,
      startTime: now,
    });
  }

  public noteOff(midiNote: number): void {
    if (!this.ctx || !this.activeVoices.has(midiNote) || !this.patchParams) return;

    const voice = this.activeVoices.get(midiNote)!;
    this.activeVoices.delete(midiNote);
    this.fadingVoices.add(voice);

    const now = this.ctx.currentTime;
    const release = Math.max(0.02, this.patchParams.releaseTime);

    try {
      voice.ampGain.gain.cancelScheduledValues(now);
      const currentGain = voice.ampGain.gain.value;
      voice.ampGain.gain.setValueAtTime(Math.max(0.0001, currentGain), now);
      voice.ampGain.gain.linearRampToValueAtTime(0.00001, now + release);
    } catch {
      // ignore
    }

    const stopDelayMs = Math.ceil((release + 0.05) * 1000);
    setTimeout(() => {
      this.cleanupVoiceNodes(voice);
      this.fadingVoices.delete(voice);
    }, stopDelayMs);
  }

  public panic(): void {
    if (!this.ctx) return;
    this.activeVoices.forEach((voice) => {
      this.killVoiceImmediately(voice, 0.002);
    });
    this.activeVoices.clear();

    this.fadingVoices.forEach((voice) => {
      this.killVoiceImmediately(voice, 0.002);
    });
    this.fadingVoices.clear();
  }

  public getWaveformData(array: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(array as unknown as Uint8Array<ArrayBuffer>);
    }
  }

  public getSpectrumData(array: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(array as unknown as Uint8Array<ArrayBuffer>);
    }
  }
}

export const globalAudioEngine = new WebAudioEngine();
