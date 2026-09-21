"use client";

import { useEffect, useRef } from "react";

/**
 * A logo made of dust.
 *
 * The shape comes from an image — `src`, by default `/solana-logo.svg` — which
 * is sampled into a few thousand particles, each keeping the colour of the
 * pixel it came from. Hover and it blows apart into a drifting cloud; move
 * away and it pulls itself back together. The cursor also brushes particles
 * aside as it passes, so it reads as dust rather than as a picture.
 *
 * If the image is missing or fails to load, `fallbackText` is drawn as dust
 * instead, so the page never shows an empty hole.
 *
 * Respects prefers-reduced-motion: the logo is drawn assembled and still.
 */

interface Particle {
  x: number;
  y: number;
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  c: string;
  s: number;
}

const MAX_PARTICLES = 2600;
const DEFAULT_FALLBACK = ["SOLANA", "SCHOOL"];
const ALPHAS = [0.5, 0.75, 1];
const SIZES = [1.2, 1.7, 2.3];

export function DustLogo({
  src = "/solana-logo.svg",
  fallbackText = DEFAULT_FALLBACK,
  label = "Solana logo",
}: {
  src?: string;
  fallbackText?: string[];
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let particles: Particle[] = [];
    let box = { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0 };
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let visible = true;

    const pointer = { x: -9999, y: -9999, inside: false };
    let scattered = false;
    let touchTimer: number | undefined;

    // ── build the particle field from an image or the fallback text ──────
    let image: HTMLImageElement | null = null;
    let imageFailed = false;
    // Nothing is drawn until the image has either loaded or failed —
    // otherwise the fallback text flashes up for a frame before the logo.
    let sourceReady = false;

    function paintSource(off: CanvasRenderingContext2D) {
      off.clearRect(0, 0, w, h);
      const maxW = w * 0.58;
      const maxH = h * 0.64;

      if (image && !imageFailed) {
        // SVGs without width/height report 0; treat them as square.
        const iw = image.naturalWidth || 300;
        const ih = image.naturalHeight || 300;
        const s = Math.min(maxW / iw, maxH / ih);
        const dw = iw * s;
        const dh = ih * s;
        off.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
        return;
      }

      // Fallback: the wordmark, in the site's display face, teal → purple.
      const lines = fallbackText;
      let size = Math.min(maxH / (lines.length * 1.05), 160);
      off.font = `800 ${size}px Archivo, "Helvetica Neue", Arial, sans-serif`;
      const widest = Math.max(...lines.map((l) => off.measureText(l).width));
      if (widest > maxW) {
        size *= maxW / widest;
        off.font = `800 ${size}px Archivo, "Helvetica Neue", Arial, sans-serif`;
      }
      const grad = off.createLinearGradient(w * 0.2, 0, w * 0.8, h);
      grad.addColorStop(0, "#3ed3cb");
      grad.addColorStop(0.55, "#8f6dff");
      grad.addColorStop(1, "#c86dff");
      off.fillStyle = grad;
      off.textAlign = "center";
      off.textBaseline = "middle";
      const lh = size * 1.02;
      const top = h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => off.fillText(l, w / 2, top + i * lh));
    }

    function sample(step: number, data: Uint8ClampedArray): Particle[] {
      const out: Particle[] = [];
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (Math.floor(y) * w + Math.floor(x)) * 4;
          if (data[i + 3] < 110) continue;
          // Quantise colour, and pick one of three opacities, so drawing can
          // still batch by fillStyle while no two neighbours look identical.
          const r = data[i] & 0xf0;
          const g = data[i + 1] & 0xf0;
          const b = data[i + 2] & 0xf0;
          const a = ALPHAS[(Math.random() * ALPHAS.length) | 0];
          // Jitter each home a little off the sampling grid. Without it the
          // resting logo reads as a dot-matrix print rather than as dust.
          const hx = x + (Math.random() - 0.5) * step * 0.8;
          const hy = y + (Math.random() - 0.5) * step * 0.8;
          out.push({
            x: hx,
            y: hy,
            hx,
            hy,
            vx: 0,
            vy: 0,
            c: `rgba(${r},${g},${b},${a})`,
            s: SIZES[(Math.random() * SIZES.length) | 0],
          });
        }
      }
      return out;
    }

    function build() {
      const rect = wrap!.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!sourceReady) return;

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return;
      paintSource(octx);
      const data = octx.getImageData(0, 0, w, h).data;

      let step = 3;
      let next = sample(step, data);
      if (next.length > MAX_PARTICLES) {
        step = Math.ceil(step * Math.sqrt(next.length / MAX_PARTICLES));
        next = sample(step, data);
      }

      // Keep motion continuous across a resize: new particles start where the
      // old ones were rather than snapping in from the origin.
      next.forEach((p, i) => {
        const old = particles[i];
        if (old) {
          p.x = old.x;
          p.y = old.y;
        }
      });
      next.sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : 0));
      particles = next;

      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of particles) {
        if (p.hx < x0) x0 = p.hx;
        if (p.hy < y0) y0 = p.hy;
        if (p.hx > x1) x1 = p.hx;
        if (p.hy > y1) y1 = p.hy;
      }
      const pad = 36;
      box = {
        x0: x0 - pad,
        y0: y0 - pad,
        x1: x1 + pad,
        y1: y1 + pad,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
      };

      draw();
    }

    // ── motion ──────────────────────────────────────────────────────────
    function burst() {
      for (const p of particles) {
        const a =
          Math.atan2(p.hy - box.cy, p.hx - box.cx) + (Math.random() - 0.5) * 1.6;
        const m = 1.5 + Math.random() * 7.5;
        p.vx += Math.cos(a) * m;
        p.vy += Math.sin(a) * m - Math.random() * 1.2; // dust rises a little
      }
    }

    function setScattered(next: boolean) {
      if (reduced || next === scattered) return;
      scattered = next;
      if (next) burst();
      start();
    }

    function step() {
      const k = scattered ? 0.0007 : 0.055;
      const drag = scattered ? 0.968 : 0.84;
      const R = 80;
      let moving = false;

      for (const p of particles) {
        let ax = (p.hx - p.x) * k;
        let ay = (p.hy - p.y) * k;

        if (scattered) {
          ax += (Math.random() - 0.5) * 0.22;
          ay += (Math.random() - 0.5) * 0.22 - 0.012;
        }

        if (pointer.inside) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / R) * 2.4;
            ax += (dx / d) * f;
            ay += (dy / d) * f;
          }
        }

        p.vx = (p.vx + ax) * drag;
        p.vy = (p.vy + ay) * drag;
        p.x += p.vx;
        p.y += p.vy;

        if (
          !moving &&
          (Math.abs(p.vx) > 0.02 ||
            Math.abs(p.vy) > 0.02 ||
            Math.abs(p.hx - p.x) > 0.3 ||
            Math.abs(p.hy - p.y) > 0.3)
        ) {
          moving = true;
        }
      }
      return moving || scattered || pointer.inside;
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      let current = "";
      for (const p of particles) {
        if (p.c !== current) {
          current = p.c;
          ctx!.fillStyle = current;
        }
        ctx!.fillRect(p.x, p.y, p.s, p.s);
      }
    }

    function frame() {
      const keepGoing = step();
      draw();
      if (keepGoing && visible && !document.hidden) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }

    function start() {
      if (reduced || running || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    // ── input ───────────────────────────────────────────────────────────
    function local(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function inBox(x: number, y: number) {
      return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const { x, y } = local(e);
      pointer.x = x;
      pointer.y = y;
      pointer.inside = true;
      setScattered(inBox(x, y));
      start();
    }
    function onLeave() {
      pointer.inside = false;
      pointer.x = pointer.y = -9999;
      setScattered(false);
    }
    // Touch has no hover: a tap scatters it, and it gathers itself again.
    function onDown(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      const { x, y } = local(e);
      if (!inBox(x, y)) return;
      setScattered(true);
      window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => setScattered(false), 1400);
    }

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);

    // ── lifecycle ───────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => build());
    ro.observe(wrap);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);

    const onVis = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVis);

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      image = img;
      sourceReady = true;
      build();
    };
    img.onerror = () => {
      if (cancelled) return;
      imageFailed = true;
      sourceReady = true;
      // Wait for the display face so the fallback is drawn in it.
      void (document.fonts?.ready ?? Promise.resolve()).then(() => {
        if (!cancelled) build();
      });
    };
    img.src = src;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(touchTimer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fallbackText.join("|")]);

  return (
    <div ref={wrapRef} className="dust">
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
}
