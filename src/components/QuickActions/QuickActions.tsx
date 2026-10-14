import { useState } from "react";
import { Folder, FileText, Globe, AppWindow, Zap } from "lucide-react";
import { shortcuts as shortcutsApi } from "../../services/bridge";
import type { ShortcutEntry } from "../../types/settings";
import type { ShortcutKind } from "../../types/bridge";
import { truncate } from "../../utils/format";

interface QuickActionsProps {
  shortcuts: ShortcutEntry[];
  onOpenSettings: () => void;
}

const ICONS: Record<ShortcutKind, typeof Globe> = {
  web: Globe,
  file: FileText,
  folder: Folder,
  app: AppWindow,
};

export function QuickActions({ shortcuts, onOpenSettings }: QuickActionsProps) {
  const [status, setStatus] = useState<string | null>(null);

  const open = async (entry: ShortcutEntry): Promise<void> => {
    const needsConfirm = await shortcutsApi.requiresConfirmation({
      kind: entry.kind,
      target: entry.target,
    });
    if (needsConfirm) {
      const ok = window.confirm(`¿Abrir “${entry.name}”?\n\n${entry.target}`);
      if (!ok) return;
    }
    const validation = await shortcutsApi.validate({
      kind: entry.kind,
      target: entry.target,
    });
    if (validation && validation.validity !== "valid") {
      setStatus(validation.detail ?? "El destino ya no existe.");
      return;
    }
    const result = await shortcutsApi.open({ kind: entry.kind, target: entry.target });
    setStatus(result === null ? "No se pudo abrir el destino." : null);
  };

  return (
    <section className="card quick" aria-label="Accesos directos">
      <header className="card__header">
        <span className="card__title">
          <Zap size={14} aria-hidden="true" />
          Accesos directos
        </span>
        <button type="button" className="btn btn--ghost" onClick={onOpenSettings}>
          Gestionar
        </button>
      </header>

      {shortcuts.length === 0 ? (
        <p className="quick__empty">
          Añade accesos directos desde la configuración para lanzar apps, archivos, carpetas o
          enlaces.
        </p>
      ) : (
        <div className="quick__grid">
          {shortcuts.map((entry) => {
            const Icon = ICONS[entry.kind] ?? Zap;
            return (
              <button
                key={entry.id}
                type="button"
                className="quick__item"
                title={`${entry.name}\n${entry.target}`}
                onClick={() => void open(entry)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{truncate(entry.name, 16)}</span>
              </button>
            );
          })}
        </div>
      )}
      {status ? (
        <p className="quick__status" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
