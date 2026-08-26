import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ImageMetrics,
  PatchParameters,
  PresetPhoto,
  SelectedColorPoint,
  ImageEffectsState,
  createDefaultEffects,
} from './types/synth';
import { getSamplePresetPhotos } from './data/sampleImages';
import { analyzeImage } from './audio/ImageAnalyzer';
import { globalAudioEngine } from './audio/WebAudioEngine';
import { calculateBlendedPatch } from './utils/colorBlending';
import { safeJsonStringify, safeJsonParse, safeDeepClone } from './utils/safeJson';
import { interpolatePatchParameters, interpolateImageMetrics } from './utils/morphEngine';

import { RadialGauge } from './components/RadialGauge';
import { ImageDropzone } from './components/ImageDropzone';
import { EditableParameters } from './components/EditableParameters';
import { MorphBar } from './components/MorphBar';
import { SavePresetModal } from './components/SavePresetModal';
import { EffectsModal } from './components/EffectsModal';
import { DeletePresetModal } from './components/DeletePresetModal';
import { DeepDiveModal } from './components/DeepDiveModal';
import { Trash2, Keyboard, Activity, Cpu } from 'lucide-react';

const STORAGE_KEY = 'paint_a_synth_user_presets';

interface SlotData {
  id: string;
  title: string;
  dataUrl: string;
  metrics: ImageMetrics;
  patch: PatchParameters;
}

