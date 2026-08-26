import React from 'react';
import { TemporalEraInfo } from '../types/synth';
import { History, Sparkles } from 'lucide-react';

interface TemporalEraGaugeProps {
  eraInfo?: TemporalEraInfo;
  eraVal?: number; // 0.0 to 1.0 continuous position
}

export const TemporalEraGauge: React.FC<TemporalEraGaugeProps> = ({ eraInfo, eraVal }) => {
  const currentVal = typeof eraVal === 'number' ? eraVal : (eraInfo?.eraVal ?? 0.5);
  const clampedVal = Math.max(0, Math.min(1, currentVal));

  const yearStr = eraInfo?.eraYear ?? (
    clampedVal < 0.16 ? '1800s & Prior' :
    clampedVal < 0.38 ? '1960s' :
    clampedVal < 0.62 ? '1970s' :
    clampedVal < 0.84 ? '1980s' : '1990s-2000s+'
  );

  const archStr = eraInfo?.architecture ?? (
    clampedVal < 0.16 ? 'Harpsichord, Gut Lute & Cathedral Organ' :
    clampedVal < 0.38 ? 'Hammond/Vox Organ & Spring Tape' :
    clampedVal < 0.62 ? 'Moog Ladder Monophonic & Rhodes' :
    clampedVal < 0.84 ? 'Oberheim OB-X & DX7 FM Bells' : 'Digital Wavetables & Modern Hybrid'
  );

  // Position indicator along timeline (4% to 96%)
  const pinPct = Math.max(4, Math.min(96, clampedVal * 100));

  return (
    <div className="flex flex-col py-2 px-3 my-1 vst-panel-recessed rounded-xl border border-[#222630] shadow-inner font-mono text-zinc-200 select-none">
      {/* Top Header line */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-200 vst-text-embossed truncate">
            TEMPORAL ERA
          </span>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-cyan-950/90 border border-cyan-500/50 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.35)] shrink-0 ml-1">
          {yearStr}
        </span>
      </div>

      {/* Architecture Description Badge */}
      <div className="text-[9px] font-sans font-semibold text-zinc-300/90 truncate mb-2 flex items-center gap-1 bg-[#12141a]/80 px-2 py-1 rounded border border-[#222630]/80">
        <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0 animate-pulse" />
        <span className="truncate">{archStr}</span>
      </div>

      {/* Historical Spectrum Track */}
      <div className="relative w-full h-2.5 rounded-full bg-[#111318] border border-[#2a303c] p-0.5 overflow-visible">
        {/* Color Gradient Track across eras */}
        <div
          className="w-full h-full rounded-full transition-all duration-300 opacity-90"
          style={{
            background: 'linear-gradient(90deg, #78350f 0%, #b45309 25%, #d97706 50%, #ec4899 75%, #06b6d4 100%)',
          }}
        />

        {/* Pin Marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#090d15] border-2 border-cyan-400 shadow-[0_0_10px_#00f2fe] flex items-center justify-center transition-all duration-200 z-10"
          style={{ left: `${pinPct}%` }}
        >
          <div className="w-1 h-1 rounded-full bg-white shadow-[0_0_4px_#ffffff]" />
        </div>
      </div>

      {/* Era Labels beneath Track */}
      <div className="flex items-center justify-between text-[8px] font-mono font-extrabold text-zinc-500 mt-1">
        <span className={clampedVal < 0.16 ? 'text-amber-400 font-black' : ''}>1800s</span>
        <span className={clampedVal >= 0.16 && clampedVal < 0.38 ? 'text-amber-400 font-black' : ''}>1960s</span>
        <span className={clampedVal >= 0.38 && clampedVal < 0.62 ? 'text-amber-400 font-black' : ''}>1970s</span>
        <span className={clampedVal >= 0.62 && clampedVal < 0.84 ? 'text-pink-400 font-black' : ''}>1980s</span>
        <span className={clampedVal >= 0.84 ? 'text-cyan-400 font-black' : ''}>2000s+</span>
      </div>
    </div>
  );
};
