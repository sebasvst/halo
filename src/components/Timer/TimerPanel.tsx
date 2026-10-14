import { useState } from "react";
import { Pause, Play, Plus, RotateCcw, Timer, X } from "lucide-react";
import { IconButton } from "../common/IconButton";
import { formatShortClock } from "../../utils/format";
import type { TimerItem } from "../../state/TimersContext";

interface TimerPanelProps {
  timers: TimerItem[];
  remainingOf: (t: TimerItem, now: number) => number;
  onCreate: (label: string, durationMs: number) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onReset: (id: string) => void;
  onCancel: (id: string) => void;
  reducedMotion: boolean;
}

const PRESETS: Array<{ label: string; ms: number }> = [
  { label: "1 min", ms: 60_000 },
  { label: "5 min", ms: 5 * 60_000 },
  { label: "10 min", ms: 10 * 60_000 },
  { label: "25 min", ms: 25 * 60_000 },
];

export function TimerPanel({
  timers,
  remainingOf,
  onCreate,
  onStart,
  onPause,
  onReset,
  onCancel,
  reducedMotion,
}: TimerPanelProps) {
  const [minutes, setMinutes] = useState(5);
  const [label, setLabel] = useState("");
  const now = Date.now();

  return (
    <section className="card timers" aria-label="Temporizadores">
      <header className="card__header">
        <span className="card__title">
          <Timer size={14} aria-hidden="true" />
          Temporizadores
        </span>
      </header>

      <form
        className="timers__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (minutes <= 0) return;
          onCreate(label, minutes * 60_000);
          setLabel("");
        }}
      >
        <input
          className="input timers__label"
          type="text"
          maxLength={40}
          placeholder="Etiqueta (opcional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Etiqueta del temporizador"
        />
        <div className="timers__presets" role="group" aria-label="Duración en minutos">
          {PRESETS.map((p) => (
            <button
              key={p.ms}
              type="button"
              className={`chip ${minutes * 60_000 === p.ms ? "chip--active" : ""}`.trim()}
              onClick={() => setMinutes(p.ms / 60_000)}
            >
              {p.label}
            </button>
          ))}
          <input
            className="input timers__minutes"
            type="number"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value) || 1)}
            aria-label="Minutos"
          />
        </div>
        <button type="submit" className="btn btn--accent">
          <Plus size={13} aria-hidden="true" />
          Crear
        </button>
      </form>

      {timers.length === 0 ? (
        <p className="timers__empty">Crea un temporizador para empezar.</p>
      ) : (
        <ul className="timers__list">
          {timers.map((t) => {
            const remaining = remainingOf(t, now);
            const done = t.status === "done";
            const running = t.status === "running";
            return (
              <li key={t.id} className={`timer-row ${done ? "timer-row--done" : ""}`.trim()}>
                <div className="timer-row__info">
                  <span className="timer-row__label">{t.label}</span>
                  <span
                    className={`timer-row__time ${running && !reducedMotion ? "timer-row__time--live" : ""}`.trim()}
                  >
                    {done ? "Completado" : formatShortClock(remaining)}
                  </span>
                </div>
                <div className="timer-row__actions">
                  {done ? (
                    <IconButton label="Reiniciar" size="sm" onClick={() => onReset(t.id)}>
                      <RotateCcw size={13} />
                    </IconButton>
                  ) : (
                    <>
                      {running ? (
                        <IconButton label="Pausar" size="sm" onClick={() => onPause(t.id)}>
                          <Pause size={13} />
                        </IconButton>
                      ) : (
                        <IconButton label="Iniciar" size="sm" onClick={() => onStart(t.id)}>
                          <Play size={13} />
                        </IconButton>
                      )}
                      <IconButton label="Reiniciar" size="sm" onClick={() => onReset(t.id)}>
                        <RotateCcw size={13} />
                      </IconButton>
                    </>
                  )}
                  <IconButton label="Cancelar" size="sm" onClick={() => onCancel(t.id)}>
                    <X size={13} />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
