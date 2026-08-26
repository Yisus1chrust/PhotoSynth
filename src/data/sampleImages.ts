import { PresetPhoto } from '../types/synth';

// Helper to generate a colorful procedural canvas image data URL
function createProceduralImageDataUrl(
  width: number,
  height: number,
  renderFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    renderFn(ctx, width, height);
  }
  return canvas.toDataURL('image/png');
}

export function getSamplePresetPhotos(): PresetPhoto[] {
  return [
    {
      id: 'jump-saw-sunset',
      title: 'Synthwave Sunset',
      description: 'High contrast, saturated neon gradients triggering Jump-style analog brass stack.',
      category: 'Analog Brass',
      dataUrl: createProceduralImageDataUrl(400, 300, (ctx, w, h) => {
        // Vibrant grid + neon sun gradient
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#ff0055');
        grad.addColorStop(0.5, '#ffaa00');
        grad.addColorStop(1, '#110022');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Sun
        const sunGrad = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, 90);
        sunGrad.addColorStop(0, '#ffff00');
        sunGrad.addColorStop(0.8, '#ff00aa');
        sunGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.45, 90, 0, Math.PI * 2);
        ctx.fill();

        // High contrast grid lines
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        for (let x = 0; x <= w; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, h * 0.6);
          ctx.lineTo(w / 2 + (x - w / 2) * 2.5, h);
          ctx.stroke();
        }
        for (let y = h * 0.6; y <= h; y += 15) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }),
    },
    {
      id: 'dark-age-fm-bells',
      title: 'Obsidian Crypt',
      description: 'Low-light, dark desaturated scene triggering Little Dark Age glassy FM bells.',
      category: 'FM / Wavetable',
      dataUrl: createProceduralImageDataUrl(400, 300, (ctx, w, h) => {
        // Dark moody background
        const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 220);
        grad.addColorStop(0, '#1a2238');
        grad.addColorStop(0.6, '#0b0e14');
        grad.addColorStop(1, '#020305');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Glassy geometric shard highlights
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 15; i++) {
          ctx.beginPath();
          const cx = (Math.sin(i * 1.5) * 0.4 + 0.5) * w;
          const cy = (Math.cos(i * 1.1) * 0.4 + 0.5) * h;
          const sz = 20 + i * 8;
          ctx.rect(cx - sz / 2, cy - sz / 2, sz, sz);
          ctx.stroke();
        }
      }),
    },
    {
      id: 'prism-crystal-complexity',
      title: 'Refractive Prism',
      description: 'Extremely high edge density & rich spectrum triggering complex modulating hybrid wavetable.',
      category: 'Hybrid Morph',
      dataUrl: createProceduralImageDataUrl(400, 300, (ctx, w, h) => {
        ctx.fillStyle = '#0a0a10';
        ctx.fillRect(0, 0, w, h);

        // Rainbow crystal facets
        const colors = ['#ff0055', '#7a00ff', '#00d2ff', '#00ffaa', '#ffea00'];
        for (let i = 0; i < 40; i++) {
          ctx.beginPath();
          ctx.moveTo((i * 13) % w, (i * 27) % h);
          ctx.lineTo(((i + 3) * 23) % w, ((i + 5) * 19) % h);
          ctx.lineTo(((i + 7) * 17) % w, ((i + 2) * 31) % h);
          ctx.closePath();
          ctx.fillStyle = colors[i % colors.length] + '44';
          ctx.fill();
          ctx.strokeStyle = colors[(i + 1) % colors.length];
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }),
    },
    {
      id: 'emerald-aurora',
      title: 'Neon Aurora',
      description: 'Luminous green and teal waves generating smooth, airy resonant pads.',
      category: 'Analog Brass',
      dataUrl: createProceduralImageDataUrl(400, 300, (ctx, w, h) => {
        ctx.fillStyle = '#020a0f';
        ctx.fillRect(0, 0, w, h);

        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#00ff87');
        grad.addColorStop(0.5, '#60efff');
        grad.addColorStop(1, '#001e3d');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.2);
        ctx.bezierCurveTo(w * 0.3, h * 0.05, w * 0.7, h * 0.5, w, h * 0.3);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }),
    },
  ];
}
