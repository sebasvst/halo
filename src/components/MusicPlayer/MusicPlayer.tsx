import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { IconButton } from "../common/IconButton";
import { AudioWaveform } from "../AudioWaveform/AudioWaveform";
import type { MediaState } from "../../types/bridge";
import { formatClock, mediaPercent } from "../../utils/format";

interface MusicPlayerProps {
  media: MediaState;
  showArtwork: boolean;
  showArtist: boolean;
  showProgress: boolean;
  showWaveform: boolean;
  reducedMotion: boolean;
  peak?: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export function MusicPlayer({
  media,
  showArtwork,
  showArtist,
  showProgress,
  showWaveform,
  reducedMotion,
  peak = 0,
  onPlayPause,
  onNext,
  onPrevious,
}: MusicPlayerProps) {
  if (!media.available) {
    return (
      <section className="card music music--empty" aria-label="Música">
        <div className="music__empty-icon">
          <Music size={18} aria-hidden="true" />
        </div>
        <div className="music__empty-text">
          <p className="music__empty-title">Sin sesión de música</p>
          <p className="music__empty-desc">
            Abre un reproductor compatible (Spotify, Groove, navegador…) y aparecerá aquí.
          </p>
        </div>
      </section>
    );
  }

  const playing = media.status === "playing";
  const percent = mediaPercent(media.positionMs, media.durationMs);
  const canPlay = media.supported.play && !playing;
  const canPause = media.supported.pause && playing;

  return (
    <section className="card music" aria-label="Reproductor de música">
      <div className="music__row">
        {showArtwork ? (
          <div className={`music__art ${playing ? "music__art--playing" : ""}`.trim()}>
            {media.artDataUrl ? (
              <img src={media.artDataUrl} alt="" draggable={false} />
            ) : (
              <Music size={20} aria-hidden="true" />
            )}
            {playing && showWaveform ? (
              <span className="music__art-pulse" aria-hidden="true" />
            ) : null}
          </div>
        ) : null}
        <div className="music__meta">
          <p className="music__title" title={media.title ?? undefined}>
            {media.title ?? "Sin título"}
          </p>
          {showArtist ? (
            <p className="music__artist" title={media.artist ?? undefined}>
              {media.artist ?? "Artista desconocido"}
            </p>
          ) : null}
          <div className="music__badges">
            {media.appId ? (
              <span className="music__source" title={media.appId}>
                {media.appId.split(/[.\\]/).pop() ?? media.appId}
              </span>
            ) : null}
            {playing ? <span className="music__live-dot" aria-hidden="true" /> : null}
            <span className={`music__status ${playing ? "music__status--live" : ""}`.trim()}>
              {playing ? "Reproduciendo" : "En pausa"}
            </span>
          </div>
        </div>
        {showWaveform ? (
          <AudioWaveform playing={playing} reducedMotion={reducedMotion} peak={peak} />
        ) : null}
      </div>

      {showProgress ? (
        <div className="music__progress">
          <div
            className="music__progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label="Progreso de reproducción"
          >
            <span className="music__progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="music__times">
            <span>{media.positionMs != null ? formatClock(media.positionMs) : "--:--"}</span>
            <span>{media.durationMs != null ? formatClock(media.durationMs) : "--:--"}</span>
          </div>
        </div>
      ) : null}

      <div className="music__controls">
        <IconButton
          label="Pista anterior"
          onClick={onPrevious}
          disabled={!media.supported.previous}
        >
          <SkipBack size={16} />
        </IconButton>
        <IconButton
          label={playing ? "Pausar" : "Reproducir"}
          onClick={onPlayPause}
          disabled={!canPlay && !canPause}
          className="music__play"
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </IconButton>
        <IconButton label="Pista siguiente" onClick={onNext} disabled={!media.supported.next}>
          <SkipForward size={16} />
        </IconButton>
      </div>
    </section>
  );
}
