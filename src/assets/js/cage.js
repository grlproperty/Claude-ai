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
    '  gl_Position = p;',
    '}',
  ].join('\n');

  // Two fades. Across the quad, so the bar has soft edges of its own rather
  // than relying on multisampling. Into depth, so the far side of the cage
  // falls back — which is what makes a wireframe legible as a volume.
  var FRAG = [
    'precision mediump float;',
    'uniform vec3 uColor;',
    'uniform float uAlpha;',
    'uniform vec2 uRange;',
    'uniform float uReveal;',
    'varying float vDist;',
    'varying float vSide;',
    'varying float vOrder;',
    'void main(){',
    // The cage assembles from its base upward on first paint. A hard cut at
    // the threshold would look like a wipe, so the leading edge is feathered
    // and briefly brighter — the part being drawn reads as the live one.
    '  if (vOrder > uReveal) discard;',
    '  float lead = 1.0 - smoothstep(0.0, 0.09, uReveal - vOrder);',
    '  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vSide));',
    '  float near = 1.0 - smoothstep(uRange.x, uRange.y, vDist);',
    '  float depth = mix(0.22, 1.0, near);',
    '  gl_FragColor = vec4(uColor + lead * 0.35, uAlpha * depth * edge * (1.0 + lead * 0.6));',
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
  var uColor = gl.getUniformLocation(prog, 'uColor');
  var uAlpha = gl.getUniformLocation(prog, 'uAlpha');
  var uRange = gl.getUniformLocation(prog, 'uRange');
  var uHalfRes = gl.getUniformLocation(prog, 'uHalfRes');
  var uReveal = gl.getUniformLocation(prog, 'uReveal');

  // --------------------------------------------------------------- geometry

  var BARS = 16;
  var STEPS = 18;
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

  /** One segment becomes two triangles: six vertices, alternating sides. */
  function seg(x0, y0, z0, x1, y1, z1, width) {
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
      // Height, normalised across the whole object including the hook, so the
      // build reads bottom to top rather than in the order the arrays happen
      // to have been filled.
      order.push((v[0][1] - LOW) / (HIGH - LOW));
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
    for (var st = 0; st < STEPS; st++) {
      var t0 = st / STEPS;
      var t1 = (st + 1) / STEPS;
      var r0 = radiusAt(t0);
      var r1 = radiusAt(t1);
      seg(c * r0, -HEIGHT / 2 + HEIGHT * t0, s * r0, c * r1, -HEIGHT / 2 + HEIGHT * t1, s * r1, 1.5);
    }
  }

  // Rings up the body, then the base: a floor ring and the lip below it, which
  // is what stops the bars reading as trailing off into nothing.
  for (var k = 0; k < 4; k++) {
    var tk = 0.12 + k * 0.19;
    ring(-HEIGHT / 2 + HEIGHT * tk, radiusAt(tk), 1.1, 56);
  }
  ring(-HEIGHT / 2, radiusAt(0), 1.6, 56);
  ring(-HEIGHT / 2 - 0.07, radiusAt(0) * 0.92, 1.3, 56);
  ring(-HEIGHT / 2 - 0.14, radiusAt(0) * 0.72, 1.1, 40);

  // The shoulder, where the wall becomes the dome.
  ring(-HEIGHT / 2 + HEIGHT * BODY, radiusAt(BODY), 1.4, 56);

  // The perch. One horizontal bar across the middle, and the detail that makes
  // this a birdcage rather than a lantern.
  var perchY = -HEIGHT / 2 + HEIGHT * 0.34;
  seg(-radiusAt(0.34) * 0.98, perchY, 0, radiusAt(0.34) * 0.98, perchY, 0, 1.7);

  // Finial and hook above the crown, so it reads as hung rather than floating.
  var crown = HEIGHT / 2;
  // The rod runs the whole way to the centre of the hook's arc. Stopping it at
  // the knob leaves the hook floating unattached above the cage.
  seg(0, crown - 0.02, 0, 0, crown + 0.3, 0, 1.8);
  ring(crown + 0.16, 0.075, 1.4, 24);
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

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var width = 0;
  var height = 0;

  function resize() {
    var rect = host.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return;
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
  gl.clearColor(0, 0, 0, 0);
  gl.uniform3f(uColor, 0.557, 0.043, 0.078); // #8E0B14

  // ------------------------------------------------------------- suspension

  // A damped harmonic swing on two axes. Impulses come from the pointer and
  // from scrolling; the spring returns it to rest, so it never spins away.
  var swing = { x: 0, vx: 0, z: 0, vz: 0, spin: 0, vspin: 0 };
  var STIFF = 5.2;
  var DAMP = 0.86;

  var pointerX = 0;
  var pointerY = 0;
  var lastScroll = window.scrollY || 0;

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
        swing.vspin += Math.max(-40, Math.min(40, y - lastScroll)) * 0.0009;
        lastScroll = y;
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

    var wide = window.innerWidth >= 1088;

    // Sized to be seen whole. The earlier version was drawn large enough that
    // the photograph cut it in half, which loses the one thing a cage has to
    // read as: a closed shape. It now hangs at a distance where hook, dome,
    // body and base all sit inside the column between the type and the plate.
    var depth = wide ? 8.6 : 10.2;
    var offsetX = wide ? 0.16 : 0;
    // Hung below the wordmark rather than across it. Crossing the letterforms
    // costs the one piece of type the whole page is built around.
    var offsetY = wide ? -0.62 : 0.1;

    var aspect = width / height;
    var proj = perspective(0.8, aspect, 0.1, 40);
    gl.uniform2f(uRange, depth - 1.1, depth + 1.3);
    gl.uniform2f(uHalfRes, canvas.width / 2, canvas.height / 2);
    // Wide screens have a column to hang it in, so it can be an object. Narrow
    // ones do not — every position collides with running text — so there it
    // drops back to a texture behind the type rather than something competing
    // with it. Same geometry, different job.
    gl.uniform1f(uAlpha, wide ? 0.9 : 0.42);

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
    var hang = multiply(
      translate(0, -pivot, 0),
      multiply(rotateZ(swing.z + idle), multiply(rotateX(swing.x), rotateY(swing.spin + elapsed * 0.05)))
    );
    var model = multiply(translate(0, pivot, 0), hang);
    var mv = multiply(translate(offsetX, offsetY, -depth), multiply(rotateX(-0.06), model));

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(uMVP, false, new Float32Array(multiply(proj, mv)));
    gl.drawArrays(gl.TRIANGLES, 0, COUNT);
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
