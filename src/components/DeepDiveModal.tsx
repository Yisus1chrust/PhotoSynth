import React from 'react';
import { PatchParameters, ImageMetrics } from '../types/synth';
import { X } from 'lucide-react';

interface DeepDiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  patch: PatchParameters | null;
  metrics: ImageMetrics | null;
}

export const DeepDiveModal: React.FC<DeepDiveModalProps> = ({
  isOpen,
  onClose,
  patch,
  metrics,
}) => {
  if (!isOpen) return null;

  // Extracted background metrics
  const bg = metrics?.backgroundFeatures;
  const era = patch?.temporalEra || metrics?.temporalEra;
  const style = metrics?.detectedStyle;
  const pm = patch?.physicalModel;

  const focusDepth = patch?.opticalFocusDepth ?? bg?.opticalFocusDepth ?? 0.5;
  const gridSymmetry = patch?.gridSymmetryDensity ?? bg?.gridSymmetryDensity ?? 0.5;
  const lightAzimuth = patch?.lightAzimuthAngle ?? bg?.lightAzimuthAngle ?? 180;
  const lightElevation = patch?.lightElevationAngle ?? bg?.lightElevationAngle ?? 45;
  const chromaticClash = patch?.chromaticClash ?? bg?.chromaticClash ?? 0.2;
  const densityWeight = patch?.semanticDensityWeight ?? bg?.semanticDensityWeight ?? 0.5;
  const detectedMaterial = bg?.detectedMaterial || (densityWeight > 0.6 ? 'stone' : densityWeight < 0.35 ? 'glass' : 'wood');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-[#0e1017] border border-[#232836] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden text-zinc-200 font-mono text-xs select-none">
        
        {/* Top Header Bar - Clean & Simple */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#131722] border-b border-[#232836]">
          <span className="font-extrabold tracking-widest text-sm text-white uppercase">
            DEEP DIVE
          </span>

          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-[#1f2536] transition-colors border border-transparent cursor-pointer"
            title="Close DEEP DIVE"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Main Content - Compact 3-Column Layout (No Scroll) */}
        <div className="p-4 grid grid-cols-3 gap-3.5 bg-[#090b10] h-[450px]">
          
          {/* COLUMN 1: TEMPORAL & MATERIAL PHYSICS */}
          <div className="flex flex-col gap-2.5 p-3 bg-[#11141f] rounded-lg border border-[#1f2536] overflow-hidden">
            <div className="text-cyan-400 font-extrabold uppercase tracking-wider text-[11px] pb-1.5 border-b border-[#1f2536]">
              1. TEMPORAL & MATERIAL PHYSICS
            </div>

            {/* Temporal Era */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 font-bold uppercase">Temporal Era</span>
                <span className="text-amber-300 font-extrabold">{era?.eraYear || '1970s'}</span>
              </div>
              <div className="text-[10px] text-zinc-200 font-semibold truncate">
                {era?.architecture || 'Moog Ladder Monophonic & Rhodes'}
              </div>
              <p className="text-[9px] text-zinc-400 font-sans leading-snug line-clamp-2">
                {era?.description || 'Warm discrete analog synthesis with spring reverb and tape modulation.'}
              </p>
            </div>

            {/* Material Physics */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 font-bold uppercase">Inferred Material</span>
                <span className="text-emerald-300 font-bold uppercase">{detectedMaterial}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400">Density Weight</span>
                <span className="text-emerald-400 font-bold">{(densityWeight * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-[#0d101a] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all"
                  style={{ width: `${densityWeight * 100}%` }}
                />
              </div>
            </div>

            {/* Physical Parameters */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1 text-[10px] mt-auto">
              <div className="flex justify-between text-zinc-300">
                <span>Body Resonance</span>
                <span className="text-cyan-300 font-bold">{pm?.bodyResonantFreq ? `${Math.round(pm.bodyResonantFreq)} Hz` : '180 Hz'}</span>
              </div>
              <div className="flex justify-between text-zinc-300">
                <span>Tape Flutter Speed</span>
                <span className="text-amber-300 font-bold">{pm?.tapeFlutterSpeed ? `${pm.tapeFlutterSpeed.toFixed(1)} Hz` : '1.2 Hz'}</span>
              </div>
              <div className="flex justify-between text-zinc-300">
                <span>Analog Saturation</span>
                <span className="text-pink-300 font-bold">{pm?.analogSaturationWarmth ? `${Math.round(pm.analogSaturationWarmth * 100)}%` : '35%'}</span>
              </div>
            </div>

          </div>

          {/* COLUMN 2: OPTICAL & SOUNDSTAGE ENGINE */}
          <div className="flex flex-col gap-2.5 p-3 bg-[#11141f] rounded-lg border border-[#1f2536] overflow-hidden">
            <div className="text-cyan-400 font-extrabold uppercase tracking-wider text-[11px] pb-1.5 border-b border-[#1f2536]">
              2. OPTICAL & SOUNDSTAGE ENGINE
            </div>

            {/* Spatial Frequency & Optical Focus */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 font-bold uppercase">Optical Depth / Focus</span>
                <span className="text-cyan-300 font-bold">{(focusDepth * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-[#0d101a] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-400 h-full transition-all"
                  style={{ width: `${focusDepth * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-zinc-400 font-sans leading-snug line-clamp-2">
                {focusDepth > 0.6
                  ? 'Hyper-focused macro contrast driving crisp multi-tapped delays & sharp digital transients.'
                  : 'Soft haze & optical depth-of-field transforming audio into a billowing atmospheric reverb wash.'}
              </p>
            </div>

            {/* Symmetry & Grid Density */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 font-bold uppercase">Grid Symmetry / Geometry</span>
                <span className="text-purple-300 font-bold">{(gridSymmetry * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-[#0d101a] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-400 h-full transition-all"
                  style={{ width: `${gridSymmetry * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-zinc-400 font-sans leading-snug line-clamp-2">
                {gridSymmetry > 0.55
                  ? 'Locked-in Euclidean rhythmic arpeggios & structured gate patterns.'
                  : 'Asymmetric organic geometry generating free-flowing, unmetered ambient drone movements.'}
              </p>
            </div>

            {/* Lighting Angle */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1 text-[10px] mt-auto">
              <div className="flex justify-between text-zinc-300">
                <span>Shadow Azimuth</span>
                <span className="text-amber-300 font-bold">{lightAzimuth}°</span>
              </div>
              <div className="flex justify-between text-zinc-300">
                <span>Elevation Angle</span>
                <span className="text-amber-200 font-bold">{lightElevation}°</span>
              </div>
            </div>

          </div>

          {/* COLUMN 3: HARMONIC & COLOR TIMBRE */}
          <div className="flex flex-col gap-2.5 p-3 bg-[#11141f] rounded-lg border border-[#1f2536] overflow-hidden">
            <div className="text-cyan-400 font-extrabold uppercase tracking-wider text-[11px] pb-1.5 border-b border-[#1f2536]">
              3. HARMONIC & COLOR TIMBRE
            </div>

            {/* Chromatic Clash */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 font-bold uppercase">Chromatic Clash / Friction</span>
                <span className={chromaticClash > 0.35 ? 'text-pink-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {(chromaticClash * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-[#0d101a] rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all ${chromaticClash > 0.35 ? 'bg-pink-500' : 'bg-emerald-400'}`}
                  style={{ width: `${chromaticClash * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-zinc-400 font-sans leading-snug line-clamp-2">
                {chromaticClash > 0.35
                  ? 'Complementary color clash injecting metallic ring modulation & microtonal pitch tension.'
                  : 'Harmonious color palette yielding smooth, consonant fifths & pure octaves.'}
              </p>
            </div>

            {/* Visual Category */}
            <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-400 font-bold uppercase">Visual Category</span>
                <span className="text-cyan-300 font-bold truncate max-w-[130px]">
                  {style?.label || 'Custom Analysis'}
                </span>
              </div>
            </div>

            {/* Palette Swatches */}
            {metrics?.colorPalette && metrics.colorPalette.length > 0 && (
              <div className="bg-[#161a28] p-2.5 rounded border border-[#252c3f] flex flex-col gap-1 mt-auto">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Dominant Palette</span>
                <div className="grid grid-cols-6 gap-1.5 h-6 mt-0.5">
                  {metrics.colorPalette.map((hex, i) => (
                    <div
                      key={i}
                      className="h-full rounded border border-white/20 shadow-inner"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>

        {/* Bottom Footer Action Bar */}
        <div className="flex items-center justify-end px-5 py-2.5 bg-[#131722] border-t border-[#232836] text-[10px]">
          <button
            onClick={onClose}
            className="bg-zinc-200 text-black hover:bg-white font-extrabold px-4 py-1 rounded transition-all cursor-pointer"
          >
            CLOSE
          </button>
        </div>

      </div>
    </div>
  );
};
