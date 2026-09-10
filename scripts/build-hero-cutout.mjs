/**
 * Lifts the hero photograph off its studio wall.
 *
 * The source frame is a figure crouching in a cage against a concrete wall,
 * on a concrete floor. The wall can be separated cleanly; the floor cannot.
 * Sampling the frame gives floor luminance 51-77, leather 36-59 and skin 71 —
 * the subject and the ground fully interleave, and saturation is no better
 * (wall 19, floor 21-25, skin 22). No threshold splits the boots from the
 * shadow they stand in, so nothing here tries to: the wall becomes the page's
 * ground and the floor stays, as a band the figure stands on.
 *
 * The fill is a flood from the frame edges that walks by *local* gradient —
 * each pixel is compared with the neighbour it was reached from, not with a
 * global model — so the wall's vignette propagates instead of halting the fill
 * a few pixels in. Two guards keep it out of the subject: a luminance gate
 * (the wall sits well above everything else) and a hard cap at the measured
 * wall/floor junction.
 *
 * Writes content/images/hero.webp. The ungraded original stays as
 * hero-source.jpg, which the build's `^hero\.(jpe?g|png|webp)$` match skips.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sharp = createRequire(import.meta.url)('sharp');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'content/images/hero-source.jpg');
const DEST = join(ROOT, 'content/images/hero.webp');

const LOCAL = 12;    // largest luminance step between neighbouring background pixels
const SATCAP = 34;   // concrete is near-neutral; skin and hair are not
const GATE = 78;     // wall only — the floor tops out around 77
const SEED_Y = 0.60; // seed the side edges only above this fraction of the height
const YCAP = 0.715;  // measured wall/floor junction; the fill may not cross it
const BOT = 0.03;    // edge feather at the bottom, as a fraction of height
const SEAM = 0.075;  // fade the concrete out of the junction over this band
// The kept floor is shaped into a pool under the figure rather than left as a
// band: a rectangle of concrete ending at the frame edge reads as a crop, the
// same soft ellipse reads as the shadow she is standing in.
const POOL_X = 0.45; // centre of the contact area, as a fraction of width
const POOL_R = 0.20; // fully opaque within this distance of the centre
const POOL_F = 0.46; // fully transparent beyond it

const meta = await sharp(SRC).metadata();
const W = 560; // the mask is solved small, then scaled up: concrete grain is noise here
const H = Math.round(meta.height * W / meta.width);

const { data } = await sharp(SRC).resize(W, H).blur(1.4).removeAlpha()
  .raw().toBuffer({ resolveWithObject: true });

const N = W * H;
const lum = new Float32Array(N);
const sat = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
}

const CAP = Math.round(H * YCAP);
const bg = new Uint8Array(N);
const queue = new Int32Array(N);
let head = 0, tail = 0;

const ok = (i) => sat[i] <= SATCAP && lum[i] >= GATE && ((i / W) | 0) < CAP;
const push = (i) => { if (!bg[i] && ok(i)) { bg[i] = 1; queue[tail++] = i; } };

// The top edge is all wall. The sides are seeded only in the upper frame so the
// fill can never begin inside the floor and walk up into the boots.
for (let x = 0; x < W; x++) push(x);
for (let y = 0; y < H * SEED_Y; y++) { push(y * W); push(y * W + W - 1); }

while (head < tail) {
  const i = queue[head++];
  const x = i % W, y = (i / W) | 0;
  const L = lum[i];
  const step = (j) => {
    if (bg[j] || !ok(j)) return;
    if (Math.abs(lum[j] - L) > LOCAL) return;
    bg[j] = 1; queue[tail++] = j;
  };
  if (x > 0) step(i - 1);
  if (x < W - 1) step(i + 1);
  if (y > 0) step(i - W);
  if (y < H - 1) step(i + W);
}

let removed = 0;
for (let i = 0; i < N; i++) if (bg[i]) removed++;

const small = Buffer.alloc(N);
for (let i = 0; i < N; i++) small[i] = bg[i] ? 0 : 255;

const mask = await sharp(small, { raw: { width: W, height: H, channels: 1 } })
  .resize(meta.width, meta.height, { kernel: 'cubic' })
  .blur(2.0)
  .toColourspace('b-w') // sharp promotes a raw single channel to sRGB otherwise
  .raw().toBuffer();

const FW = meta.width, FH = meta.height;
const botPx = Math.round(FH * BOT);
const capPx = Math.round(FH * YCAP);
const seamPx = Math.round(FH * SEAM);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// `joinChannel` will not attach this as alpha, so the RGBA buffer is built here.
const rgb = await sharp(SRC).removeAlpha().raw().toBuffer();
const rgba = Buffer.alloc(FW * FH * 4);

for (let y = 0; y < FH; y++) {
  const fy = botPx ? smooth((FH - 1 - y) / botPx) : 1;
  // 0 at the junction, rising to 1 below it, and inert above it
  const seam = y < capPx ? 1 : smooth((y - capPx) / seamPx);
  for (let x = 0; x < FW; x++) {
    const i = y * FW + x;
    const d = Math.abs(x / FW - POOL_X);
    const fx = 1 - smooth((d - POOL_R) / (POOL_F - POOL_R));
    const px = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
    // only concrete dissolves into the seam; cage bars and boots stay solid
    const concrete = smooth((px - 34) / 22);
    const fs = 1 - concrete * (1 - seam);
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = Math.round(mask[i] * fx * fy * fs);
  }
}

await sharp(rgba, { raw: { width: FW, height: FH, channels: 4 } })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(DEST);

console.log(`  Hero cut-out: ${FW}x${FH}, wall removed (${(100 * removed / N).toFixed(1)}% of frame)`);
