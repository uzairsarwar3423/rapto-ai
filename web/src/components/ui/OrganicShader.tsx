"use client";

/**
 * OrganicShader — a self-contained, GPU-accelerated generative surface.
 *
 * Raw WebGL (no three.js): one full-screen triangle, one fragment shader.
 * The field is a domain-warped fBm; a luminous ribbon is carved where the
 * warped field crosses an iso-level, with tight core / mid glow / wide haze
 * layers for soft light diffusion. Slow lights drift in from the corners and
 * the cursor both bends the field and carries a gentle light of its own.
 *
 * Engineering notes
 *  - Renders at <= 1.5 DPR and <= 1.4 MP, and steps its own resolution down
 *    if frames run long (adaptive quality).
 *  - Pauses when off-screen or when the tab is hidden.
 *  - animated={false} or prefers-reduced-motion: renders a single still frame
 *    (grain included), no loop, no pointer.
 *  - Survives context loss/restoration; lazily initialises only once it has a
 *    non-zero size (so a `display:none` instance costs nothing).
 *  - If WebGL is unavailable the CSS gradient underneath stays visible.
 */

import React, { useEffect, useRef, useState } from "react";

const VERT = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;          // 0..1, origin bottom-left
uniform float uMouseStrength;  // 0..1, eased in JS

// Hoskins hash — stays well-behaved for large inputs (pixel coordinates).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv  = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p   = (uv - 0.5) * vec2(asp, 1.0);
  vec2 m   = (uMouse - 0.5) * vec2(asp, 1.0);
  float t  = uTime * 0.05;

  // Cursor (live mode only): soft repulsion bends the field around the pointer
  vec2 d   = p - m;
  float md = length(d);
  float pull = uMouseStrength * exp(-md * md * 6.0);
  p += (d / (md + 0.02)) * pull * 0.12;

  // Gentle two-layer warp keeps every edge organic
  vec2 q = vec2(
    fbm(p * 1.2 + vec2(0.0, t)),
    fbm(p * 1.2 + vec2(5.2, 1.3) - t)
  );
  vec2 w = p + (q - 0.5) * 0.45;
  vec2 r = vec2(
    fbm(w * 1.5 + vec2(1.7, 9.2) + t * 1.3),
    fbm(w * 1.5 + vec2(8.3, 2.8) - t * 1.1)
  );

  // ── The sweep: one large S-curve with a crisp edge on one side and a long,
  //    soft falloff on the other, so light pools into the lower right ────────
  vec2 u = rot(0.38) * w;
  float cx = 0.03 + 0.15 * sin(u.y * 2.3 + 0.7 + t * 5.0) + 0.03 * sin(u.y * 5.0 - t * 7.0 + r.x * 1.5);
  float s  = u.x - cx;
  float side = smoothstep(-0.02, 0.02, s);
  float lit  = mix(exp(s / 0.032), exp(-s / 0.11), side);
  float edge = exp(-abs(s) / 0.016);

  // ── Light pooling at the top and lower right ─────────────────────────────
  vec2 lp = vec2(uv.x * asp, uv.y);
  vec2 l1 = vec2(asp * 0.52 + 0.04 * sin(t * 8.0), 1.02);
  vec2 l2 = vec2(asp * 0.96, 0.06 + 0.04 * cos(t * 7.0));
  float k1 = exp(-dot(lp - l1, lp - l1) * 11.0);
  float k2 = exp(-dot(lp - l2, lp - l2) * 5.5);

  // Cursor light (live mode only)
  float cur = uMouseStrength * exp(-md * md * 18.0) * (0.4 + 0.8 * r.y);

  float L = lit * (0.55 + 0.5 * r.x)
          + edge * 0.55
          + k1 * 0.70
          + k2 * 1.00
          + exp(-uv.x * 6.0) * 0.14 * (0.5 + r.y)   // faint green wash on the far left
          + cur * 0.4;

  // ── Palette: deep olive-forest into luminous lime ────────────────────────
  vec3 dark = vec3(0.060, 0.135, 0.050);
  vec3 mid  = vec3(0.170, 0.410, 0.150);
  vec3 lime = vec3(0.760, 0.975, 0.500);
  vec3 pale = vec3(0.930, 1.000, 0.800);

  vec3 col = dark;
  col = mix(col, mid,  smoothstep(0.10, 0.62, L));
  col = mix(col, lime, smoothstep(0.55, 1.15, L));
  col = mix(col, pale, smoothstep(1.15, 1.70, L) * 0.8);

  // Slight tonal drift in the shadows so the dark is never flat
  col *= 0.86 + 0.28 * r.y;

  // ── Coarse film grain: the defining texture ──────────────────────────────
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec2 gc = floor(gl_FragCoord.xy / 1.4);
  float gt = floor(uTime * 8.0);
  float g = (hash(gc + gt * 37.0) + hash(gc * 1.7 + 11.3 + gt * 13.0)) * 0.5 - 0.5;
  col *= 1.0 + g * 0.42;
  col += g * (0.06 + 0.10 * smoothstep(0.1, 0.8, lum)) * vec3(0.7, 1.0, 0.6);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const MAX_PIXELS = 1_400_000;

