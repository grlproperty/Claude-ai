/**
 * The cage.
 *
 * A hanging birdcage rendered in WebGL behind the hero. It is the brand's own
 * motif rather than an abstract shader: the campaign imagery puts a cage
 * around the subject, and the site puts the same object behind the masthead.
 *
 * Written against raw WebGL rather than a library. The scene is a few hundred
 * segments, so a 3D framework would be almost entirely dead weight on a page
 * whose point is that it loads fast and asks nothing of anyone else.
 *
 * Two things here are worth knowing before changing them.
 *
 * The bars are not gl.LINES. Every browser clamps lineWidth to 1 physical
 * pixel, which is why a line-drawn wireframe reads as a diagram rather than an
 * object — no weight, no taper, and a hairline that vanishes on a dense
 * screen. Each segment is instead a quad expanded in the vertex shader along
 * the screen-space normal of the segment, so bars have real thickness, thin
 * with distance, and antialias on their own edges.
 *
 * It hangs rather than spins. A constantly rotating object reads as a 3D demo;
 * a suspended one reads as a thing in a room. The motion is a damped pendulum
 * on two axes, pushed by the pointer and by scrolling, so it always settles
 * back to rest instead of turning forever.
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

  // aOther is the segment's far endpoint. Both ends are projected so the
  // expansion direction can be computed in screen space, which is the only
  // place a constant pixel width means anything.
  var VERT = [
    'attribute vec3 aPos;',
    'attribute vec3 aOther;',
    'attribute vec2 aSpec;', // x: side (-1/+1), y: base width in px
    'attribute float aOrder;', // 0 at the base, 1 at the top of the hook
    'uniform mat4 uMVP;',
    'uniform vec2 uHalfRes;',
    // mediump explicitly. A uniform shared by both stages must match precision,
    // and float defaults to highp in a vertex shader but is declared mediump
    // below in the fragment one. The mismatch fails the link, not the compile,
    // so both shaders report themselves fine and the program never runs.
    'uniform mediump vec2 uRange;',
    'varying float vDist;',
    'varying float vSide;',
    'varying float vOrder;',
    'varying vec2 vNrm;',
    'void main(){',
    '  vOrder = aOrder;',
    '  vec4 p = uMVP * vec4(aPos, 1.0);',
    '  vec4 q = uMVP * vec4(aOther, 1.0);',
    '  vDist = p.w;',
    '  vec2 ps = (p.xy / p.w) * uHalfRes;',
    '  vec2 qs = (q.xy / q.w) * uHalfRes;',
    '  vec2 d = qs - ps;',
    '  float len = length(d);',
    // A degenerate segment would normalise to NaN and take the whole draw with
    // it, so fall back to a fixed axis rather than dividing by zero.
    '  vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);',
    '  vec2 nrm = vec2(-dir.y, dir.x);',
    // Bars thin with distance but never to nothing: a far bar that disappears
    // takes the cage's volume with it.
    '  float k = clamp((p.w - uRange.x) / max(uRange.y - uRange.x, 0.001), 0.0, 1.0);',
    '  float w = aSpec.y * mix(1.0, 0.5, k);',
    '  p.xy += (nrm * aSpec.x * w / uHalfRes) * p.w;',
    '  vSide = aSpec.x;',
    '  vNrm = nrm;',
    '  gl_Position = p;',
    '}',
  ].join('\n');

  // Two fades. Across the quad, so the bar has soft edges of its own rather
  // than relying on multisampling. Into depth, so the far side of the cage
  // falls back — which is what makes a wireframe legible as a volume.
  // Each bar is a flat ribbon, but it is shaded as though it were round: the
  // across-the-width coordinate is exactly a cylinder's cross-section, so a
  // normal can be rebuilt from it and lit. That is what separates a drawn line
  // from a bar of metal, and it costs one square root.
  var FRAG = [
    'precision mediump float;',
    'uniform vec3 uMetal;',
    'uniform vec3 uRim;',
    'uniform float uAlpha;',
    'uniform vec2 uRange;',
    'uniform float uReveal;',
    'varying float vDist;',
    'varying float vSide;',
    'varying float vOrder;',
    'varying vec2 vNrm;',
    'void main(){',
    '  if (vOrder > uReveal) discard;',
    '  float lead = 1.0 - smoothstep(0.0, 0.09, uReveal - vOrder);',
    // Cylinder normal across the ribbon. z is the part facing the viewer.
    '  float face = sqrt(max(0.0, 1.0 - vSide * vSide));',
    '  vec3 N = normalize(vec3(vNrm * vSide, face));',
    '  vec3 L = normalize(vec3(-0.45, 0.72, 0.53));',
    '  float diff = max(dot(N, L), 0.0);',
    // A hard, narrow highlight is what reads as metal; a broad one reads as
    // plastic. The rim term picks out the turning edges of every bar, which is
    // where a wire cage catches light in the photograph beside it.
    '  float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 42.0);',
    '  float rim = pow(1.0 - face, 2.4);',
    '  vec3 col = uMetal * (0.30 + 0.70 * diff) + uRim * rim * 0.55 + vec3(spec) * 0.65;',
    '  col += lead * 0.5;',
    // The far side of the cage falls back rather than disappearing, which is
    // what lets a see-through object still read as having volume.
    '  float near = 1.0 - smoothstep(uRange.x, uRange.y, vDist);',
    '  float depth = mix(0.42, 1.0, near);',
    // Antialias the ribbon's own edges; multisampling will not do it here
    // because the geometry is a quad, not a line.
    '  float edge = 1.0 - smoothstep(0.78, 1.0, abs(vSide));',
    '  gl_FragColor = vec4(col, uAlpha * depth * edge * (1.0 + lead * 0.5));',
    '}',
  ].join('\n');

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
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    host.setAttribute('data-state', 'fallback');
    return;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    host.setAttribute('data-state', 'fallback');
    return;
  }
  gl.useProgram(prog);

  var aPos = gl.getAttribLocation(prog, 'aPos');
  var aOther = gl.getAttribLocation(prog, 'aOther');
  var aSpec = gl.getAttribLocation(prog, 'aSpec');
  var aOrder = gl.getAttribLocation(prog, 'aOrder');
  var uMVP = gl.getUniformLocation(prog, 'uMVP');
  var uMetal = gl.getUniformLocation(prog, 'uMetal');
  var uRim = gl.getUniformLocation(prog, 'uRim');
  var uAlpha = gl.getUniformLocation(prog, 'uAlpha');
  var uRange = gl.getUniformLocation(prog, 'uRange');
  var uHalfRes = gl.getUniformLocation(prog, 'uHalfRes');
  var uReveal = gl.getUniformLocation(prog, 'uReveal');

  // --------------------------------------------------------------- geometry

  var BARS = 26;
  var STEPS = 20;
  var HEIGHT = 2.25;
  var RADIUS = 0.95;

  // Profile from base (t=0) to crown (t=1): a straight wall with the faintest
  // barrel, then a dome that closes to the finial. A sine bow reads as a
  // globe; a birdcage has walls and a shoulder where they stop.
  var BODY = 0.7;

  function radiusAt(t) {
    if (t <= BODY) return RADIUS * (0.96 + 0.04 * Math.sin((t / BODY) * Math.PI));
    var k = (t - BODY) / (1 - BODY);
    return RADIUS * Math.cos(k * Math.PI * 0.5) * 0.96;
  }

  // Vertical extent of everything drawn, hook included.
  var LOW = -HEIGHT / 2 - 0.14;
  var HIGH = HEIGHT / 2 + 0.42;

  var pos = [];
  var other = [];
  var spec = [];
  var order = [];

  // The cage builds over the first 62% of the wipe; the chain climbs out of
  // the hook over the rest. Anything higher than the chain's reveal span — the
  // length that only exists to run off the top of a tall viewport — arrives
  // with the last link that is actually on screen rather than never.
  var CHAIN_REVEAL = 3.2;
  var orderOf = function (y) {
    return ((y - LOW) / (HIGH - LOW)) * 0.62;
  };

  // Bar widths are authored in relative terms and scaled here. Below about two
  // pixels a round bar has nowhere to put its highlight, and the shading that
  // makes it read as metal degrades into noise.
  var WIDTH_SCALE = 1.75;

  /** One segment becomes two triangles: six vertices, alternating sides. */
  function seg(x0, y0, z0, x1, y1, z1, width) {
    width *= WIDTH_SCALE;
    var a = [x0, y0, z0];
    var b = [x1, y1, z1];
    var corners = [
      [a, b, -1],
      [a, b, 1],
      [b, a, -1],
      [b, a, 1],
      [a, b, 1],
      [b, a, -1],
    ];
    for (var i = 0; i < 6; i++) {
      var v = corners[i];
      pos.push(v[0][0], v[0][1], v[0][2]);
      other.push(v[1][0], v[1][1], v[1][2]);
      spec.push(v[2], width);
      // Height, normalised so the build reads bottom to top rather than in the
      // order the arrays happen to have been filled. The mapping is swapped
      // between the cage and the chain so each gets its own share of the wipe.
      order.push(orderOf(v[0][1]));
    }
  }

  function ring(y, r, width, n) {
    for (var i = 0; i < n; i++) {
      var a0 = (i / n) * Math.PI * 2;
      var a1 = ((i + 1) / n) * Math.PI * 2;
      seg(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r, width);
    }
  }

  // Vertical bars. Slightly heavier than the rings, as they are on a real
  // cage: the bars carry the weight and the rings only hold them apart.
  for (var b = 0; b < BARS; b++) {
    var ang = (b / BARS) * Math.PI * 2;
    var c = Math.cos(ang);
    var s = Math.sin(ang);
    // Every other bar stops at the shoulder. A real cage does not carry every
    // upright over the dome — they would collide at the finial — and the
    // alternation is most of what makes the crown read as built rather than
    // extruded.
    var full = b % 2 === 0;
    for (var st = 0; st < STEPS; st++) {
      var t0 = st / STEPS;
      var t1 = (st + 1) / STEPS;
      if (!full && t0 >= BODY) break;
      var r0 = radiusAt(t0);
      var r1 = radiusAt(t1);
      // Tapered: heavier at the base where the load is, finer into the dome.
      var w = 1.9 - 0.8 * t0;
      seg(c * r0, -HEIGHT / 2 + HEIGHT * t0, s * r0, c * r1, -HEIGHT / 2 + HEIGHT * t1, s * r1, w);
    }
  }

  // Rings up the body, then the base: a floor ring and the lip below it, which
  // is what stops the bars reading as trailing off into nothing.
  for (var k = 0; k < 6; k++) {
    var tk = 0.09 + k * 0.115;
    ring(-HEIGHT / 2 + HEIGHT * tk, radiusAt(tk), 1.05, 108);
  }
  // The base: a heavy floor ring, then the moulding stepping in underneath it.
  ring(-HEIGHT / 2, radiusAt(0), 2.1, 108);
  ring(-HEIGHT / 2 - 0.05, radiusAt(0) * 1.02, 1.5, 108);
  ring(-HEIGHT / 2 - 0.11, radiusAt(0) * 0.94, 1.4, 108);
  ring(-HEIGHT / 2 - 0.17, radiusAt(0) * 0.78, 1.2, 88);
  ring(-HEIGHT / 2 - 0.22, radiusAt(0) * 0.55, 1.1, 72);

  // Cross-bracing under the floor, which is how a cage of this shape is
  // actually held together and reads as having a bottom rather than an edge.
  for (var x = 0; x < 4; x++) {
    var xa = (x / 4) * Math.PI;
    var xr = radiusAt(0) * 0.94;
    seg(Math.cos(xa) * xr, -HEIGHT / 2 - 0.11, Math.sin(xa) * xr, -Math.cos(xa) * xr, -HEIGHT / 2 - 0.11, -Math.sin(xa) * xr, 1.0);
  }

  // The shoulder, where the wall becomes the dome.
  ring(-HEIGHT / 2 + HEIGHT * BODY, radiusAt(BODY), 1.9, 108);
  ring(-HEIGHT / 2 + HEIGHT * (BODY + 0.015), radiusAt(BODY) * 0.985, 1.2, 108);

  // Two rings up the dome, so the crown has structure instead of being a fan
  // of unbroken curves.
  ring(-HEIGHT / 2 + HEIGHT * (BODY + (1 - BODY) * 0.34), radiusAt(BODY + (1 - BODY) * 0.34), 1.0, 96);
  ring(-HEIGHT / 2 + HEIGHT * (BODY + (1 - BODY) * 0.66), radiusAt(BODY + (1 - BODY) * 0.66), 0.95, 88);

  // The perch. One horizontal bar across the middle, and the detail that makes
  // this a birdcage rather than a lantern.
  var perchY = -HEIGHT / 2 + HEIGHT * 0.34;
  seg(-radiusAt(0.34) * 0.98, perchY, 0, radiusAt(0.34) * 0.98, perchY, 0, 2.2);
  // The collars where the perch meets the wall.
  for (var pc = -1; pc <= 1; pc += 2) {
    var px = radiusAt(0.34) * 0.98 * pc;
    seg(px, perchY - 0.05, 0, px, perchY + 0.05, 0, 1.6);
  }

  // Finial and hook above the crown, so it reads as hung rather than floating.
  var crown = HEIGHT / 2;
  // The rod runs the whole way to the centre of the hook's arc. Stopping it at
  // the knob leaves the hook floating unattached above the cage.
  seg(0, crown - 0.02, 0, 0, crown + 0.3, 0, 1.8);
  ring(crown + 0.16, 0.075, 1.4, 40);
  for (var h = 0; h < 12; h++) {
    var ha = Math.PI * (0.15 + (h / 12) * 0.9);
    var hb = Math.PI * (0.15 + ((h + 1) / 12) * 0.9);
    seg(
      Math.cos(ha) * 0.11,
      crown + 0.3 + Math.sin(ha) * 0.11,
      0,
      Math.cos(hb) * 0.11,
      crown + 0.3 + Math.sin(hb) * 0.11,
      0,
      1.5
    );
  }

  // Everything up to here is the cage, and it swings on its hook. The chain
  // above it does not — it is fixed to the top of the page — so the two are
  // drawn with different matrices, and the split is recorded here.
  var CAGE_VERTS = pos.length / 3;

  // ----------------------------------------------------------------- chain
  //
  // The cage hangs from the top of the site rather than floating in the middle
  // of it. A run of interlocking links climbs from the hook and off the top of
  // the frame, passing behind the masthead, so the eye reads a fixing point
  // somewhere above the page.
  //
  // Links alternate plane — one across, the next through — which is what makes
  // a chain read as a chain instead of a stack of rings. Each is an ellipse,
  // not a stadium; at the size these are drawn the difference is a pixel.
  //
  // The run is longer than any viewport needs, so the chain reaches the top of
  // the screen without the geometry being rebuilt every time the window
  // changes size. Not much longer, though: measured across the layouts, the
  // hungriest asks for about three world units of chain, and this is six.
  // Every link past that is fill a software renderer still pays for before
  // clipping throws it away.
  var LINK_H = 0.115;
  var LINK_W = 0.058;
  var LINK_PITCH = LINK_H * 1.5;
  var LINKS = 34;
  var LINK_SEGS = 14;
  var chainBase = HEIGHT / 2 + 0.3 + LINK_H;

  orderOf = function (y) {
    return 0.62 + Math.min(1, (y - HIGH) / CHAIN_REVEAL) * 0.38;
  };

  for (var ci = 0; ci < LINKS; ci++) {
    var cy = chainBase + ci * LINK_PITCH;
    // The first link has to pass through the hook's arc, which lies in the
    // x/y plane, so it is set in the other one.
    var across = ci % 2 === 1;
    for (var cs = 0; cs < LINK_SEGS; cs++) {
      var ca0 = (cs / LINK_SEGS) * Math.PI * 2;
      var ca1 = ((cs + 1) / LINK_SEGS) * Math.PI * 2;
      var lu0 = Math.cos(ca0) * LINK_W;
      var lv0 = Math.sin(ca0) * LINK_H;
      var lu1 = Math.cos(ca1) * LINK_W;
      var lv1 = Math.sin(ca1) * LINK_H;
      if (across) seg(lu0, cy + lv0, 0, lu1, cy + lv1, 0, 1.7);
      else seg(0, cy + lv0, lu0, 0, cy + lv1, lu1, 1.7);
    }
  }

  function attrib(loc, data, size) {
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  attrib(aPos, pos, 3);
  attrib(aOther, other, 3);
  attrib(aSpec, spec, 2);
  attrib(aOrder, order, 1);

  var COUNT = pos.length / 3;

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

  // ----------------------------------------------------------------- render

  // Capped below the display's own ratio. The cage is thin geometry over a
  // large area, so the cost is in pixels shaded rather than vertices, and at
  // 1.5 the difference is invisible while the fill cost is halved against 2.
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var width = 0;
  var height = 0;

  // How far the cage reaches from its own centre, in world units, at the size
  // it is built. Measured off the drawn geometry rather than guessed, so the
  // fit solved below stays true if the cage is ever rebuilt.
  var CAGE_HALF = 1.05;
  var CAGE_TALL = 2.8;
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

  function solveSlot() {
    var slot = document.querySelector('.hero__slot');
    if (!slot) return null;
    var h = host.getBoundingClientRect();
    var r = slot.getBoundingClientRect();
    if (r.width < 40 || r.height < 90 || h.height < 1) return null;
    // Pixels per world unit: fit to the cell on whichever axis binds first,
    // leaving the cage short of the cell's top so there is chain to see.
    var ppu = Math.min((r.height * 0.72) / CAGE_TALL, (r.width * 0.9) / (CAGE_HALF * 2));
    return {
      // The projection's half-height at distance d is tan(fovy / 2) * d, so
      // the distance that yields the wanted scale falls straight out of it.
      depth: h.height / (2 * TAN_HALF_FOV * ppu),
      offsetX: (r.left + r.width / 2 - (h.left + h.width / 2)) / ppu,
      // Hung low in its cell, world y up against screen y down.
      offsetY: (h.top + h.height / 2 - (r.top + r.height * 0.6)) / ppu,
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

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // Depth testing, now that the bars are opaque metal rather than a
  // transparent lattice. It does two things: a bar in front hides the one
  // behind it, which is most of what makes a see-through object read as solid;
  // and it stops the ends of adjacent ring segments blending over each other,
  // which was showing up as a bead along every hoop.
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 0);
  // Dark iron, with the brand's crimson only on the turning edges. The cage in
  // the photograph beside this is black metal; a pink wireframe next to it
  // reads as a diagram of a cage rather than one.
  gl.uniform3f(uMetal, 0.085, 0.072, 0.078);
  gl.uniform3f(uRim, 0.62, 0.07, 0.11);

  // ------------------------------------------------------------- suspension

  // A damped harmonic swing on two axes. Impulses come from the pointer and
  // from scrolling; the spring returns it to rest, so it never spins away.
  var swing = { x: 0, vx: 0, z: 0, vz: 0, spin: 0, vspin: 0 };
  var STIFF = 5.2;
  var DAMP = 0.86;

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
        swing.vz += (nx - pointerX) * 1.5;
        swing.vx += (ny - pointerY) * 1.1;
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
    gl.uniform2f(uRange, depth - 1.1, depth + 1.3);
    gl.uniform2f(uHalfRes, canvas.width / 2, canvas.height / 2);
    // The same object at the same weight on every screen. It has a cell of its
    // own now rather than a corner of the type's, so there is no reason for a
    // phone to get a fainter one — and that difference was most of why the two
    // did not feel like the same site.
    gl.uniform1f(uAlpha, 0.9);

    if (built < 1) {
      built = Math.min(1, (now - t0) / 1000 / BUILD);
      // easeOutCubic
      gl.uniform1f(uReveal, 1 - Math.pow(1 - built, 3));
    } else {
      gl.uniform1f(uReveal, 1);
    }

    // Rotated about the hook, not the middle: a hung object pivots where it is
    // held. Translate the pivot to the origin, swing, and put it back.
    var pivot = HEIGHT / 2 + 0.3;
    scrollTurn += (scrollTurnTarget - scrollTurn) * Math.min(1, dt * 4);
    var hang = multiply(
      translate(0, -pivot, 0),
      multiply(
        rotateZ(swing.z + idle),
        multiply(rotateX(swing.x), rotateY(swing.spin + scrollTurn + elapsed * 0.05))
      )
    );
    var model = multiply(translate(0, pivot, 0), hang);
    var place = translate(offsetX, offsetY, -depth);
    var tilt = rotateX(-0.06);
    var mv = multiply(place, multiply(tilt, model));
    // The chain is fixed to whatever is above the page. It takes the same
    // placement and tilt but none of the swing, so the hook stays where the
    // last link holds it however far the cage below has swung.
    var mvChain = multiply(place, tilt);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uMVP, false, new Float32Array(multiply(proj, mv)));
    gl.drawArrays(gl.TRIANGLES, 0, CAGE_VERTS);
    gl.uniformMatrix4fv(uMVP, false, new Float32Array(multiply(proj, mvChain)));
    gl.drawArrays(gl.TRIANGLES, CAGE_VERTS, COUNT - CAGE_VERTS);
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
