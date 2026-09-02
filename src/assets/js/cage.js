/**
 * The cage.
 *
 * A wireframe armature — bowed vertical bars and horizontal rings — rendered
 * in WebGL behind the hero type. It is the brand's own motif rather than an
 * abstract shader: the campaign imagery puts a cage around the subject, and
 * the site puts the same structure behind the masthead.
 *
 * Written against raw WebGL rather than a library. The whole scene is a few
 * hundred line segments, so a 600KB 3D framework would be almost entirely
 * dead weight on a page whose point is that it loads fast and requests
 * nothing from anyone else.
 *
 * Degrades in three steps: no WebGL → CSS lattice (via data-state);
 * reduced-motion → one static frame; offscreen or hidden tab → paused.
 */
(function () {
  'use strict';

  var host = document.querySelector('[data-cage]');
  if (!host) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  var gl = null;
  try {
    gl =
      canvas.getContext('webgl', {
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
        // Kept so the composited frame survives past the paint. The scene is a
        // few hundred line segments, so the extra buffer copy costs nothing
        // measurable, and without it the canvas reads blank to screenshot and
        // thumbnail pipelines that capture outside the rendering task.
        preserveDrawingBuffer: true,
      }) ||
      canvas.getContext('experimental-webgl', { antialias: true, alpha: true, preserveDrawingBuffer: true });
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

  // The varying is clip-space w, which for this projection equals the distance
  // from the camera. Normalised device z would be the obvious choice and is the
  // wrong one: across a cage two units deep it spans about 0.955 to 0.970, far
  // too compressed to fade on.
  var VERT = [
    'attribute vec3 aPos;',
    'uniform mat4 uMVP;',
    'varying float vDist;',
    'void main(){',
    '  vec4 p = uMVP * vec4(aPos, 1.0);',
    '  vDist = p.w;',
    '  gl_Position = p;',
    '}',
  ].join('\n');

  // Nearer segments read stronger; the far side of the cage falls back without
  // disappearing, which is what makes a flat wireframe legible as a volume.
  var FRAG = [
    'precision mediump float;',
    'uniform vec3 uColor;',
    'uniform float uAlpha;',
    'uniform vec2 uRange;',
    'varying float vDist;',
    'void main(){',
    '  float near = 1.0 - smoothstep(uRange.x, uRange.y, vDist);',
    '  float fade = mix(0.28, 1.0, near);',
    '  gl_FragColor = vec4(uColor, uAlpha * fade);',
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
  var uMVP = gl.getUniformLocation(prog, 'uMVP');
  var uColor = gl.getUniformLocation(prog, 'uColor');
  var uAlpha = gl.getUniformLocation(prog, 'uAlpha');
  var uRange = gl.getUniformLocation(prog, 'uRange');

  // --------------------------------------------------------------- geometry

  var BARS = 22;
  var RINGS = 6;
  var SEGMENTS = 26;
  var HEIGHT = 2.5;
  var RADIUS = 1.15;

  // How far back the camera sits. Wide screens pull in close, so the cage
  // overruns the hero plate on every side and reads as enclosing it. Narrow
  // screens sit further back: there the cage is centred behind the type, and a
  // near camera drags bars across the running text.
  var DEPTH_WIDE = 3.9;
  var DEPTH_NARROW = 5.6;

  // Profile, from base (t = 0) to apex (t = 1): near-straight sides with a
  // slight barrel through the body, then a dome that closes to a point where
  // the chain attaches. A pure sine bow reads as a globe; a birdcage has walls.
  var BODY = 0.74;

  function radiusAt(t) {
    if (t <= BODY) return RADIUS * (0.94 + 0.06 * Math.sin((t / BODY) * Math.PI));
    var k = (t - BODY) / (1 - BODY);
    return RADIUS * 0.94 * Math.cos(k * Math.PI * 0.5);
  }

  var verts = [];

  // Vertical bars, subdivided so the bow is smooth.
  for (var b = 0; b < BARS; b++) {
    var a = (b / BARS) * Math.PI * 2;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    for (var s = 0; s < SEGMENTS; s++) {
      var t0 = s / SEGMENTS;
      var t1 = (s + 1) / SEGMENTS;
      var r0 = radiusAt(t0);
      var r1 = radiusAt(t1);
      verts.push(cos * r0, -HEIGHT / 2 + HEIGHT * t0, sin * r0);
      verts.push(cos * r1, -HEIGHT / 2 + HEIGHT * t1, sin * r1);
    }
  }

  // Horizontal rings, plus a closing ring at the base so the bars do not read
  // as trailing off.
  for (var k = -1; k < RINGS; k++) {
    var tk = k < 0 ? 0 : (k + 0.5) / RINGS;
    var rk = radiusAt(tk);
    var yk = -HEIGHT / 2 + HEIGHT * tk;
    for (var i = 0; i < 64; i++) {
      var a0 = (i / 64) * Math.PI * 2;
      var a1 = ((i + 1) / 64) * Math.PI * 2;
      verts.push(Math.cos(a0) * rk, yk, Math.sin(a0) * rk);
      verts.push(Math.cos(a1) * rk, yk, Math.sin(a1) * rk);
    }
  }

  // The suspension chain, which is what makes it read as hung rather than sat.
  for (var c = 0; c < 9; c++) {
    verts.push(0, HEIGHT / 2 + c * 0.16, 0);
    verts.push(0, HEIGHT / 2 + (c + 1) * 0.16, 0);
  }

  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  var COUNT = verts.length / 3;

  // ------------------------------------------------------------------ maths

  // WebGL matrices are column-major: m[col * 4 + row]. Every helper below
  // follows that convention, and multiply() composes in the same order as the
  // maths — multiply(a, b) applies b first, then a.

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
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
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
  gl.uniform1f(uAlpha, 0.68);
  // The near and far faces of the cage land either side of the camera distance,
  // which changes with the breakpoint, so the fade range is set per frame.

  var pointerX = 0;
  var pointerY = 0;
  var targetX = 0;
  var targetY = 0;

  if (!reduced) {
    window.addEventListener(
      'pointermove',
      function (e) {
        targetX = (e.clientX / window.innerWidth - 0.5) * 2;
        targetY = (e.clientY / window.innerHeight - 0.5) * 2;
      },
      { passive: true }
    );
  }

  var start = performance.now();

  function draw(now) {
    resize();
    if (!width || !height) return;

    // Ease toward the pointer so the parallax never snaps.
    pointerX += (targetX - pointerX) * 0.045;
    pointerY += (targetY - pointerY) * 0.045;

    var t = reduced ? 0 : (now - start) / 1000;
    var spin = t * 0.11 + pointerX * 0.42;
    var tilt = -0.12 + pointerY * 0.16;

    var aspect = width / height;
    var proj = perspective(0.86, aspect, 0.1, 40);

    // On wide screens the cage sits right of centre, concentric with the hero
    // plate and drawn large enough that its bars carry on past every edge of
    // the photograph — the lattice encloses the frame rather than being hidden
    // behind it. On narrow ones it centres, because the plate stacks below the
    // type and there is no column to sit beside.
    // Matched to the 68rem breakpoint at which the hero plate moves beside the
    // type. Keyed to viewport width, not canvas aspect: the hero grows taller
    // when the plate stacks, which would otherwise flip this on its own.
    var wide = window.innerWidth >= 1088;
    var offsetX = wide ? 1.1 : 0;
    var depth = wide ? DEPTH_WIDE : DEPTH_NARROW;
    gl.uniform2f(uRange, depth - 1.25, depth + 1.4);

    var drift = reduced ? 0 : Math.sin(t * 0.5) * 0.045;
    var mv = multiply(translate(offsetX, drift, -depth), multiply(rotateY(spin), rotateX(tilt)));

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(uMVP, false, new Float32Array(multiply(proj, mv)));
    gl.drawArrays(gl.LINES, 0, COUNT);
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
    // One frame, then nothing moves again.
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
