import React from 'react';

interface RadialGaugeProps {
  label: string;
  value: number; // 0.0 to 1.0 or raw number
  color: string;
  displayValue?: string | number;
}

export const RadialGauge: React.FC<RadialGaugeProps> = ({
  label,
  value,
  color,
  displayValue,
}) => {
  const clampedValue = Math.max(0, Math.min(1, value));
  const numVal = displayValue !== undefined ? displayValue : Math.round(clampedValue * 100);

  // SVG arc calculation (270 degree sweep)
  const size = 52;
  const strokeWidth = 3.5;
  const center = size / 2;
  const radius = center - strokeWidth - 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270 deg
  const strokeDashoffset = arcLength * (1 - clampedValue);

  // Rotation angle for central potentiometer knob (-135deg to +135deg)
  const rotationDeg = -135 + clampedValue * 270;

  return (
    <div className="flex items-center justify-between py-2 px-3 my-1 vst-panel-recessed rounded-xl border border-[#222630] shadow-inner">
      {/* Round Potentiometer Knob on the left */}
      <div className="relative w-[52px] h-[52px] shrink-0 flex items-center justify-center">
        {/* SVG Arc Ring around Knob */}
        <svg width={size} height={size} className="transform -rotate-225 absolute inset-0">
          {/* Recessed Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#111318"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Active Glowing Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-200 ease-out"
            style={{
              filter: `drop-shadow(0px 0px 6px ${color}dd)`,
            }}
          />
        </svg>

        {/* 3D Round Pot Knob Body */}
        <div className="w-8 h-8 rounded-full vst-knob-ring p-0.5 flex items-center justify-center shadow-lg z-10">
          <div
            className="w-full h-full rounded-full vst-knob-cap relative flex items-center justify-center transition-transform duration-200 ease-out"
            style={{ transform: `rotate(${rotationDeg}deg)` }}
          >
            {/* Center Metallic Ridge */}
            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-zinc-500/40 to-zinc-950/90 border border-zinc-700/60" />
            {/* Round Pot Indicator Dot near outer rim */}
            <div
              className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}, 0 0 2px #ffffff`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Label in middle */}
      <div className="flex flex-col flex-1 min-w-0 px-3 justify-center">
        <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-zinc-300 vst-text-embossed truncate">
          {label}
        </span>
      </div>

      {/* Big Value Readout on the right */}
      <div className="vst-readout px-2.5 py-1 rounded-md border border-[#1e222a] min-w-[48px] flex items-center justify-center">
        <span
          className="text-xl font-mono font-black tracking-tight"
          style={{ color, textShadow: `0 0 10px ${color}aa` }}
        >
          {numVal}
        </span>
      </div>
    </div>
  );
};

