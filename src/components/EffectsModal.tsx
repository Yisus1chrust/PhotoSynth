import React, { useState } from 'react';
import { EffectConfig, ImageEffectsState, createDefaultEffects } from '../types/synth';
import { X, Power, Lock, Unlock } from 'lucide-react';
import { Knob } from './Knob';

interface EffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  effects?: ImageEffectsState;
  onToggleEffect: (effectId: keyof ImageEffectsState) => void;
  onToggleAllEffects: (enable: boolean) => void;
  onUpdateEffectIntensity?: (effectId: keyof ImageEffectsState, intensity: number) => void;
  onUpdateEffectParam?: (effectId: keyof ImageEffectsState, paramNum: 1 | 2, val: number) => void;
}

interface KnobSpec {
  label: string;
  displayValue: string;
  normVal: number;
}

function getKnobSpecs(effect: EffectConfig): { knob1: KnobSpec; knob2: KnobSpec } {
  const p1 = effect.param1 ?? effect.intensity;
  const p2 = effect.param2 ?? effect.intensity;

  switch (effect.id) {
    case 'delay': {
      const ms = Math.round(50 + p1 * 750);
      const fb = Math.round(p2 * 90);
      return {
        knob1: { label: 'TIME', displayValue: `${ms} ms`, normVal: p1 },
        knob2: { label: 'FEEDBACK', displayValue: `${fb}% FB`, normVal: p2 },
      };
    }
    case 'reverb': {
      const wet = Math.round(p1 * 100);
      const decay = (0.5 + p2 * 5.5).toFixed(1);
      return {
        knob1: { label: 'WET MIX', displayValue: `${wet}% Wet`, normVal: p1 },
        knob2: { label: 'DECAY', displayValue: `${decay}s Decay`, normVal: p2 },
      };
    }
    case 'chorus': {
      const voices = Math.round(1 + p1 * 5);
      const cents = Math.round(p2 * 30);
      return {
        knob1: { label: 'VOICES', displayValue: `${voices} Voices`, normVal: p1 },
        knob2: { label: 'WIDTH', displayValue: `+${cents} Cents`, normVal: p2 },
      };
    }
    case 'phaser': {
      const hz = (0.1 + p1 * 3.9).toFixed(2);
      const sweep = Math.round(p2 * 100);
      return {
        knob1: { label: 'LFO RATE', displayValue: `${hz} Hz`, normVal: p1 },
        knob2: { label: 'SWEEP', displayValue: `${sweep}% Sweep`, normVal: p2 },
      };
    }
    case 'flanger': {
      const ms = (0.5 + p1 * 9.5).toFixed(1);
      const fb = Math.round(p2 * 90);
      return {
        knob1: { label: 'DELAY', displayValue: `${ms} ms`, normVal: p1 },
        knob2: { label: 'COMB FB', displayValue: `${fb}% FB`, normVal: p2 },
      };
    }
    case 'distortion': {
      const db = Math.round(p1 * 30);
      const mode = p2 > 0.5 ? 'Hard Clip' : 'Soft Clip';
      return {
        knob1: { label: 'DRIVE', displayValue: `+${db} dB Drive`, normVal: p1 },
        knob2: { label: 'CLIP', displayValue: mode, normVal: p2 },
      };
    }
    default:
      return {
        knob1: { label: 'PARAM 1', displayValue: `${Math.round(p1 * 100)}%`, normVal: p1 },
        knob2: { label: 'PARAM 2', displayValue: `${Math.round(p2 * 100)}%`, normVal: p2 },
      };
  }
}

const EFFECT_COLORS: Record<string, string> = {
  delay: '#00f2fe',      // Cyan
  reverb: '#a855f7',     // Purple
  chorus: '#ec4899',     // Pink
  phaser: '#f59e0b',     // Amber
  flanger: '#10b981',    // Emerald
  distortion: '#ef4444', // Red
};

