/**
 * Compiles content/models/hanging-cage.glb into the compact mesh the hero's
 * WebGL cage draws.
 *
 * The exported glTF is 1.0 MB of float32 positions, normals and texture
 * coordinates — fine as a source file, far too much to put in front of a first
 * paint on a page whose whole argument is that it loads fast. Three things get
 * it down to about a seventh of that:
 *
 *   · Shapes are shared. The file carries 79 meshes, but only 20 distinct
 *     shapes: twenty-four bars are one bar at twenty-four rotations, and the
 *     exporter wrote the geometry out once per node. Hashing the vertex data
 *     collapses them back to one copy each, and every node keeps only its 4x3
 *     transform.
 *   · Positions are quantised to 16 bits across the model's own bounding box,
 *     which at this size is finer than a tenth of a millimetre.
 *   · Normals are octahedron-encoded to two signed bytes, and texture
 *     coordinates are dropped — nothing here is textured.
 *
 * The instances are expanded and baked back into one flat buffer in the
 * browser, once, at startup: small on the wire, one draw call on the screen.
 *
 * Run after replacing the model:  node scripts/build-cage.mjs
 * The output is committed, so the site build itself never reads the glTF.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLB = resolve(ROOT, 'content/models/hanging-cage.glb');
const MTL = resolve(ROOT, 'content/models/hanging-cage.mtl');
const OUT = resolve(ROOT, 'src/assets/js/cage-mesh.js');

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * The two rigs. Everything from the tray up to and including the hanging ring
 * is the cage, and swings on its own suspension; the links, the hook at the top
 * of them and the ceiling plate hang from the fixing above the page and swing
 * more slowly on a much longer arm.
 *
 * The ring is on the cage's side of that line, not the chain's: it is welded to
 * the finial and the lowest link passes through it, so it turns with the cage.
 * Putting it with the chain leaves the cage swinging out of a ring that stays
 * still, which is exactly the tell that gives away a drawing.
 */
const CHAIN_PARTS = /^(chainLink|hook|hookShank|ceilingPlate)/;

function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len)));
    if (type === 0x004e4942) bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('glb missing a chunk');
  return { json, bin };
}

function reader(json, bin) {
  return (index) => {
    const a = json.accessors[index];
    const view = json.bufferViews[a.bufferView];
    const T = COMPONENT[a.componentType];
    const n = COUNT[a.type];
    const start = bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
    // byteStride only matters for interleaved data; this exporter writes tight
    // buffers, and a stride that is not the natural one would silently
    // misread, so refuse rather than guess.
    if (view.byteStride && view.byteStride !== n * T.BYTES_PER_ELEMENT) {
      throw new Error(`accessor ${index} is interleaved (stride ${view.byteStride})`);
    }
    return new T(bin.buffer, start, a.count * n);
  };
}

/** Column-major 4x4 from a glTF node, which may give a matrix or T/R/S. */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

/** Octahedron encoding: a unit normal in two signed bytes. */
function octEncode(x, y, z) {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let px = x / l;
  let py = y / l;
  if (z < 0) {
    const nx = (1 - Math.abs(py)) * (px >= 0 ? 1 : -1);
    const ny = (1 - Math.abs(px)) * (py >= 0 ? 1 : -1);
    px = nx;
    py = ny;
  }
  const q = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
  return [q(px), q(py)];
}

