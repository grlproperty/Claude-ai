/**
 * The cage.
 *
 * A hanging birdcage rendered in WebGL behind the hero. It is the brand's own
 * motif rather than an abstract shader: the campaign imagery puts a cage
 * around the subject, and the site puts the same object behind the masthead.
 *
 * Written against raw WebGL rather than a library. The scene is one model and
 * two draw calls, so a 3D framework would be almost entirely dead weight on a
 * page whose point is that it loads fast and asks nothing of anyone else.
 *
 * Three things here are worth knowing before changing them.
 *
 * The geometry is not written here. It is a modelled object, kept in
 * content/models/ and compiled by scripts/build-cage.mjs into the shapes and
 * placements this file expands at startup — see the README beside the model
 * for what an export has to satisfy. This used to be a few hundred procedural
 * segments drawn as screen-space quads, because a wireframe cannot be drawn
 * with gl.LINES: every browser clamps lineWidth to one physical pixel, and a
 * hairline reads as a diagram rather than an object. A model with real tubes
 * needs none of that.
 *
 * It hangs rather than spins. A constantly rotating object reads as a 3D demo;
 * a suspended one reads as a thing in a room. The motion is a damped pendulum
 * on two axes, pushed by the pointer and by scrolling, so it always settles
 * back to rest instead of turning forever. Two pendulums, in fact: the chain
 * leans from a fixing above the page on a long slow arm, and the cage swings
 * faster on the ring at the top of it.
 *
 * It is drawn twice over. The reveal pass cuts the object off at a sweep front
 * with `discard` and softens that edge with blending; the solid pass, which
 * runs for the rest of the session, does neither — a shader that can discard
 * has early-Z switched off for its whole life, and this is a lot of overdraw
 * to pay that on.
 *
 * Degrades in three steps: no WebGL → CSS lattice (via data-state);
 * reduced-motion → one still frame, upright; offscreen or hidden tab → paused.
 */
