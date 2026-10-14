import { useEffect, useRef } from "react";

/**
 * Live waveform driven by the real system audio peak (WASAPI meter).
 * Bars are updated via direct DOM style writes (no React re-render) so the
 * island stays buttery-smooth even at 20 peak samples per second.
 */

interface AudioWaveformProps {
  playing: boolean;
  reducedMotion: boolean;
  /** Smoothed peak 0..=1 from AudioContext. */
  peak?: number;
  compact?: boolean;
  barCount?: number;
}

function barHeight(peak: number, i: number, seed: number): number {
  const base = 0.12 + peak * 0.88;
  const phase = Math.sin(seed * 0.017 + i * 1.7) * 0.5 + 0.5;
  const neighbour = Math.sin(seed * 0.011 + (i + 1) * 2.3) * 0.5 + 0.5;
  const mix = phase * 0.65 + neighbour * 0.35;
  return Math.min(1, base * (0.45 + mix * 0.55));
}

export function AudioWaveform({
  playing,
  reducedMotion,
  peak = 0,
  compact = false,
  barCount = 5,
}: AudioWaveformProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef(peak);
  peakRef.current = peak;
  const frozen = !playing || reducedMotion;
  const maxH = compact ? 13 : 18;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bars = Array.from(root.querySelectorAll<HTMLElement>(".wave__bar"));
    if (frozen) {
      for (const bar of bars) {
        bar.style.height = "3px";
      }
      return;
    }
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 1;
      // ~30 fps is plenty for 5 tiny bars.
      if (t % 2 === 0) {
        const seed = t * 16;
        for (let i = 0; i < bars.length; i++) {
          const h = barHeight(peakRef.current, i, seed);
          bars[i]!.style.height = `${Math.round(h * maxH)}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozen, maxH, barCount]);

  return (
    <div
      ref={rootRef}
      className={`wave ${compact ? "wave--compact" : ""} ${frozen ? "wave--frozen" : ""}`.trim()}
      aria-hidden="true"
      data-playing={playing || undefined}
    >
      {Array.from({ length: barCount }, (_, i) => (
        <span
          key={i}
          className="wave__bar"
          style={{ height: frozen ? "3px" : `${Math.round(0.22 * maxH)}px` }}
        />
      ))}
    </div>
  );
}
