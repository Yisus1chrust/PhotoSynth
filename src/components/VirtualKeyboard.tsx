import React, { useEffect, useCallback, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface VirtualKeyboardProps {
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
  onPanic?: () => void;
  activeNotes?: Set<number>;
  onHideKeyboard?: () => void;
}

// Map key codes starting from 'A' to MIDI pitch offsets from startNote
const QWERTY_MAP: Record<string, number> = {
  a: 0,   // C
  w: 1,   // C#
  s: 2,   // D
  e: 3,   // D#
  d: 4,   // E
  f: 5,   // F
  t: 6,   // F#
  g: 7,   // G
  y: 8,   // G#
  h: 9,   // A
  u: 10,  // A#
  j: 11,  // B
  k: 12,  // C (+1 octave)
  o: 13,  // C#
  l: 14,  // D
  p: 15,  // D#
  ';': 16, // E
  "'": 17, // F
};

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  onNoteOn,
  onNoteOff,
  activeNotes,
}) => {
  const [octaveShift, setOctaveShift] = useState<number>(0);
  const [localActiveNotes, setLocalActiveNotes] = useState<Set<number>>(new Set());

  const handleKeyNoteOn = useCallback(
    (note: number, velocity = 0.9) => {
      onNoteOn(note, velocity);
      setLocalActiveNotes((prev) => {
        if (prev.has(note)) return prev;
        const next = new Set(prev);
        next.add(note);
        return next;
      });
    },
    [onNoteOn]
  );

  const handleKeyNoteOff = useCallback(
    (note: number) => {
      onNoteOff(note);
      setLocalActiveNotes((prev) => {
        if (!prev.has(note)) return prev;
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    },
    [onNoteOff]
  );

  const baseMidiNote = 36 + octaveShift * 12; // C2 = 36 by default
  const totalKeys = 37; // 3 full octaves

  // QWERTY keyboard listener
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (key in QWERTY_MAP) {
        const midiNote = 48 + octaveShift * 12 + QWERTY_MAP[key]; // C3 start for typing
        handleKeyNoteOn(midiNote, 0.85);
      }
    },
    [handleKeyNoteOn, octaveShift]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (key in QWERTY_MAP) {
        const midiNote = 48 + octaveShift * 12 + QWERTY_MAP[key];
        handleKeyNoteOff(midiNote);
      }
    },
    [handleKeyNoteOff, octaveShift]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Generate list of notes
  const notes = Array.from({ length: totalKeys }, (_, i) => baseMidiNote + i);
  const effectiveActiveNotes = new Set([
    ...Array.from(activeNotes || []),
    ...Array.from(localActiveNotes),
  ]);

  return (
    <div className="w-full select-none font-mono flex flex-col space-y-1">
      {/* Mini Controls Bar */}
      <div className="flex items-center justify-between text-[9px] text-zinc-500 px-0.5">
        <span className="font-bold text-zinc-400 uppercase tracking-widest text-[9px]">
          PIANO
        </span>

        <div className="flex items-center gap-1.5">
          {/* Octave Arrow Controls */}
          <div className="flex items-center gap-1 bg-[#06090e] border border-[#1b2536] px-1.5 py-0.5 rounded text-[8px] font-bold text-zinc-300">
            <span className="text-zinc-500 uppercase tracking-wider mr-0.5">OCT</span>
            <button
              type="button"
              onClick={() => setOctaveShift((prev) => Math.max(-2, prev - 1))}
              disabled={octaveShift <= -2}
              title="Shift Octave Down (<)"
              className="w-4 h-4 flex items-center justify-center rounded bg-zinc-800 hover:bg-cyan-600 disabled:opacity-30 disabled:hover:bg-zinc-800 text-white transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="font-mono text-cyan-400 min-w-[20px] text-center font-extrabold">
              C{3 + octaveShift}
            </span>
            <button
              type="button"
              onClick={() => setOctaveShift((prev) => Math.min(2, prev + 1))}
              disabled={octaveShift >= 2}
              title="Shift Octave Up (>)"
              className="w-4 h-4 flex items-center justify-center rounded bg-zinc-800 hover:bg-cyan-600 disabled:opacity-30 disabled:hover:bg-zinc-800 text-white transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Piano Keys Bed */}
      <div className="relative flex h-14 sm:h-16 w-full justify-center bg-[#05080e] rounded-lg overflow-hidden p-0.5 border border-[#1a2333] vst-bezel shadow-inner">
        {notes.map((midiNote) => {
          const noteInOctave = midiNote % 12;
          const octaveNum = Math.floor(midiNote / 12) - 1;
          const isBlackKey = [1, 3, 6, 8, 10].includes(noteInOctave);
          const isActive = effectiveActiveNotes.has(midiNote);
          const isCKey = noteInOctave === 0;

          if (isBlackKey) {
            return (
              <div
                key={midiNote}
                onMouseDown={() => handleKeyNoteOn(midiNote, 0.9)}
                onMouseUp={() => handleKeyNoteOff(midiNote)}
                onMouseLeave={() => isActive && handleKeyNoteOff(midiNote)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleKeyNoteOn(midiNote, 0.9);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleKeyNoteOff(midiNote);
                }}
                className={`relative -mx-1.5 sm:-mx-2 z-20 w-3.5 sm:w-4.5 h-8 sm:h-10 rounded-b border cursor-pointer transition-all shadow-md ${
                  isActive
                    ? 'bg-blue-500 border-cyan-200 shadow-[0_0_16px_#00d2ff] scale-[0.97]'
                    : 'bg-gradient-to-b from-[#242b38] via-[#121622] to-[#080b12] border-[#0a0d14] hover:from-[#323c4e] hover:to-[#0f1420]'
                }`}
              />
            );
          }

          return (
            <div
              key={midiNote}
              onMouseDown={() => handleKeyNoteOn(midiNote, 0.9)}
              onMouseUp={() => handleKeyNoteOff(midiNote)}
              onMouseLeave={() => isActive && handleKeyNoteOff(midiNote)}
              onTouchStart={(e) => {
                e.preventDefault();
                handleKeyNoteOn(midiNote, 0.9);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleKeyNoteOff(midiNote);
              }}
              className={`z-10 flex-1 min-w-[8px] sm:min-w-[12px] h-full rounded-b border cursor-pointer transition-all flex flex-col justify-end p-0.5 text-[8px] font-bold ${
                isActive
                  ? 'bg-gradient-to-b from-cyan-400 via-blue-500 to-blue-600 border-cyan-100 shadow-[0_0_20px_#00d2ff] text-white scale-[0.98]'
                  : 'bg-gradient-to-b from-[#f1f5f9] via-[#e2e8f0] to-[#cbd5e1] border-[#94a3b8]/40 hover:from-white hover:to-[#cbd5e1] text-zinc-600 shadow-[inset_0_-3px_4px_rgba(0,0,0,0.15)]'
              }`}
            >
              {isCKey && (
                <span className="text-zinc-500 font-black text-[8px] sm:text-[9px] pl-0.5 pb-0.5 tracking-tighter">
                  C{octaveNum}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

