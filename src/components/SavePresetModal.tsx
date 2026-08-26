import React, { useState, useEffect } from 'react';
import { PatchParameters, ImageMetrics, SelectedColorPoint } from '../types/synth';
import { Save, X, Image as ImageIcon, Sliders, Check, Palette } from 'lucide-react';

interface ImageSlotSummary {
  id: string;
  title: string;
  dataUrl: string;
}

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  slotA: ImageSlotSummary | null;
  slotB: ImageSlotSummary | null;
  morphValue: number;
  bpm: number;
  patch: PatchParameters | null;
  metrics: ImageMetrics | null;
  selectedColorPoints?: SelectedColorPoint[];
}

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  slotA,
  slotB,
  morphValue,
  bpm,
  patch,
  metrics,
  selectedColorPoints = [],
}) => {
  const [presetName, setPresetName] = useState('');
  const [description, setDescription] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPresetName(`Preset ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      setDescription('');
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const morphPercent = Math.round(morphValue * 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    onSave(presetName.trim(), description.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono select-none">
      <div className="relative w-full max-w-lg bg-[#0c111a] border border-[#1b2536] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#090d15] border-b border-[#1b2536] px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-cyan-400" />
            <span className="font-bold tracking-widest text-sm text-zinc-100 uppercase">
              SAVE FULL PRESET
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Top Section: Dual Image Preview Badges & Preset Inputs */}
          <div className="flex gap-4 items-start">
            {/* Dual Images & Crossfade Summary */}
            <div className="flex flex-col gap-1 shrink-0 items-center">
              <div className="flex items-center gap-1">
                {/* Image A */}
                <div className="w-12 h-12 rounded-lg border border-cyan-500/40 bg-[#06090e] overflow-hidden relative" title={`Image A: ${slotA?.title || 'None'}`}>
                  {slotA?.dataUrl ? (
                    <img src={slotA.dataUrl} alt="Slot A" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-zinc-600 m-auto" />
                  )}
                  <span className="absolute bottom-0.5 left-0.5 bg-black/80 text-[8px] font-black text-cyan-400 px-1 rounded">A</span>
                </div>

                <div className="text-[10px] text-zinc-500 font-bold">➔</div>

                {/* Image B */}
                <div className="w-12 h-12 rounded-lg border border-rose-500/40 bg-[#06090e] overflow-hidden relative" title={`Image B: ${slotB?.title || 'None'}`}>
                  {slotB?.dataUrl ? (
                    <img src={slotB.dataUrl} alt="Slot B" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-zinc-600 m-auto" />
                  )}
                  <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[8px] font-black text-rose-400 px-1 rounded">B</span>
                </div>
              </div>

              {/* Badges for Morph & BPM */}
              <div className="flex items-center gap-1.5 text-[9px] font-bold">
                <span className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-1.5 py-0.5 rounded">
                  {morphPercent}% CROSSFADE
                </span>
                <span className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded">
                  {bpm} BPM
                </span>
              </div>
            </div>

            {/* Inputs */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  PRESET NAME
                </label>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Enter preset name..."
                  autoFocus
                  required
                  className="w-full bg-[#06090e] border border-[#1b2536] focus:border-cyan-400 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  NOTES / DESCRIPTION (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Image A + B morph with filter sweep..."
                  className="w-full bg-[#06090e] border border-[#1b2536] focus:border-cyan-400 rounded-lg px-3 py-1.5 text-[11px] text-zinc-300 font-mono outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Color Palette & Spectrum Points Summary */}
          {metrics?.colorPalette && metrics.colorPalette.length > 0 && (
            <div className="bg-[#06090e] border border-[#1b2536] rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-b border-[#1b2536] pb-1">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3 h-3 text-pink-400" />
                  <span>COLOR SPECTRUM PALETTE</span>
                </div>
                <span className="text-[9px] text-cyan-400">
                  {selectedColorPoints.length > 0
                    ? `${selectedColorPoints.length} ACTIVE BLEND POINTS`
                    : 'NO BLEND POINTS'}
                </span>
              </div>
              <div className="relative w-full h-3.5 rounded border border-[#1b2536] overflow-hidden">
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(90deg, ${metrics.colorPalette.join(', ')})`,
                  }}
                />
                {selectedColorPoints.map((pt) => (
                  <div
                    key={pt.id}
                    style={{ left: `${pt.pct}%` }}
                    className="absolute top-0 bottom-0 -translate-x-1/2 w-1 bg-white border border-black shadow-[0_0_4px_#fff]"
                    title={`Blend point: ${pt.hex}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Current Parameters Summary */}
          {patch && (
            <div className="bg-[#06090e] border border-[#1b2536] rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-b border-[#1b2536] pb-1">
                <Sliders className="w-3 h-3 text-cyan-400" />
                <span>SNAPSHOTTED PARAMETERS</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                <div>
                  <span className="text-zinc-500">Cutoff: </span>
                  <span className="text-purple-300 font-bold">
                    {patch.cutoffOffset >= 1000
                      ? `${(patch.cutoffOffset / 1000).toFixed(2)}kHz`
                      : `${patch.cutoffOffset.toFixed(0)}Hz`}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Resonance: </span>
                  <span className="text-purple-300 font-bold">
                    {(patch.resonance * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">LFO Rate: </span>
                  <span className="text-purple-300 font-bold">
                    {patch.lfoRate.toFixed(1)}Hz
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Master Vol: </span>
                  <span className="text-amber-300 font-bold">
                    {patch.masterVolume.toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Attack: </span>
                  <span className="text-amber-300 font-bold">
                    {(patch.attackTime * 1000).toFixed(0)}ms
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Decay: </span>
                  <span className="text-amber-300 font-bold">
                    {(patch.decayTime * 1000).toFixed(0)}ms
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1b2536]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#1b2536] text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={!presetName.trim() || savedSuccess}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all shadow-[0_0_12px_#00f2fe88] disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>SAVED!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>SAVE PRESET</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
