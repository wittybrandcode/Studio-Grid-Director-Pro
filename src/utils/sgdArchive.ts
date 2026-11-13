import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { SavedWorkspaceProject, StudioProject } from '../types/studio';
import { saveStudioBinaryFile } from './tauriBridge';

export interface SgdAssetDescriptor {
  id: string;
  path: string;
  mimeType: string;
  byteLength: number;
  fileName?: string;
}

export interface SgdManifest {
  magic: 'SGD_ARCHIVE_CONTAINER';
  formatVersion: '1.0';
  archiveType: 'workspace' | 'single_screen';
  createdAt: string;
  workspaceName: string;
  screenCount: number;
  assetsCount: number;
  assets: SgdAssetDescriptor[];
}

export interface SgdExportStats {
  screensCount: number;
  assetsCount: number;
  rawBytes: number;
  compressedBytes: number;
  compressionRatioPct: number;
}

export type ParsedSgdImportResult =
  | {
      ok: true;
      sourceFormat: 'sgd' | 'json';
      archiveType: 'workspace';
      workspaceName: string;
      activeScreenId: string;
      screens: Partial<StudioProject>[];
      assetsRestored: number;
      previewDataUrl?: string;
      fileName?: string;
      fileSizeKb?: number;
    }
  | {
      ok: true;
      sourceFormat: 'sgd' | 'json';
      archiveType: 'single_screen';
      screen: Partial<StudioProject>;
      assetsRestored: number;
      previewDataUrl?: string;
      fileName?: string;
      fileSizeKb?: number;
    }
  | {
      ok: false;
      error: string;
    };

const SGD_ASSET_PREFIX = 'sgd-asset://';

/**
 * Fast FNV-1a 32-bit hash for deduplicating binary image assets across screens
 */
function hashStringFNV1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Convert a Data URL (data:image/png;base64,...) into binary Uint8Array + mimeType + extension
 */
function dataUrlToBinary(dataUrl: string): {
  bytes: Uint8Array;
  mimeType: string;
  ext: string;
} | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;

  const header = dataUrl.slice(5, commaIdx);
  const base64Part = dataUrl.slice(commaIdx + 1);
  const isBase64 = header.includes(';base64');
  const mimeType = header.split(';')[0] || 'image/png';

  let ext = 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
  else if (mimeType.includes('webp')) ext = 'webp';
  else if (mimeType.includes('svg')) ext = 'svg';
  else if (mimeType.includes('gif')) ext = 'gif';

  try {
    if (isBase64) {
      const binStr = window.atob(base64Part);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      return { bytes, mimeType, ext };
    } else {
      const decoded = decodeURIComponent(base64Part);
      return { bytes: strToU8(decoded), mimeType, ext };
    }
  } catch {
    return null;
  }
}

/**
 * Convert binary Uint8Array + mimeType back into a browser Data URL (data:image/...;base64,...)
 */
function binaryToDataUrl(bytes: Uint8Array, mimeType: string): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  const b64 = window.btoa(chunks.join(''));
  return `data:${mimeType || 'image/png'};base64,${b64}`;
}

/**
 * Generate a lightweight 320x180 PNG thumbnail Uint8Array from an HTMLCanvasElement
 */
function capturePreviewThumbnailBytes(canvas?: HTMLCanvasElement | null): Uint8Array | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  const thumb = document.createElement('canvas');
  try {
    thumb.width = 320;
    thumb.height = 180;
    const tCtx = thumb.getContext('2d');
    if (!tCtx) return null;
    tCtx.fillStyle = '#090D16';
    tCtx.fillRect(0, 0, 320, 180);
    tCtx.drawImage(canvas, 0, 0, 320, 180);
    const dataUrl = thumb.toDataURL('image/png');
    return dataUrlToBinary(dataUrl)?.bytes || null;
  } catch {
    return null;
  } finally {
    thumb.width = 0;
    thumb.height = 0;
  }
}

/**
 * Extract all embedded custom images from a list of screens into binary files (deduplicated by hash)
 */