export const EffectsModal: React.FC<EffectsModalProps> = ({
  isOpen,
  onClose,
  effects = createDefaultEffects(),
  onToggleEffect,
  onToggleAllEffects,
  onUpdateEffectIntensity,
  onUpdateEffectParam,
}) => {
  const [isLocked, setIsLocked] = useState(true);

  if (!isOpen) return null;

  const effectList: EffectConfig[] = [
    effects.delay,
    effects.reverb,
    effects.chorus,
    effects.phaser,
    effects.flanger,
    effects.distortion,
  ];

  const totalActive = effectList.filter((e) => e.enabled).length;
  const anyActive = totalActive > 0;

  const handleToggleAll = () => {
    onToggleAllEffects(!anyActive);
  };

  const handleKnobChange = (effectId: keyof ImageEffectsState, paramNum: 1 | 2, newVal: number) => {
    if (isLocked) return;
    const clamped = Math.max(0, Math.min(1, newVal));
    if (onUpdateEffectParam) {
      onUpdateEffectParam(effectId, paramNum, clamped);
    } else if (onUpdateEffectIntensity) {
      onUpdateEffectIntensity(effectId, clamped);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0e1017] border border-[#232836] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden font-mono text-zinc-200">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#232836] bg-[#131722]">
          {/* Header Left: Title */}
          <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-white">
            EFFECTS
          </h3>

          {/* Header Right: Lock Toggle Button + Single Toggle Button (ALL OFF / ALL ON) + Close X */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLocked(!isLocked)}
              className={`px-2.5 py-1 rounded border text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                isLocked
                  ? 'bg-amber-950/60 hover:bg-amber-900/80 border-amber-600/80 text-amber-300'
                  : 'bg-emerald-950/60 hover:bg-emerald-900/80 border-emerald-500/80 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
              }`}
              title={isLocked ? 'Effects locked (picture-derived). Click to unlock & edit parameters.' : 'Effects unlocked. Click to lock parameters.'}
            >
              {isLocked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-emerald-400" />}
              <span>{isLocked ? 'LOCKED' : 'EDITABLE'}</span>
            </button>

            <button
              onClick={handleToggleAll}
              className={`px-3 py-1 rounded border text-[9px] font-bold uppercase tracking-wider transition-all ${
                anyActive
                  ? 'bg-rose-950/60 hover:bg-rose-900/80 border-rose-700/80 text-rose-300'
                  : 'bg-purple-950/60 hover:bg-purple-900/80 border-purple-600/80 text-purple-300'
              }`}
            >
              {anyActive ? 'ALL OFF' : 'ALL ON'}
            </button>

            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-rose-950/80 border border-zinc-800 hover:border-rose-700/80 text-zinc-400 hover:text-white transition-colors"
              title="Close Effects Window"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3 Effects per Row Grid (3 columns x 2 rows = 6 total) */}
        <div className="p-3 grid grid-cols-3 gap-2.5 bg-[#0a0f18]">
          {effectList.map((effect) => {
            const isEnabled = effect.enabled;
            const color = EFFECT_COLORS[effect.id] || '#00f2fe';
            const { knob1, knob2 } = getKnobSpecs(effect);

            return (
              <div
                key={effect.id}
                className={`rounded-xl border flex flex-col justify-between p-2.5 transition-all relative ${
                  isEnabled
                    ? 'bg-[#0e1624] border-[#1f3048] shadow-[0_2px_12px_rgba(0,0,0,0.4)]'
                    : 'bg-[#070b12] border-[#151f2d] opacity-50'
                }`}
              >
                {/* Square Top: Title & Power Switch */}
                <div className="flex items-center justify-between pb-1.5 border-b border-[#182538]">
                  <span
                    className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider truncate"
                    style={{ color: isEnabled ? color : '#71717a' }}
                  >
                    {effect.name}
                  </span>

                  <button
                    type="button"
                    onClick={() => onToggleEffect(effect.id)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider transition-all border shrink-0 ${
                      isEnabled
                        ? 'bg-cyan-500/15 border-cyan-400/80 text-cyan-300 shadow-[0_0_6px_#00f2fe33]'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Power className={`w-2 h-2 ${isEnabled ? 'text-cyan-400' : 'text-zinc-500'}`} />
                    <span>{isEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                {/* 2 Knobs Side-by-Side */}
                <div className="flex items-center justify-around pt-2 pb-1 relative">
                  <Knob
                    label={knob1.label}
                    value={knob1.normVal}
                    min={0}
                    max={1}
                    onChange={(val) => handleKnobChange(effect.id as keyof ImageEffectsState, 1, val)}
                    displayFormatter={() => knob1.displayValue}
                    color={isEnabled ? (isLocked ? color : '#10b981') : '#52525b'}
                  />
                  <Knob
                    label={knob2.label}
                    value={knob2.normVal}
                    min={0}
                    max={1}
                    onChange={(val) => handleKnobChange(effect.id as keyof ImageEffectsState, 2, val)}
                    displayFormatter={() => knob2.displayValue}
                    color={isEnabled ? (isLocked ? color : '#10b981') : '#52525b'}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-3 py-2 bg-[#080c14] border-t border-[#182232] flex items-center justify-between text-[10px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            {isLocked ? (
              <span className="font-mono text-amber-400/80 text-[9px] flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 inline" /> PICTURE-DERIVED PARAMETERS (LOCKED)
              </span>
            ) : (
              <span className="font-mono text-emerald-400 text-[9px] flex items-center gap-1 font-bold animate-pulse">
                <Unlock className="w-2.5 h-2.5 inline text-emerald-400" /> CUSTOM PARAMETER EDITING ACTIVE
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-0.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold uppercase tracking-wider transition-all shadow-[0_0_10px_#00f2fe44] text-[9px]"
          >
            CLOSE
          </button>
        </div>

      </div>
    </div>
  );
};