export interface OrganicShaderProps {
  className?: string;
  /** Run the animation loop. When false, one still frame is rendered (no loop, no pointer). */
  animated?: boolean;
  /** Point in the field's timeline (seconds) used for the still frame. */
  stillTime?: number;
  /** Animation speed multiplier. */
  speed?: number;
  /** Let the cursor bend and light the field. */
  interactive?: boolean;
  /** Adapt render resolution to keep frame times healthy. */
  adaptive?: boolean;
}

export function OrganicShader({
  className,
  animated = true,
  stillTime = 36,
  speed = 1,
  interactive = true,
  adaptive = true,
}: OrganicShaderProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let uMouse: WebGLUniformLocation | null = null;
    let uMouseStrength: WebGLUniformLocation | null = null;

    let raf = 0;
    let disposed = false;
    let running = false;
    let announced = false;
    let width = 0;
    let height = 0;
    let scale = 1;
    let time = 0;
    let last = 0;
    let frames = 0;
    let frameAvg = 16;
    let visible = true;

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // "reduce" = hold a single still frame (user preference, or animated=false)
    let reduce = reduceMq.matches || !animated;

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, s: 0, ts: 0 };

    const compile = (type: number, src: string) => {
      if (!gl) return null;
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const teardownGl = () => {
      if (!gl) return;
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      program = null;
      buffer = null;
    };

    const init = (): boolean => {
      teardownGl();
      gl =
        (canvas.getContext("webgl", {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: "high-performance",
        }) as WebGLRenderingContext | null) ?? null;
      if (!gl) return false;

      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;

      program = gl.createProgram();
      if (!program) return false;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // One oversized triangle covers the viewport with no diagonal seam.
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW
      );
      const loc = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uMouse = gl.getUniformLocation(program, "uMouse");
      uMouseStrength = gl.getUniformLocation(program, "uMouseStrength");
      return true;
    };

    const resize = () => {
      if (!gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const k = dpr * scale;
      let pw = Math.max(1, Math.round(width * k));
      let ph = Math.max(1, Math.round(height * k));
      if (pw * ph > MAX_PIXELS) {
        const s = Math.sqrt(MAX_PIXELS / (pw * ph));
        pw = Math.round(pw * s);
        ph = Math.round(ph * s);
      }
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      gl.viewport(0, 0, pw, ph);
    };

    const draw = (t: number) => {
      if (!gl || !program) return;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uMouseStrength, mouse.s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!announced) {
        announced = true;
        setReady(true);
      }
    };

    const loop = (now: number) => {
      raf = 0;
      if (disposed || !running) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      time += dt * speed;

      // Frame-rate independent easing for the pointer.
      const kp = 1 - Math.exp(-dt * 5);
      mouse.x += (mouse.tx - mouse.x) * kp;
      mouse.y += (mouse.ty - mouse.y) * kp;
      mouse.s += (mouse.ts - mouse.s) * (1 - Math.exp(-dt * 3));

      draw(time);

      if (adaptive) {
        frameAvg = frameAvg * 0.94 + dt * 1000 * 0.06;
        frames += 1;
        if (frames > 90 && frameAvg > 24 && scale > 0.5) {
          scale = Math.max(0.5, scale * 0.8);
          frames = 0;
          frameAvg = 16;
          resize();
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    /** Decide between looping, a single still frame, or idle. */
    const sync = () => {
      if (disposed || !gl || !program) return;
      stop();
      if (width === 0 || height === 0) return;
      resize();
      if (reduce) {
        draw(stillTime);
        return;
      }
      if (!visible || document.hidden) {
        draw(time);
        return;
      }
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const measure = () => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      if (width === 0 || height === 0) return;
      if (!gl || !program) {
        if (!init()) {
          // Leave the CSS fallback in place.
          teardownGl();
          return;
        }
      }
      sync();
    };

    // ── Observers & listeners ─────────────────────────────────────────────
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    io.observe(wrap);

    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);

    const onReduce = (e: MediaQueryListEvent) => {
      reduce = e.matches || !animated;
      if (reduce) mouse.ts = 0;
      sync();
    };
    reduceMq.addEventListener("change", onReduce);

    const onPointerMove = (e: PointerEvent) => {
      if (!interactive || reduce || width === 0) return;
      const rect = wrap.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (inside) {
        mouse.tx = (e.clientX - rect.left) / rect.width;
        mouse.ty = 1 - (e.clientY - rect.top) / rect.height;
      }
      mouse.ts = inside ? 1 : 0;
    };
    const onPointerLeave = () => {
      mouse.ts = 0;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);

    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
      program = null;
    };
    const onRestored = () => {
      if (init()) sync();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    measure();

    return () => {
      disposed = true;
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMq.removeEventListener("change", onReduce);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      teardownGl();
    };
  }, [animated, stillTime, speed, interactive, adaptive]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={`organic-shader ${className ?? ""}`}
    >
      <canvas
        ref={canvasRef}
        role="presentation"
        className="organic-shader__canvas"
        data-ready={ready}
      />
    </div>
  );
}

export default OrganicShader;
