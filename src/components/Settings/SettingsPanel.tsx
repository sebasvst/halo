import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Download,
  X,
} from "lucide-react";
import { Toggle } from "../common/Toggle";
import { Slider } from "../common/Slider";
import { Segmented } from "../common/Segmented";
import { IconButton } from "../common/IconButton";
import { useSettings, type DeepPatch } from "../../state/SettingsContext";
import { useAudio } from "../../state/AudioContext";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  shortcuts as shortcutsApi,
  app as appApi,
  settingsApi,
} from "../../services/bridge";
import type {
  AnimSpeed,
  ReduceMotionPref,
  ShortcutEntry,
  ThemeName,
} from "../../types/settings";
import type { SettingsStoreInfo, ShortcutKind } from "../../types/bridge";

interface SettingsPanelProps {
  onBack: () => void;
}

export function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { settings, update, exportSettings, importSettings } = useSettings();
  const { audio, available } = useAudio();
  const reduced = useReducedMotion(settings.appearance.reduceMotion);
  const [status, setStatus] = useState<string | null>(null);
  const [newShortcut, setNewShortcut] = useState({
    name: "",
    kind: "web" as ShortcutKind,
    target: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [store, setStore] = useState<SettingsStoreInfo | null>(null);
  const s = settings;

  useEffect(() => {
    let disposed = false;
    void settingsApi.storeInfo().then((info) => {
      if (!disposed) setStore(info);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const set = (patch: DeepPatch): void => update(patch);

  const addShortcut = async (): Promise<void> => {
    if (!newShortcut.name.trim() || !newShortcut.target.trim()) return;
    const validation = await shortcutsApi.validate({
      kind: newShortcut.kind,
      target: newShortcut.target.trim(),
    });
    if (validation && validation.validity !== "valid") {
      setStatus(validation.detail ?? "El destino no es válido.");
      return;
    }
    const entry: ShortcutEntry = {
      id: `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: newShortcut.name.trim(),
      kind: newShortcut.kind,
      target: newShortcut.target.trim(),
      icon: null,
    };
    set({ shortcuts: [...s.shortcuts, entry] });
    setNewShortcut({ name: "", kind: "web", target: "" });
    setStatus(null);
  };

  const removeShortcut = (id: string): void => {
    set({ shortcuts: s.shortcuts.filter((sc) => sc.id !== id) });
  };

  const doExport = async (): Promise<void> => {
    const json = await exportSettings();
    if (json === null) {
      setStatus("No se pudo exportar la configuración.");
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "halo-config.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Configuración exportada.");
  };

  const onImportFile = async (file: File): Promise<void> => {
    try {
      const json = await file.text();
      const error = await importSettings(json);
      setStatus(error ?? "Configuración importada.");
    } catch {
      setStatus("No se pudo leer el archivo.");
    }
  };

  const quit = async (): Promise<void> => {
    const confirmed = window.confirm("¿Salir de Halo?");
    if (confirmed) await appApi.quit();
  };

  return (
    <div className="studio" aria-label="Halo Studio">
      <header className="studio__header">
        <IconButton label="Volver" size="sm" onClick={onBack}>
          <ArrowLeft size={15} />
        </IconButton>
        <span className="studio__title">Halo Studio</span>
        <IconButton label="Cerrar" size="sm" onClick={onBack}>
          <X size={15} />
        </IconButton>
      </header>

      <div className="studio__body">
        {/* Apariencia */}
        <section className="studio__group">
          <h3 className="studio__group-title">Apariencia</h3>
          <div className="studio__row">
            <span className="studio__label">Tema</span>
            <Segmented<ThemeName>
              label="Tema"
              value={s.appearance.theme}
              options={[
                { value: "dark", label: "Oscuro" },
                { value: "light", label: "Claro" },
                { value: "auto", label: "Auto" },
              ]}
              onChange={(theme) => set({ appearance: { theme } })}
            />
          </div>
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Transparencia</span>
            <Slider
              value={s.appearance.transparency}
              min={0}
              max={0.6}
              onChange={(transparency) => set({ appearance: { transparency } })}
              label="Transparencia"
              formatValue={(v) => `${Math.round((v / 0.6) * 100)}%`}
            />
          </div>
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Escala de la cápsula</span>
            <Slider
              value={s.appearance.capsuleScale}
              min={0.85}
              max={1.3}
              step={0.05}
              onChange={(capsuleScale) => set({ appearance: { capsuleScale } })}
              label="Escala de la cápsula"
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Escala del panel</span>
            <Slider
              value={s.appearance.panelScale}
              min={0.85}
              max={1.3}
              step={0.05}
              onChange={(panelScale) => set({ appearance: { panelScale } })}
              label="Escala del panel"
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <div className="studio__row">
            <span className="studio__label">Animaciones</span>
            <Segmented<AnimSpeed>
              label="Velocidad de animación"
              value={s.appearance.animationSpeed}
              options={[
                { value: "slow", label: "Lento" },
                { value: "normal", label: "Normal" },
                { value: "fast", label: "Rápido" },
              ]}
              onChange={(animationSpeed) => set({ appearance: { animationSpeed } })}
            />
          </div>
          <div className="studio__row">
            <span className="studio__label">Movimiento reducido</span>
            <Segmented<ReduceMotionPref>
              label="Movimiento reducido"
              value={s.appearance.reduceMotion}
              options={[
                { value: "system", label: "Sistema" },
                { value: "reduce", label: "Reducir" },
                { value: "allow", label: "Permitir" },
              ]}
              onChange={(reduceMotion) => set({ appearance: { reduceMotion } })}
            />
          </div>
          <p className="studio__hint">
            {reduced ? "Las animaciones están reducidas en este momento." : "Las animaciones están activas."}
          </p>
        </section>

        {/* Interacción */}
        <section className="studio__group">
          <h3 className="studio__group-title">Interacción</h3>
          <Toggle
            label="Vista previa al pasar el cursor"
            description="La isla se expande al pasar el ratón por encima."
            checked={s.interaction.hoverPreview}
            onChange={(hoverPreview) => set({ interaction: { hoverPreview } })}
          />
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Retardo de vista previa</span>
            <Slider
              value={s.interaction.hoverPreviewMs}
              min={150}
              max={1500}
              step={50}
              onChange={(hoverPreviewMs) => set({ interaction: { hoverPreviewMs } })}
              label="Retardo de vista previa"
              formatValue={(v) => `${Math.round(v)} ms`}
            />
          </div>
          <Toggle
            label="Colapso automático"
            description="El panel se pliega solo al dejar de interactuar."
            checked={s.interaction.autoCollapse}
            onChange={(autoCollapse) => set({ interaction: { autoCollapse } })}
          />
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Tiempo de colapso</span>
            <Slider
              value={s.interaction.autoCollapseMs}
              min={1000}
              max={60000}
              step={500}
              onChange={(autoCollapseMs) => set({ interaction: { autoCollapseMs } })}
              label="Tiempo de colapso"
              disabled={!s.interaction.autoCollapse}
              formatValue={(v) => `${(v / 1000).toFixed(0)} s`}
            />
          </div>
          <div className="studio__row">
            <span className="studio__label">Atajo global</span>
            <input
              className="input input--narrow"
              type="text"
              value={s.interaction.globalShortcut ?? ""}
              placeholder="Ctrl+Alt+H"
              onChange={(e) =>
                set({ interaction: { globalShortcut: e.target.value || null } })
              }
              aria-label="Atajo global"
            />
          </div>
          <p className="studio__hint">Pulsa Esc para colapsar la isla en cualquier momento.</p>
        </section>

        {/* Música */}
        <section className="studio__group">
          <h3 className="studio__group-title">Música</h3>
          <Toggle
            label="Mostrar portada"
            checked={s.music.showArtwork}
            onChange={(showArtwork) => set({ music: { showArtwork } })}
          />
          <Toggle
            label="Mostrar artista"
            checked={s.music.showArtist}
            onChange={(showArtist) => set({ music: { showArtist } })}
          />
          <Toggle
            label="Mostrar progreso"
            checked={s.music.showProgress}
            onChange={(showProgress) => set({ music: { showProgress } })}
          />
          <Toggle
            label="Forma de onda"
            description="Barras animadas con el nivel de audio real del sistema (WASAPI)."
            checked={s.music.waveform}
            onChange={(waveform) => set({ music: { waveform } })}
          />
        </section>

        {/* Notificaciones */}
        <section className="studio__group">
          <h3 className="studio__group-title">Notificaciones</h3>
          <Toggle
            label="Activar notificaciones"
            checked={s.notifications.enabled}
            onChange={(enabled) => set({ notifications: { enabled } })}
          />
          <Toggle
            label="Alertas visuales"
            description="Muestra un aviso breve en la cápsula al llegar una notificación."
            checked={s.notifications.visualAlerts}
            disabled={!s.notifications.enabled}
            onChange={(visualAlerts) => set({ notifications: { visualAlerts } })}
          />
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Duración del aviso</span>
            <Slider
              value={s.notifications.durationMs}
              min={1000}
              max={15000}
              step={500}
              disabled={!s.notifications.visualAlerts}
              onChange={(durationMs) => set({ notifications: { durationMs } })}
              label="Duración del aviso"
              formatValue={(v) => `${(v / 1000).toFixed(1)} s`}
            />
          </div>
          <Toggle
            label="No molestar"
            description="Suprime las alertas visuales (la cola sigue recogiendo)."
            checked={s.notifications.doNotDisturb}
            onChange={(doNotDisturb) => set({ notifications: { doNotDisturb } })}
          />
          <Toggle
            label="Ocultar vista previa"
            description="Privacidad: nunca muestra el texto de los mensajes."
            checked={s.notifications.hidePreviews}
            onChange={(hidePreviews) => set({ notifications: { hidePreviews } })}
          />
          <Toggle
            label="Mostrar iconos de app"
            description="Muestra el icono de cada aplicación en las notificaciones."
            checked={s.notifications.showAppIcons}
            onChange={(showAppIcons) => set({ notifications: { showAppIcons } })}
          />
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Límite de la cola</span>
            <Slider
              value={s.notifications.queueLimit}
              min={5}
              max={50}
              step={1}
              onChange={(queueLimit) => set({ notifications: { queueLimit } })}
              label="Límite de la cola"
              formatValue={(v) => `${v}`}
            />
          </div>
          <div className="studio__row studio__row--stack">
            <span className="studio__label">Historial (minutos)</span>
            <Slider
              value={s.notifications.historyMinutes}
              min={0}
              max={240}
              step={5}
              onChange={(historyMinutes) => set({ notifications: { historyMinutes } })}
              label="Historial"
              formatValue={(v) => (v === 0 ? "Solo sesión" : `${v} min`)}
            />
          </div>
        </section>

        {/* Temporizadores */}
        <section className="studio__group">
          <h3 className="studio__group-title">Temporizadores</h3>
          <Toggle
            label="Sonido de alerta"
            description="Tono generado localmente con Web Audio; sin archivos."
            checked={s.timers.alertSound}
            onChange={(alertSound) => set({ timers: { alertSound } })}
          />
          <Toggle
            label="Mantener isla visible al terminar"
            checked={s.timers.keepIslandVisible}
            onChange={(keepIslandVisible) => set({ timers: { keepIslandVisible } })}
          />
          <Toggle
            label="Recordar temporizadores al reiniciar"
            description="Se guardan solo en tu equipo, nunca se envían a ningún sitio."
            checked={s.timers.persistAcrossRestarts}
            onChange={(persistAcrossRestarts) =>
              set({ timers: { persistAcrossRestarts } })
            }
          />
        </section>

        {/* Sonido */}
        <section className="studio__group">
          <h3 className="studio__group-title">Sonido del sistema</h3>
          {available && audio ? (
            <>
              <div className="studio__row studio__row--stack">
                <span className="studio__label">
                  Volumen · {audio.deviceName ?? "predeterminado"}
                </span>
                <Slider
                  value={audio.muted ? 0 : audio.level}
                  onChange={() => undefined}
                  label="Volumen (usa el control de la portada)"
                  disabled
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
              <p className="studio__hint">
                Ajusta el volumen desde el control de la página principal.
              </p>
            </>
          ) : (
            <p className="studio__hint">Controles de sonido no disponibles en este equipo.</p>
          )}
        </section>

        {/* Accesos directos */}
        <section className="studio__group">
          <h3 className="studio__group-title">Accesos directos</h3>
          <form
            className="studio__shortcut-form"
            onSubmit={(e) => {
              e.preventDefault();
              void addShortcut();
            }}
          >
            <input
              className="input"
              type="text"
              placeholder="Nombre"
              maxLength={40}
              value={newShortcut.name}
              onChange={(e) => setNewShortcut((p) => ({ ...p, name: e.target.value }))}
              aria-label="Nombre del acceso directo"
            />
            <select
              className="input input--select"
              value={newShortcut.kind}
              onChange={(e) =>
                setNewShortcut((p) => ({ ...p, kind: e.target.value as ShortcutKind }))
              }
              aria-label="Tipo de acceso directo"
            >
              <option value="web">Web</option>
              <option value="app">App</option>
              <option value="file">Archivo</option>
              <option value="folder">Carpeta</option>
            </select>
            <input
              className="input"
              type="text"
              placeholder="https://… o ruta"
              value={newShortcut.target}
              onChange={(e) => setNewShortcut((p) => ({ ...p, target: e.target.value }))}
              aria-label="Destino"
            />
            <button type="submit" className="btn btn--accent" aria-label="Añadir acceso directo">
              <Plus size={14} />
            </button>
          </form>
          {s.shortcuts.length === 0 ? (
            <p className="studio__hint">Aún no hay accesos directos.</p>
          ) : (
            <ul className="studio__shortcut-list">
              {s.shortcuts.map((sc) => (
                <li key={sc.id} className="studio__shortcut-item">
                  <span className="studio__shortcut-name">{sc.name}</span>
                  <span className="studio__shortcut-kind">{sc.kind}</span>
                  <IconButton
                    label={`Eliminar ${sc.name}`}
                    size="sm"
                    onClick={() => removeShortcut(sc.id)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sistema */}
        <section className="studio__group">
          <h3 className="studio__group-title">Sistema</h3>
          <Toggle
            label="Iniciar con Windows"
            description="Se registra únicamente en tu cuenta de usuario."
            checked={s.system.launchAtStartup}
            onChange={(launchAtStartup) => set({ system: { launchAtStartup } })}
          />
          <Toggle
            label="Cerrar en bandeja"
            description="Al cerrar la ventana, Halo sigue en la bandeja."
            checked={s.system.closeToTray}
            onChange={(closeToTray) => set({ system: { closeToTray } })}
          />
          <Toggle
            label="Mostrar icono de bandeja"
            checked={s.system.showTrayIcon}
            onChange={(showTrayIcon) => set({ system: { showTrayIcon } })}
          />
        </section>

        {/* Datos */}
        <section className="studio__group">
          <h3 className="studio__group-title">Configuración y privacidad</h3>
          <div className="studio__actions">
            <button type="button" className="btn" onClick={() => void doExport()}>
              <Download size={13} aria-hidden="true" />
              Exportar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={13} aria-hidden="true" />
              Importar
            </button>
          </div>
          <p className="studio__hint studio__hint--privacy">
            Halo no usa IA, telemetría ni envía datos a servidores. Las notificaciones se leen en
            local mediante la API de Windows y solo viven en la memoria de la isla.
          </p>
          {store ? (
            <p className="studio__hint" title={store.path}>
              {store.portable ? "Modo portátil" : "Configuración guardada en"}{" "}
              <span className="studio__store-path">{store.path}</span>
            </p>
          ) : null}
          {status ? (
            <p className="studio__status" role="status">
              {status}
            </p>
          ) : null}
          <button type="button" className="btn btn--danger" onClick={() => void quit()}>
            Salir de Halo
          </button>
        </section>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onImportFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