export default function App() {
  const samplePresets = useRef(getSamplePresetPhotos()).current;

  // State
  const [userPresets, setUserPresets] = useState<PresetPhoto[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = safeJsonParse<PresetPhoto[]>(saved, []);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('Failed to load user presets from localStorage:', err);
    }
    return [];
  });

  // Keep localStorage in sync with userPresets
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, safeJsonStringify(userPresets));
    } catch (e) {
      console.warn('LocalStorage quota error while saving presets, attempting lightweight fallback:', e);
      try {
        const lightweightPresets = userPresets.map((p) => ({
          ...p,
          dataUrl: p.dataUrl && p.dataUrl.length > 300000 ? '' : p.dataUrl,
        }));
        localStorage.setItem(STORAGE_KEY, safeJsonStringify(lightweightPresets));
      } catch (err2) {
        console.error('Failed to write user presets to localStorage:', err2);
      }
    }
  }, [userPresets]);

  // A/B Morphing Slots
  const [slotA, setSlotA] = useState<SlotData | null>(null);
  const [slotB, setSlotB] = useState<SlotData | null>(null);
  const [morphValue, setMorphValue] = useState<number>(0.0);
  const [isAutoSweeping, setIsAutoSweeping] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(120);
  const [isEditingBpm, setIsEditingBpm] = useState<boolean>(false);
  const [bpmInputVal, setBpmInputVal] = useState<string>('120');

  const [metrics, setMetrics] = useState<ImageMetrics | null>(null);
  const [patch, setPatch] = useState<PatchParameters | null>(null);
  const [baselinePatch, setBaselinePatch] = useState<PatchParameters | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [audioStarted, setAudioStarted] = useState<boolean>(false);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isEffectsModalOpen, setIsEffectsModalOpen] = useState<boolean>(false);
  const [isDeepDiveOpen, setIsDeepDiveOpen] = useState<boolean>(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [showKeyboard, setShowKeyboard] = useState<boolean>(true);
  const [selectedColorPoints, setSelectedColorPoints] = useState<SelectedColorPoint[]>([]);
  const [presetToDeleteId, setPresetToDeleteId] = useState<string | null>(null);

  // Helper to process image source into compact base64 data & metrics
  const processImageSourceToData = useCallback(
    async (source: File | string, presetTitle?: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        if (typeof source === 'string') {
          img.src = source;
        } else {
          img.src = URL.createObjectURL(source);
        }
      });

      const loadedImg = await loadPromise;

      let previewUrl: string;
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let w = loadedImg.width || 300;
        let h = loadedImg.height || 300;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(loadedImg, 0, 0, canvas.width, canvas.height);
          previewUrl = canvas.toDataURL('image/jpeg', 0.85);
        } else {
          previewUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
        }
      } catch {
        previewUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
      }

      const { metrics: extractedMetrics, baselinePatch: generatedPatch } =
        await analyzeImage(loadedImg);

      return {
        dataUrl: previewUrl,
        metrics: extractedMetrics,
        patch: generatedPatch,
        title:
          presetTitle ||
          (typeof source === 'string' ? 'Preset Image' : source.name || 'Custom Image'),
      };
    },
    []
  );

  // Load Slot A
  const loadSlotA = useCallback(
    async (source: File | string, presetTitle?: string, presetId?: string) => {
      setIsLoading(true);
      setSelectedColorPoints([]);
      try {
        const data = await processImageSourceToData(source, presetTitle);
        const newSlotA: SlotData = {
          id: presetId || `slot-a-${Date.now()}`,
          title: data.title,
          dataUrl: data.dataUrl,
          metrics: data.metrics,
          patch: data.patch,
        };

        setSlotA(newSlotA);
        setImagePreviewUrl(data.dataUrl);

        if (slotB) {
          const morphedP = interpolatePatchParameters(newSlotA.patch, slotB.patch, morphValue);
          const morphedM = interpolateImageMetrics(newSlotA.metrics, slotB.metrics, morphValue);
          setPatch(morphedP);
          setBaselinePatch(morphedP);
          setMetrics(morphedM);
          await globalAudioEngine.initAudio();
          globalAudioEngine.updateParameters(morphedP);
        } else {
          setPatch(data.patch);
          setBaselinePatch(data.patch);
          setMetrics(data.metrics);
          await globalAudioEngine.initAudio();
          globalAudioEngine.updateParameters(data.patch);
        }
        setAudioStarted(true);
      } catch (err) {
        console.error('Failed to load Slot A:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [processImageSourceToData, slotB, morphValue]
  );

  // Load Slot B
  const loadSlotB = useCallback(
    async (source: File | string, presetTitle?: string, presetId?: string) => {
      try {
        const data = await processImageSourceToData(source, presetTitle);
        const newSlotB: SlotData = {
          id: presetId || `slot-b-${Date.now()}`,
          title: data.title,
          dataUrl: data.dataUrl,
          metrics: data.metrics,
          patch: data.patch,
        };

        setSlotB(newSlotB);

        if (slotA) {
          const morphedP = interpolatePatchParameters(slotA.patch, newSlotB.patch, morphValue);
          const morphedM = interpolateImageMetrics(slotA.metrics, newSlotB.metrics, morphValue);
          setPatch(morphedP);
          setBaselinePatch(morphedP);
          setMetrics(morphedM);
          globalAudioEngine.updateParameters(morphedP);
        }
      } catch (err) {
        console.error('Failed to load Slot B:', err);
      }
    },
    [processImageSourceToData, slotA, morphValue]
  );

  // Initial load on mount: Slot A = Preset 0, Slot B = Preset 1
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current && samplePresets.length >= 2) {
      initialLoadDone.current = true;
      loadSlotA(samplePresets[0].dataUrl, samplePresets[0].title, samplePresets[0].id).then(() => {
        loadSlotB(samplePresets[1].dataUrl, samplePresets[1].title, samplePresets[1].id);
      });
      setSelectedPresetId(samplePresets[0].id);
    }
  }, [loadSlotA, loadSlotB, samplePresets]);

  // Morph slider change handler
  const handleMorphChange = useCallback(
    (val: number) => {
      setMorphValue(val);
      if (slotA && slotB) {
        const morphedP = interpolatePatchParameters(slotA.patch, slotB.patch, val);
        const morphedM = interpolateImageMetrics(slotA.metrics, slotB.metrics, val);
        setPatch(morphedP);
        setMetrics(morphedM);
        globalAudioEngine.updateParameters(morphedP);
      }
    },
    [slotA, slotB]
  );

  // Auto Sweep LFO loop
  const animRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    if (!isAutoSweeping) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    let lastTime = performance.now();
    const loop = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      // Auto sweep speed linked directly to BPM:
      // 16 beats (4 bars) full crossfade cycle: T = (60 / bpm) * 16 = 960 / bpm seconds
      const safeBpm = Math.max(20, Math.min(300, bpm || 120));
      const cycleSeconds = 960 / safeBpm;
      const omega = (Math.PI * 2) / cycleSeconds;

      phaseRef.current += delta * omega;
      const newMorph = (Math.sin(phaseRef.current) + 1) / 2;

      setMorphValue(newMorph);

      if (slotA && slotB) {
        const morphedP = interpolatePatchParameters(slotA.patch, slotB.patch, newMorph);
        const morphedM = interpolateImageMetrics(slotA.metrics, slotB.metrics, newMorph);
        setPatch(morphedP);
        setMetrics(morphedM);
        globalAudioEngine.updateParameters(morphedP);
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isAutoSweeping, slotA, slotB, bpm]);

  // Preset Selection Handlers
  const handleSelectSlotA = (presetId: string) => {
    setSelectedPresetId(presetId);
    const userMatch = userPresets.find((p) => p.id === presetId);
    if (userMatch && userMatch.dataUrl && userMatch.customPatch && userMatch.customMetrics) {
      const newSlotA: SlotData = {
        id: userMatch.id,
        title: userMatch.title,
        dataUrl: userMatch.dataUrl,
        metrics: userMatch.customMetrics,
        patch: userMatch.customPatch,
      };
      setSlotA(newSlotA);
      setImagePreviewUrl(userMatch.dataUrl);
      if (slotB) {
        const morphedP = interpolatePatchParameters(newSlotA.patch, slotB.patch, morphValue);
        const morphedM = interpolateImageMetrics(newSlotA.metrics, slotB.metrics, morphValue);
        setPatch(morphedP);
        setBaselinePatch(morphedP);
        setMetrics(morphedM);
        globalAudioEngine.updateParameters(morphedP);
      } else {
        setPatch(userMatch.customPatch);
        setBaselinePatch(userMatch.customPatch);
        setMetrics(userMatch.customMetrics);
        globalAudioEngine.updateParameters(userMatch.customPatch);
      }
      return;
    }

    const factoryMatch = samplePresets.find((p) => p.id === presetId);
    if (factoryMatch) {
      loadSlotA(factoryMatch.dataUrl, factoryMatch.title, factoryMatch.id);
    }
  };

  const handleSelectSlotB = (presetId: string) => {
    const userMatch = userPresets.find((p) => p.id === presetId);
    if (userMatch && userMatch.dataUrl && userMatch.customPatch && userMatch.customMetrics) {
      const newSlotB: SlotData = {
        id: userMatch.id,
        title: userMatch.title,
        dataUrl: userMatch.dataUrl,
        metrics: userMatch.customMetrics,
        patch: userMatch.customPatch,
      };
      setSlotB(newSlotB);
      if (slotA) {
        const morphedP = interpolatePatchParameters(slotA.patch, newSlotB.patch, morphValue);
        const morphedM = interpolateImageMetrics(slotA.metrics, newSlotB.metrics, morphValue);
        setPatch(morphedP);
        setBaselinePatch(morphedP);
        setMetrics(morphedM);
        globalAudioEngine.updateParameters(morphedP);
      }
      return;
    }

    const factoryMatch = samplePresets.find((p) => p.id === presetId);
    if (factoryMatch) {
      loadSlotB(factoryMatch.dataUrl, factoryMatch.title, factoryMatch.id);
    }
  };

  // Effect toggling handlers
  const handleToggleEffect = useCallback((effectId: keyof ImageEffectsState) => {
    setPatch((prev) => {
      if (!prev) return prev;
      const currentEffects = prev.effects || createDefaultEffects();
      const updatedEffects: ImageEffectsState = {
        ...currentEffects,
        [effectId]: {
          ...currentEffects[effectId],
          enabled: !currentEffects[effectId].enabled,
        },
      };
      const updatedPatch: PatchParameters = {
        ...prev,
        effects: updatedEffects,
      };
      globalAudioEngine.updateParameters(updatedPatch);
      return updatedPatch;
    });
  }, []);

  const handleToggleAllEffects = useCallback((enable: boolean) => {
    setPatch((prev) => {
      if (!prev) return prev;
      const currentEffects = prev.effects || createDefaultEffects();
      const keys: (keyof ImageEffectsState)[] = ['delay', 'reverb', 'chorus', 'phaser', 'flanger', 'distortion'];
      const updatedEffects = { ...currentEffects };
      keys.forEach((k) => {
        updatedEffects[k] = {
          ...updatedEffects[k],
          enabled: enable,
        };
      });
      const updatedPatch: PatchParameters = {
        ...prev,
        effects: updatedEffects,
      };
      globalAudioEngine.updateParameters(updatedPatch);
      return updatedPatch;
    });
  }, []);

  const handleUpdateEffectParam = useCallback((
    effectId: keyof ImageEffectsState,
    paramNum: 1 | 2,
    val: number
  ) => {
    setPatch((prev) => {
      if (!prev) return prev;
      const currentEffects = prev.effects || createDefaultEffects();
      const targetEffect = currentEffects[effectId];
      if (!targetEffect) return prev;

      const p1 = paramNum === 1 ? val : (targetEffect.param1 ?? targetEffect.intensity);
      const p2 = paramNum === 2 ? val : (targetEffect.param2 ?? targetEffect.intensity);

      let valueDisplay = targetEffect.valueDisplay;
      switch (effectId) {
        case 'delay':
          valueDisplay = `${Math.round(50 + p1 * 750)} ms | ${Math.round(p2 * 90)}% FB`;
          break;
        case 'reverb':
          valueDisplay = `${Math.round(p1 * 100)}% Wet | ${(0.5 + p2 * 5.5).toFixed(1)}s Decay`;
          break;
        case 'chorus':
          valueDisplay = `${Math.round(1 + p1 * 5)} Voices | +${Math.round(p2 * 30)} Cents`;
          break;
        case 'phaser':
          valueDisplay = `${(0.1 + p1 * 3.9).toFixed(2)} Hz | ${Math.round(p2 * 100)}% Sweep`;
          break;
        case 'flanger':
          valueDisplay = `${(0.5 + p1 * 9.5).toFixed(1)} ms | ${Math.round(p2 * 90)}% FB`;
          break;
        case 'distortion':
          valueDisplay = `+${Math.round(p1 * 30)} dB Drive | ${p2 > 0.5 ? 'Hard Clip' : 'Soft Clip'}`;
          break;
      }

      const updatedEffects: ImageEffectsState = {
        ...currentEffects,
        [effectId]: {
          ...targetEffect,
          param1: p1,
          param2: p2,
          valueDisplay,
        },
      };

      const updatedPatch: PatchParameters = {
        ...prev,
        effects: updatedEffects,
        ...(effectId === 'delay' ? { delayMix: p1 * 0.5 } : {}),
        ...(effectId === 'reverb' ? { reverbMix: p1 * 0.8 } : {}),
      };

      globalAudioEngine.updateParameters(updatedPatch);
      return updatedPatch;
    });
  }, []);

  const handleUpdateEffectIntensity = useCallback((effectId: keyof ImageEffectsState, intensity: number) => {
    handleUpdateEffectParam(effectId, 1, intensity);
  }, [handleUpdateEffectParam]);

  // Color selection & blending handlers
  const handleAddColorPoint = useCallback(
    (pct: number, hex: string, rgb: [number, number, number]) => {
      if (!baselinePatch) return;

      setSelectedColorPoints((prev) => {
        let updated: SelectedColorPoint[];
        const newPoint: SelectedColorPoint = {
          id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          pct,
          hex,
          rgb,
        };

        if (prev.length < 3) {
          updated = [...prev, newPoint];
        } else {
          let closestIdx = 0;
          let minDiff = Infinity;
          prev.forEach((p, idx) => {
            const diff = Math.abs(p.pct - pct);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = idx;
            }
          });
          updated = [...prev];
          updated[closestIdx] = newPoint;
        }

        const blendedPatch = calculateBlendedPatch(baselinePatch, updated);
        setPatch(blendedPatch);
        globalAudioEngine.updateParameters(blendedPatch);

        return updated;
      });
    },
    [baselinePatch]
  );

  const handleRemoveColorPoint = useCallback(
    (id: string) => {
      if (!baselinePatch) return;

      setSelectedColorPoints((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        const blendedPatch = calculateBlendedPatch(baselinePatch, updated);
        setPatch(blendedPatch);
        globalAudioEngine.updateParameters(blendedPatch);
        return updated;
      });
    },
    [baselinePatch]
  );

  const handleSaveUserPreset = (name: string, description: string) => {
    if (!patch) return;

    const newPreset: PresetPhoto = {
      id: `user-${Date.now()}`,
      title: name,
      description: description || `Crossfade: ${Math.round(morphValue * 100)}% · ${bpm} BPM`,
      category: 'User Preset',
      dataUrl: slotA?.dataUrl || samplePresets[0]?.dataUrl || '',
      slotA: slotA
        ? {
            id: slotA.id,
            title: slotA.title,
            dataUrl: slotA.dataUrl,
            metrics: safeDeepClone(slotA.metrics),
            patch: safeDeepClone(slotA.patch),
          }
        : undefined,
      slotB: slotB
        ? {
            id: slotB.id,
            title: slotB.title,
            dataUrl: slotB.dataUrl,
            metrics: safeDeepClone(slotB.metrics),
            patch: safeDeepClone(slotB.patch),
          }
        : undefined,
      morphValue,
      bpm,
      customPatch: safeDeepClone(patch),
      customMetrics: metrics ? safeDeepClone(metrics) : undefined,
      selectedColorPoints: selectedColorPoints.length > 0 ? safeDeepClone(selectedColorPoints) : [],
      isUserPreset: true,
    };

    setUserPresets((prev) => [newPreset, ...prev]);
    setSelectedPresetId(newPreset.id);
  };

  const handleLoadFullPreset = async (presetId: string) => {
    const allPresets = [...userPresets, ...samplePresets];
    const target = allPresets.find((p) => p.id === presetId);
    if (!target) return;

    setSelectedPresetId(presetId);

    if (target.slotA && target.slotB) {
      setSlotA(safeDeepClone(target.slotA));
      setSlotB(safeDeepClone(target.slotB));
      setImagePreviewUrl(target.slotA.dataUrl);
      if (typeof target.morphValue === 'number') {
        setMorphValue(target.morphValue);
      }
      if (typeof target.bpm === 'number') {
        setBpm(target.bpm);
      }
      if (target.customPatch) {
        setPatch(safeDeepClone(target.customPatch));
        setBaselinePatch(safeDeepClone(target.customPatch));
        globalAudioEngine.updateParameters(target.customPatch);
      }
      if (target.customMetrics) {
        setMetrics(safeDeepClone(target.customMetrics));
      }
      if (target.selectedColorPoints) {
        setSelectedColorPoints(safeDeepClone(target.selectedColorPoints));
      } else {
        setSelectedColorPoints([]);
      }
    } else {
      // Factory preset or single-image preset
      setIsLoading(true);
      try {
        const targetIdx = samplePresets.findIndex((p) => p.id === presetId);
        const slotBIdx = targetIdx >= 0 ? (targetIdx + 1) % samplePresets.length : 1;
        const slotBPreset = samplePresets[slotBIdx];

        const dataA = await processImageSourceToData(target.dataUrl, target.title);
        const dataB = await processImageSourceToData(slotBPreset.dataUrl, slotBPreset.title);

        const newSlotA: SlotData = {
          id: target.id,
          title: dataA.title,
          dataUrl: dataA.dataUrl,
          metrics: dataA.metrics,
          patch: dataA.patch,
        };
        const newSlotB: SlotData = {
          id: slotBPreset.id,
          title: dataB.title,
          dataUrl: dataB.dataUrl,
          metrics: dataB.metrics,
          patch: dataB.patch,
        };

        setSlotA(newSlotA);
        setSlotB(newSlotB);
        setImagePreviewUrl(dataA.dataUrl);
        setMorphValue(0.0);

        setPatch(dataA.patch);
        setBaselinePatch(dataA.patch);
        setMetrics(dataA.metrics);
        setSelectedColorPoints([]);
        globalAudioEngine.updateParameters(dataA.patch);
      } catch (err) {
        console.error('Failed to load preset:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDeleteUserPreset = (presetId: string) => {
    setUserPresets((prev) => prev.filter((p) => p.id !== presetId));
    if (samplePresets.length > 0) {
      handleSelectSlotA(samplePresets[0].id);
    }
  };

  const handleChangeParam = <K extends keyof PatchParameters>(
    key: K,
    value: PatchParameters[K]
  ) => {
    if (!patch) return;
    const updated = { ...patch, [key]: value };
    setPatch(updated);
    globalAudioEngine.updateParameters(updated);
  };

  const handleResetToBaseline = () => {
    setSelectedColorPoints([]);
    if (baselinePatch) {
      setPatch(baselinePatch);
      globalAudioEngine.updateParameters(baselinePatch);
    }
  };

  const handleStartAudio = async () => {
    await globalAudioEngine.initAudio();
    if (patch) {
      globalAudioEngine.updateParameters(patch);
    }
    setAudioStarted(true);
  };

  const handleNoteOn = useCallback(
    (note: number, velocity = 0.8) => {
      if (!audioStarted) {
        handleStartAudio();
      }
      globalAudioEngine.noteOn(note, velocity);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.add(note);
        return next;
      });
    },
    [audioStarted]
  );

  const handleNoteOff = useCallback((note: number) => {
    globalAudioEngine.noteOff(note);
    setActiveNotes((prev) => {
      if (!prev.has(note)) return prev;
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
  }, []);

  const handlePanic = useCallback(() => {
    globalAudioEngine.panic();
    setActiveNotes(new Set());
  }, []);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-2 sm:p-4 font-sans select-none antialiased overflow-hidden">
      {/* Main VST Plugin Window Container (Square Shape) */}
      <div className="w-full max-w-[1280px] h-full max-h-[960px] vst-chassis border border-[#27272a] rounded-none shadow-2xl flex flex-col overflow-hidden relative">
        {/* Header Section Container with Left Logo */}
        <div className="relative shrink-0 flex flex-col">
          {/* Left Square Logo Block displaying uploaded Modular Sound Technologies logo */}
          <div className="absolute left-0 top-0 bottom-0 z-30 w-16 sm:w-20 bg-[#141417] border-r-2 border-b-2 border-[#27272a] flex flex-col items-center justify-center p-1.5 shadow-[0_0_12px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Subtle white-grey background hue overlay to make the logo pop */}
            <div 
              className="w-full h-full rounded-md flex items-center justify-center p-1 border border-zinc-200/15 shadow-[0_0_15px_rgba(255,255,255,0.12)]"
              style={{
                background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.18) 0%, rgba(212, 212, 216, 0.08) 55%, rgba(20, 20, 23, 0.95) 100%)'
              }}
            >
              <img
                src="/MODULARSOUNDTECHNOLOGIES.png"
                alt="Modular Sound Technologies"
                className="max-w-full max-h-full object-contain filter drop-shadow-[0_0_8px_rgba(255,255,255,0.35)]"
              />
            </div>
          </div>

          {/* Top Window Titlebar */}
          <div className="relative bg-gradient-to-r from-[#141417] via-[#1f1f23] to-[#141417] border-b border-[#27272a] pl-20 sm:pl-24 pr-4 py-2 flex items-center justify-between shadow-md min-h-[36px]">
            {/* Center Brand Name */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs sm:text-sm font-black tracking-[0.25em] text-zinc-100 vst-text-embossed uppercase">
                PAINT A SYNTH
              </span>
            </div>
          </div>

          {/* Sub-Header Bar with 12-Column Grid matching Main Body */}
          <div className="bg-[#121215]/95 border-b border-[#27272a] grid grid-cols-12 gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-1.5 items-center min-h-[44px] text-xs">
            {/* Column 1 (3 cols): Empty spacer offset after logo */}
            <div className="col-span-3 flex items-center gap-2 pl-16 sm:pl-20" />

            {/* Column 2 (5 cols): MorphBar centered directly over Middle Image Column */}
            <div className="col-span-5 flex items-center justify-center w-full">
              <MorphBar
                slotA={slotA}
                slotB={slotB}
                morphValue={morphValue}
                onMorphChange={handleMorphChange}
                isAutoSweeping={isAutoSweeping}
                onToggleAutoSweep={() => setIsAutoSweeping((prev) => !prev)}
                presetPhotos={samplePresets}
                userPresets={userPresets}
                onSelectSlotA={handleSelectSlotA}
                onSelectSlotB={handleSelectSlotB}
                onUploadSlotA={(file) => loadSlotA(file, file.name)}
                onUploadSlotB={(file) => loadSlotB(file, file.name)}
              />
            </div>

            {/* Column 3 (4 cols): Action Buttons */}
            <div className="col-span-4 flex items-center justify-end gap-1.5">
              {/* Full Preset Dropdown */}
              <div
                className="relative flex items-center gap-1 vst-btn-3d rounded px-2.5 py-1 transition-all"
                title="Select Full Sound & Image Preset"
              >
                <span className="text-[10px] font-extrabold text-cyan-400 tracking-wider hidden sm:inline">PRESET:</span>
                <select
                  value={selectedPresetId}
                  onChange={(e) => handleLoadFullPreset(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-zinc-200 focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[160px] truncate"
                >
                  <option value="" disabled className="bg-[#111318] text-zinc-300">
                    SELECT PRESET
                  </option>
                  {userPresets.length > 0 && (
                    <optgroup label="USER PRESETS" className="bg-[#111318] text-cyan-400 font-bold">
                      {userPresets.map((p) => (
                        <option key={`p-u-${p.id}`} value={p.id} className="bg-[#111318] text-zinc-200">
                          ★ {p.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="FACTORY PRESETS" className="bg-[#111318] text-amber-400 font-bold">
                    {samplePresets.map((p) => (
                      <option key={`p-f-${p.id}`} value={p.id} className="bg-[#111318] text-zinc-200">
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Delete button for user presets */}
              {userPresets.some((p) => p.id === selectedPresetId) && (
                <button
                  onClick={() => setPresetToDeleteId(selectedPresetId)}
                  title="Delete this user preset"
                  className="vst-btn-3d hover:bg-rose-950/60 border border-rose-800/60 text-rose-400 p-1.5 rounded transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* SAVE PRESET Button */}
              <button
                onClick={() => setIsSaveModalOpen(true)}
                className="vst-btn-3d hover:border-cyan-400 text-cyan-300 px-3 py-1 rounded text-[11px] font-bold tracking-wider transition-all shadow-[0_0_10px_rgba(34,211,238,0.25)]"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>

        {/* Main 3-Column Layout */}
        <div className="grid grid-cols-12 gap-2 sm:gap-3 p-2 sm:p-3 flex-1 min-h-0 bg-[#09090b] items-stretch overflow-hidden">
          {/* Column 1: TIMBRE DNA (3 cols) */}
          <div className="col-span-3 flex flex-col vst-panel rounded-xl p-2 sm:p-2.5 space-y-1.5 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="vst-screw" />
                <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-widest text-zinc-200 vst-text-embossed">
                  TIMBRE DNA
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEffectsModalOpen(true)}
                title="View & Toggle Image-Driven Audio Effects"
                className="vst-btn-3d border-purple-500/50 text-purple-300 hover:text-purple-200 px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all shadow-[0_0_8px_rgba(168,85,247,0.3)]"
              >
                <span>EFFECTS</span>
              </button>
            </div>

            <div className="flex flex-col justify-around flex-1 my-auto space-y-1">
              <RadialGauge
                label="COLOR"
                value={metrics?.timbreDna ?? 0.5}
                color="#ec4899"
                displayValue={Math.round((metrics?.timbreDna ?? 0.5) * 100)}
              />
              <RadialGauge
                label="BRIGHTNESS"
                value={metrics?.brightness ?? 0.5}
                color="#f59e0b"
                displayValue={Math.round((metrics?.brightness ?? 0.5) * 100)}
              />
              <RadialGauge
                label="SATURATION"
                value={metrics?.saturation ?? 0.5}
                color="#a855f7"
                displayValue={Math.round((metrics?.saturation ?? 0.5) * 100)}
              />
              <RadialGauge
                label="COMPLEXITY"
                value={metrics?.complexity ?? 0.2}
                color="#06b6d4"
                displayValue={Math.round((metrics?.complexity ?? 0.2) * 100)}
              />
            </div>
          </div>

          {/* Column 2: IMAGE ANALYSIS & VOICE OUTPUT & KEYBOARD (5 cols) */}
          <div className="col-span-5 flex flex-col min-h-0">
            <ImageDropzone
              metrics={metrics}
              imagePreviewUrl={imagePreviewUrl}
              slotBUrl={slotB?.dataUrl}
              morphValue={morphValue}
              presetPhotos={samplePresets}
              onImageSelected={(file) => loadSlotA(file, typeof file === 'string' ? 'Preset A' : file.name)}
              isLoading={isLoading}
              onGetWaveform={(arr) => globalAudioEngine.getWaveformData(arr)}
              onGetSpectrum={(arr) => globalAudioEngine.getSpectrumData(arr)}
              onNoteOn={handleNoteOn}
              onNoteOff={handleNoteOff}
              onPanic={handlePanic}
              activeNotes={activeNotes}
              selectedColorPoints={selectedColorPoints}
              onAddColorPoint={handleAddColorPoint}
              onRemoveColorPoint={handleRemoveColorPoint}
            />
          </div>

          {/* Column 3: MANUAL OVERRIDE (4 cols) */}
          <div className="col-span-4 flex flex-col min-h-0">
            {patch && (
              <EditableParameters
                patch={patch}
                baselinePatch={baselinePatch}
                onChangeParam={handleChangeParam}
                onResetToBaseline={handleResetToBaseline}
                onPanic={handlePanic}
              />
            )}
          </div>
        </div>

        {/* Footer Status Bar */}
        <div className="bg-gradient-to-r from-[#09090b] via-[#141417] to-[#09090b] border-t border-[#27272a] px-4 py-2 flex items-center justify-between text-[11px] text-zinc-400 font-mono tracking-wider shrink-0">
          <button
            type="button"
            onClick={() => setIsDeepDiveOpen(true)}
            title="Open DEEP DIVE"
            className="hover:text-cyan-400 hover:bg-cyan-500/10 px-2 py-0.5 rounded border border-transparent hover:border-cyan-500/30 transition-all font-bold cursor-pointer text-[11px] text-zinc-400 font-mono tracking-wider"
          >
            DEEP DIVE
          </button>

          <div className="flex items-center gap-1.5">
            {isEditingBpm ? (
              <div className="flex items-center gap-1 bg-[#18181b] border border-cyan-500/60 rounded px-1.5 py-0.5">
                <input
                  type="number"
                  min={20}
                  max={300}
                  value={bpmInputVal}
                  onChange={(e) => setBpmInputVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const num = parseInt(bpmInputVal, 10);
                      if (!isNaN(num)) {
                        const clamped = Math.max(20, Math.min(300, num));
                        setBpm(clamped);
                        setBpmInputVal(String(clamped));
                      }
                      setIsEditingBpm(false);
                    } else if (e.key === 'Escape') {
                      setIsEditingBpm(false);
                      setBpmInputVal(String(bpm));
                    }
                  }}
                  onBlur={() => {
                    const num = parseInt(bpmInputVal, 10);
                    if (!isNaN(num)) {
                      const clamped = Math.max(20, Math.min(300, num));
                      setBpm(clamped);
                      setBpmInputVal(String(clamped));
                    }
                    setIsEditingBpm(false);
                  }}
                  autoFocus
                  className="w-12 bg-transparent text-cyan-300 font-bold text-center text-[11px] focus:outline-none"
                />
                <span className="text-[10px] text-cyan-400 font-bold">BPM</span>
              </div>
            ) : (
              <button
                type="button"
                onDoubleClick={() => {
                  setBpmInputVal(String(bpm));
                  setIsEditingBpm(true);
                }}
                title="Double-click to edit BPM (20 - 300)"
                className="hover:text-cyan-400 hover:bg-cyan-500/10 px-2 py-0.5 rounded border border-transparent hover:border-cyan-500/30 transition-all font-bold cursor-pointer flex items-center gap-1"
              >
                <span>{bpm} BPM</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Save Preset Modal */}
      <SavePresetModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveUserPreset}
        slotA={slotA ? { id: slotA.id, title: slotA.title, dataUrl: slotA.dataUrl } : null}
        slotB={slotB ? { id: slotB.id, title: slotB.title, dataUrl: slotB.dataUrl } : null}
        morphValue={morphValue}
        bpm={bpm}
        patch={patch}
        metrics={metrics}
        selectedColorPoints={selectedColorPoints}
      />

      {/* Deep Dive Diagnostics Modal */}
      <DeepDiveModal
        isOpen={isDeepDiveOpen}
        onClose={() => setIsDeepDiveOpen(false)}
        patch={patch}
        metrics={metrics}
      />

      {/* Image-Driven Effects Modal */}
      <EffectsModal
        isOpen={isEffectsModalOpen}
        onClose={() => setIsEffectsModalOpen(false)}
        effects={patch?.effects}
        onToggleEffect={handleToggleEffect}
        onToggleAllEffects={handleToggleAllEffects}
        onUpdateEffectIntensity={handleUpdateEffectIntensity}
        onUpdateEffectParam={handleUpdateEffectParam}
      />

      {/* Delete Preset Confirmation Modal */}
      <DeletePresetModal
        isOpen={Boolean(presetToDeleteId)}
        presetName={userPresets.find((p) => p.id === presetToDeleteId)?.title || ''}
        onConfirm={() => {
          if (presetToDeleteId) {
            handleDeleteUserPreset(presetToDeleteId);
            setPresetToDeleteId(null);
          }
        }}
        onCancel={() => setPresetToDeleteId(null)}
      />
    </div>
  );
}
