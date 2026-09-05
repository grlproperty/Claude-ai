/**
 * The figure.
 *
 * A bust in a cage, hung on a chain, rendered in WebGL behind the hero. It is
 * the brand's own image rather than an abstract shader: the campaign
 * photograph puts a wire cage over the subject's head and hangs it from a
 * chain, and the site puts the same object behind the masthead.
 *
 * The figure is contour rings, not a surface. A solid head at this size is a
 * low-polygon face, and a low-polygon face is worse to look at than none —
 * the viewer reads a person and finds one that is wrong. Contours read as
 * what they are: a form, a mannequin, a milliner's block. That is also the
 * honest object for this site. It is a body with no one in it.
 *
 * Written against raw WebGL rather than a library. The scene is a few thousand
 * segments, so a 3D framework would be almost entirely dead weight on a page
 * whose point is that it loads fast and asks nothing of anyone else.
 *
 * Three things here are worth knowing before changing them.
 *
 * The bars are not gl.LINES. Every browser clamps lineWidth to 1 physical
 * pixel, which is why a line-drawn wireframe reads as a diagram rather than an
 * object — no weight, no taper, and a hairline that vanishes on a dense
 * screen. Each segment is instead a quad expanded in the vertex shader along
 * the screen-space normal of the segment, so bars have real thickness, thin
 * with distance, and antialias on their own edges.
 *
 * It hangs, and it turns. A pendulum on two axes, damped, pushed by the
 * pointer and by scrolling, pivoting at the top of the chain rather than at
 * the object — which is what makes the sway a long arc instead of a wobble.
 * On top of that it rotates: one revolution every fifty seconds, with a
 * torsional wobble so the rate is never perfectly even. A chain is a torsion
 * spring with no preferred angle, so a thing hung on one always comes round;
 * the wobble is what separates that from a turntable in a shop window.
 *
 * The cage and the body are one mesh in one draw call, told apart by a tone
 * carried per vertex. The cage is drawn as black wire; the body is mixed
 * towards the page behind it, so it recedes rather than darkening. Give them
 * the same tone and the two meshes sit six hundredths of a unit apart at the
 * same weight, and what you have is not a figure in a cage but noise inside a
 * lamp. Nothing else in this file matters as much to whether the image works.
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
    // x: side (-1/+1), y: base width in px, z: tone. Tone is what separates
    // the cage from what is inside it — one mesh drawn as black wire, the
    // other as a pale ghost, from the same buffer and the same shader.
    'attribute vec3 aSpec;',
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
    'varying float vTone;',
    'void main(){',
    '  vOrder = aOrder;',
    '  vTone = aSpec.z;',
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
    'uniform vec3 uPaper;',
    'uniform float uAlpha;',
    'uniform vec2 uRange;',
    'uniform float uReveal;',
    'varying float vDist;',
    'varying float vSide;',
    'varying float vOrder;',
    'varying vec2 vNrm;',
    'varying float vTone;',
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
    // Tone lifts a segment towards the page rather than dimming it towards
    // black. Dimming a dark bar on a pale ground makes it darker, not fainter.
    '  col = mix(uPaper, col, vTone);',
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
  var uPaper = gl.getUniformLocation(prog, 'uPaper');
  var uAlpha = gl.getUniformLocation(prog, 'uAlpha');
  var uRange = gl.getUniformLocation(prog, 'uRange');
  var uHalfRes = gl.getUniformLocation(prog, 'uHalfRes');
  var uReveal = gl.getUniformLocation(prog, 'uReveal');

  // --------------------------------------------------------------- geometry
  //
  // A bust in a cage, hung on a chain. Three objects, built from one segment
  // primitive: the figure, the cage over its head, and the chain it hangs by.
  //
  // The figure is contour rings rather than a surface. A solid head rendered
  // at this size would be a low-polygon face, and a low-polygon face is a
  // worse thing to look at than no face at all — it lands in the valley where
  // the viewer reads a person and finds one that is wrong. Contours read as
  // what they are: a form, a mannequin, a milliner's block. That is also the
  // honest object for this site. It is a body with no one in it.
  //
  // Nothing here is anatomical. The proportions are a dressmaker's bust: head
  // roughly one and a half times as tall as it is wide, shoulders roughly
  // three head-widths across, and a clean horizontal cut at the chest.

  // Cross-sections, bottom to top: [y, halfWidth, depthFront, depthBack].
  //
  // Front and back depths are separate because a head is not symmetrical front
  // to back, and that asymmetry is the whole of what stops it reading as an
  // egg. Two features carry it. The back of the skull overhangs the neck,
  // which is why depthBack climbs from 0.19 to 0.30 across four hundredths of
  // a unit at the jaw. And the face is a flatter plane than the cranium, so
  // depthFront stays well under depthBack the whole way up.
  //
  // The bust is the same idea turned sideways: shoulders wide and thin,
  // roughly two and a third times as broad as they are deep, and below the
  // armpit a torso that runs near enough parallel to the cut. Tapering it is
  // what made the first attempt a vase.
  var PROFILE = [
    // y      rx     zFront  zBack
    [-0.72, 0.498, 0.246, 0.246], // the cut
    [-0.56, 0.506, 0.256, 0.256],
    [-0.4, 0.522, 0.266, 0.266], // torso, near enough parallel
    [-0.28, 0.556, 0.274, 0.274],
    [-0.19, 0.628, 0.282, 0.282], // out into the deltoid
    [-0.12, 0.702, 0.288, 0.288], // shoulder, widest
    [-0.05, 0.694, 0.278, 0.278],
    [0.01, 0.578, 0.258, 0.258], // the shoulder line breaking
    [0.08, 0.402, 0.228, 0.228],
    [0.12, 0.268, 0.200, 0.200],
    [0.16, 0.196, 0.180, 0.180], // where the neck leaves the trapezius
    [0.22, 0.174, 0.166, 0.176],
    [0.28, 0.172, 0.160, 0.190], // top of the neck
    [0.32, 0.196, 0.184, 0.252], // the jaw begins to overhang
    [0.37, 0.222, 0.214, 0.298], // jaw
    [0.45, 0.244, 0.242, 0.330],
    [0.55, 0.256, 0.256, 0.356], // cheekbone, and the skull behind it
    [0.66, 0.26, 0.254, 0.366], // widest point of the skull
    [0.76, 0.254, 0.24, 0.358],
    [0.85, 0.236, 0.216, 0.328],
    [0.93, 0.202, 0.18, 0.278],
    [0.99, 0.146, 0.128, 0.198],
    [1.05, 0.052, 0.046, 0.07], // crown
  ];

  /** The cross-section at a height, linearly interpolated between rows. */
  function figureAt(y) {
    if (y <= PROFILE[0][0]) return PROFILE[0];
    for (var i = 1; i < PROFILE.length; i++) {
      if (y <= PROFILE[i][0]) {
        var a = PROFILE[i - 1];
        var b = PROFILE[i];
        var k = (y - a[0]) / (b[0] - a[0]);
        return [
          y,
          a[1] + (b[1] - a[1]) * k,
          a[2] + (b[2] - a[2]) * k,
          a[3] + (b[3] - a[3]) * k,
        ];
      }
    }
    return PROFILE[PROFILE.length - 1];
  }

  var FIG_LOW = PROFILE[0][0];
  var FIG_HIGH = PROFILE[PROFILE.length - 1][0];

  // The cage is fitted, not enclosing. In the photograph it is a headpiece —
  // wire bent round a skull with an inch of air in it, following the jaw and
  // bulging where the skull does. An evenly round cage with the head loose
  // inside it is a birdcage with something in it, which is a different and
  // much weaker picture.
  //
  // So it is the head's own profile, inflated by about six hundredths of a
  // unit on every axis, closing over the crown rather than following the skull
  // down to its point. Same four columns: [y, halfWidth, depthFront,
  // depthBack].
  var CAGE = [
    // y     rx     zFront  zBack
    [0.19, 0.25, 0.235, 0.262], // the rim, tucked under the jaw
    [0.26, 0.262, 0.25, 0.3],
    [0.34, 0.286, 0.278, 0.352],
    [0.45, 0.306, 0.302, 0.388],
    [0.56, 0.318, 0.316, 0.412],
    [0.68, 0.322, 0.316, 0.422], // widest, over the parietal
    [0.8, 0.316, 0.302, 0.41],
    [0.9, 0.298, 0.278, 0.378],
    [0.99, 0.262, 0.24, 0.322],
    [1.07, 0.206, 0.188, 0.246],
    [1.14, 0.128, 0.116, 0.15],
    [1.19, 0.055, 0.05, 0.064], // the apex, where the bars gather
  ];

  var CAGE_LOW = CAGE[0][0];
  var CAGE_HIGH = CAGE[CAGE.length - 1][0];
  var CAGE_BARS = 20;

  /** The cage cross-section at a height. */
  function cageAt(y) {
    if (y <= CAGE[0][0]) return CAGE[0];
    for (var i = 1; i < CAGE.length; i++) {
      if (y <= CAGE[i][0]) {
        var a = CAGE[i - 1];
        var b = CAGE[i];
        var k = (y - a[0]) / (b[0] - a[0]);
        return [
          y,
          a[1] + (b[1] - a[1]) * k,
          a[2] + (b[2] - a[2]) * k,
          a[3] + (b[3] - a[3]) * k,
        ];
      }
    }
    return CAGE[CAGE.length - 1];
  }

  // Where the chain leaves the ring, and how far up it runs. It leaves the top
  // of the frame rather than ending: a chain with a visible last link is a
  // prop, and a chain that goes out of shot is a room.
  var CHAIN_FROM = CAGE_HIGH + 0.17;
  var CHAIN_TO = 4.3;

  // Vertical extent of everything drawn. Drives the build reveal, which runs
  // bottom to top, so the figure arrives before the chain it hangs from.
  var LOW = FIG_LOW - 0.05;
  var HIGH = CHAIN_TO;

  var pos = [];
  var other = [];
  var spec = [];
  var order = [];

  // Bar widths are authored in relative terms and scaled here. Below about two
  // pixels a round bar has nowhere to put its highlight, and the shading that
  // makes it read as metal degrades into noise.
  var WIDTH_SCALE = 1.75;

  /** One segment becomes two triangles: six vertices, alternating sides. */
  function seg(x0, y0, z0, x1, y1, z1, width, tone) {
    width *= WIDTH_SCALE;
    var tn = tone === undefined ? 1 : tone;
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
      spec.push(v[2], width, tn);
      // Height, normalised across the whole scene, so the build reads bottom
      // to top rather than in the order the arrays happen to have been filled.
      order.push((v[0][1] - LOW) / (HIGH - LOW));
    }
  }

  /**
   * A closed horizontal loop, built as two half-ellipses so the front and back
   * can have different depths. The join at the sides is continuous in position
   * and not in slope, which is invisible at any size this is drawn and is what
   * a head does there anyway.
   */
  function ellipse(y, rx, zFront, zBack, width, n, tone) {
    for (var i = 0; i < n; i++) {
      var a0 = (i / n) * Math.PI * 2;
      var a1 = ((i + 1) / n) * Math.PI * 2;
      var s0 = Math.sin(a0);
      var s1 = Math.sin(a1);
      seg(
        Math.cos(a0) * rx,
        y,
        s0 * (s0 >= 0 ? zFront : zBack),
        Math.cos(a1) * rx,
        y,
        s1 * (s1 >= 0 ? zFront : zBack),
        width,
        tone
      );
    }
  }

  function ring(y, r, width, n, tone) {
    ellipse(y, r, r, r, width, n, tone);
  }

  /**
   * A tapered tube along an arbitrary axis, ringed and ribbed. Used for the
   * arm stumps, which do not run vertically and so cannot be built from the
   * horizontal cross-sections everything else uses.
   */
  function tube(a, b, r0, r1, rings, ribs, width, tone) {
    var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    var len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    d = [d[0] / len, d[1] / len, d[2] / len];
    // Any vector not parallel to the axis gives a usable frame; the arms run
    // in the XY plane, so Z is always safely off-axis.
    var u = [-d[1], d[0], 0];
    var ul = Math.sqrt(u[0] * u[0] + u[1] * u[1]) || 1;
    u = [u[0] / ul, u[1] / ul, 0];
    var v = [
      d[1] * u[2] - d[2] * u[1],
      d[2] * u[0] - d[0] * u[2],
      d[0] * u[1] - d[1] * u[0],
    ];

    function at(k, ang) {
      var r = r0 + (r1 - r0) * k;
      var c = Math.cos(ang);
      var s = Math.sin(ang);
      return [
        a[0] + d[0] * len * k + (u[0] * c + v[0] * s) * r,
        a[1] + d[1] * len * k + (u[1] * c + v[1] * s) * r,
        a[2] + d[2] * len * k + (u[2] * c + v[2] * s) * r,
      ];
    }

    var n = 20;
    for (var ri = 0; ri <= rings; ri++) {
      var k = ri / rings;
      for (var i = 0; i < n; i++) {
        var p = at(k, (i / n) * Math.PI * 2);
        var q = at(k, ((i + 1) / n) * Math.PI * 2);
        seg(p[0], p[1], p[2], q[0], q[1], q[2], ri === rings ? width * 1.7 : width, tone);
      }
    }
    for (var rb = 0; rb < ribs; rb++) {
      var ang = (rb / ribs) * Math.PI * 2;
      for (var st2 = 0; st2 < rings; st2++) {
        var p2 = at(st2 / rings, ang);
        var q2 = at((st2 + 1) / rings, ang);
        seg(p2[0], p2[1], p2[2], q2[0], q2[1], q2[2], width, tone);
      }
    }
  }

  // ---- the figure ---------------------------------------------------------

  // Contours. Closer together over the head, where the form changes fastest
  // and where the eye goes; wider apart down the chest, which is doing nothing
  // but holding the shape up.
  var CONTOURS = [
    -0.86, -0.72, -0.59, -0.47, -0.36, -0.28, -0.23, -0.19, -0.14, -0.08, 0.0,
    0.09, 0.18, 0.26, 0.32, 0.4, 0.49, 0.58, 0.67, 0.76, 0.85, 0.92, 0.98, 1.02,
  ];

  for (var ci = 0; ci < CONTOURS.length; ci++) {
    var cs = figureAt(CONTOURS[ci]);
    // The cut at the bottom and the shoulder line carry more weight: they are
    // the two edges that tell you where the object begins and how wide it is.
    var cy = CONTOURS[ci];
    // The cut and the shoulder line are the two edges that say where the
    // object begins and how wide it is, so they carry weight. Everything over
    // the jaw is deliberately faint.
    var cw = cy === -0.86 ? 1.45 : cy === -0.23 ? 1.15 : cy > 0.32 ? 0.72 : 0.62;
    ellipse(cs[0], cs[1], cs[2], cs[3], cw, cs[1] > 0.4 ? 52 : 40, FIGURE_TONE);
  }

  // Meridians, tying the contours into a solid — but only up to the jaw.
  //
  // Above that the head is contours alone, and the difference is the whole
  // composition. The cage is the drawn object: hard, metal, fully described.
  // What is inside it is a stack of faint rings, a presence rather than a
  // second wireframe. Run the meridians over the skull as well and the two
  // meshes sit six hundredths of a unit apart at the same weight, and the head
  // stops being a head and becomes noise inside a lamp.
  //
  // It is also what the photograph does. The cage is in focus. The face behind
  // it is not.
  // How present the figure is against the cage. Low enough that the cage is
  // unmistakably the object in front and the body is behind it, high enough
  // that the body is a body and not a smudge. This one number does more for
  // the composition than any amount of geometry.
  var FIGURE_TONE = 0.62;

  var MERIDIANS = 14;
  var MERIDIAN_TOP = 0.3;
  for (var m = 0; m < MERIDIANS; m++) {
    var ma = (m / MERIDIANS) * Math.PI * 2;
    var mc = Math.cos(ma);
    var ms = Math.sin(ma);
    var steps = 20;
    for (var mstep = 0; mstep < steps; mstep++) {
      var y0 = FIG_LOW + ((MERIDIAN_TOP - FIG_LOW) * mstep) / steps;
      var y1 = FIG_LOW + ((MERIDIAN_TOP - FIG_LOW) * (mstep + 1)) / steps;
      var p0 = figureAt(y0);
      var p1 = figureAt(y1);
      seg(
        mc * p0[1],
        y0,
        ms * (ms >= 0 ? p0[2] : p0[3]),
        mc * p1[1],
        y1,
        ms * (ms >= 0 ? p1[2] : p1[3]),
        0.55,
        FIGURE_TONE
      );
    }
  }

  // Arm stumps, cut short the way a dressmaker's form is.
  //
  // These are the single thing that stops the whole object reading as a table
  // lamp. A dome over a bell is a lamp; a dome over a bell with two arms is a
  // figure, and no amount of work on the torso profile achieves what these two
  // short cones do immediately.
  for (var side = -1; side <= 1; side += 2) {
    tube(
      [side * 0.62, -0.2, 0],
      [side * 0.87, -0.44, 0],
      0.146,
      0.108,
      4,
      7,
      0.5,
      FIGURE_TONE
    );
  }

  // The one feature. A shallow ridge down the centre of the face, from brow to
  // chin — enough that the front is distinguishable from the back as it turns,
  // and not so much that it becomes a face to be judged against real ones.
  for (var bs = 0; bs < 12; bs++) {
    var by0 = 0.31 + (bs / 12) * 0.5;
    var by1 = 0.31 + ((bs + 1) / 12) * 0.5;
    var bp0 = figureAt(by0);
    var bp1 = figureAt(by1);
    seg(0, by0, bp0[2] + 0.005, 0, by1, bp1[2] + 0.005, 0.5, FIGURE_TONE * 1.2);
  }

  // ---- the cage -----------------------------------------------------------

  // Rim, doubled. A single loop reads as the edge of a hole; two read as a
  // band that was made and then bent.
  var rim = cageAt(CAGE_LOW);
  ellipse(CAGE_LOW, rim[1], rim[2], rim[3], 2.3, 56);
  var rim2 = cageAt(CAGE_LOW + 0.03);
  ellipse(CAGE_LOW + 0.03, rim2[1] * 0.99, rim2[2] * 0.99, rim2[3] * 0.99, 1.2, 56);

  for (var cb = 0; cb < CAGE_BARS; cb++) {
    var cba = (cb / CAGE_BARS) * Math.PI * 2 + Math.PI / CAGE_BARS;
    var cbc = Math.cos(cba);
    var cbs = Math.sin(cba);
    var csteps = 18;
    for (var cstep = 0; cstep < csteps; cstep++) {
      var cy0 = CAGE_LOW + ((CAGE_HIGH - CAGE_LOW) * cstep) / csteps;
      var cy1 = CAGE_LOW + ((CAGE_HIGH - CAGE_LOW) * (cstep + 1)) / csteps;
      var q0 = cageAt(cy0);
      var q1 = cageAt(cy1);
      seg(
        cbc * q0[1],
        cy0,
        cbs * (cbs >= 0 ? q0[2] : q0[3]),
        cbc * q1[1],
        cy1,
        cbs * (cbs >= 0 ? q1[2] : q1[3]),
        1.85 - 0.45 * (cstep / csteps)
      );
    }
  }

  // Latitudes, unevenly spaced. Even spacing on a dome reads as a wireframe
  // globe; the crowding towards the crown is what a made object does, because
  // that is where the bars need holding apart.
  var LATS = [0.3, 0.5, 0.7, 0.87, 0.98];
  for (var la = 0; la < LATS.length; la++) {
    var ly = CAGE_LOW + (CAGE_HIGH - CAGE_LOW) * LATS[la];
    var lp = cageAt(ly);
    ellipse(ly, lp[1], lp[2], lp[3], 1.3, 56);
  }

  // ---- the suspension -----------------------------------------------------

  // The collar the bars gather into, and the ring above it that the chain
  // takes. Heavier than anything else in the scene: it is carrying all of it.
  ring(CAGE_HIGH - 0.01, 0.052, 1.9, 24);
  ring(CAGE_HIGH + 0.03, 0.044, 1.5, 20);
  seg(0, CAGE_HIGH, 0, 0, CAGE_HIGH + 0.075, 0, 2.0);

  // The eye, standing in the vertical plane so it reads as a loop rather than
  // a disc from the front.
  for (var e = 0; e < 20; e++) {
    var ea = (e / 20) * Math.PI * 2;
    var eb = ((e + 1) / 20) * Math.PI * 2;
    seg(
      Math.sin(ea) * 0.062,
      CHAIN_FROM - 0.055 + Math.cos(ea) * 0.062,
      0,
      Math.sin(eb) * 0.062,
      CHAIN_FROM - 0.055 + Math.cos(eb) * 0.062,
      0,
      1.7
    );
  }

  // ---- the chain ----------------------------------------------------------

  // Links alternate plane, which is the whole of why a chain looks like a
  // chain: each one is turned ninety degrees from its neighbour and they
  // interlock. Drawn as flattened rings — a stadium shape, straight down the
  // sides — because a chain link is a bent rod, not a circle.
  var LINK_H = 0.155;
  var LINK_W = 0.056;
  var LINK_STEP = LINK_H * 0.78;
  var links = Math.ceil((CHAIN_TO - CHAIN_FROM) / LINK_STEP);

  for (var li = 0; li < links; li++) {
    var cy = CHAIN_FROM + li * LINK_STEP;
    var flat = li % 2 === 0;
    var n = 16;
    for (var s2 = 0; s2 < n; s2++) {
      var t0a = (s2 / n) * Math.PI * 2;
      var t1a = ((s2 + 1) / n) * Math.PI * 2;
      // Stadium: the sine is squashed towards the ends so the sides run
      // straight and the curvature collects in the two caps.
      var sx0 = Math.sin(t0a) * LINK_W;
      var sy0 = Math.cos(t0a);
      var sx1 = Math.sin(t1a) * LINK_W;
      var sy1 = Math.cos(t1a);
      sy0 = (Math.abs(sy0) > 0.7 ? Math.sign(sy0) * (0.7 + (Math.abs(sy0) - 0.7) * 0.55) : sy0) * LINK_H;
      sy1 = (Math.abs(sy1) > 0.7 ? Math.sign(sy1) * (0.7 + (Math.abs(sy1) - 0.7) * 0.55) : sy1) * LINK_H;
      if (flat) {
        seg(sx0, cy + sy0, 0, sx1, cy + sy1, 0, 1.25);
      } else {
        seg(0, cy + sy0, sx0, 0, cy + sy1, sx1, 1.25);
      }
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
  attrib(aSpec, spec, 3);
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
  // The hero's own ground. A low-tone segment is mixed towards this rather
  // than towards black, so it recedes into the page instead of getting darker.
  gl.uniform3f(uPaper, 0.965, 0.875, 0.888);

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

  // One revolution every fifty seconds. Slow enough that a reader who looks up
  // does not catch it moving, fast enough that anyone reading the hero sees a
  // different side of it by the time they reach the bottom of the paragraph.
  var TURN_RATE = (Math.PI * 2) / 50;
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
    // On a narrow screen the canvas is the full height of a stacked hero, so
    // the camera sits much further back to bring the object down to the size
    // of the gap beside the wordmark. These numbers were solved from that
    // gap's position on screen rather than found by eye.
    // Re-solved for the figure, which is taller than the cage it replaced and
    // carries its mass low. The chain runs up out of the top of the canvas
    // rather than ending in shot: a chain with a visible last link is a prop.
    var depth = wide ? 6.9 : 12.6;
    var offsetX = wide ? 0.12 : 1.2;
    // Hung below the wordmark rather than across it. Crossing the letterforms
    // costs the one piece of type the whole page is built around.
    // High on a phone: the clear column to the right of the wordmark, above
    // the paragraph, which is the only place on that layout where a whole
    // object fits without sitting on running text.
    var offsetY = wide ? -1.0 : 3.1;

    var aspect = width / height;
    var proj = perspective(0.8, aspect, 0.1, 40);
    gl.uniform2f(uRange, depth - 1.1, depth + 1.3);
    gl.uniform2f(uHalfRes, canvas.width / 2, canvas.height / 2);
    // Wide screens have a column to hang it in, so it can be an object. Narrow
    // ones do not — every position collides with running text — so there it
    // drops back to a texture behind the type rather than something competing
    // with it. Same geometry, different job.
    // The same object on both. It used to drop to a third of its weight on a
    // phone, which is most of why the two did not feel like the same site.
    gl.uniform1f(uAlpha, wide ? 0.9 : 0.82);

    if (built < 1) {
      built = Math.min(1, (now - t0) / 1000 / BUILD);
      // easeOutCubic
      gl.uniform1f(uReveal, 1 - Math.pow(1 - built, 3));
    } else {
      gl.uniform1f(uReveal, 1);
    }

    // Rotated about the top of the chain, not the middle. A hung object pivots
    // where it is held, and this one is held somewhere above the frame — which
    // is why the sway is a long slow arc rather than a wobble. Translate the
    // pivot to the origin, swing, and put it back.
    var pivot = CHAIN_TO;
    scrollTurn += (scrollTurnTarget - scrollTurn) * Math.min(1, dt * 4);
    var hang = multiply(
      translate(0, -pivot, 0),
      multiply(
        rotateZ(swing.z + idle),
        multiply(
          rotateX(swing.x),
          // A full turn, slowly. Anything on a chain rotates — a chain is a
          // torsion spring with no preferred angle — so the figure comes round
          // to show its back and keeps going. The second, faster term is a
          // torsional wobble on top, without which the rate is perfectly even
          // and the whole thing reads as a turntable in a shop window.
          rotateY(
            swing.spin +
              scrollTurn +
              elapsed * TURN_RATE +
              Math.sin(elapsed * 0.21) * 0.16
          )
        )
      )
    );
    var model = multiply(translate(0, pivot, 0), hang);
    var mv = multiply(translate(offsetX, offsetY, -depth), multiply(rotateX(-0.06), model));

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
