import React, { useRef, useState } from 'react';
import { ImageMetrics, PresetPhoto, SelectedColorPoint } from '../types/synth';
import { Image as ImageIcon, X } from 'lucide-react';
import { Oscilloscope } from './Oscilloscope';
import { VirtualKeyboard } from './VirtualKeyboard';
import { sampleGradientColor } from '../utils/colorBlending';

interface ImageDropzoneProps {
  metrics: ImageMetrics | null;
  imagePreviewUrl: string | null;
  slotBUrl?: string | null;
  morphValue?: number;
  presetPhotos: PresetPhoto[];
  onImageSelected: (file: File | string) => void;
  isLoading: boolean;
  onGetWaveform: (array: Uint8Array) => void;
  onGetSpectrum: (array: Uint8Array) => void;
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
  onPanic: () => void;
  activeNotes: Set<number>;
  showKeyboard?: boolean;
  onHideKeyboard?: () => void;
  selectedColorPoints?: SelectedColorPoint[];
  onAddColorPoint?: (pct: number, hex: string, rgb: [number, number, number]) => void;
  onRemoveColorPoint?: (id: string) => void;
}

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({
  metrics,
  imagePreviewUrl,
  slotBUrl,
  morphValue = 0,
  onImageSelected,
  isLoading,
  onGetWaveform,
  onGetSpectrum,
  onNoteOn,
  onNoteOff,
  onPanic,
  activeNotes,
  showKeyboard = true,
  onHideKeyboard,
  selectedColorPoints = [],
  onAddColorPoint,
  onRemoveColorPoint,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onImageSelected(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageSelected(e.target.files[0]);
    }
  };

  const palette = metrics?.colorPalette && metrics.colorPalette.length > 0
    ? metrics.colorPalette
    : ['#0F172A', '#1E293B', '#0284C7', '#38BDF8', '#A855F7', '#EC4899'];

  const handlePaletteClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const { hex, rgb } = sampleGradientColor(palette, pct);
    onAddColorPoint?.(pct, hex, rgb);
  };

  return (
    <div className="flex flex-col h-full vst-panel rounded-xl p-2 sm:p-2.5 space-y-2 font-mono overflow-hidden">
      {/* 1. Cinematic Movie Color Palette Bar (Interactive Color Selection & Blending) */}
      <div className="flex flex-col shrink-0 my-0.5">
        <div
          onClick={handlePaletteClick}
          className="relative w-full h-4 sm:h-4.5 rounded-md border border-[#222630] vst-bezel shadow-inner cursor-crosshair overflow-visible group select-none"
          title="Click anywhere to sample color & blend harmonic character (Up to 3)"
        >
          {/* Gradient Strip */}
          <div
            className="w-full h-full rounded-[5px] transition-all duration-300"
            style={{
              background: `linear-gradient(90deg, ${palette.join(', ')})`,
            }}
          />

          {/* Active Selected Color Points / Pins with "X" markers */}
          {selectedColorPoints.map((pt) => (
            <div
              key={pt.id}
              style={{ left: `${pt.pct}%` }}
              className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-center z-20"
            >
              {/* Vertical Pin Line */}
              <div
                className="w-0.5 h-full shadow-[0_0_6px_#ffffff]"
                style={{ backgroundColor: pt.hex }}
              />

              {/* Pin Badge with "X" surrounded by outline in the selected color tone */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveColorPoint?.(pt.id);
                }}
                title={`Remove Color Point (${pt.hex})`}
                className="absolute bottom-full mb-1 w-4 sm:w-5 h-4 sm:h-5 rounded-full bg-[#090d15]/95 border-[1.5px] flex items-center justify-center transition-transform hover:scale-110 shadow-md z-30"
                style={{
                  borderColor: pt.hex,
                  color: pt.hex,
                  boxShadow: `0 0 6px ${pt.hex}aa`,
                }}
              >
                <X className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5]" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Main Center Image Display */}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex-1 min-h-0 rounded-lg vst-panel-recessed vst-bezel transition-all cursor-pointer flex flex-col items-center justify-center p-1 sm:p-2 overflow-hidden group ${
          isDragOver ? 'border-cyan-400 bg-cyan-950/20' : 'hover:border-cyan-500/50'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-cyan-300 animate-pulse font-bold tracking-wider">
              ANALYZING...
            </span>
          </div>
        ) : imagePreviewUrl ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Slot A Image */}
            <img
              src={imagePreviewUrl}
              alt="Uploaded Synth Source A"
              className="max-h-full max-w-full w-auto h-auto object-contain rounded border border-[#1b2536] shadow-md transition-opacity duration-75"
              style={{ opacity: slotBUrl && morphValue !== undefined ? 1 - morphValue : 1 }}
            />
            {/* Slot B Image superimposed for smooth visual crossfade */}
            {slotBUrl && morphValue !== undefined && morphValue > 0 && (
              <img
                src={slotBUrl}
                alt="Uploaded Synth Source B"
                className="absolute inset-0 max-h-full max-w-full w-auto h-auto object-contain rounded border border-[#1b2536] shadow-md transition-opacity duration-75 mx-auto my-auto z-10"
                style={{ opacity: morphValue }}
              />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded backdrop-blur-[1px] z-20 pointer-events-none">
              <span className="text-[10px] font-bold text-white bg-zinc-900/90 px-2.5 py-1 rounded border border-zinc-700">
                CHANGE IMAGE A
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-1.5 p-2">
            <div className="w-8 h-8 rounded-lg border border-cyan-500/30 flex items-center justify-center text-cyan-400/80">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold tracking-wider text-zinc-300 uppercase">
              DROP IMAGE HERE
            </span>
          </div>
        )}
      </div>

      {/* 3. Voice Output (Oscilloscope - Compact Headerless) */}
      <Oscilloscope
        onGetWaveform={onGetWaveform}
        onGetSpectrum={onGetSpectrum}
      />

      {/* 4. Keyboard below Voice Output */}
      <div className="shrink-0 pt-0.5">
        <VirtualKeyboard
          onNoteOn={onNoteOn}
          onNoteOff={onNoteOff}
          onPanic={onPanic}
          activeNotes={activeNotes}
        />
      </div>
    </div>
  );
};