(function start() {
  'use strict';
  window.FF = window.FF || {};
  window.FF.initCage = start;

  var host = document.querySelector('[data-cage]');
  if (!host) return;
  // The single-file build calls this again on returning to the homepage; a
  // second canvas on the same host would stack and double the draw cost.
  if (host.querySelector('canvas')) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  var gl = null;
  try {
    var opts = {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      // Kept so the composited frame survives past the paint. Without it the
      // canvas reads blank to screenshot and thumbnail pipelines that capture
      // outside the rendering task.
      preserveDrawingBuffer: true,
    };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  } catch (e) {
    gl = null;
  }

  if (!gl) {
    host.setAttribute('data-state', 'fallback');
    return;
  }

  host.appendChild(canvas);
  host.setAttribute('data-state', 'gl');
  // ---------------------------------------------------------------- shaders

  // A lit triangle mesh. The cage used to be drawn as screen-space expanded
  // quads, because it was a wireframe and every browser clamps gl.lineWidth to
  // one physical pixel — a hairline reads as a diagram rather than an object.
  // The model has real tubes with real surface, so that whole apparatus is
  // gone: this shades actual geometry, and the weight of a bar now comes from
  // the bar instead of from a width in pixels.
  //
  // Lighting is done in view space, which is the one space where both the
  // normal and the direction to the eye are cheap: the eye sits at the origin
  // there, so the view vector is just the negated position. It also fixes the
  // lights to the camera rather than to the object, so a cage that swings
  // keeps its highlights instead of strobing as it turns.
  var VERT = [
    'attribute vec3 aPos;',
    'attribute vec3 aNrm;',
    'attribute vec3 aCol;',
    'attribute vec2 aSurf;', // x: specular strength, y: height through the object
    'uniform mat4 uMVP;',
    'uniform mat4 uMV;',
    'uniform mat3 uMV3;',
    'varying vec3 vNrm;',
    'varying vec3 vCol;',
    'varying vec3 vView;',
    'varying float vSpec;',
    'varying float vOrder;',
    'void main() {',
    '  vNrm = uMV3 * aNrm;',
    '  vCol = aCol;',
    '  vSpec = aSurf.x;',
    '  vOrder = aSurf.y;',
    '  vView = -(uMV * vec4(aPos, 1.0)).xyz;',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}',
  ].join('\n');

  // Two lights and a rim. The key is high, right and slightly in front; the
  // fill is low, opposite and weak — enough that the underside of the dome
  // does not go to a flat black against a pale ground. The rim is the brand's
  // crimson, and only on the turning edge: it is the one place colour reads on
  // an object this dark without the whole thing becoming a pink wireframe.
  // Two builds of the fragment shader. The reveal needs `discard` to cut the
  // object off at the sweep front and blending to soften that edge — and a
  // shader that *can* discard has early-Z switched off for its whole life,
  // which on this much overdraw is most of the cost of drawing it. The reveal
  // lasts about a second; the solid build runs for the rest of the session,
  // with no discard, no blend, and depth rejecting hidden fragments before
  // they are ever shaded.
  var FRAG = function (revealing) {
    return [
    'precision mediump float;',
    'uniform vec3 uRim;',
    'uniform float uAlpha;',
    'uniform float uReveal;',
    'varying vec3 vNrm;',
    'varying vec3 vCol;',
    'varying vec3 vView;',
    'varying float vSpec;',
    'varying float vOrder;',
    'const vec3 KEY = vec3(0.42, 0.80, 0.43);',
    'const vec3 FILL = vec3(-0.62, -0.30, 0.72);',
    'void main() {',
    // Nothing past the reveal front is drawn at all, and the front is soft, so
    // the object arrives from the ground up rather than switching on.
    revealing ? '  float edge = uReveal * 1.14 - vOrder;' : '',
    revealing ? '  if (edge <= 0.0) discard;' : '',
    revealing ? '  float arrive = clamp(edge / 0.10, 0.0, 1.0);' : '  float arrive = 1.0;',
    '  vec3 n = normalize(vNrm);',
    '  vec3 v = normalize(vView);',
    '  vec3 k = normalize(KEY);',
    '  float key = max(dot(n, k), 0.0);',
    '  float fill = max(dot(n, normalize(FILL)), 0.0);',
    '  vec3 lit = vCol * (0.34 + key * 1.05 + fill * 0.26);',
    // Blinn-Phong on the key only. At this size a dark metal is mostly its
    // highlight — without one the bars read as matte plastic.
    '  float spec = pow(max(dot(n, normalize(k + v)), 0.0), 40.0) * vSpec;',
    '  lit += vec3(1.0, 0.97, 0.95) * spec * 0.85;',
    // The turning edge. On an object made entirely of thin tubes almost every
    // pixel is a grazing angle, so a rim term that would edge a solid form
    // instead floods this one — at the third power and half strength the whole
    // cage came out crimson. Raised to the sixth and cut to a sixth, it does
    // what it was for: a line of colour down the outside of the silhouette.
    '  float rim = 1.0 - max(dot(n, v), 0.0);',
    '  rim = rim * rim * rim;',
    '  rim = rim * rim;',
    '  lit = mix(lit, uRim, rim * 0.55);',
    '  gl_FragColor = vec4(lit, uAlpha * arrive);',
    '}',
    ]
      .filter(Boolean)
      .join('\n');
  };

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  if (!vs) {
    host.setAttribute('data-state', 'fallback');
    return;
  }

  function build(revealing) {
    var fs = compile(gl.FRAGMENT_SHADER, FRAG(revealing));
    if (!fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return {
      prog: prog,
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNrm: gl.getAttribLocation(prog, 'aNrm'),
      aCol: gl.getAttribLocation(prog, 'aCol'),
      aSurf: gl.getAttribLocation(prog, 'aSurf'),
      uMVP: gl.getUniformLocation(prog, 'uMVP'),
      uMV: gl.getUniformLocation(prog, 'uMV'),
      uMV3: gl.getUniformLocation(prog, 'uMV3'),
      uRim: gl.getUniformLocation(prog, 'uRim'),
      uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
      uReveal: gl.getUniformLocation(prog, 'uReveal'),
    };
  }

  var REVEAL_PASS = build(true);
  var SOLID_PASS = build(false);
  if (!REVEAL_PASS || !SOLID_PASS) {
    host.setAttribute('data-state', 'fallback');
    return;
  }
  var pass = REVEAL_PASS;

  // --------------------------------------------------------------- geometry

  // The cage is a modelled object, compiled from content/models/ by
  // scripts/build-cage.mjs. What arrives is deliberately not a finished mesh:
  // it is twenty-one distinct shapes plus seventy-nine placements of them,
  // because twenty-four bars are one bar at twenty-four rotations, and sending
  // that once rather than twenty-four times is most of the difference between
  // a one-megabyte model and a two-hundred-kilobyte one.
  //
  // They are expanded here, once, into two flat buffers — what hangs off the
  // ring, and what hangs from the ceiling. The saving is on the wire; the
  // screen still gets two draw calls.

  var MESH = window.FF_CAGE_MESH;
  if (!MESH) {
    host.setAttribute('data-state', 'fallback');
    return;
  }

  function decode(b64, Type) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Type(bytes.buffer, 0, bin.length / Type.BYTES_PER_ELEMENT);
  }

  var qpos = decode(MESH.pos, Uint16Array);
  var qnrm = decode(MESH.nrm, Int8Array);
  var qidx = decode(MESH.idx, Uint16Array);
  var shapeTable = decode(MESH.shapeTable, Uint16Array);
  var xform = decode(MESH.xform, Float32Array);
  var meta = decode(MESH.meta, Uint8Array);

  // The .mtl's diffuse values run from 0.008 to 0.042 for the metals — right
  // for a studio render, and indistinguishable from a black silhouette as a
  // small object on a pale page. Lifted toward the ink the rest of the site is
  // set in, keeping each material's relation to the others: the walnut perch
  // and the porcelain cup and floor stay the warm notes in an iron object.
  var MATERIALS = [];
  for (var mti = 0; mti < MESH.materials.length; mti++) {
    var mt = MESH.materials[mti];
    MATERIALS.push({
      colour: [0.052 + mt.kd[0] * 0.6, 0.046 + mt.kd[1] * 0.6, 0.05 + mt.kd[2] * 0.6],
      // Ns runs 40 on the walnut to 124 on the bars.
      spec: Math.min(1, mt.ns / 110),
    });
  }

  var normal = [0, 0, 0];

  function unpackNormal(index) {
    var x = qnrm[index * 2] / 127;
    var y = qnrm[index * 2 + 1] / 127;
    var z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) {
      var t = x;
      x = (1 - Math.abs(y)) * (t >= 0 ? 1 : -1);
      y = (1 - Math.abs(t)) * (y >= 0 ? 1 : -1);
    }
    var len = Math.sqrt(x * x + y * y + z * z) || 1;
    normal[0] = x / len;
    normal[1] = y / len;
    normal[2] = z / len;
  }

  // How much chain hangs above the cage, as a multiple of the cage's own
  // height. It only has to leave the top of the hero — everything past that is
  // drawn and never seen, and a link is a torus of six hundred and eighty
  // triangles, so the difference is not free: the 1.64 carried over from the
  // drawn cage this replaces put half of every frame's triangles into chain
  // that was off the page.
  //
  // Measured, not guessed. The run reaches the top edge at every layout down
  // to about 0.85, and falls short of the two narrowest below that; 1.15 keeps
  // a third of the object's height in hand for a layout not tested here.
  var CHAIN_RATIO = 1.15;
  var CAGE_TALL = MESH.cageTop - MESH.cageBottom;
  // The model is authored standing on the floor — its whole height is above
  // y = 0. The fit below hangs the object about the origin and measures half
  // its height either side of it, so the rig is recentred as it is expanded:
  // otherwise the cage sits a full half-height high in its cell and the chain
  // above it leaves the top of the page entirely.
  var CENTRE_Y = MESH.cageBottom + CAGE_TALL / 2;
  var LINK_PERIOD = MESH.linkPitch * 2;
  var MODEL_TOP = MESH.lo[1] + MESH.span[1];
  // Links alternate the plane they lie in, so the run repeats two at a time or
  // every other link comes out flat to the one below it.
  var EXTRA_PAIRS = Math.max(
    0,
    Math.round((CHAIN_RATIO * CAGE_TALL - (MODEL_TOP - MESH.cageTop)) / LINK_PERIOD)
  );
  var CHAIN_ADDED = EXTRA_PAIRS * LINK_PERIOD;
  // The fixing point above the page. The whole assembly leans from here.
  var CHAIN_TOP = MODEL_TOP + CHAIN_ADDED - CENTRE_Y;

  // Order runs 0 at the tray to 1 at the ceiling plate, so the reveal walks the
  // object on from the ground up. Solved against the extended chain rather than
  // the model's own height, or the cage would be finished before the sweep had
  // left the floor.
  var ORDER_BASE = MESH.cageBottom - CENTRE_Y;

  function orderOf(y) {
    return (y - ORDER_BASE) / (CHAIN_TOP - ORDER_BASE);
  }

  // Built into plain arrays: the totals are not known until the chain has been
  // extended, and the extension depends on the model's own measurements.
  function Rig() {
    this.vert = [];
    this.index = [];
    this.count = 0;
    this.half = 0;
  }

  Rig.prototype.add = function (instance, lift) {
    var shape = meta[instance * 3];
    var material = MATERIALS[meta[instance * 3 + 1]] || MATERIALS[0];
    var vo = shapeTable[shape * 4];
    var vc = shapeTable[shape * 4 + 1];
    var io = shapeTable[shape * 4 + 2];
    var ic = shapeTable[shape * 4 + 3];
    var m = instance * 12;
    var base = this.count;

    for (var v = 0; v < vc; v++) {
      var q = (vo + v) * 3;
      var px = MESH.lo[0] + (qpos[q] / 65535) * MESH.span[0];
      var py = MESH.lo[1] + (qpos[q + 1] / 65535) * MESH.span[1];
      var pz = MESH.lo[2] + (qpos[q + 2] / 65535) * MESH.span[2];

      var wx = xform[m] * px + xform[m + 3] * py + xform[m + 6] * pz + xform[m + 9];
      var wy =
        xform[m + 1] * px + xform[m + 4] * py + xform[m + 7] * pz + xform[m + 10] + lift - CENTRE_Y;
      var wz = xform[m + 2] * px + xform[m + 5] * py + xform[m + 8] * pz + xform[m + 11];

      unpackNormal(vo + v);
      // These placements are rotations and translations only — no scale, no
      // shear — so the rotation applies to the normal unchanged and there is
      // no inverse transpose to take.
      var nx = xform[m] * normal[0] + xform[m + 3] * normal[1] + xform[m + 6] * normal[2];
      var ny = xform[m + 1] * normal[0] + xform[m + 4] * normal[1] + xform[m + 7] * normal[2];
      var nz = xform[m + 2] * normal[0] + xform[m + 5] * normal[1] + xform[m + 8] * normal[2];

      this.vert.push(
        wx, wy, wz,
        nx, ny, nz,
        material.colour[0], material.colour[1], material.colour[2],
        material.spec, orderOf(wy)
      );

      var reach = Math.abs(wx) > Math.abs(wz) ? Math.abs(wx) : Math.abs(wz);
      if (reach > this.half) this.half = reach;
    }

    // The compiler writes each shape's indices relative to its own first
    // vertex, so they rebase onto wherever this copy landed in the rig.
    for (var i = 0; i < ic; i++) this.index.push(base + qidx[io + i]);
    this.count += vc;
  };

  Rig.prototype.upload = function () {
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vert), gl.STATIC_DRAW);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.index), gl.STATIC_DRAW);
    this.elements = this.index.length;
    // A 16-bit index cannot address past this, and the chain is the buffer
    // that grows: say so rather than drawing a scrambled object.
    if (this.count > 65535) throw new Error('cage rig exceeds a 16-bit index');
    this.vert = null;
    this.index = null;
    return this;
  };

  var cage = new Rig();
  var chain = new Rig();

  // Everything that hangs off the ring goes into the cage rig as it stands.
  // The chain divides again: the links stay where the model put them, and the
  // hook and plate at the top are lifted by however much chain is about to be
  // inserted underneath them.
  var links = [];
  for (var ii = 0; ii < MESH.instances; ii++) {
    if (!meta[ii * 3 + 2]) {
      cage.add(ii, 0);
      continue;
    }
    var isLink = MESH.names[ii].indexOf('chainLink') === 0;
    chain.add(ii, isLink ? 0 : CHAIN_ADDED);
    if (isLink) links.push(ii);
  }

  // The model's six links continue upward on their own pitch until they meet
  // the lifted hook. Repeating the lowest two keeps the alternation in step
  // with the run already there — a link lies in one of two planes, and taking
  // an odd number would leave every second one flat to its neighbour.
  //
  // Sorted numerically: Array.sort compares as strings by default, which would
  // order instance 10 before instance 9 and take the repeat off the wrong pair.
  links.sort(function (a, b) {
    return a - b;
  });
  for (var p = 0; p < EXTRA_PAIRS && links.length >= 2; p++) {
    for (var k = 0; k < 2; k++) {
      chain.add(links[k], links.length * MESH.linkPitch + p * LINK_PERIOD);
    }
  }

  cage.upload();
  chain.upload();

  var STRIDE = 11 * 4;

  function bindRig(rig) {
    gl.bindBuffer(gl.ARRAY_BUFFER, rig.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rig.ibo);
    gl.enableVertexAttribArray(pass.aPos);
    gl.vertexAttribPointer(pass.aPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(pass.aNrm);
    gl.vertexAttribPointer(pass.aNrm, 3, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(pass.aCol);
    gl.vertexAttribPointer(pass.aCol, 3, gl.FLOAT, false, STRIDE, 24);
    gl.enableVertexAttribArray(pass.aSurf);
    gl.vertexAttribPointer(pass.aSurf, 2, gl.FLOAT, false, STRIDE, 36);
  }

  // The point the cage turns about: where the hanging ring bears on the lowest
  // link, measured off the model rather than written down beside it.
  var HOOK_Y = MESH.pivot - CENTRE_Y;
  // ------------------------------------------------------------------ maths

  // WebGL matrices are column-major: m[col * 4 + row]. Every helper follows
  // that, and multiply(a, b) applies b first, then a.

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    var m = new Array(16).fill(0);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  }

  function multiply(a, b) {
    var o = new Array(16);
    for (var col = 0; col < 4; col++) {
      for (var row = 0; row < 4; row++) {
        o[col * 4 + row] =
          a[row] * b[col * 4] +
          a[4 + row] * b[col * 4 + 1] +
          a[8 + row] * b[col * 4 + 2] +
          a[12 + row] * b[col * 4 + 3];
      }
    }
    return o;
  }

  function rotateY(a) {
    var c = Math.cos(a);
    var s = Math.sin(a);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  }

  function rotateX(a) {
    var c = Math.cos(a);
    var s = Math.sin(a);
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  }

  function rotateZ(a) {
    var c = Math.cos(a);
    var s = Math.sin(a);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function translate(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }

  // A rig is a bound buffer pair and one modelview. The normal matrix is the
  // rotation block of that modelview, taken straight rather than as an inverse
  // transpose: every transform here is a rotation and a translation, and for
  // those two the rotation block already is its own inverse transpose.
  function drawRig(rig, proj, mv) {
    bindRig(rig);
    gl.uniformMatrix4fv(pass.uMVP, false, new Float32Array(multiply(proj, mv)));
    gl.uniformMatrix4fv(pass.uMV, false, new Float32Array(mv));
    gl.uniformMatrix3fv(
      pass.uMV3,
      false,
      new Float32Array([mv[0], mv[1], mv[2], mv[4], mv[5], mv[6], mv[8], mv[9], mv[10]])
    );
    gl.drawElements(gl.TRIANGLES, rig.elements, gl.UNSIGNED_SHORT, 0);
  }

  // ----------------------------------------------------------------- render

  // Capped below the display's own ratio. The cage is thin geometry over a
  // large area, so the cost is in pixels shaded rather than vertices, and at
  // 1.5 the difference is invisible while the fill cost is halved against 2.
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var width = 0;
  var height = 0;

  // How far the cage reaches from its own centre. Measured off the vertices
  // that were actually written into the rig, not written down beside the
  // model: the fit below reads it, so a stale figure is a cage that no longer
  // fills the cell it is given — and the model can be replaced without anyone
  // remembering to come back here.
  var CAGE_HALF = cage.half;
  // Half the vertical field of view, as used by the projection below.
  var TAN_HALF_FOV = Math.tan(0.4);

  // The hero reserves an empty cell for the cage — beside the wordmark on a
  // wide screen, above it on a narrow one — and the renderer fits the object
  // into whatever that cell turns out to be. Nothing about the position is
  // written down twice: the layout decides, in CSS, and this reads the answer.
  // It is also why no bar can ever cross a letter. The cell is empty.
  var placed = null;

  // The display face lands after first paint and the hero reflows when it
  // does. Re-solve then, or the cage is fitted to a fallback's metrics.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      placed = null;
    });
  }

  // The least chain that still reads as one. Proportional to the object, or a
  // small cage in a narrow column gets a run of links longer than itself.
  function minChain(half) {
    var want = half * 1.1;
    return want < 55 ? 55 : want > 130 ? 130 : want;
  }

  function solveSlot() {
    var slot = document.querySelector('.hero__slot');
    if (!slot) return null;
    var h = host.getBoundingClientRect();
    var r = slot.getBoundingClientRect();
    if (r.width < 40 || r.height < 90 || h.height < 1) return null;
    // Pixels per world unit: fit to the cell on whichever axis binds first,
    // leaving the cage short of the cell's top so there is chain to see.
    var ppu = Math.min((r.height * 0.72) / CAGE_TALL, (r.width * 0.9) / (CAGE_HALF * 2));
    var half = (CAGE_TALL * ppu) / 2;

    // Where it hangs to. The cell runs the height of the whole type column —
    // eyebrow down to the buttons — and centring in that puts the cage level
    // with the running text rather than with the wordmark, which is the thing
    // it is meant to be standing next to. Hung on the wordmark's baseline
    // instead, so its upper half sits beside the heading.
    var centre = r.top + r.height * 0.6;
    var title = document.querySelector('.hero__title');
    if (title) {
      var t = title.getBoundingClientRect();
      // Only when the two are actually side by side. Stacked, the wordmark is
      // below the cell and anchoring to it would drop the cage onto the type.
      if (t.right <= r.left + 8) centre = t.bottom;
    }
    // Kept clear of the top of the frame, and inside the cell at the bottom.
    var lowest = r.bottom - half;
    var highest = h.top + minChain(half) + half;
    if (centre > lowest) centre = lowest;
    if (centre < highest) centre = highest;

    return {
      // The projection's half-height at distance d is tan(fovy / 2) * d, so
      // the distance that yields the wanted scale falls straight out of it.
      depth: h.height / (2 * TAN_HALF_FOV * ppu),
      offsetX: (r.left + r.width / 2 - (h.left + h.width / 2)) / ppu,
      // World y up against screen y down.
      offsetY: (h.top + h.height / 2 - centre) / ppu,
    };
  }

  function resize() {
    var rect = host.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return;
    // Solved once per size, not per frame: the solve reads layout, and reading
    // layout inside the render loop is how a smooth canvas turns into a stutter.
    placed = null;
    width = w;
    height = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Blending is only for the reveal's soft front edge. The cage itself is
  // opaque metal, and once it has finished arriving the blend comes off: it
  // costs a read-modify-write on every fragment, and on a self-overlapping
  // object drawn in buffer order it was never correct anyway — a bar behind
  // another could be blended over the one in front of it.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // Depth testing, now that the bars are opaque metal rather than a
  // transparent lattice. It does two things: a bar in front hides the one
  // behind it, which is most of what makes a see-through object read as solid;
  // and it stops the ends of adjacent ring segments blending over each other,
  // which was showing up as a bead along every hoop.
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 0);
  // The brand's crimson on the turning edges only. The cage in the photograph
  // beside this is black metal; a pink one next to it reads as a diagram of a
  // cage rather than as one. Every other colour on the object comes from the
  // model's own materials.
  function usePass(next) {
    if (pass === next) return;
    pass = next;
    gl.useProgram(pass.prog);
    gl.uniform3f(pass.uRim, 0.62, 0.07, 0.11);
    gl.uniform1f(pass.uAlpha, 1);
    if (pass === REVEAL_PASS) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
  }

  pass = SOLID_PASS;
  usePass(REVEAL_PASS);

  // Backfaces are dropped. Every part of this model is a closed solid — a
  // tube, a ring, a turned finial — so the inside of one is never visible, and
  // at twenty-four bars and twenty-four ribs the far wall of each is half of
  // all the shading being done. Seeing through the cage is unaffected: the far
  // side of it is a different tube, and still faces the camera.
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // ------------------------------------------------------------- suspension

  // A damped harmonic swing on two axes. Impulses come from the pointer and
  // from scrolling; the spring returns it to rest, so it never spins away.
  var swing = { x: 0, vx: 0, z: 0, vz: 0, spin: 0, vspin: 0 };
  var STIFF = 5.2;
  var DAMP = 0.86;
  // How much of the cage's swing the chain above it takes up. Small, because
  // the arm is six units where the cage's is one and a half: the same angle
  // would throw the whole object out of the cell it hangs in.
  var CHAIN_FOLLOW = 0.2;
  var LEAN_LIMIT = 0.042;

  function clampAngle(a) {
    return a < -LEAN_LIMIT ? -LEAN_LIMIT : a > LEAN_LIMIT ? LEAN_LIMIT : a;
  }

  // How far the cage may swing on its own hook.
  var SWING_LIMIT = 0.16;

  function capSwing(o, a, v) {
    if (o[a] > SWING_LIMIT) {
      if (o[v] > 0) o[v] = 0;
      return SWING_LIMIT;
    }
    if (o[a] < -SWING_LIMIT) {
      if (o[v] < 0) o[v] = 0;
      return -SWING_LIMIT;
    }
    return o[a];
  }

  var pointerX = 0;
  var pointerY = 0;
  var lastScroll = window.scrollY || 0;
  // Absolute scroll position drives a slow turn, so the cage shows a different
  // face as the hero leaves. The swing impulses below sit on top of it. This
  // is the part that works identically on a phone, where there is no pointer.
  var scrollTurn = 0;
  var scrollTurnTarget = 0;

  if (!reduced) {
    window.addEventListener(
      'pointermove',
      function (e) {
        var nx = (e.clientX / window.innerWidth - 0.5) * 2;
        var ny = (e.clientY / window.innerHeight - 0.5) * 2;
        swing.vz += (nx - pointerX) * 0.85;
        swing.vx += (ny - pointerY) * 0.62;
        pointerX = nx;
        pointerY = ny;
      },
      { passive: true }
    );

    window.addEventListener(
      'scroll',
      function () {
        var y = window.scrollY || 0;
        // Scrolling nudges it the way a passing draught would.
        swing.vz += Math.max(-40, Math.min(40, y - lastScroll)) * 0.0016;
        lastScroll = y;
        scrollTurnTarget = (y / Math.max(1, window.innerHeight)) * 0.85;
      },
      { passive: true }
    );
  }

  function step(dt) {
    swing.vx += -STIFF * swing.x * dt;
    swing.vz += -STIFF * swing.z * dt;
    swing.vx *= Math.pow(DAMP, dt * 60 * 0.016);
    swing.vz *= Math.pow(DAMP, dt * 60 * 0.016);
    swing.x += swing.vx * dt;
    swing.z += swing.vz * dt;

    // Stopped at the angle a chain of this length would allow. Past it the
    // hook rotates far enough inside the link to come out of it, and a hard
    // flick of the pointer could reach that in one frame. Hitting the limit
    // kills the velocity into it rather than reflecting: this is a chain going
    // taut, not a ball bouncing.
    swing.x = capSwing(swing, 'x', 'vx');
    swing.z = capSwing(swing, 'z', 'vz');

    // The spin has no spring: it drifts to a stop and stays where it lands, so
    // the cage is never caught in the same pose twice.
    swing.vspin *= Math.pow(0.985, dt * 60);
    swing.spin += swing.vspin * dt;
  }

  var last = performance.now();
  var t0 = last;

  // 0 to 1 over BUILD seconds on first paint, then held. Eased so it starts
  // quickly and settles, rather than arriving at a constant rate.
  var BUILD = 1.7;
  var built = reduced ? 1 : 0;

  function draw(now) {
    resize();
    if (!width || !height) return;

    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!reduced) step(dt);

    var elapsed = reduced ? 0 : (now - t0) / 1000;
    // A slow idle breath, so it is never perfectly still even at rest.
    var idle = reduced ? 0 : Math.sin(elapsed * 0.62) * 0.022;

    // Where the cage hangs is solved from the hero as laid out — see
    // solveSlot. These are the fallback for a hero without the cell to
    // measure: centred, and far enough back to sit clear of the type.
    var depth = 10.5;
    var offsetX = 0;
    var offsetY = -0.4;

    if (placed === null) placed = solveSlot() || false;
    if (placed) {
      depth = placed.depth;
      offsetX = placed.offsetX;
      offsetY = placed.offsetY;
    }

    var aspect = width / height;
    var proj = perspective(0.8, aspect, 0.1, 40);
    if (built < 1) {
      built = Math.min(1, (now - t0) / 1000 / BUILD);
      usePass(REVEAL_PASS);
      // easeOutCubic
      gl.uniform1f(pass.uReveal, 1 - Math.pow(1 - built, 3));
    } else {
      usePass(SOLID_PASS);
    }

    // Rotated where it is actually held: the line where the hanging ring bears
    // on the lowest link. Measured off the model by the compiler rather than
    // written down here, so replacing the model moves the joint with it.
    var pivot = HOOK_Y;
    scrollTurn += (scrollTurnTarget - scrollTurn) * Math.min(1, dt * 4);
    // Rotate about a point, not the origin: translate the pivot to the origin
    // FIRST, then rotate, then put it back. multiply(a, b) applies b then a, so
    // the inward translation has to be the innermost term. It used to be the
    // outer one, which pairs with the outward translation and cancels — the
    // cage was turning about its own middle for as long as this has existed.
    // Invisible until something was attached to the hook.
    var spin = multiply(
      rotateZ(swing.z + idle),
      multiply(rotateX(swing.x), rotateY(swing.spin + scrollTurn + elapsed * 0.05))
    );
    var hang = multiply(spin, translate(0, -pivot, 0));

    // Two pendulums, not one. The chain leans from its fixing above the page —
    // a long arm, so a small angle and a slow, wide arc — and the cage adds a
    // second, faster swing on its own hook. A chain that stayed rigid while
    // the thing hanging off it moved was the one part of this that read as a
    // drawing rather than an object.
    //
    // Both are the same rotation about the same point, so the cage cannot come
    // off the hook however far either swings: the chain's transform is applied
    // to the cage as well, and the hook travels with the last link.
    var lean = reduced ? 0 : Math.sin(elapsed * 0.31 + 0.9) * 0.009;
    var leanZ = clampAngle(swing.z * CHAIN_FOLLOW + lean);
    var leanX = clampAngle(swing.x * CHAIN_FOLLOW);
    var ceiling = multiply(
      translate(0, CHAIN_TOP, 0),
      multiply(rotateZ(leanZ), multiply(rotateX(leanX), translate(0, -CHAIN_TOP, 0)))
    );

    var model = multiply(ceiling, multiply(translate(0, pivot, 0), hang));
    var place = translate(offsetX, offsetY, -depth);
    var tilt = rotateX(-0.06);
    var mv = multiply(place, multiply(tilt, model));
    var mvChain = multiply(place, multiply(tilt, ceiling));

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawRig(cage, proj, mv);
    drawRig(chain, proj, mvChain);
  }

  var running = false;
  var frame = 0;

  function loop(now) {
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function play() {
    if (running || reduced) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(frame);
  }

  window.addEventListener('resize', function () {
    if (reduced || !running) draw(performance.now());
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
    else play();
  });

  if (reduced) {
    draw(performance.now());
  } else if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      function (entries) {
        if (entries[0].isIntersecting) play();
        else pause();
      },
      { threshold: 0 }
    ).observe(host);
  } else {
    play();
  }
})();