function extractScreenAssets(screens: StudioProject[]): {
  sanitizedScreens: StudioProject[];
  filesMap: Record<string, Uint8Array>;
  descriptors: SgdAssetDescriptor[];
  totalAssetBytes: number;
} {
  const filesMap: Record<string, Uint8Array> = {};
  const descriptorsByHash = new Map<string, SgdAssetDescriptor>();
  let totalAssetBytes = 0;

  const sanitizedScreens = screens.map((scr) => {
    const dataUrl = scr.colorCalibration?.customImageDataUrl;
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      return { ...scr, focusedNoteId: null };
    }

    const hash = hashStringFNV1a(dataUrl);
    let desc = descriptorsByHash.get(hash);

    if (!desc) {
      const converted = dataUrlToBinary(dataUrl);
      if (!converted) {
        return { ...scr, focusedNoteId: null };
      }
      const assetPath = `assets/img_${hash}.${converted.ext}`;
      filesMap[assetPath] = converted.bytes;
      totalAssetBytes += converted.bytes.byteLength;
      desc = {
        id: hash,
        path: assetPath,
        mimeType: converted.mimeType,
        byteLength: converted.bytes.byteLength,
        fileName: scr.colorCalibration?.customImageName || `image_${hash}.${converted.ext}`,
      };
      descriptorsByHash.set(hash, desc);
    }

    return {
      ...scr,
      focusedNoteId: null,
      colorCalibration: {
        ...scr.colorCalibration!,
        customImageDataUrl: `${SGD_ASSET_PREFIX}${desc.path}`,
      },
    };
  });

  return {
    sanitizedScreens,
    filesMap,
    descriptors: Array.from(descriptorsByHash.values()),
    totalAssetBytes,
  };
}

/**
 * Build and compress a complete Multi-Screen Workspace into a binary .sgd container archive
 */