async function main() {
  const { json, bin } = parseGlb(await readFile(GLB));
  const read = reader(json, bin);

  // --- materials, from the .mtl rather than the glTF: the exporter wrote
  // PBR metallic-roughness, and the .mtl carries the diffuse the model was
  // authored against, which is what the page is matching.
  const mtl = await readFile(MTL, 'utf8');
  const materials = [];
  let current = null;
  for (const line of mtl.split('\n')) {
    const [key, ...rest] = line.trim().split(/\s+/);
    if (key === 'newmtl') {
      current = { name: rest[0], kd: [0.5, 0.5, 0.5], ks: [0.2, 0.2, 0.2], ns: 60 };
      materials.push(current);
    } else if (!current) continue;
    else if (key === 'Kd') current.kd = rest.slice(0, 3).map(Number);
    else if (key === 'Ks') current.ks = rest.slice(0, 3).map(Number);
    else if (key === 'Ns') current.ns = Number(rest[0]);
  }
  const materialIndex = new Map(materials.map((m, i) => [m.name, i]));

  // --- walk the node tree, carrying transforms down
  const instances = [];
  const walk = (index, parent) => {
    const node = json.nodes[index];
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh != null) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) continue; // triangles only
        instances.push({ name: node.name ?? `node${index}`, prim, world });
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes.map((_, i) => i);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const seen = new Set();
  for (const r of roots) {
    walk(r, identity);
    seen.add(r);
  }

  // --- collapse identical shapes
  const shapes = [];
  const byHash = new Map();
  for (const inst of instances) {
    const pos = read(inst.prim.attributes.POSITION);
    const nrm = read(inst.prim.attributes.NORMAL);
    const idx = read(inst.prim.indices);
    // The shape's identity is its raw bytes. Different transforms of the same
    // geometry hash the same, which is the whole point.
    const key =
      Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength).toString('base64') +
      '|' +
      Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength).toString('base64');
    let shape = byHash.get(key);
    if (!shape) {
      shape = { index: shapes.length, pos, nrm, idx };
      shapes.push(shape);
      byHash.set(key, shape);
    }
    inst.shape = shape;
    inst.material = materialIndex.get(json.materials[inst.prim.material]?.name) ?? 0;
  }

  // --- quantise
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) {
    for (let i = 0; i < s.pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (s.pos[i + k] < lo[k]) lo[k] = s.pos[i + k];
        if (s.pos[i + k] > hi[k]) hi[k] = s.pos[i + k];
      }
    }
  }
  const span = hi.map((h, k) => Math.max(1e-6, h - lo[k]));

  let vertexTotal = 0;
  let indexTotal = 0;
  for (const s of shapes) {
    s.vertexOffset = vertexTotal;
    s.indexOffset = indexTotal;
    s.vertexCount = s.pos.length / 3;
    s.indexCount = s.idx.length;
    vertexTotal += s.vertexCount;
    indexTotal += s.indexCount;
  }
  if (vertexTotal > 65535) throw new Error(`${vertexTotal} shape vertices exceeds a 16-bit index`);

  const qpos = new Uint16Array(vertexTotal * 3);
  const qnrm = new Int8Array(vertexTotal * 2);
  const qidx = new Uint16Array(indexTotal);
  for (const s of shapes) {
    for (let i = 0; i < s.vertexCount; i++) {
      for (let k = 0; k < 3; k++) {
        const t = (s.pos[i * 3 + k] - lo[k]) / span[k];
        qpos[(s.vertexOffset + i) * 3 + k] = Math.round(Math.max(0, Math.min(1, t)) * 65535);
      }
      const [ox, oy] = octEncode(s.nrm[i * 3], s.nrm[i * 3 + 1], s.nrm[i * 3 + 2]);
      qnrm[(s.vertexOffset + i) * 2] = ox;
      qnrm[(s.vertexOffset + i) * 2 + 1] = oy;
    }
    for (let i = 0; i < s.indexCount; i++) qidx[s.indexOffset + i] = s.idx[i];
  }

  // --- instances: 4x3 transform, shape, material, and which of the two rigs
  // it belongs to. Only the rows that can differ are stored; the fourth is
  // always (0,0,0,1) for these transforms.
  const xform = new Float32Array(instances.length * 12);
  const meta = new Uint8Array(instances.length * 3);
  instances.forEach((inst, i) => {
    const m = inst.world;
    const dst = i * 12;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) xform[dst + c * 3 + r] = m[c * 4 + r];
    }
    meta[i * 3] = inst.shape.index;
    meta[i * 3 + 1] = inst.material;
    meta[i * 3 + 2] = CHAIN_PARTS.test(inst.name) ? 1 : 0;
  });

  // --- the joint. The cage turns about the line where the ring bears on the
  // lowest link, which is the midpoint of their overlap — not the ring's
  // centre, which is a few millimetres low and lets the cage walk off the
  // chain as it swings.
  const yRange = (predicate) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const inst of instances) {
      if (!predicate(inst.name)) continue;
      const s = inst.shape;
      for (let v = 0; v < s.pos.length / 3; v++) {
        const [x, y, z] = [s.pos[v * 3], s.pos[v * 3 + 1], s.pos[v * 3 + 2]];
        const m = inst.world;
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        if (wy < lo) lo = wy;
        if (wy > hi) hi = wy;
      }
    }
    return [lo, hi];
  };

  const ring = yRange((n) => n.startsWith('hangRing'));
  const links = yRange((n) => n.startsWith('chainLink'));
  const cageSpan = yRange((n) => !CHAIN_PARTS.test(n));
  const pivot = (ring[1] + links[0]) / 2;

  // Link spacing, measured rather than assumed: the chain has to be repeated to
  // reach a fixing point that is off the top of the page, and it can only be
  // repeated on its own pitch.
  const linkCentres = instances
    .filter((i) => i.name.startsWith('chainLink'))
    .map((i) => {
      const s = i.shape;
      let sum = 0;
      const n = s.pos.length / 3;
      for (let v = 0; v < n; v++) {
        const m = i.world;
        sum += m[1] * s.pos[v * 3] + m[5] * s.pos[v * 3 + 1] + m[9] * s.pos[v * 3 + 2] + m[13];
      }
      return sum / n;
    })
    .sort((a, b) => a - b);
  const pitches = linkCentres.slice(1).map((y, i) => y - linkCentres[i]);
  const linkPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;

  const shapeTable = new Uint16Array(shapes.length * 4);
  shapes.forEach((s, i) => {
    shapeTable[i * 4] = s.vertexOffset;
    shapeTable[i * 4 + 1] = s.vertexCount;
    shapeTable[i * 4 + 2] = s.indexOffset;
    shapeTable[i * 4 + 3] = s.indexCount;
  });

  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const payload = {
    lo,
    span,
    pivot,
    linkPitch,
    cageTop: cageSpan[1],
    cageBottom: cageSpan[0],
    chainBottom: links[0],
    shapes: shapes.length,
    instances: instances.length,
    vertices: vertexTotal,
    indices: indexTotal,
    triangles: indexTotal / 3,
    materials: materials.map((m) => ({ name: m.name, kd: m.kd, ks: m.ks, ns: m.ns })),
    names: instances.map((i) => i.name),
    shapeTable: b64(shapeTable),
    pos: b64(qpos),
    nrm: b64(qnrm),
    idx: b64(qidx),
    xform: b64(xform),
    meta: b64(meta),
  };

  const js =
    '/* Generated by scripts/build-cage.mjs from content/models/hanging-cage.glb — do not edit by hand. */\n' +
    'window.FF_CAGE_MESH = ' +
    JSON.stringify(payload) +
    ';\n';
  await writeFile(OUT, js);

  const drawn = instances.length;
  const chain = instances.filter((i) => CHAIN_PARTS.test(i.name)).length;
  console.log(
    `Cage: ${drawn} instances (${chain} on the chain) of ${shapes.length} shapes · ` +
      `${vertexTotal} vertices, ${indexTotal / 3} triangles`
  );
  console.log(
    `  cage ${cageSpan[0].toFixed(3)}..${cageSpan[1].toFixed(3)} · ` +
      `joint at ${pivot.toFixed(4)} · link pitch ${linkPitch.toFixed(5)}`
  );
  console.log(`  ${(js.length / 1024).toFixed(0)} KB written to src/assets/js/cage-mesh.js`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
