import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { PRESET_PROJECT_TEMPLATES } from './src/types/studio.ts';
import type {
  StudioProject,
  SavedWorkspaceProject,
  LaserPointerState,
} from './src/types/studio.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const STATE_FILE_PATH = path.resolve(__dirname, '.studio-screens-state.json');
const PROJECTS_FILE_PATH = path.resolve(__dirname, '.studio-saved-projects.json');

interface ServerScreenState {
  screens: StudioProject[];
  activeScreenId: string;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizePlainValue<T>(value: T, depth = 0): T {
  if (depth > 16 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePlainValue(item, depth + 1)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    clean[k] = sanitizePlainValue(v, depth + 1);
  }
  return clean as T;
}

function isValidScreen(obj: unknown): obj is StudioProject {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const candidate = obj as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim() || candidate.id.length > 128) {
    return false;
  }
  if (typeof candidate.name !== 'string' || candidate.name.length > 256) {
    return false;
  }
  if (
    typeof candidate.compWidth !== 'number' ||
    !Number.isFinite(candidate.compWidth) ||
    candidate.compWidth < 16 ||
    candidate.compWidth > 16384
  ) {
    return false;
  }
  if (
    typeof candidate.compHeight !== 'number' ||
    !Number.isFinite(candidate.compHeight) ||
    candidate.compHeight < 16 ||
    candidate.compHeight > 16384
  ) {
    return false;
  }
  return true;
}

function isValidSavedWorkspace(obj: unknown): obj is SavedWorkspaceProject {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const candidate = obj as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return false;
  if (typeof candidate.name !== 'string') return false;
  if (!Array.isArray(candidate.screens) || candidate.screens.length === 0 || candidate.screens.length > 100) {
    return false;
  }
  return candidate.screens.every((scr) => isValidScreen(scr));
}

function isValidLaserState(obj: unknown): obj is LaserPointerState {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.active === 'boolean' &&
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  );
}

function loadInitialState(): ServerScreenState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as ServerScreenState;
      if (parsed && Array.isArray(parsed.screens) && parsed.screens.length > 0) {
        const validScreens = parsed.screens.filter(isValidScreen);
        if (validScreens.length > 0) {
          return {
            screens: validScreens,
            activeScreenId: parsed.activeScreenId || validScreens[0].id,
          };
        }
      }
    }
  } catch {
    // ignore disk read errors
  }
  return {
    screens: PRESET_PROJECT_TEMPLATES,
    activeScreenId: PRESET_PROJECT_TEMPLATES[0].id,
  };
}

function loadSavedProjectsFromDisk(): SavedWorkspaceProject[] {
  try {
    if (fs.existsSync(PROJECTS_FILE_PATH)) {
      const raw = fs.readFileSync(PROJECTS_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidSavedWorkspace);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

let state: ServerScreenState = loadInitialState();
let savedWorkspaces: SavedWorkspaceProject[] = loadSavedProjectsFromDisk();

const writeQueues = new Map<string, Promise<void>>();

function writeFileAtomicallyQueued(targetPath: string, payload: unknown): Promise<void> {
  const prev = writeQueues.get(targetPath) || Promise.resolve();
  const next = prev
    .catch(() => {
      // keep queue alive after an error
    })
    .then(async () => {
      const tmpPath = `${targetPath}.${process.pid}.tmp`;
      const serialized = JSON.stringify(payload, null, 2);
      await fs.promises.writeFile(tmpPath, serialized, 'utf8');
      await fs.promises.rename(tmpPath, targetPath);
    })
    .catch(() => {
      // ignore disk write errors gracefully
    });
  writeQueues.set(targetPath, next);
  return next;
}

let saveTimeout: NodeJS.Timeout | null = null;
function scheduleSaveToDisk() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    const snapshot: ServerScreenState = {
      screens: state.screens,
      activeScreenId: state.activeScreenId,
    };
    void writeFileAtomicallyQueued(STATE_FILE_PATH, snapshot);
  }, 300);
}

