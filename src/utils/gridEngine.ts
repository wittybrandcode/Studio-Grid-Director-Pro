/**
 * Barrel facade re-exporting Studio Grid Engine submodules:
 * - gridMath.ts (physical LED metrics, coordinate lookup, grid computation)
 * - colorCalibration.ts (WebGL + 2D LUT grading, telemetry & fast pixel sampler)
 * - canvasRenderer.ts (multi-layer Canvas 2D renderer & offscreen layer caches)
 * - exporters.ts (After Effects ExtendScript JSX & 1:1 / composite PNG exporters)
 */
export * from './gridMath';
export * from './colorCalibration';
export * from './canvasRenderer';
export * from './exporters';
