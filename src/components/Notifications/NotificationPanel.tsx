import { useState } from "react";
import { Bell, BellRing, ChevronLeft, ChevronRight, ExternalLink, ShieldAlert, Trash2, X } from "lucide-react";
import { IconButton } from "../common/IconButton";
import type { NotificationAccess, NotificationItem } from "../../types/bridge";
import { formatTimeOfDay, truncate } from "../../utils/format";
import { shortcuts as shortcutsApi } from "../../services/bridge";

interface NotificationPanelProps {
  queue: NotificationItem[];
  current: NotificationItem | null;
  index: number;
  access: NotificationAccess;
  hidePreviews: boolean;
  showAppIcons: boolean;
  onSelect: (i: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onRefreshAccess: () => void;
}

export function NotificationPanel({
  queue,
  current,
  index,
  access,
  hidePreviews,
  showAppIcons,
  onSelect,
  onNext,
  onPrevious,
  onDismiss,
  onDismissAll,
  onRefreshAccess,
}: NotificationPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);

  const openAction = async (item: NotificationItem, actionId?: string): Promise<void> => {
    const action = actionId
      ? item.actions.find((a) => a.id === actionId)
      : item.actions.find((a) => a.kind === "openUri" && a.payload);
    if (!action?.payload) return;
    if (action.kind === "openApp") {
      const result = await shortcutsApi.open({ kind: "app", target: action.payload });
      if (result === null) setActionError("No se pudo abrir la aplicación.");
      else setActionError(null);
      return;
    }
    const result = await shortcutsApi.open({ kind: "web", target: action.payload });
    if (result === null) setActionError("No se pudo abrir el enlace de la notificación.");
    else setActionError(null);
  };

  // Compact upcoming queue (skip the current one) — glanceable "what else is waiting".
  const upcoming = queue
    .map((n, i) => ({ n, i }))
    .filter(({ i }) => i !== index)
    .slice(0, 3);

  return (
    <section className="card notifications" aria-label="Notificaciones">
      <header className="card__header">
        <span className="card__title">
          <Bell size={14} aria-hidden="true" />
          Notificaciones
        </span>
        <div className="card__header-actions">
          {queue.length > 1 ? (
            <span className="notifications__count">
              {index + 1}/{queue.length}
            </span>
          ) : null}
          {queue.length > 0 ? (
            <IconButton label="Descartar todas" size="sm" onClick={onDismissAll}>
              <Trash2 size={13} />
            </IconButton>
          ) : null}
        </div>
      </header>

      {access.status !== "allowed" ? (
        <AccessBanner access={access} onRefresh={onRefreshAccess} />
      ) : null}

      {current ? (
        <>
          <article className="notif" aria-label="Notificación actual">
            <div className="notif__head">
              {showAppIcons ? (
                <span className="notif__icon" aria-hidden="true">
                  {current.icon ? (
                    <img src={current.icon} alt="" draggable={false} />
                  ) : (
                    <BellRing size={14} />
                  )}
                </span>
              ) : null}
              <div className="notif__head-text">
<span className="notif__app">
                {current.appName && current.appName.trim() && current.appName !== "?"
                  ? truncate(current.appName, 22)
                  : "Aplicación"}
              </span>
                <span className="notif__time">{formatTimeOfDay(current.receivedAt)}</span>
              </div>
              <IconButton
                label="Descartar notificación"
                size="sm"
                onClick={() => onDismiss(current.id)}
              >
                <X size={13} />
              </IconButton>
            </div>

            {current.title ? <p className="notif__title">{truncate(current.title, 120)}</p> : null}
            {current.preview && !hidePreviews ? (
              <p className="notif__preview">{truncate(current.preview, 240)}</p>
            ) : current.preview && hidePreviews ? (
              <p className="notif__preview notif__preview--hidden">
                Vista previa oculta por privacidad
              </p>
            ) : null}

            {current.actions.length > 0 ? (
              <div className="notif__actions">
                {current.actions
                  .filter((a) => a.kind === "openUri" && a.payload || a.kind === "openApp" && a.payload)
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="btn btn--accent"
                      onClick={() => void openAction(current, a.id)}
                    >
                      <ExternalLink size={13} aria-hidden="true" />
                      {a.label}
                    </button>
                  ))}
              </div>
            ) : null}
            {actionError ? <p className="notif__error">{actionError}</p> : null}

            {queue.length > 1 ? (
              <nav className="notif__nav" aria-label="Navegar notificaciones">
                <IconButton
                  label="Notificación anterior"
                  size="sm"
                  onClick={onPrevious}
                >
                  <ChevronLeft size={14} />
                </IconButton>
                <div className="notif__dots" role="group" aria-label={`Notificación ${index + 1} de ${queue.length}`}>
                  {queue.slice(0, 8).map((n, i) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`notif__dot ${i === Math.min(index, 7) ? "notif__dot--active" : ""}`.trim()}
                      aria-label={`Ver notificación ${i + 1}`}
                      aria-current={i === Math.min(index, 7)}
                      onClick={() => onSelect(i)}
                    />
                  ))}
                </div>
                <IconButton
                  label="Siguiente notificación"
                  size="sm"
                  onClick={onNext}
                >
                  <ChevronRight size={14} />
                </IconButton>
              </nav>
            ) : null}
          </article>

          {/* Upcoming peek — mini stack of what's next in the queue */}
          {upcoming.length > 0 ? (
            <div className="notif__upcoming" aria-label="Siguiente en la cola">
              {upcoming.map(({ n, i }) => (
                <button
                  key={n.id}
                  type="button"
                  className="notif__upcoming-item"
                  onClick={() => onSelect(i)}
                >
                  <span className="notif__upcoming-dot" aria-hidden="true" />
                  <span className="notif__upcoming-app">
                    {n.appName && n.appName.trim() && n.appName !== "?"
                      ? truncate(n.appName, 14)
                      : "App"}
                  </span>
                  <span className="notif__upcoming-title">
                    {truncate(n.title ?? n.preview ?? "", 28)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="notif--empty">
          <span className="notif__empty-icon">
            <Bell size={18} aria-hidden="true" />
          </span>
          <p className="notif__empty-title">Sin notificaciones</p>
          <p className="notif__empty-desc">
            Las notificaciones de tus apps aparecerán aquí en tiempo real.
          </p>
        </div>
      )}
    </section>
  );
}

function AccessBanner({
  access,
  onRefresh,
}: {
  access: NotificationAccess;
  onRefresh: () => void;
}) {
  const message =
    access.status === "denied"
      ? "Windows ha denegado el acceso al historial de notificaciones. Permite el acceso en Configuración › Sistema › Notificaciones › Halo y vuelve a intentarlo."
      : access.status === "unavailable"
        ? "El oyente de notificaciones no está disponible en este sistema."
        : "Halo necesita permiso de Windows para leer tus notificaciones. Pulsa el botón y acepta el diálogo de Windows.";

  return (
    <div className="notif__access" role="status">
      <ShieldAlert size={14} aria-hidden="true" />
      <p className="notif__access-text">{message}</p>
      <IconButton
        label={
          access.status === "denied"
            ? "Comprobar de nuevo"
            : "Permitir acceso a las notificaciones"
        }
        size="sm"
        onClick={onRefresh}
      >
        <ShieldAlert size={13} />
      </IconButton>
    </div>
  );
}