function saveWorkspacesToDisk() {
  const snapshot = [...savedWorkspaces];
  void writeFileAtomicallyQueued(PROJECTS_FILE_PATH, snapshot);
}

// Track active SSE clients
const outputClientsByScreen = new Map<string, Set<Response>>();
const directorClients = new Set<Response>();

function getConnectedCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [scrId, set] of outputClientsByScreen.entries()) {
    if (set.size > 0) {
      counts[scrId] = set.size;
    }
  }
  return counts;
}

function sendSse(res: Response, data: unknown) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // ignore broken pipe
  }
}

function broadcastConnectionCountsToDirectors() {
  const payload = {
    type: 'CONNECTION_COUNTS',
    connectedScreens: getConnectedCounts(),
    timestamp: Date.now(),
  };
  for (const client of directorClients) {
    sendSse(client, payload);
  }
}

function broadcastScreenUpdate(screen: StudioProject) {
  const payload = {
    type: 'PROJECT_UPDATE',
    screenId: screen.id,
    project: screen,
    timestamp: Date.now(),
  };

  const listeners = outputClientsByScreen.get(screen.id);
  if (listeners) {
    for (const client of listeners) {
      sendSse(client, payload);
    }
  }

  const wildcard = outputClientsByScreen.get('*');
  if (wildcard) {
    for (const client of wildcard) {
      sendSse(client, payload);
    }
  }
}

function broadcastLaserToScreen(screenId: string, laser: LaserPointerState) {
  const payload = {
    type: 'LASER_MOVE',
    screenId,
    laser,
    timestamp: Date.now(),
  };
  const listeners = outputClientsByScreen.get(screenId);
  if (listeners) {
    for (const client of listeners) {
      sendSse(client, payload);
    }
  }
  const wildcard = outputClientsByScreen.get('*');
  if (wildcard) {
    for (const client of wildcard) {
      sendSse(client, payload);
    }
  }
}

