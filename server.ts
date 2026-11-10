import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  PRESET_PROJECT_TEMPLATES,
  StudioProject,
  SavedWorkspaceProject,
  LaserPointerState,
} from './src/types/studio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const STATE_FILE_PATH = path.resolve(__dirname, '.studio-screens-state.json');
const PROJECTS_FILE_PATH = path.resolve(__dirname, '.studio-saved-projects.json');

interface ServerScreenState {
  screens: StudioProject[];
  activeScreenId: string;
}

function loadInitialState(): ServerScreenState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as ServerScreenState;
      if (parsed && Array.isArray(parsed.screens) && parsed.screens.length > 0) {
        return {
          screens: parsed.screens,
          activeScreenId: parsed.activeScreenId || parsed.screens[0].id,
        };
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
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

let state: ServerScreenState = loadInitialState();
let savedWorkspaces: SavedWorkspaceProject[] = loadSavedProjectsFromDisk();

let saveTimeout: NodeJS.Timeout | null = null;
function scheduleSaveToDisk() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // ignore disk write errors
    }
  }, 300);
}

function saveWorkspacesToDisk() {
  try {
    fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(savedWorkspaces, null, 2), 'utf8');
  } catch {
    // ignore
  }
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
    const targetId = req.params.screenId;
    const found =
      state.screens.find((s) => s.id === targetId) || state.screens[0] || null;
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
    const body = req.body || {};
    if (Array.isArray(body.projects)) {
      savedWorkspaces = body.projects;
      saveWorkspacesToDisk();
    }
    res.json({ ok: true, projects: savedWorkspaces });
  });

  // 4. Real-time SSE stream for Live Output Windows & Director Console
  app.get('/api/screens-stream', (req: Request, res: Response) => {
    const role = String(req.query.role || 'output');
    const screenId = String(req.query.screenId || '*');

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
        state.screens.find((s) => s.id === screenId) || state.screens[0];
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
    const body = req.body || {};

    if (body.type === 'LASER_MOVE' && body.screenId && body.laser) {
      broadcastLaserToScreen(String(body.screenId), body.laser as LaserPointerState);
      res.json({ ok: true });
      return;
    }

    if (
      (body.type === 'IDENTIFY_SCREEN' || body.type === 'BLINK_CELLS') &&
      body.screenId
    ) {
      broadcastCustomPayloadToScreen(String(body.screenId), body);
      res.json({ ok: true });
      return;
    }

    if (Array.isArray(body.screens) && body.screens.length > 0) {
      state.screens = body.screens;
    }

    if (typeof body.activeScreenId === 'string' && body.activeScreenId) {
      state.activeScreenId = body.activeScreenId;
    }

    if (body.screen && typeof body.screen.id === 'string') {
      const updatedScreen = body.screen as StudioProject;
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
