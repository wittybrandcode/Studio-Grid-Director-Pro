import { SyncPayload } from '../types/studio';

/**
 * Type definitions for Tauri v2 global API (`window.__TAURI__` when `app.withGlobalTauri = true`)
 * and internal IPC (`window.__TAURI_INTERNALS__`).
 * Works with zero required npm runtime dependencies in browser mode and full native capabilities in Tauri.
 */
interface TauriMonitor {
  name: string | null;
  size: { width: number; height: number };
  position: { x: number; y: number };
  scaleFactor: number;
}

interface TauriWindowHandle {
  label?: string;
  setFocus?: () => Promise<void>;
  setFullscreen?: (fullscreen: boolean) => Promise<void>;
  isFullscreen?: () => Promise<boolean>;
  setDecorations?: (decorations: boolean) => Promise<void>;
  setAlwaysOnTop?: (alwaysOnTop: boolean) => Promise<void>;
  setPosition?: (pos: { type: 'Physical'; x: number; y: number }) => Promise<void>;
  setSize?: (size: { type: 'Physical'; width: number; height: number }) => Promise<void>;
  show?: () => Promise<void>;
  unminimize?: () => Promise<void>;
  close?: () => Promise<void>;
  once?: (event: string, cb: (ev: unknown) => void) => Promise<() => void>;
}

