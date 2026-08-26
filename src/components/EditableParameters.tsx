import React from 'react';
import { PatchParameters } from '../types/synth';
import { Knob } from './Knob';
import { Power } from 'lucide-react';

interface EditableParametersProps {
  patch: PatchParameters;
  baselinePatch: PatchParameters | null;
  onChangeParam: <K extends keyof PatchParameters>(key: K, val: PatchParameters[K]) => void;
  onResetToBaseline: () => void;
  onPanic?: () => void;
}

export const EditableParameters: React.FC<EditableParametersProps> = ({
  patch,
  baselinePatch,
  onChangeParam,
  onResetToBaseline,
  onPanic,
}) => {
  const handleResetAndPanic = () => {
    onResetToBaseline();
    if (onPanic) {
      onPanic();
    }
  };

  return (
    <div className="flex flex-col h-full vst-panel rounded-xl p-2 space-y-1 font-mono overflow-hidden justify-between">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-[#222630] pb-0.5 text-[11px] shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="vst-screw" />
          <span className="font-extrabold uppercase tracking-widest text-zinc-200 vst-text-embossed">
            MANUAL OVERRIDE
          </span>
        </div>
        <button
          onClick={handleResetAndPanic}
          disabled={!baselinePatch}
          className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider vst-btn-3d text-rose-400 hover:text-rose-300 border-rose-800/60 px-2 py-0.5 rounded transition-all disabled:opacity-40 shadow-sm"
          title="Reset to Image Baseline and Stop All Active Sound"
        >
          RESET
        </button>
      </div>

      {/* PERFORMANCE / SYNTH CONTROLS Box */}
      <div className="vst-panel-recessed rounded-lg p-1 border border-[#1e222b] shadow-inner shrink-0">
        <div className="text-[9px] font-bold uppercase tracking-widest text-[#c084fc] mb-0.5 border-b border-[#222630]/80 pb-0.5 vst-text-embossed flex items-center justify-between">
          <span>PERFORMANCE / SYNTH CONTROLS</span>
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_6px_#c084fc]" />
        </div>
        <div className="grid grid-cols-2 gap-0.5">
          <Knob
            label="CUTOFF OFFSET"
            value={patch.cutoffOffset}
            min={20}
            max={20000}
            step={10}
            defaultValue={baselinePatch?.cutoffOffset}
            displayFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${v.toFixed(0)}Hz`)}
            onChange={(val) => onChangeParam('cutoffOffset', val)}
            color="#c084fc"
          />

          <Knob
            label="RESONANCE"
            value={patch.resonance}
            min={0.0}
            max={1.0}
            step={0.01}
            defaultValue={baselinePatch?.resonance}
            displayFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(val) => onChangeParam('resonance', val)}
            color="#c084fc"
          />

          <Knob
            label="LFO RATE"
            value={patch.lfoRate}
            min={0.1}
            max={20.0}
            step={0.1}
            defaultValue={baselinePatch?.lfoRate}
            displayFormatter={(v) => `${v.toFixed(1)}Hz`}
            onChange={(val) => onChangeParam('lfoRate', val)}
            color="#c084fc"
          />

          <Knob
            label="LFO DEPTH"
            value={patch.lfoDepth}
            min={0.0}
            max={1.0}
            step={0.01}
            defaultValue={baselinePatch?.lfoDepth}
            displayFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(val) => onChangeParam('lfoDepth', val)}
            color="#c084fc"
          />
        </div>
      </div>

      {/* DYNAMICS / OUTPUT Box */}
      <div className="vst-panel-recessed rounded-lg p-1 border border-[#1e222b] shadow-inner flex-1 flex flex-col justify-between min-h-0">
        <div className="text-[9px] font-bold uppercase tracking-widest text-[#f59e0b] mb-0.5 border-b border-[#222630]/80 pb-0.5 vst-text-amber flex items-center justify-between shrink-0">
          <span>DYNAMICS / OUTPUT</span>
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b]" />
        </div>

        {/* Top Row: Master Volume, Attack Time, Decay Time */}
        <div className="grid grid-cols-3 gap-0.5 items-center">
          <Knob
            label="MASTER VOL"
            value={patch.masterVolume}
            min={0}
            max={100}
            step={1}
            defaultValue={baselinePatch?.masterVolume}
            displayFormatter={(v) => `${v.toFixed(0)}%`}
            onChange={(val) => onChangeParam('masterVolume', val)}
            color="#f59e0b"
          />

          <Knob
            label="ATTACK"
            value={patch.attackTime}
            min={0.001}
            max={5.0}
            step={0.005}
            defaultValue={baselinePatch?.attackTime}
            displayFormatter={(v) => `${(v * 1000).toFixed(0)}ms`}
            onChange={(val) => onChangeParam('attackTime', val)}
            color="#f59e0b"
          />

          <Knob
            label="DECAY"
            value={patch.decayTime}
            min={0.01}
            max={10.0}
            step={0.05}
            defaultValue={baselinePatch?.decayTime}
            displayFormatter={(v) => `${(v * 1000).toFixed(0)}ms`}
            onChange={(val) => onChangeParam('decayTime', val)}
            color="#f59e0b"
          />
        </div>

        {/* Bottom Row: Limiter & Threshold */}
        <div className="flex items-center justify-around pt-0.5 border-t border-[#222630]/60 shrink-0">
          {/* Limiter Toggle */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-[9px] font-mono font-bold tracking-wider text-zinc-300 uppercase mb-0.5 vst-text-embossed">
              LIMITER
            </span>
            <button
              type="button"
              onClick={() => onChangeParam('limiterEnabled', !patch.limiterEnabled)}
              className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all vst-knob-ring ${
                patch.limiterEnabled
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_8px_#10b981]'
                  : 'bg-zinc-950 border-zinc-700/80 text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <Power className="w-3 h-3" />
            </button>
            <div className="vst-readout px-1 py-0.2 rounded mt-0.5">
              <span className={`text-[8px] font-mono font-bold ${patch.limiterEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {patch.limiterEnabled ? 'ACTIVE' : 'BYPASS'}
              </span>
            </div>
          </div>

          {/* Threshold Knob */}
          <Knob
            label="THRESHOLD"
            value={patch.threshold}
            min={-30}
            max={0}
            step={0.5}
            defaultValue={baselinePatch?.threshold}
            displayFormatter={(v) => `${v.toFixed(1)}dB`}
            onChange={(val) => onChangeParam('threshold', val)}
            color="#f59e0b"
          />
        </div>
      </div>
    </div>
  );
};
