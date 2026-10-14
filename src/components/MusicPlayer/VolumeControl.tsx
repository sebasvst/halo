import { ExternalLink, RefreshCw, Volume1, Volume2, VolumeX } from "lucide-react";
import { IconButton } from "../common/IconButton";
import { Slider } from "../common/Slider";
import type { AudioState } from "../../types/bridge";

interface VolumeControlProps {
  audio: AudioState | null;
  available: boolean;
  onLevel: (level: number) => void;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
}

export function VolumeControl({
  audio,
  available,
  onLevel,
  onToggleMute,
  onOpenSettings,
  onRefresh,
}: VolumeControlProps) {
  if (!available || !audio) {
    return (
      <section className="card volume volume--unavailable" aria-label="Volumen">
        <div className="volume__row">
          <VolumeX size={15} aria-hidden="true" />
          <p className="volume__unavailable-text">Controles de sonido no disponibles.</p>
          <IconButton label="Reintentar" size="sm" onClick={onRefresh}>
            <RefreshCw size={13} />
          </IconButton>
        </div>
      </section>
    );
  }

  const LevelIcon = audio.muted || audio.level === 0 ? VolumeX : audio.level < 0.5 ? Volume1 : Volume2;

  return (
    <section className="card volume" aria-label="Volumen del sistema">
      <div className="volume__row">
        <IconButton
          label={audio.muted ? "Activar sonido" : "Silenciar"}
          size="sm"
          onClick={onToggleMute}
        >
          <LevelIcon size={15} />
        </IconButton>
        <Slider
          value={audio.muted ? 0 : audio.level}
          onChange={onLevel}
          label="Volumen del sistema"
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
        <IconButton
          label="Abrir configuración de sonido de Windows"
          size="sm"
          onClick={onOpenSettings}
        >
          <ExternalLink size={13} />
        </IconButton>
      </div>
      {audio.deviceName ? (
        <p className="volume__device" title={audio.deviceName}>
          {audio.deviceName}
        </p>
      ) : null}
    </section>
  );
}
