import * as THREE from 'three';
import {seededRandom} from '../planning/generation.ts';

/** Tests and tools run without a browser canvas; they need the texture object but not its pixels. */
function canPaint(g: CanvasRenderingContext2D) {
  return typeof CanvasRenderingContext2D !== "undefined" && g instanceof CanvasRenderingContext2D;
}

export function makeAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext("2d")!;
  const rng = seededRandom(12345);
  if (canPaint(g)) {
    g.fillStyle = "#636a71";
    g.fillRect(0, 0, 1024, 1024);
    // Lengthwise wear: two slightly polished wheel paths per lane and darker oil between them.
    for (const [x, width, shade] of [[170, 150, 255], [420, 150, 255], [604, 150, 255], [854, 150, 255], [295, 70, 20], [729, 70, 20]] as const) {
      const wear = g.createLinearGradient(x - width / 2, 0, x + width / 2, 0);
      wear.addColorStop(0, `rgba(${shade},${shade},${shade},0)`); wear.addColorStop(0.5, `rgba(${shade},${shade},${shade},0.07)`);
      wear.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      g.fillStyle = wear; g.fillRect(x - width / 2, 0, width, 1024);
    }
    // Aggregate: many fine light and dark stones.
    for (let i = 0; i < 26000; i++) {
      const shade = rng() < 0.5 ? 55 + rng() * 40 : 120 + rng() * 60;
      g.fillStyle = `rgba(${shade},${shade},${shade + 5},${0.12 + rng() * 0.3})`;
      const size = 1 + rng() * 2.2;
      g.fillRect(rng() * 1024, rng() * 1024, size, size);
    }
    // Faint resurfaced strips and fine tar-sealed cracks that wander along the road.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(40,44,50,${0.05 + rng() * 0.05})`;
      g.fillRect(rng() * 900, rng() * 900, 50 + rng() * 90, 120 + rng() * 260);
    }
    g.strokeStyle = "rgba(34,36,40,0.38)";
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 0.8 + rng() * 1.1;
      g.beginPath();
      let x = rng() * 1024;
      let y = rng() * 1024;
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += (rng() - 0.5) * 16;
        y += 8 + rng() * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/** Near-white grass detail that multiplies the terrain's vertex colours, so districts keep their own tint. */
export function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d")!;
  const rng = seededRandom(777);
  if (canPaint(g)) {
    g.fillStyle = "#dcdcdc";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      const shade = rng() < 0.5 ? 255 : 150, radius = 14 + rng() * 44, x = rng() * 512, y = rng() * 512;
      // Draw each blotch wrapped, so the tile repeats without a seam.
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        const blotch = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
        blotch.addColorStop(0, `rgba(${shade},${shade},${shade},0.16)`); blotch.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
        g.fillStyle = blotch; g.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
      }
    }
    for (let i = 0; i < 9000; i++) {
      const shade = 150 + rng() * 105;
      g.fillStyle = `rgba(${shade},${shade},${shade * 0.94},${0.25 + rng() * 0.4})`;
      g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 1.5, 2 + rng() * 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.4, 3.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