export function buildWorkspaceSgdArchive(
  workspace: SavedWorkspaceProject,
  previewCanvas?: HTMLCanvasElement | null
): {
  blob: Blob;
  fileName: string;
  stats: SgdExportStats;
} {
  const { sanitizedScreens, filesMap, descriptors, totalAssetBytes } = extractScreenAssets(
    workspace.screens
  );

  const manifest: SgdManifest = {
    magic: 'SGD_ARCHIVE_CONTAINER',
    formatVersion: '1.0',
    archiveType: 'workspace',
    createdAt: new Date().toISOString(),
    workspaceName: workspace.name || 'مشروع_الاستوديو',
    screenCount: sanitizedScreens.length,
    assetsCount: descriptors.length,
    assets: descriptors,
  };

  const workspacePayload = {
    version: 5,
    format: 'sgd',
    type: 'studio_workspace',
    id: workspace.id,
    name: workspace.name,
    updatedAt: workspace.updatedAt || new Date().toISOString(),
    activeScreenId: workspace.activeScreenId,
    screens: sanitizedScreens,
  };

  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  const workspaceBytes = strToU8(JSON.stringify(workspacePayload, null, 2));

  const archiveEntries: Record<string, Uint8Array | [Uint8Array, { level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {
    'manifest.json': [manifestBytes, { level: 9 }],
    'workspace.json': [workspaceBytes, { level: 9 }],
  };

  for (const [assetPath, assetBytes] of Object.entries(filesMap)) {
    archiveEntries[assetPath] = [assetBytes, { level: 6 }];
  }

  const thumbBytes = capturePreviewThumbnailBytes(previewCanvas);
  if (thumbBytes) {
    archiveEntries['preview.png'] = [thumbBytes, { level: 6 }];
  }

  const zipped = zipSync(archiveEntries, { level: 9 });
  const rawBytes =
    manifestBytes.byteLength +
    workspaceBytes.byteLength +
    totalAssetBytes +
    (thumbBytes?.byteLength || 0);
  const compressedBytes = zipped.byteLength;
  const compressionRatioPct =
    rawBytes > 0 ? Math.max(1, Math.round((1 - compressedBytes / rawBytes) * 100)) : 0;

  const safeName = (workspace.name || 'Studio_Project').replace(/[\\/:*?"<>|]/g, '_');
  const fileName = `${safeName}_${sanitizedScreens.length}screens.sgd`;

  const blobBuffer = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength
  ) as ArrayBuffer;

  return {
    blob: new Blob([blobBuffer], { type: 'application/octet-stream' }),
    fileName,
    stats: {
      screensCount: sanitizedScreens.length,
      assetsCount: descriptors.length,
      rawBytes,
      compressedBytes,
      compressionRatioPct,
    },
  };
}

/**
 * Build and compress a Single Screen into a binary .sgd container archive
 */
export function buildSingleScreenSgdArchive(
  screen: StudioProject,
  previewCanvas?: HTMLCanvasElement | null
): {
  blob: Blob;
  fileName: string;
  stats: SgdExportStats;
} {
  const { sanitizedScreens, filesMap, descriptors, totalAssetBytes } = extractScreenAssets([
    screen,
  ]);
  const sanitizedScreen = sanitizedScreens[0];

  const manifest: SgdManifest = {
    magic: 'SGD_ARCHIVE_CONTAINER',
    formatVersion: '1.0',
    archiveType: 'single_screen',
    createdAt: new Date().toISOString(),
    workspaceName: screen.name || 'Screen',
    screenCount: 1,
    assetsCount: descriptors.length,
    assets: descriptors,
  };

  const screenPayload = {
    version: 5,
    format: 'sgd',
    type: 'studio_single_screen',
    ...sanitizedScreen,
  };

  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  const workspaceBytes = strToU8(JSON.stringify(screenPayload, null, 2));

  const archiveEntries: Record<string, Uint8Array | [Uint8Array, { level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {
    'manifest.json': [manifestBytes, { level: 9 }],
    'workspace.json': [workspaceBytes, { level: 9 }],
  };

  for (const [assetPath, assetBytes] of Object.entries(filesMap)) {
    archiveEntries[assetPath] = [assetBytes, { level: 6 }];
  }

  const thumbBytes = capturePreviewThumbnailBytes(previewCanvas);
  if (thumbBytes) {
    archiveEntries['preview.png'] = [thumbBytes, { level: 6 }];
  }

  const zipped = zipSync(archiveEntries, { level: 9 });
  const rawBytes =
    manifestBytes.byteLength +
    workspaceBytes.byteLength +
    totalAssetBytes +
    (thumbBytes?.byteLength || 0);
  const compressedBytes = zipped.byteLength;
  const compressionRatioPct =
    rawBytes > 0 ? Math.max(1, Math.round((1 - compressedBytes / rawBytes) * 100)) : 0;

  const safeName = (screen.name || 'Studio_Screen').replace(/[\\/:*?"<>|]/g, '_');
  const fileName = `${safeName}_${screen.compWidth}x${screen.compHeight}.sgd`;

  const blobBuffer = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength
  ) as ArrayBuffer;

  return {
    blob: new Blob([blobBuffer], { type: 'application/octet-stream' }),
    fileName,
    stats: {
      screensCount: 1,
      assetsCount: descriptors.length,
      rawBytes,
      compressedBytes,
      compressionRatioPct,
    },
  };
}

/**
 * Trigger native Tauri Save Dialog or browser download for a generated .sgd or .json Blob
 */
export function triggerSgdDownload(blob: Blob, fileName: string): void {
  void saveStudioBinaryFile(blob, fileName, {
    filterName: 'Studio Grid Director Archive (.sgd)',
    extensions: ['sgd', 'json'],
  });
}

/**
 * Restore binary assets referenced via `sgd-asset://assets/...` inside screen objects
 */
function rehydrateScreensAssets(
  rawScreens: Partial<StudioProject>[],
  unzippedFiles: Record<string, Uint8Array>,
  manifest?: SgdManifest | null
): { screens: Partial<StudioProject>[]; assetsRestored: number } {
  let assetsRestored = 0;
  const mimeLookup = new Map<string, string>();
  if (manifest?.assets) {
    for (const a of manifest.assets) {
      mimeLookup.set(a.path, a.mimeType);
    }
  }

  const rehydrated = rawScreens.map((scr) => {
    const refUrl = scr.colorCalibration?.customImageDataUrl;
    if (!refUrl || !refUrl.startsWith(SGD_ASSET_PREFIX)) {
      return scr;
    }

    const assetPath = refUrl.slice(SGD_ASSET_PREFIX.length);
    const assetBytes = unzippedFiles[assetPath];
    if (!assetBytes) {
      return scr;
    }

    let mimeType = mimeLookup.get(assetPath) || 'image/png';
    if (!mimeLookup.has(assetPath)) {
      if (assetPath.endsWith('.jpg') || assetPath.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (assetPath.endsWith('.webp')) mimeType = 'image/webp';
      else if (assetPath.endsWith('.svg')) mimeType = 'image/svg+xml';
      else if (assetPath.endsWith('.gif')) mimeType = 'image/gif';
    }

    const restoredDataUrl = binaryToDataUrl(assetBytes, mimeType);
    assetsRestored++;

    return {
      ...scr,
      colorCalibration: {
        ...scr.colorCalibration!,
        customImageDataUrl: restoredDataUrl,
      },
    };
  });

  return { screens: rehydrated, assetsRestored };
}

/**
 * Parse a raw JSON string into a ParsedSgdImportResult
 */
export function parseRawJsonString(rawText: string): ParsedSgdImportResult {
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && Array.isArray(parsed.screens) && parsed.screens.length > 0) {
      return {
        ok: true,
        sourceFormat: 'json',
        archiveType: 'workspace',
        workspaceName:
          typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name.trim()
            : 'مشروع مستورد',
        activeScreenId:
          typeof parsed.activeScreenId === 'string'
            ? parsed.activeScreenId
            : parsed.screens[0]?.id || 'screen-1',
        screens: parsed.screens,
        assetsRestored: 0,
      };
    }

    if (parsed && typeof parsed.compWidth === 'number') {
      return {
        ok: true,
        sourceFormat: 'json',
        archiveType: 'single_screen',
        screen: parsed,
        assetsRestored: 0,
      };
    }

    return { ok: false, error: 'Unrecognized project structure' };
  } catch {
    return { ok: false, error: 'Invalid JSON syntax' };
  }
}

/**
 * Universal reader for both compressed `.sgd` archives (ZIP binary container) and legacy `.json` files
 */
export async function readSgdOrJsonFile(file: File): Promise<ParsedSgdImportResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Check ZIP magic header PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    const isZipContainer =
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04;

    if (isZipContainer) {
      const unzipped = unzipSync(bytes);
      const workspaceFile = unzipped['workspace.json'] || unzipped['project.json'];
      if (!workspaceFile) {
        return { ok: false, error: 'Missing workspace.json inside .sgd archive' };
      }

      let manifest: SgdManifest | null = null;
      if (unzipped['manifest.json']) {
        try {
          manifest = JSON.parse(strFromU8(unzipped['manifest.json'])) as SgdManifest;
        } catch {
          manifest = null;
        }
      }

      let previewDataUrl: string | undefined;
      if (unzipped['preview.png']) {
        try {
          previewDataUrl = binaryToDataUrl(unzipped['preview.png'], 'image/png');
        } catch {
          previewDataUrl = undefined;
        }
      }

      const fileSizeKb = Math.max(1, Math.round(bytes.byteLength / 1024));
      const workspaceJsonStr = strFromU8(workspaceFile);
      const parsed = JSON.parse(workspaceJsonStr);

      if (parsed && Array.isArray(parsed.screens) && parsed.screens.length > 0) {
        const { screens, assetsRestored } = rehydrateScreensAssets(
          parsed.screens,
          unzipped,
          manifest
        );
        return {
          ok: true,
          sourceFormat: 'sgd',
          archiveType: 'workspace',
          workspaceName:
            parsed.name || manifest?.workspaceName || file.name.replace(/\.sgd$/i, ''),
          activeScreenId: parsed.activeScreenId || screens[0]?.id || 'screen-1',
          screens,
          assetsRestored,
          previewDataUrl,
          fileName: file.name,
          fileSizeKb,
        };
      }

      if (parsed && typeof parsed.compWidth === 'number') {
        const { screens, assetsRestored } = rehydrateScreensAssets(
          [parsed],
          unzipped,
          manifest
        );
        return {
          ok: true,
          sourceFormat: 'sgd',
          archiveType: 'single_screen',
          screen: screens[0],
          assetsRestored,
          previewDataUrl,
          fileName: file.name,
          fileSizeKb,
        };
      }

      return { ok: false, error: 'Invalid workspace data inside .sgd container' };
    }

    // Fallback: Plain text JSON (either .json or uncompressed text .sgd)
    const textContent = strFromU8(bytes);
    const parsedJson = parseRawJsonString(textContent);
    if (parsedJson.ok) {
      return {
        ...parsedJson,
        fileName: file.name,
        fileSizeKb: Math.max(1, Math.round(bytes.byteLength / 1024)),
      };
    }
    return parsedJson;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to read project file',
    };
  }
}
