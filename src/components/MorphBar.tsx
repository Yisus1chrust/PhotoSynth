import React from 'react';
import { PresetPhoto } from '../types/synth';
import { Play, Pause, Sliders, Layers } from 'lucide-react';

interface ImageSlotState {
  id: string;
  title: string;
  dataUrl: string;
}

interface MorphBarProps {
  slotA: ImageSlotState | null;
  slotB: ImageSlotState | null;
  morphValue: number; // 0.0 to 1.0
  onMorphChange: (val: number) => void;
  isAutoSweeping: boolean;
  onToggleAutoSweep: () => void;
  presetPhotos: PresetPhoto[];
  userPresets: PresetPhoto[];
  onSelectSlotA: (presetId: string) => void;
  onSelectSlotB: (presetId: string) => void;
  onUploadSlotA: (file: File) => void;
  onUploadSlotB: (file: File) => void;
}

export const MorphBar: React.FC<MorphBarProps> = ({
  slotA,
  slotB,
  morphValue,
  onMorphChange,
  isAutoSweeping,
  onToggleAutoSweep,
  presetPhotos,
  userPresets,
  onSelectSlotA,
  onSelectSlotB,
  onUploadSlotA,
  onUploadSlotB,
}) => {
  const fileInputA = React.useRef<HTMLInputElement>(null);
  const fileInputB = React.useRef<HTMLInputElement>(null);

  const morphPercent = Math.round(morphValue * 100);

  return (
    <div className="flex items-center gap-2 vst-panel-recessed rounded-lg px-2 py-1 text-xs select-none shadow-inner">
      {/* Slot A Selector Badge (Icon thumbnail only) */}
      <div
        className="relative flex items-center gap-1.5 vst-btn-3d border-cyan-500/50 hover:border-cyan-400 rounded px-2 py-1 shrink-0 transition-all cursor-pointer group shadow-md"
        title={`Image A: ${slotA?.title || 'Select Image A'}`}
      >
        <span className="text-[10px] font-black text-cyan-400 tracking-wider vst-text-cyan">A:</span>
        {slotA?.dataUrl ? (
          <img
            src={slotA.dataUrl}
            alt="Slot A"
            className="w-5 h-5 object-cover rounded border border-cyan-500/50 group-hover:border-cyan-300 transition-colors shadow-sm"
          />
        ) : (
          <div className="w-5 h-5 bg-zinc-950 rounded border border-cyan-500/50 flex items-center justify-center text-[10px] font-bold text-cyan-400">
            +
          </div>
        )}
        <input
          type="file"
          ref={fileInputA}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) onUploadSlotA(e.target.files[0]);
          }}
          accept="image/*"
          className="hidden"
        />
        <select
          value={slotA?.id || ''}
          onChange={(e) => {
            if (e.target.value === '__upload__') {
              fileInputA.current?.click();
            } else {
              onSelectSlotA(e.target.value);
            }
          }}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
          title={`Select Image A (${slotA?.title || 'Default'})`}
        >
          <option value="" disabled>
            SELECT IMAGE A
          </option>
          <optgroup label="IMAGES">
            {presetPhotos.map((p) => (
              <option key={`a-f-${p.id}`} value={p.id}>
                {p.title}
              </option>
            ))}
          </optgroup>
          <option value="__upload__">+ UPLOAD NEW IMAGE A</option>
        </select>
      </div>

      {/* Crossfade Morph Slider & Auto Sweep Track */}
      <div className="flex items-center gap-2 min-w-[120px] sm:min-w-[180px] max-w-[260px] flex-1 px-1">
        <div className="relative flex-1 flex items-center h-4">
          {/* Recessed Hardware Slider Channel Groove */}
          <div className="absolute inset-x-0 h-2 bg-[#050608] border border-[#1a1e27] rounded-full shadow-inner pointer-events-none" />

          {/* Visual gradient fill behind slider */}
          <div
            className="absolute left-0 top-1 bottom-1 pointer-events-none rounded-full bg-gradient-to-r from-cyan-500 via-purple-500 to-rose-500 opacity-80 h-1.5 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
            style={{ width: `${morphPercent}%` }}
          />

          <input
            type="range"
            min="0"
            max="1"
            step="0.005"
            value={morphValue}
            onChange={(e) => onMorphChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer accent-cyan-400 relative z-10 focus:outline-none"
            title={`Crossfade Morph: ${morphPercent}%`}
          />
        </div>

        {/* Auto Sweep LFO Button (Play/Pause Icon ONLY) */}
        <button
          type="button"
          onClick={onToggleAutoSweep}
          title={isAutoSweeping ? 'Pause Auto Sweep' : 'Play Auto Sweep'}
          className={`p-1 sm:p-1.5 rounded flex items-center justify-center transition-all shrink-0 vst-btn-3d ${
            isAutoSweeping
              ? 'bg-rose-500/20 border-rose-500/80 text-rose-300 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]'
              : 'text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/50'
          }`}
        >
          {isAutoSweeping ? (
            <Pause className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Play className="w-3.5 h-3.5 text-cyan-400" />
          )}
        </button>
      </div>

      {/* Slot B Selector Badge (Icon thumbnail only) */}
      <div
        className="relative flex items-center gap-1.5 vst-btn-3d border-rose-500/50 hover:border-rose-400 rounded px-2 py-1 shrink-0 transition-all cursor-pointer group shadow-md"
        title={`Image B: ${slotB?.title || 'Select Image B'}`}
      >
        <span className="text-[10px] font-black text-rose-400 tracking-wider vst-text-amber">B:</span>
        {slotB?.dataUrl ? (
          <img
            src={slotB.dataUrl}
            alt="Slot B"
            className="w-5 h-5 object-cover rounded border border-rose-500/50 group-hover:border-rose-300 transition-colors shadow-sm"
          />
        ) : (
          <div className="w-5 h-5 bg-zinc-950 rounded border border-rose-500/50 flex items-center justify-center text-[10px] font-bold text-rose-400">
            +
          </div>
        )}
        <input
          type="file"
          ref={fileInputB}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) onUploadSlotB(e.target.files[0]);
          }}
          accept="image/*"
          className="hidden"
        />
        <select
          value={slotB?.id || ''}
          onChange={(e) => {
            if (e.target.value === '__upload__') {
              fileInputB.current?.click();
            } else {
              onSelectSlotB(e.target.value);
            }
          }}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
          title={`Select Image B (${slotB?.title || 'Default'})`}
        >
          <option value="" disabled>
            SELECT IMAGE B
          </option>
          <optgroup label="IMAGES">
            {presetPhotos.map((p) => (
              <option key={`b-f-${p.id}`} value={p.id}>
                {p.title}
              </option>
            ))}
          </optgroup>
          <option value="__upload__">+ UPLOAD NEW IMAGE B</option>
        </select>
      </div>
    </div>
  );
};
