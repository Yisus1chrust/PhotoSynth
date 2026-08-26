import React, { useState, useRef, useEffect, useCallback } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  displayFormatter?: (val: number) => string;
  onChange: (val: number) => void;
  color?: string;
  statusText?: string;
  compact?: boolean;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  unit = '',
  displayFormatter,
  onChange,
  color = '#a855f7',
  statusText,
  compact = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValRef = useRef<number>(value);

  // Normalize value to 0..1 range for rotation (-135 deg to +135 deg)
  const normValue = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const rotationDeg = -135 + normValue * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
  };

  const handleDoubleClick = () => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const dy = startYRef.current - e.clientY;
      const sensitivity = e.shiftKey ? 0.001 : 0.005;
      const deltaRange = (max - min) * dy * sensitivity;
      let newVal = startValRef.current + deltaRange;

      newVal = Math.max(min, Math.min(max, newVal));
      if (step) {
        newVal = Math.round(newVal / step) * step;
      }
      onChange(newVal);
    },
    [isDragging, min, max, step, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const formattedValue = displayFormatter
    ? displayFormatter(value)
    : `${Number(value.toFixed(2))}${unit}`;

  return (
    <div className="flex flex-col items-center justify-center select-none py-0.5 px-0.5">
      {/* Label above Knob */}
      <span className="text-[9px] font-mono font-bold tracking-wider text-zinc-300 uppercase text-center mb-0.5 max-w-[90px] truncate vst-text-embossed">
        {label}
      </span>

      {/* Knob Graphic Container */}
      <div
        className="relative w-11 h-11 cursor-ns-resize flex items-center justify-center my-0.5"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Drag up/down to adjust. Double click to reset."
      >
        {/* Outer Arc Track & Tick Marks */}
        <svg width="44" height="44" className="absolute inset-0">
          {/* Recessed Ring Groove */}
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="#0a0e16"
            strokeWidth="3.5"
            strokeDasharray="83 100"
            strokeDashoffset="-12"
            strokeLinecap="round"
          />
          {/* Background Track */}
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="#1a2436"
            strokeWidth="2.5"
            strokeDasharray="83 100"
            strokeDashoffset="-12"
            strokeLinecap="round"
          />
          {/* Active Glowing Arc Track */}
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeDasharray={`${normValue * 81} 100`}
            strokeDashoffset="-12"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0px 0px 4px ${color}dd)`,
            }}
          />
        </svg>

        {/* Metallic Bevel Outer Ring */}
        <div className="w-8 h-8 rounded-full vst-knob-ring p-0.5 flex items-center justify-center shadow-lg">
          {/* Rotary Metallic Knob Cap */}
          <div
            className="w-full h-full rounded-full vst-knob-cap relative flex items-center justify-center transition-transform duration-75"
            style={{ transform: `rotate(${rotationDeg}deg)` }}
          >
            {/* Concentric Ridge Center Detail */}
            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-zinc-600/40 to-zinc-950/80 border border-zinc-700/50" />

            {/* Round Pot Indicator Dot near outer rim */}
            <div
              className="absolute top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}, 0 0 2px #ffffff`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Recessed Value Readout Box below Knob */}
      <div className="vst-readout px-1.5 py-0.5 rounded mt-0.5 flex items-center justify-center min-w-[42px]">
        <span
          className="text-[10px] font-mono font-bold tracking-tight text-zinc-100"
          style={{ textShadow: `0 0 6px ${color}88` }}
        >
          {formattedValue}
        </span>
      </div>

      {/* Optional Status text */}
      {statusText && (
        <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">
          {statusText}
        </span>
      )}
    </div>
  );
};