function broadcastCustomPayloadToScreen(screenId: string, payload: Record<string, unknown>) {
  const msg = {
    ...payload,
    screenId,
    timestamp: Date.now(),
  };
  const listeners = outputClientsByScreen.get(screenId);
  if (listeners) {
    for (const client of listeners) {
      sendSse(client, msg);
    }
  }
  const wildcard = outputClientsByScreen.get('*');
  if (wildcard) {
    for (const client of wildcard) {
      sendSse(client, msg);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // 1. Get all screens & connection counts
  app.get('/api/screens', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      screens: state.screens,
      activeScreenId: state.activeScreenId,
      connectedScreens: getConnectedCounts(),
    });
  });

  // 2. Get a single screen by ID
  app.get('/api/screens/:screenId', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const targetId = String(req.params.screenId || '');
    const found =
      state.screens.find((s) => s.id === targetId) ||
      state.screens.find((s) => s.id === state.activeScreenId) ||
      state.screens[0] ||
      null;
    res.json({
      screen: found,
      connectedCount: outputClientsByScreen.get(targetId)?.size || 0,
    });
  });

  // 3. Saved Workspace Projects API
  app.get('/api/projects', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ projects: savedWorkspaces });
  });

  app.post('/api/projects', (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ ok: false, error: 'Invalid projects payload' });
      return;
    }
    const body = sanitizePlainValue(req.body as Record<string, unknown>);
    if (!Array.isArray(body.projects) || body.projects.length > 200) {
      res.status(400).json({ ok: false, error: 'projects must be an array (max 200)' });
      return;
    }
    if (!body.projects.every((p) => isValidSavedWorkspace(p))) {
      res.status(400).json({ ok: false, error: 'Invalid workspace schema in projects' });
      return;
    }

    savedWorkspaces = body.projects;
    saveWorkspacesToDisk();
    res.json({ ok: true, projects: savedWorkspaces });
  });

  // 4. Real-time SSE stream for Live Output Windows & Director Console
  app.get('/api/screens-stream', (req: Request, res: Response) => {
    const role = String(req.query.role || 'output');
    const screenId = String(req.query.screenId || '*').slice(0, 128);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    if (role === 'director') {
      directorClients.add(res);
      sendSse(res, {
        type: 'INITIAL_STATE',
        screens: state.screens,
        activeScreenId: state.activeScreenId,
        connectedScreens: getConnectedCounts(),
        timestamp: Date.now(),
      });
    } else {
      if (!outputClientsByScreen.has(screenId)) {
        outputClientsByScreen.set(screenId, new Set());
      }
      outputClientsByScreen.get(screenId)!.add(res);

      const targetScreen =
        state.screens.find((s) => s.id === screenId) ||
        state.screens.find((s) => s.id === state.activeScreenId) ||
        state.screens[0];
      if (targetScreen) {
        sendSse(res, {
          type: 'PROJECT_UPDATE',
          screenId: targetScreen.id,
          project: targetScreen,
          timestamp: Date.now(),
        });
      }

      broadcastConnectionCountsToDirectors();
    }

    const keepAlive = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        // ignore
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      if (role === 'director') {
        directorClients.delete(res);
      } else {
        const set = outputClientsByScreen.get(screenId);
        if (set) {
          set.delete(res);
          if (set.size === 0) {
            outputClientsByScreen.delete(screenId);
          }
        }
        broadcastConnectionCountsToDirectors();
      }
    });
  });

  // 5. Instant Sync Endpoint (called whenever a screen is created, selected, or edited)
  app.post('/api/screens/sync', (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ ok: false, error: 'Invalid sync payload' });
      return;
    }

    const body = sanitizePlainValue(req.body as Record<string, unknown>);

    if (body.type === 'LASER_MOVE') {
      if (typeof body.screenId !== 'string' || !body.screenId.trim() || !isValidLaserState(body.laser)) {
        res.status(400).json({ ok: false, error: 'Invalid LASER_MOVE payload' });
        return;
      }
      broadcastLaserToScreen(body.screenId, body.laser);
      res.json({ ok: true });
      return;
    }

    if (body.type === 'IDENTIFY_SCREEN' || body.type === 'BLINK_CELLS') {
      if (typeof body.screenId !== 'string' || !body.screenId.trim()) {
        res.status(400).json({ ok: false, error: 'Invalid screenId for live command' });
        return;
      }
      const sanitizedCmd: Record<string, unknown> = {
        type: body.type,
        screenId: body.screenId,
      };
      if (body.type === 'BLINK_CELLS') {
        sanitizedCmd.blinkActive = Boolean(body.blinkActive);
        sanitizedCmd.blinkingCellKeys = Array.isArray(body.blinkingCellKeys)
          ? body.blinkingCellKeys.filter((k): k is string => typeof k === 'string').slice(0, 5000)
          : [];
      }
      broadcastCustomPayloadToScreen(body.screenId, sanitizedCmd);
      res.json({ ok: true });
      return;
    }

    const hasScreens = 'screens' in body;
    const hasScreen = 'screen' in body && body.screen !== undefined;
    const hasActiveId = 'activeScreenId' in body && body.activeScreenId !== undefined;

    if (!hasScreens && !hasScreen && !hasActiveId) {
      res.status(400).json({ ok: false, error: 'Empty or unrecognized sync payload' });
      return;
    }

    if (hasScreens) {
      if (
        !Array.isArray(body.screens) ||
        body.screens.length === 0 ||
        body.screens.length > 100 ||
        !body.screens.every((scr) => isValidScreen(scr))
      ) {
        res.status(400).json({ ok: false, error: 'Invalid screens array' });
        return;
      }
      state.screens = body.screens;
    }

    if (hasActiveId) {
      if (typeof body.activeScreenId !== 'string' || !body.activeScreenId.trim()) {
        res.status(400).json({ ok: false, error: 'Invalid activeScreenId' });
        return;
      }
      state.activeScreenId = body.activeScreenId;
    }

    if (hasScreen) {
      if (!isValidScreen(body.screen)) {
        res.status(400).json({ ok: false, error: 'Invalid screen object' });
        return;
      }
      const updatedScreen = body.screen;
      const exists = state.screens.some((s) => s.id === updatedScreen.id);
      if (exists) {
        state.screens = state.screens.map((s) =>
          s.id === updatedScreen.id ? updatedScreen : s
        );
      } else {
        state.screens.push(updatedScreen);
      }
      if (Array.isArray(body.screens) && body.screens.length > 1) {
        for (const scr of state.screens) {
          broadcastScreenUpdate(scr);
        }
      } else {
        broadcastScreenUpdate(updatedScreen);
      }
    } else if (Array.isArray(body.screens)) {
      for (const scr of state.screens) {
        broadcastScreenUpdate(scr);
      }
    }

    scheduleSaveToDisk();

    res.json({
      ok: true,
      connectedScreens: getConnectedCounts(),
    });
  });

  // 6. SSRF-safe Local / Private LAN Resolume Arena 7 REST API Proxy (avoids browser CORS blocks)
  const isAllowedLocalResolumeHost = (hostname: string): boolean => {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    // Block cloud/link-local metadata (169.254.0.0/16) and public routable IPs/domains
    if (host.startsWith('169.254.') || host === '0.0.0.0') return false;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) return false;
    const octets = ipv4.slice(1).map((n) => Number(n));
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
    const [a, b] = octets;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 127) return true; // 127.0.0.0/8
    return false;
  };

  app.post('/api/resolume/proxy', async (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ ok: false, error: 'Invalid Resolume proxy payload' });
      return;
    }

    const body = sanitizePlainValue(req.body as Record<string, unknown>);
    const targetBaseUrl = typeof body.targetBaseUrl === 'string' ? body.targetBaseUrl.trim() : '';
    const apiPath = typeof body.apiPath === 'string' ? body.apiPath.trim() : '';
    const method = typeof body.method === 'string' ? body.method.toUpperCase() : 'GET';

    if (method !== 'GET' && method !== 'POST' && method !== 'PUT') {
      res.status(400).json({ ok: false, error: 'Unsupported HTTP method for Arena API' });
      return;
    }

    if (!apiPath.startsWith('/api/v1/') || apiPath.includes('..') || apiPath.includes('@') || apiPath.includes('//')) {
      res.status(400).json({ ok: false, error: 'Invalid Arena API path' });
      return;
    }

    let parsedBase: URL;
    try {
      parsedBase = new URL(targetBaseUrl);
    } catch {
      res.status(400).json({ ok: false, error: 'Invalid Resolume target URL' });
      return;
    }

    if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
      res.status(400).json({ ok: false, error: 'Unsupported protocol for Arena Webserver' });
      return;
    }

    if (!isAllowedLocalResolumeHost(parsedBase.hostname)) {
      res.status(403).json({
        ok: false,
        error: 'Resolume Webserver host must be loopback (127.0.0.1/localhost) or private LAN IP',
      });
      return;
    }

    const upstreamUrl = `${parsedBase.origin}${apiPath}`;
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        method,
        headers:
          body.payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body.payload !== undefined ? JSON.stringify(body.payload) : undefined,
        signal: AbortSignal.timeout(2500),
      });

      const contentType = upstreamRes.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await upstreamRes.json().catch(() => null)
        : await upstreamRes.text().catch(() => null);

      res.status(upstreamRes.status).json({
        ok: upstreamRes.ok,
        status: upstreamRes.status,
        data,
      });
    } catch {
      res.status(502).json({
        ok: false,
        status: 502,
        error: 'Unable to reach Resolume Arena Webserver',
      });
    }
  });

  // Start listening on PORT immediately so startup health checks succeed without waiting for Vite cold boot
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Studio Multi-Screen Server running on http://0.0.0.0:${PORT}`);
  });

  // Mount Vite in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer();
