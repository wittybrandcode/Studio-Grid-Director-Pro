import { StudioProject } from '../types/studio';
import { renderStudioCanvas } from './canvasRenderer';
import { ComputedGridResult, computeGrid, hexToRgb } from './gridMath';
import { saveStudioBinaryFile } from './tauriBridge';

/**
 * Generate an Adobe After Effects ExtendScript (.jsx) file
 */
export function generateAfterEffectsJSX(
  project: StudioProject,
  computed: ComputedGridResult
): string {
  const commentSafeName = String(project.name || 'Studio Grid')
    .replace(/\*\//g, '* /')
    .replace(/[\r\n]+/g, ' ');
  const compNameJson = JSON.stringify(String(project.name || 'Studio Grid'));
  const undoNameJson = JSON.stringify(`Studio Grid - ${project.name || 'Untitled'}`);
  const cellDataJson = JSON.stringify(
    computed.cells.map((c) => ({
      id: c.displayId,
      coord: c.coordId,
      x: c.x,
      y: c.y,
      w: c.width,
      h: c.height,
      rgb: hexToRgb(c.effectiveColor).map((v) => Number((v / 255).toFixed(4))),
      label: c.resolvedNoteText || '',
      marked: Boolean(c.hasCustomColor || c.resolvedNoteText),
    })),
    null,
    2
  );

  const safeGridLineWidth = Math.max(0, Number(project.gridLineWidth) || 0);

  return `/**
 * Adobe After Effects Calibration & Camera Blocking Grid Script (.jsx)
 * Project: ${commentSafeName} (${project.compWidth}x${project.compHeight} px, ${computed.cells.length} cells)
 */

(function createStudioCalibrationGrid() {
  var compW = ${project.compWidth};
  var compH = ${project.compHeight};
  var compName = ${compNameJson};
  var undoLabel = ${undoNameJson};
  var gridGap = ${safeGridLineWidth};
  var cells = ${cellDataJson};

  var isDenseGrid = cells.length > 250;
  var compactMode = false;
  if (isDenseGrid) {
    compactMode = confirm(
      "This grid has " + cells.length + " cells (" + (cells.length * 2) + " individual layers).\\n" +
      "Creating hundreds of Solid & Text layers can freeze After Effects.\\n\\n" +
      "Click OK / Yes for Fast Compact Mode (Slate Backdrop + Marked/Colored Cells only).\\n" +
      "Click Cancel / No to generate every cell layer."
    );
  }

  app.beginUndoGroup(undoLabel);
  try {
    var comp = app.project.items.addComp(compName, compW, compH, 1.0, 10.0, 25);
    comp.bgColor = [0.035, 0.051, 0.086];

    var targetCells = [];
    for (var idx = 0; idx < cells.length; idx++) {
      if (!compactMode || cells[idx].marked) {
        targetCells.push(cells[idx]);
      }
    }

    if (compactMode) {
      var bgLayer = comp.layers.addSolid([0.05, 0.07, 0.11], "SGD_Grid_Backdrop", compW, compH, 1.0);
      bgLayer.locked = true;
    }

    for (var i = targetCells.length - 1; i >= 0; i--) {
      var cell = targetCells[i];
      var safeLabel = String(cell.label || "").replace(/[\\r\\n]+/g, " ");
      var solidName = "Cell_" + cell.coord + (safeLabel ? "_" + safeLabel : "");
      var solidLayer = comp.layers.addSolid(
        cell.rgb,
        solidName,
        Math.max(4, cell.w - gridGap),
        Math.max(4, cell.h - gridGap),
        1.0
      );
      solidLayer.property("Position").setValue([cell.x + cell.w / 2, cell.y + cell.h / 2]);
      if (safeLabel) {
        solidLayer.comment = safeLabel;
      }

      var numTextLayer = comp.layers.addText(String(cell.id));
      numTextLayer.name = "ID_" + cell.coord;
      var textProp = numTextLayer.property("Source Text");
      var textDoc = textProp.value;
      textDoc.fontSize = Math.max(14, Math.min(cell.w, cell.h) * 0.28);
      textDoc.fillColor = [1, 1, 1];
      textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
      textProp.setValue(textDoc);
      numTextLayer.property("Position").setValue([
        cell.x + cell.w / 2,
        cell.y + cell.h * 0.54
      ]);
    }

    comp.openInViewer();
  } finally {
    app.endUndoGroup();
  }
})();
`;
}

/**
 * Render an offscreen 1:1 exact native-resolution PNG of a single screen and trigger download.
 */
export function exportScreenNativePixelMapPng(
  screen: StudioProject,
  screenOrderIndex = 0
): void {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = screen.compWidth;
  offCanvas.height = screen.compHeight;
  const releaseOffCanvas = () => {
    offCanvas.width = 0;
    offCanvas.height = 0;
  };

  try {
    const ctx = offCanvas.getContext('2d');
    if (!ctx) {
      releaseOffCanvas();
      return;
    }

    const computed = computeGrid(screen);
    renderStudioCanvas(ctx, screen, computed, {
      isLiveOutput: false,
      screenOrderIndex,
    });

    const safeName = screen.name.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const fileName = `PixelMap_${String(screenOrderIndex + 1).padStart(2, '0')}_${safeName}_${screen.compWidth}x${screen.compHeight}.png`;
    offCanvas.toBlob((blob) => {
      try {
        if (!blob) return;
        void saveStudioBinaryFile(blob, fileName, {
          filterName: 'PNG Calibration Image (.png)',
          extensions: ['png'],
        });
      } finally {
        releaseOffCanvas();
      }
    }, 'image/png');
  } catch {
    releaseOffCanvas();
  }
}

/**
 * Export all screens as individual 1:1 native PNGs PLUS a composite Multi-Screen Wall Map PNG.
 */
export function exportAllScreensPixelMapPack(
  screens: StudioProject[],
  workspaceName = 'Studio_Wall'
): void {
  if (!screens || screens.length === 0) return;

  screens.forEach((scr, idx) => {
    window.setTimeout(() => {
      exportScreenNativePixelMapPng(scr, idx);
    }, idx * 220);
  });

  if (screens.length > 1) {
    window.setTimeout(() => {
      let runningX = 0;
      const gap = 60;
      const rects = screens.map((scr, idx) => {
        const hasPos =
          typeof scr.wallPosX === 'number' &&
          Number.isFinite(scr.wallPosX) &&
          typeof scr.wallPosY === 'number' &&
          Number.isFinite(scr.wallPosY);
        const x = hasPos ? Math.round(scr.wallPosX!) : runningX;
        const y = hasPos ? Math.round(scr.wallPosY!) : 0;
        runningX = x + scr.compWidth + gap;
        return { scr, idx, x, y, w: scr.compWidth, h: scr.compHeight };
      });

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of rects) {
        if (r.x < minX) minX = r.x;
        if (r.y < minY) minY = r.y;
        if (r.x + r.w > maxX) maxX = r.x + r.w;
        if (r.y + r.h > maxY) maxY = r.y + r.h;
      }

      const rawW = Math.max(1, maxX - minX);
      const rawH = Math.max(1, maxY - minY);
      const scale = Math.min(1, 8192 / Math.max(rawW, rawH));
      const compCanvas = document.createElement('canvas');
      compCanvas.width = Math.max(1, Math.round(rawW * scale));
      compCanvas.height = Math.max(1, Math.round(rawH * scale));
      const releaseCompCanvas = () => {
        compCanvas.width = 0;
        compCanvas.height = 0;
      };

      try {
        const cCtx = compCanvas.getContext('2d');
        if (!cCtx) {
          releaseCompCanvas();
          return;
        }

        cCtx.fillStyle = '#070A10';
        cCtx.fillRect(0, 0, compCanvas.width, compCanvas.height);

        const orderedRects = [...rects].sort(
          (a, b) => (a.scr.wallZIndex ?? a.idx) - (b.scr.wallZIndex ?? b.idx)
        );

        for (const r of orderedRects) {
          const subCanvas = document.createElement('canvas');
          subCanvas.width = r.w;
          subCanvas.height = r.h;
          try {
            const sCtx = subCanvas.getContext('2d');
            if (sCtx) {
              const comp = computeGrid(r.scr);
              renderStudioCanvas(sCtx, r.scr, comp, {
                isLiveOutput: false,
                screenOrderIndex: r.idx,
              });
              cCtx.drawImage(
                subCanvas,
                Math.round((r.x - minX) * scale),
                Math.round((r.y - minY) * scale),
                Math.round(r.w * scale),
                Math.round(r.h * scale)
              );
            }
          } finally {
            subCanvas.width = 0;
            subCanvas.height = 0;
          }
        }

        const safeWs = workspaceName.replace(/[^\w\u0600-\u06FF-]+/g, '_');
        const fileName = `${safeWs}_Composite_Wall_${rawW}x${rawH}.png`;
        compCanvas.toBlob((blob) => {
          try {
            if (!blob) return;
            void saveStudioBinaryFile(blob, fileName, {
              filterName: 'PNG Calibration Image (.png)',
              extensions: ['png'],
            });
          } finally {
            releaseCompCanvas();
          }
        }, 'image/png');
      } catch {
        releaseCompCanvas();
      }
    }, screens.length * 240);
  }
}
