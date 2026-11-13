import { ColorCalibrationConfig, UILanguage } from '../types/studio';

// Tiny Reusable Hardware-Downscaled Sampler Canvases to eliminate 4K/8K GPU-to-CPU getImageData stalls
let telemetrySampleCanvas: HTMLCanvasElement | null = null;
let telemetrySampleCtx: CanvasRenderingContext2D | null = null;
let singlePixelSampleCanvas: HTMLCanvasElement | null = null;
let singlePixelSampleCtx: CanvasRenderingContext2D | null = null;

interface ColorCalibGlProcessor {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  maxTextureSize: number;
  program: WebGLProgram;
  texture: WebGLTexture;
  buffer: WebGLBuffer;
  aPosLoc: number;
  aTexLoc: number;
  uImage: WebGLUniformLocation | null;
  uBrightness: WebGLUniformLocation | null;
  uContrast: WebGLUniformLocation | null;
  uSaturation: WebGLUniformLocation | null;
  uHueSinCos: WebGLUniformLocation | null;
  uTempGains: WebGLUniformLocation | null;
  uInvGamma: WebGLUniformLocation | null;
  uChannelMode: WebGLUniformLocation | null;
}

let cachedColorCalibGl: ColorCalibGlProcessor | null = null;
let colorCalibGlUnavailable = false;

function compileGlShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function getOrCreateColorCalibGlProcessor(): ColorCalibGlProcessor | null {
  if (colorCalibGlUnavailable) return null;
  if (cachedColorCalibGl && !cachedColorCalibGl.gl.isContextLost()) {
    return cachedColorCalibGl;
  }
  cachedColorCalibGl = null;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      colorCalibGlUnavailable = true;
      return null;
    }

    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        cachedColorCalibGl = null;
      },
      false
    );

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif

      uniform sampler2D u_image;
      uniform float u_brightness;
      uniform float u_contrast;
      uniform float u_saturation;
      uniform vec2 u_hueSinCos;
      uniform vec3 u_tempGains;
      uniform float u_invGamma;
      uniform int u_channelMode;

      varying vec2 v_texCoord;

      void main() {
        vec4 texel = texture2D(u_image, v_texCoord);
        float a = texel.a;
        if (a <= 0.0001) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
          return;
        }

        vec3 rgb = texel.rgb;

        // 1. White-Balance Temperature gains (alpha-safe)
        rgb = clamp(rgb * u_tempGains, 0.0, 1.0);

        // 2. Brightness multiplier
        rgb = clamp(rgb * u_brightness, 0.0, 1.0);

        // 3. True Non-Linear Power Gamma curve: pow(v, 1 / gamma)
        if (abs(u_invGamma - 1.0) > 0.001) {
          rgb = pow(max(rgb, vec3(0.0)), vec3(u_invGamma));
        }

        // 4. Contrast around mid-gray 0.5
        if (abs(u_contrast - 1.0) > 0.001) {
          rgb = clamp((rgb - 0.5) * u_contrast + 0.5, 0.0, 1.0);
        }

        // 5. Saturation (Rec.709 luminance weights)
        if (abs(u_saturation - 1.0) > 0.001) {
          float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
          rgb = clamp(mix(vec3(lum), rgb, u_saturation), 0.0, 1.0);
        }

        // 6. Hue Rotation (W3C feColorMatrix standard)
        float s = u_hueSinCos.x;
        float c = u_hueSinCos.y;
        if (abs(s) > 0.0001 || abs(c - 1.0) > 0.0001) {
          vec3 rRow = vec3(
            0.213 + c * 0.787 - s * 0.213,
            0.715 - c * 0.715 - s * 0.715,
            0.072 - c * 0.072 + s * 0.928
          );
          vec3 gRow = vec3(
            0.213 - c * 0.213 + s * 0.143,
            0.715 + c * 0.285 + s * 0.140,
            0.072 - c * 0.072 - s * 0.283
          );
          vec3 bRow = vec3(
            0.213 - c * 0.213 - s * 0.787,
            0.715 - c * 0.715 + s * 0.715,
            0.072 + c * 0.928 + s * 0.072
          );
          rgb = clamp(vec3(dot(rgb, rRow), dot(rgb, gRow), dot(rgb, bRow)), 0.0, 1.0);
        }

        // 7. RGB Channel Isolation / Monochrome Luma (without polluting transparent pixels)
        if (u_channelMode == 1) {
          rgb = vec3(rgb.r, 0.0, 0.0);
        } else if (u_channelMode == 2) {
          rgb = vec3(0.0, rgb.g, 0.0);
        } else if (u_channelMode == 3) {
          rgb = vec3(0.0, 0.0, rgb.b);
        } else if (u_channelMode == 4) {
          float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
          rgb = vec3(lum);
        }

        gl_FragColor = vec4(rgb * a, a);
      }
    `;

    const vs = compileGlShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileGlShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      colorCalibGlUnavailable = true;
      return null;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      colorCalibGlUnavailable = true;
      return null;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      colorCalibGlUnavailable = true;
      return null;
    }

    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) {
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      gl.deleteProgram(program);
      colorCalibGlUnavailable = true;
      return null;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, 1, 0, 0,
        1, 1, 1, 0,
        -1, -1, 0, 1,
        1, -1, 1, 1,
      ]),
      gl.STATIC_DRAW
    );

    const aPosLoc = gl.getAttribLocation(program, 'a_position');
    const aTexLoc = gl.getAttribLocation(program, 'a_texCoord');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;

    cachedColorCalibGl = {
      canvas,
      gl,
      maxTextureSize,
      program,
      texture,
      buffer,
      aPosLoc,
      aTexLoc,
      uImage: gl.getUniformLocation(program, 'u_image'),
      uBrightness: gl.getUniformLocation(program, 'u_brightness'),
      uContrast: gl.getUniformLocation(program, 'u_contrast'),
      uSaturation: gl.getUniformLocation(program, 'u_saturation'),
      uHueSinCos: gl.getUniformLocation(program, 'u_hueSinCos'),
      uTempGains: gl.getUniformLocation(program, 'u_tempGains'),
      uInvGamma: gl.getUniformLocation(program, 'u_invGamma'),
      uChannelMode: gl.getUniformLocation(program, 'u_channelMode'),
    };
    return cachedColorCalibGl;
  } catch {
    colorCalibGlUnavailable = true;
    return null;
  }
}

function applyColorCalibrationWebGL(
  ctx: CanvasRenderingContext2D,
  compWidth: number,
  compHeight: number,
  params: {
    bFactor: number;
    cFactor: number;
    sFactor: number;
    hueRad: number;
    tempGains: [number, number, number];
    invGamma: number;
    channelMode: number;
  }
): boolean {
  const proc = getOrCreateColorCalibGlProcessor();
  if (!proc) return false;
  if (compWidth > proc.maxTextureSize || compHeight > proc.maxTextureSize) {
    return false;
  }

  const { gl, canvas } = proc;
  try {
    if (canvas.width !== compWidth) canvas.width = compWidth;
    if (canvas.height !== compHeight) canvas.height = compHeight;

    gl.viewport(0, 0, compWidth, compHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(proc.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, proc.buffer);
    if (proc.aPosLoc >= 0) {
      gl.enableVertexAttribArray(proc.aPosLoc);
      gl.vertexAttribPointer(proc.aPosLoc, 2, gl.FLOAT, false, 16, 0);
    }
    if (proc.aTexLoc >= 0) {
      gl.enableVertexAttribArray(proc.aTexLoc);
      gl.vertexAttribPointer(proc.aTexLoc, 2, gl.FLOAT, false, 16, 8);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, proc.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);

    gl.uniform1i(proc.uImage, 0);
    gl.uniform1f(proc.uBrightness, params.bFactor);
    gl.uniform1f(proc.uContrast, params.cFactor);
    gl.uniform1f(proc.uSaturation, params.sFactor);
    gl.uniform2f(proc.uHueSinCos, Math.sin(params.hueRad), Math.cos(params.hueRad));
    gl.uniform3f(
      proc.uTempGains,
      params.tempGains[0],
      params.tempGains[1],
      params.tempGains[2]
    );
    gl.uniform1f(proc.uInvGamma, params.invGamma);
    gl.uniform1i(proc.uChannelMode, params.channelMode);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(canvas, 0, 0, compWidth, compHeight);
    ctx.restore();
    return true;
  } catch {
    cachedColorCalibGl = null;
    return false;
  }
}

function applyColorCalibration2DFallback(
  ctx: CanvasRenderingContext2D,
  compWidth: number,
  compHeight: number,
  params: {
    bFactor: number;
    cFactor: number;
    sFactor: number;
    hueRad: number;
    tempGains: [number, number, number];
    invGamma: number;
    channelMode: number;
  }
) {
  const imageData = ctx.getImageData(0, 0, compWidth, compHeight);
  const data = imageData.data;

  const { bFactor, cFactor, sFactor, hueRad, tempGains, invGamma, channelMode } = params;
  const hasContrast = Math.abs(cFactor - 1.0) > 0.001;
  const hasSaturation = Math.abs(sFactor - 1.0) > 0.001;
  const sinA = Math.sin(hueRad);
  const cosA = Math.cos(hueRad);
  const hasHue = Math.abs(sinA) > 0.0001 || Math.abs(cosA - 1.0) > 0.0001;
  const hasGamma = Math.abs(invGamma - 1.0) > 0.001;

  // Precompute 256-entry per-channel LUT combining Temperature * Brightness + non-linear Gamma
  const lutR = new Float32Array(256);
  const lutG = new Float32Array(256);
  const lutB = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const base = i / 255;
    let r = Math.min(1, Math.max(0, base * tempGains[0] * bFactor));
    let g = Math.min(1, Math.max(0, base * tempGains[1] * bFactor));
    let b = Math.min(1, Math.max(0, base * tempGains[2] * bFactor));
    if (hasGamma) {
      r = Math.pow(r, invGamma);
      g = Math.pow(g, invGamma);
      b = Math.pow(b, invGamma);
    }
    lutR[i] = r;
    lutG[i] = g;
    lutB[i] = b;
  }

  const m00 = 0.213 + cosA * 0.787 - sinA * 0.213;
  const m01 = 0.715 - cosA * 0.715 - sinA * 0.715;
  const m02 = 0.072 - cosA * 0.072 + sinA * 0.928;
  const m10 = 0.213 - cosA * 0.213 + sinA * 0.143;
  const m11 = 0.715 + cosA * 0.285 + sinA * 0.140;
  const m12 = 0.072 - cosA * 0.072 - sinA * 0.283;
  const m20 = 0.213 - cosA * 0.213 - sinA * 0.787;
  const m21 = 0.715 - cosA * 0.715 + sinA * 0.715;
  const m22 = 0.072 + cosA * 0.928 + sinA * 0.072;

  for (let i = 0; i < data.length; i += 4) {
    // Preserve 100% transparency on alpha-key pixels (bgKeyMode === 'alpha')
    if (data[i + 3] === 0) continue;

    let r = lutR[data[i]];
    let g = lutG[data[i + 1]];
    let b = lutB[data[i + 2]];

    if (hasContrast) {
      r = Math.min(1, Math.max(0, (r - 0.5) * cFactor + 0.5));
      g = Math.min(1, Math.max(0, (g - 0.5) * cFactor + 0.5));
      b = Math.min(1, Math.max(0, (b - 0.5) * cFactor + 0.5));
    }

    if (hasSaturation) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = Math.min(1, Math.max(0, lum + (r - lum) * sFactor));
      g = Math.min(1, Math.max(0, lum + (g - lum) * sFactor));
      b = Math.min(1, Math.max(0, lum + (b - lum) * sFactor));
    }

    if (hasHue) {
      const nr = m00 * r + m01 * g + m02 * b;
      const ng = m10 * r + m11 * g + m12 * b;
      const nb = m20 * r + m21 * g + m22 * b;
      r = Math.min(1, Math.max(0, nr));
      g = Math.min(1, Math.max(0, ng));
      b = Math.min(1, Math.max(0, nb));
    }

    if (channelMode === 1) {
      g = 0;
      b = 0;
    } else if (channelMode === 2) {
      r = 0;
      b = 0;
    } else if (channelMode === 3) {
      r = 0;
      g = 0;
    } else if (channelMode === 4) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum;
      g = lum;
      b = lum;
    }

    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply Color Grading (Brightness, Contrast, Saturation, Hue, Temperature, Gamma, RGB Channel Isolation)
 * using a WebKit/Tauri-safe WebGL shader pipeline with a 2D LUT ImageData fallback that preserves
 * alpha transparency cleanly and never relies on fragile ctx.filter / self-drawImage calls.
 */
export function applyCanvasColorCalibration(
  ctx: CanvasRenderingContext2D,
  compWidth: number,
  compHeight: number,
  colorCfg?: ColorCalibrationConfig,
  lang?: UILanguage
) {
  if (!colorCfg || !colorCfg.enabled) return;

  const brightness = colorCfg.brightness ?? 100;
  const contrast = colorCfg.contrast ?? 100;
  const saturation = colorCfg.saturation ?? 100;
  const hueRotate = colorCfg.hueRotate ?? 0;
  const temperature = colorCfg.temperature ?? 0;
  const gamma = colorCfg.gamma ?? 1.0;
  const rgbChannel = colorCfg.rgbChannel || 'all';

  const hasFilter =
    brightness !== 100 ||
    contrast !== 100 ||
    saturation !== 100 ||
    hueRotate !== 0 ||
    temperature !== 0 ||
    Math.abs(gamma - 1.0) > 0.001 ||
    rgbChannel !== 'all';

  if (!hasFilter) return;

  // If Split-Screen A/B Compare is active, snapshot the uncalibrated left portion first
  const splitCompare = Boolean(colorCfg.splitCompareEnabled);
  const splitPct = Math.max(10, Math.min(90, colorCfg.splitComparePositionPct ?? 50));
  const splitX = Math.round((splitPct / 100) * compWidth);
  let uncalibratedSnapshot: HTMLCanvasElement | null = null;

  try {
    if (splitCompare && splitX > 0) {
      uncalibratedSnapshot = document.createElement('canvas');
      uncalibratedSnapshot.width = splitX;
      uncalibratedSnapshot.height = compHeight;
      const uctx = uncalibratedSnapshot.getContext('2d');
      if (uctx) {
        uctx.globalCompositeOperation = 'copy';
        uctx.drawImage(ctx.canvas, 0, 0, splitX, compHeight, 0, 0, splitX, compHeight);
      }
    }

    const tNorm = Math.max(-1, Math.min(1, temperature / 100));
    const tempGains: [number, number, number] = [
      Math.max(0.1, 1 + 0.24 * tNorm),
      Math.max(0.1, 1 + 0.02 * tNorm),
      Math.max(0.1, 1 - 0.26 * tNorm),
    ];
    const clampedGamma = Math.max(0.2, Math.min(3.5, gamma));
    const channelMode =
      rgbChannel === 'r'
        ? 1
        : rgbChannel === 'g'
        ? 2
        : rgbChannel === 'b'
        ? 3
        : rgbChannel === 'luma'
        ? 4
        : 0;

    const params = {
      bFactor: Math.max(0, brightness / 100),
      cFactor: Math.max(0, contrast / 100),
      sFactor: Math.max(0, saturation / 100),
      hueRad: (hueRotate * Math.PI) / 180,
      tempGains,
      invGamma: 1 / clampedGamma,
      channelMode,
    };

    const appliedOnGpu = applyColorCalibrationWebGL(ctx, compWidth, compHeight, params);
    if (!appliedOnGpu) {
      applyColorCalibration2DFallback(ctx, compWidth, compHeight, params);
    }

    // If Split-Screen A/B Compare is active, restore the uncalibrated left half and draw A/B divider
    if (splitCompare && uncalibratedSnapshot && splitX > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, splitX, compHeight);
      ctx.clip();
      ctx.clearRect(0, 0, splitX, compHeight);
      ctx.drawImage(uncalibratedSnapshot, 0, 0);
      ctx.restore();

      ctx.save();
      const minSide = Math.min(compWidth, compHeight);
      const lineW = Math.max(3, Math.round(minSide * 0.0035));
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, compHeight);
      ctx.stroke();

      const tagFont = Math.max(12, Math.round(minSide * 0.016));
      ctx.font = `700 ${tagFont}px "Cairo", "JetBrains Mono", sans-serif`;
      const isEn = lang === 'en';
      const leftLabel = isEn ? 'ORIGINAL (BEFORE)' : 'الأصل (BEFORE)';
      const rightLabel = isEn ? 'CALIBRATED (AFTER)' : 'بعد المعايرة (AFTER)';
      const padX = 12;
      const tagH = tagFont + 12;
      const tagY = Math.max(18, Math.round(compHeight * 0.91));

      const lw = ctx.measureText(leftLabel).width + padX * 2;
      const rw = ctx.measureText(rightLabel).width + padX * 2;

      if (splitX > lw + 16) {
        ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
        ctx.fillRect(splitX - lw - 10, tagY, lw, tagH);
        ctx.strokeStyle = '#9FA6B3';
        ctx.lineWidth = 2;
        ctx.strokeRect(splitX - lw - 10, tagY, lw, tagH);
        ctx.fillStyle = '#DCE0E8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(leftLabel, splitX - 10 - lw / 2, tagY + tagH / 2 + 1);
      }

      if (compWidth - splitX > rw + 16) {
        ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
        ctx.fillRect(splitX + 10, tagY, rw, tagH);
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 2;
        ctx.strokeRect(splitX + 10, tagY, rw, tagH);
        ctx.fillStyle = '#FEF08A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rightLabel, splitX + 10 + rw / 2, tagY + tagH / 2 + 1);
      }

      ctx.restore();
    }
  } finally {
    if (uncalibratedSnapshot) {
      uncalibratedSnapshot.width = 0;
      uncalibratedSnapshot.height = 0;
    }
  }
}

export interface CanvasColorAnalysisResult {
  avgR: number;
  avgG: number;
  avgB: number;
  avgHex: string;
  avgLuminanceIRE: number;
  minLuminanceIRE: number;
  maxLuminanceIRE: number;
  contrastRatio: string;
  estimatedKelvin: number;
  blackCrushPct: number;
  whiteClipPct: number;
  gamutOverloadPct: number;
  lumaHistogram: number[]; // 8 buckets (0-12.5%, 12.5-25%, ..., 87.5-100%)
  status: 'optimal' | 'warning' | 'clipping';
}

/**
 * Sample pixels across the active canvas to produce real-time Broadcast Color & Luminance Telemetry
 */
export function analyzeCanvasColorMetrics(
  canvas: HTMLCanvasElement | null,
  colorCfg?: ColorCalibrationConfig
): CanvasColorAnalysisResult {
  const fallback: CanvasColorAnalysisResult = {
    avgR: 128,
    avgG: 128,
    avgB: 128,
    avgHex: '#808080',
    avgLuminanceIRE: 50,
    minLuminanceIRE: 0,
    maxLuminanceIRE: 100,
    contrastRatio: '10.0:1',
    estimatedKelvin: 6500,
    blackCrushPct: 0,
    whiteClipPct: 0,
    gamutOverloadPct: 0,
    lumaHistogram: [12, 14, 15, 16, 15, 12, 9, 7],
    status: 'optimal',
  };

  if (!canvas || canvas.width === 0 || canvas.height === 0) return fallback;

  try {
    const sampleW = 48;
    const sampleH = 27;
    if (!telemetrySampleCanvas) {
      telemetrySampleCanvas = document.createElement('canvas');
      telemetrySampleCanvas.width = sampleW;
      telemetrySampleCanvas.height = sampleH;
      telemetrySampleCtx = telemetrySampleCanvas.getContext('2d', {
        willReadFrequently: true,
      });
    }
    if (!telemetrySampleCtx) return fallback;

    telemetrySampleCtx.clearRect(0, 0, sampleW, sampleH);
    telemetrySampleCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
    const imgData = telemetrySampleCtx.getImageData(0, 0, sampleW, sampleH).data;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumLuma = 0;
    let minLuma = 255;
    let maxLuma = 0;
    let blackCrushCount = 0;
    let whiteClipCount = 0;
    let gamutOverloadCount = 0;
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    const totalSamples = sampleW * sampleH;

    for (let i = 0; i < totalSamples; i++) {
      const idx = i * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];

      sumR += r;
      sumG += g;
      sumB += b;

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumLuma += luma;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;

      const ire = (luma / 255) * 100;
      if (ire < 3) blackCrushCount++;
      if (ire > 97) whiteClipCount++;

      const maxCh = Math.max(r, g, b);
      const minCh = Math.min(r, g, b);
      if (maxCh > 250 && maxCh - minCh > 220) {
        gamutOverloadCount++;
      }

      const bIdx = Math.min(7, Math.max(0, Math.floor((ire / 100) * 8)));
      buckets[bIdx]++;
    }

    const avgR = Math.round(sumR / totalSamples);
    const avgG = Math.round(sumG / totalSamples);
    const avgB = Math.round(sumB / totalSamples);
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    const avgHex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

    const avgLuminanceIRE = Math.round(((sumLuma / totalSamples) / 255) * 100);
    const minLuminanceIRE = Math.round((minLuma / 255) * 100);
    const maxLuminanceIRE = Math.round((maxLuma / 255) * 100);

    const l1 = maxLuma / 255 + 0.05;
    const l2 = minLuma / 255 + 0.05;
    const ratioVal = Number((l1 / l2).toFixed(1));
    const contrastRatio = `${ratioVal}:1`;

    const tempOffset = (colorCfg?.temperature ?? 0) * -22;
    const rbShift = (avgB - avgR) * 8;
    const estimatedKelvin = Math.max(
      2500,
      Math.min(12000, Math.round(6500 + tempOffset + rbShift))
    );

    const blackCrushPct = Math.round((blackCrushCount / totalSamples) * 100);
    const whiteClipPct = Math.round((whiteClipCount / totalSamples) * 100);
    const gamutOverloadPct = Math.round((gamutOverloadCount / totalSamples) * 100);

    const lumaHistogram = buckets.map((c) => Math.round((c / totalSamples) * 100));

    let status: 'optimal' | 'warning' | 'clipping' = 'optimal';
    if (whiteClipPct > 20 || blackCrushPct > 45 || gamutOverloadPct > 30) {
      status = 'clipping';
    } else if (whiteClipPct > 8 || blackCrushPct > 25 || gamutOverloadPct > 15) {
      status = 'warning';
    }

    return {
      avgR,
      avgG,
      avgB,
      avgHex,
      avgLuminanceIRE,
      minLuminanceIRE,
      maxLuminanceIRE,
      contrastRatio,
      estimatedKelvin,
      blackCrushPct,
      whiteClipPct,
      gamutOverloadPct,
      lumaHistogram,
      status,
    };
  } catch {
    return fallback;
  }
}

/**
 * Sample a single pixel (x, y) from a 4K/8K canvas using a 1x1 willReadFrequently offscreen buffer
 * so the main GPU canvas texture is never locked or copied to CPU RAM on mousemove.
 */
export function sampleCanvasPixelFast(
  canvas: HTMLCanvasElement | null,
  x: number,
  y: number
): { x: number; y: number; r: number; g: number; b: number; hex: string; ire: number } | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    if (!singlePixelSampleCanvas) {
      singlePixelSampleCanvas = document.createElement('canvas');
      singlePixelSampleCanvas.width = 1;
      singlePixelSampleCanvas.height = 1;
      singlePixelSampleCtx = singlePixelSampleCanvas.getContext('2d', {
        willReadFrequently: true,
      });
    }
    if (!singlePixelSampleCtx) return null;

    const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
    singlePixelSampleCtx.clearRect(0, 0, 1, 1);
    singlePixelSampleCtx.drawImage(canvas, sx, sy, 1, 1, 0, 0, 1, 1);
    const p = singlePixelSampleCtx.getImageData(0, 0, 1, 1).data;
    const r = p[0];
    const g = p[1];
    const b = p[2];
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    const ire = Math.round(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 100);
    return { x: sx, y: sy, r, g, b, hex, ire };
  } catch {
    return null;
  }
}