interface TauriGlobalApi {
  core?: {
    invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
  window?: {
    getCurrentWindow?: () => TauriWindowHandle;
    availableMonitors?: () => Promise<TauriMonitor[]>;
    primaryMonitor?: () => Promise<TauriMonitor | null>;
  };
  webviewWindow?: {
    WebviewWindow?: {
      new (label: string, options: Record<string, unknown>): TauriWindowHandle;
      getByLabel?: (label: string) => Promise<TauriWindowHandle | null>;
    };
  };
  event?: {
    emit?: (event: string, payload?: unknown) => Promise<void>;
    listen?: <T = unknown>(
      event: string,
      handler: (event: { payload: T }) => void
    ) => Promise<() => void>;
  };
  dialog?: {
    save?: (options?: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<string | null>;
    open?: (options?: {
      title?: string;
      multiple?: boolean;
      directory?: boolean;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<string | string[] | null>;
  };
  fs?: {
    writeFile?: (path: string, data: Uint8Array) => Promise<void>;
    readFile?: (path: string) => Promise<Uint8Array>;
  };
  clipboardManager?: {
    writeText?: (text: string) => Promise<void>;
    readText?: () => Promise<string>;
  };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobalApi;
    __TAURI_INTERNALS__?: {
      invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

export const TAURI_SYNC_EVENT_NAME = 'studio-grid-director-sync';

/**
 * Detect whether the app is currently running inside a Tauri Desktop WebView container
 */
export function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__)
  );
}

/**
 * Low-level Tauri IPC invoke helper (works via `window.__TAURI__.core.invoke` or `window.__TAURI_INTERNALS__.invoke`)
 */
async function tauriInvoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  try {
    const fn =
      window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (typeof fn === 'function') {
      return await fn<T>(cmd, args);
    }
  } catch {
    // ignore IPC errors when plugin is not registered
  }
  return null;
}

async function tauriInvokeStrict<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const fn =
    window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (typeof fn !== 'function') {
    throw new Error('Tauri invoke unavailable');
  }
  return await fn<T>(cmd, args);
}

/**
 * Save a binary Blob (.sgd, .png, .json, .txt) using:
 * 1. Tauri Native OS Save Dialog + Native File System write (when in Tauri)
 * 2. Standard browser `<a download>` fallback
 */
export async function saveStudioBinaryFile(
  blob: Blob,
  defaultFileName: string,
  options?: {
    filterName?: string;
    extensions?: string[];
  }
): Promise<{ saved: boolean; filePath?: string }> {
  const extMatch = defaultFileName.match(/\.([a-z0-9]+)$/i);
  const inferredExt = extMatch ? extMatch[1].toLowerCase() : 'sgd';
  const extensions = options?.extensions || [inferredExt];
  const filterName =
    options?.filterName ||
    (inferredExt === 'sgd'
      ? 'Studio Grid Director Archive (.sgd)'
      : inferredExt === 'png'
      ? 'PNG Calibration Image (.png)'
      : 'Studio File');

  if (isTauriRuntime()) {
    try {
      let targetPath: string | null = null;
      let dialogSucceeded = false;

      if (window.__TAURI__?.dialog?.save) {
        targetPath = await window.__TAURI__.dialog.save({
          defaultPath: defaultFileName,
          filters: [{ name: filterName, extensions }],
        });
        dialogSucceeded = true;
      } else if (window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke) {
        targetPath = await tauriInvokeStrict<string | null>('plugin:dialog|save', {
          options: {
            defaultPath: defaultFileName,
            filters: [{ name: filterName, extensions }],
          },
        });
        dialogSucceeded = true;
      }

      // Only treat null as explicit user cancellation if the native dialog actually ran
      if (targetPath === null && dialogSucceeded) {
        return { saved: false };
      }

      if (targetPath && typeof targetPath === 'string') {
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        if (window.__TAURI__?.fs?.writeFile) {
          await window.__TAURI__.fs.writeFile(targetPath, bytes);
          return { saved: true, filePath: targetPath };
        }

        // Fallback to raw Tauri v2 fs plugin invoke
        await tauriInvokeStrict('plugin:fs|write_file', {
          path: targetPath,
          data: Array.from(bytes),
        });
        return { saved: true, filePath: targetPath };
      }
    } catch {
      // Fall through to standard browser download if dialog/fs plugin is not yet installed
    }
  }

  // Browser / WebView fallback download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { saved: true, filePath: defaultFileName };
}

/**
 * Open a `.sgd` or `.json` project file using Tauri's Native OS Open Dialog when running in Tauri.
 * Returns `null` if not in Tauri (or if plugin is unavailable) so the caller can fall back to `<input type="file">`.
 * Returns `'cancelled'` if the user opened the native dialog and clicked Cancel.
 */
export async function openStudioNativeProjectFile(): Promise<
  File | 'cancelled' | null
> {
  if (!isTauriRuntime()) return null;

  try {
    let selected: string | string[] | null = null;
    const filters = [
      {
        name: 'Studio Grid & Resolume Arena (.sgd, .json, .xml)',
        extensions: ['sgd', 'json', 'xml'],
      },
    ];

    if (window.__TAURI__?.dialog?.open) {
      selected = await window.__TAURI__.dialog.open({
        multiple: false,
        directory: false,
        filters,
      });
    } else {
      selected = await tauriInvoke<string | string[] | null>(
        'plugin:dialog|open',
        {
          options: {
            multiple: false,
            directory: false,
            filters,
          },
        }
      );
    }

    if (selected === null) {
      return 'cancelled';
    }

    const filePath = Array.isArray(selected) ? selected[0] : selected;
    if (!filePath || typeof filePath !== 'string') {
      return 'cancelled';
    }

    let bytes: Uint8Array | null = null;
    if (window.__TAURI__?.fs?.readFile) {
      bytes = await window.__TAURI__.fs.readFile(filePath);
    } else {
      const raw = await tauriInvoke<number[] | Uint8Array>(
        'plugin:fs|read_file',
        { path: filePath }
      );
      if (raw) {
        bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      }
    }

    if (!bytes) return null;

    const fileName = filePath.split(/[\\/]/).pop() || 'project.sgd';
    const slicedBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([slicedBuffer], {
      type: fileName.toLowerCase().endsWith('.json')
        ? 'application/json'
        : 'application/octet-stream',
    });
    return new File([blob], fileName, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

/**
 * List available physical monitors in Tauri Desktop runtime
 */
export async function getAvailableTauriMonitors(): Promise<TauriMonitor[]> {
  if (!isTauriRuntime()) return [];
  try {
    if (window.__TAURI__?.window?.availableMonitors) {
      return await window.__TAURI__.window.availableMonitors();
    }
    const viaInvoke = await tauriInvoke<TauriMonitor[]>('plugin:window|available_monitors');
    if (Array.isArray(viaInvoke)) {
      return viaInvoke;
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Spawn or focus a native borderless fullscreen Live Output window in Tauri,
 * automatically targeting a secondary physical monitor (e.g., LED Processor HDMI/DP port) when connected.
 * Returns `true` if handled natively by Tauri, or `false` to let the browser `<a>` tag open a tab.
 */
export async function openTauriLiveOutputWindow(
  screen: {
    id: string;
    name: string;
    compWidth: number;
    compHeight: number;
  },
  preferredMonitorIndex?: number
): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  const safeId = screen.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const windowLabel = `live-output-${safeId}`;
  const targetUrl = `${window.location.origin}${window.location.pathname}#live-output?screen=${encodeURIComponent(
    screen.id
  )}`;
  const windowTitle = `${screen.name} (${screen.compWidth}×${screen.compHeight}) — LIVE OUTPUT`;

  try {
    const WebviewWindowCtor = window.__TAURI__?.webviewWindow?.WebviewWindow;
    if (WebviewWindowCtor) {
      if (typeof WebviewWindowCtor.getByLabel === 'function') {
        const existing = await WebviewWindowCtor.getByLabel(windowLabel);
        if (existing) {
          await existing.unminimize?.();
          await existing.show?.();
          await existing.setFocus?.();
          return true;
        }
      }

      const monitors = await getAvailableTauriMonitors();
      // If multiple monitors are connected, default to secondary monitor (index 1, e.g. LED Wall Processor)
      const targetMonitor =
        monitors.length > 0
          ? monitors[
              preferredMonitorIndex !== undefined &&
              preferredMonitorIndex < monitors.length
                ? preferredMonitorIndex
                : monitors.length > 1
                ? 1
                : 0
            ]
          : null;

      const winOptions: Record<string, unknown> = {
        url: targetUrl,
        title: windowTitle,
        width: screen.compWidth,
        height: screen.compHeight,
        decorations: false,
        resizable: true,
        fullscreen: Boolean(targetMonitor && monitors.length > 1),
        focus: true,
      };

      if (targetMonitor) {
        winOptions.x = targetMonitor.position.x;
        winOptions.y = targetMonitor.position.y;
      }

      const webview = new WebviewWindowCtor(windowLabel, winOptions);
      if (targetMonitor && monitors.length > 1) {
        webview.once?.('tauri://created', async () => {
          try {
            await webview.setPosition?.({
              type: 'Physical',
              x: targetMonitor.position.x,
              y: targetMonitor.position.y,
            });
            await webview.setFullscreen?.(true);
          } catch {
            // ignore
          }
        });
      }
      return true;
    }

    // Fallback: direct Tauri v2 core IPC command to create a webview window
    const created = await tauriInvoke('plugin:webview|create_webview_window', {
      options: {
        label: windowLabel,
        url: targetUrl,
        title: windowTitle,
        width: screen.compWidth,
        height: screen.compHeight,
        decorations: false,
        resizable: true,
        focus: true,
      },
    });
    if (created !== null) return true;
  } catch {
    // Fall back to standard browser tab/window
  }

  return false;
}

/**
 * Emit a real-time 60fps synchronization payload across all Tauri windows (Serverless cross-window sync)
 */
export function emitTauriSyncEvent(payload: SyncPayload): void {
  if (!isTauriRuntime()) return;
  try {
    if (window.__TAURI__?.event?.emit) {
      void window.__TAURI__.event.emit(TAURI_SYNC_EVENT_NAME, payload);
      return;
    }
    void tauriInvoke('plugin:event|emit', {
      event: TAURI_SYNC_EVENT_NAME,
      payload,
    });
  } catch {
    // ignore
  }
}

/**
 * Subscribe to real-time Tauri cross-window synchronization events
 */
export function listenTauriSyncEvent(
  handler: (payload: SyncPayload) => void
): () => void {
  if (!isTauriRuntime()) return () => {};

  let unlistenFn: (() => void) | null = null;
  let cancelled = false;

  if (window.__TAURI__?.event?.listen) {
    window.__TAURI__.event
      .listen<SyncPayload>(TAURI_SYNC_EVENT_NAME, (event) => {
        if (!cancelled && event?.payload) {
          handler(event.payload);
        }
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      })
      .catch(() => {
        // ignore
      });
  }

  return () => {
    cancelled = true;
    if (unlistenFn) {
      try {
        unlistenFn();
      } catch {
        // ignore
      }
    }
  };
}

/**
 * Toggle native window fullscreen in Tauri or standard Fullscreen API in browsers
 */
export async function toggleStudioFullscreen(): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      const win = window.__TAURI__?.window?.getCurrentWindow?.();
      if (win && win.isFullscreen && win.setFullscreen) {
        const current = await win.isFullscreen();
        await win.setFullscreen(!current);
        return !current;
      }
    } catch {
      // fall through to standard Fullscreen API
    }
  }

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return true;
    } else {
      await document.exitFullscreen();
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Close current Tauri Live Output window if running as a secondary Tauri window
 */
export async function closeCurrentTauriWindowIfSecondary(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const win = window.__TAURI__?.window?.getCurrentWindow?.();
    if (win && win.label && win.label !== 'main' && win.close) {
      await win.close();
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Copy text to clipboard safely across Tauri, modern browsers, and restricted WebViews
 */
export async function copyTextWithTauriFallback(text: string): Promise<boolean> {
  if (isTauriRuntime() && window.__TAURI__?.clipboardManager?.writeText) {
    try {
      await window.__TAURI__.clipboardManager.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to textarea fallback
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Push a 32-bit RGBA8 video frame from an HTMLCanvasElement to the Tauri Rust NDI Sender (`ndi_send_rgba_frame`).
 * Caps NDI transmission buffer to max 3840x2160 (4K UHD) to protect IPC throughput on 8K/12K walls.
 */
let ndiScratchCanvas: HTMLCanvasElement | null = null;
const ndiInFlightScreens = new Set<string>();

/**
 * Release the offscreen NDI scratch canvas immediately to free GPU/RAM buffers.
 */
export function disposeTauriNdiScratchCanvas(): void {
  if (ndiScratchCanvas) {
    ndiScratchCanvas.width = 0;
    ndiScratchCanvas.height = 0;
    ndiScratchCanvas = null;
  }
}

export async function pushTauriNdiCanvasFrame(
  screenId: string,
  sourceName: string,
  canvas: HTMLCanvasElement,
  frameRate = 30
): Promise<boolean> {
  if (!isTauriRuntime() || !canvas || canvas.width === 0 || canvas.height === 0) {
    return false;
  }

  // Drop overlapping interval ticks while a frame for this screen is already in flight over IPC
  if (ndiInFlightScreens.has(screenId)) {
    return false;
  }
  ndiInFlightScreens.add(screenId);

  try {
    const maxDim = 3840;
    const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    const targetW = Math.max(16, Math.round((canvas.width * scale) / 2) * 2); // Even width for NDI FourCC
    const targetH = Math.max(16, Math.round((canvas.height * scale) / 2) * 2); // Even height for NDI FourCC

    let readCtx: CanvasRenderingContext2D | null = null;
    if (targetW === canvas.width && targetH === canvas.height) {
      readCtx = canvas.getContext('2d', { willReadFrequently: true });
    } else {
      if (!ndiScratchCanvas) {
        ndiScratchCanvas = document.createElement('canvas');
      }
      if (ndiScratchCanvas.width !== targetW) ndiScratchCanvas.width = targetW;
      if (ndiScratchCanvas.height !== targetH) ndiScratchCanvas.height = targetH;
      readCtx = ndiScratchCanvas.getContext('2d', { willReadFrequently: true });
      if (readCtx) {
        readCtx.clearRect(0, 0, targetW, targetH);
        readCtx.drawImage(canvas, 0, 0, targetW, targetH);
      }
    }

    if (!readCtx) return false;
    const imgData = readCtx.getImageData(0, 0, targetW, targetH);
    const rgbaBytes = new Uint8Array(
      imgData.data.buffer,
      imgData.data.byteOffset,
      imgData.data.byteLength
    );

    const res = await tauriInvoke<boolean>('ndi_send_rgba_frame', {
      screenId,
      sourceName: sourceName.trim() || `SGD_${screenId}`,
      width: targetW,
      height: targetH,
      frameRateN: frameRate * 1000,
      frameRateD: 1000,
      rgbaBytes,
    });
    return Boolean(res);
  } catch {
    return false;
  } finally {
    ndiInFlightScreens.delete(screenId);
  }
}

/**
 * Stop an active Tauri NDI Sender stream for a specific screen and dispose scratch canvas memory
 */
export async function stopTauriNdiStream(
  screenId: string,
  sourceName?: string
): Promise<void> {
  ndiInFlightScreens.delete(screenId);
  disposeTauriNdiScratchCanvas();

  if (!isTauriRuntime()) return;
  try {
    await tauriInvoke('ndi_stop_stream', {
      screenId,
      sourceName: sourceName || `SGD_${screenId}`,
    });
  } catch {
    // ignore
  }
}

