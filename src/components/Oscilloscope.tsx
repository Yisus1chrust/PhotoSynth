import React, { useEffect, useRef } from 'react';

interface OscilloscopeProps {
  onGetWaveform: (array: Uint8Array) => void;
  onGetSpectrum: (array: Uint8Array) => void;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({
  onGetWaveform,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    const waveformArray = new Uint8Array(512);

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Dark background
      ctx.fillStyle = '#06090e';
      ctx.fillRect(0, 0, w, h);

      // Subtle horizontal baseline
      ctx.strokeStyle = '#111927';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      onGetWaveform(waveformArray);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 6;

      ctx.beginPath();
      const sliceWidth = w / waveformArray.length;
      let x = 0;

      for (let i = 0; i < waveformArray.length; i++) {
        const v = waveformArray[i] / 128.0;
        const y = (v * h) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [onGetWaveform]);

  return (
    <div className="relative w-full h-11 vst-readout vst-bezel rounded-md overflow-hidden shrink-0 shadow-inner">
      <canvas
        ref={canvasRef}
        width={600}
        height={44}
        className="w-full h-full object-cover"
      />
    </div>
  );
};
