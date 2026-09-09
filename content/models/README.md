# The hanging cage

`hanging-cage.glb` is the model behind the hero, and `hanging-cage.mtl` carries
the diffuse values it was authored against. Neither ships: they are compiled by

    npm run cage

into `src/assets/js/cage-mesh.js`, which is what the page loads. The output is
committed, so a normal build never reads this folder.

## Replacing it

Export a glTF binary with the same conventions and run `npm run cage`:

* **Y up, standing on the floor.** The renderer recentres what it is given, but
  it measures the cage's own height to do it, so the model has to be one object
  rather than a scene with a floor plane in it.
* **Triangles, positions and normals.** Texture coordinates are dropped — nothing
  here is textured — and anything that is not a triangle list is skipped.
* **No scale or shear on the nodes.** Placements may rotate and translate. The
  compiler leans on that when it transforms normals, and would have to ship an
  inverse transpose per instance otherwise.
* **Named parts.** `chainLink*`, `hook`, `hookShank` and `ceilingPlate` hang from
  the fixing above the page; everything else, including `hangRing`, swings on
  the cage's own suspension. The names decide which, so a renamed part moves rig.
* **A ring and a lowest link that overlap.** The cage turns about the middle of
  that overlap, measured at compile time — no ring, no joint.
* **Repeated shapes placed by node, not baked.** Twenty-four bars should be one
  bar at twenty-four transforms. The compiler hashes the vertex data and
  collapses identical shapes, so a baked export still works, but it will be
  several times larger.

`npm run cage` prints what it found — instance and shape counts, the cage's
extent, where it put the joint, and the link pitch it will repeat the chain on.
Check those before committing: they are the numbers the hero is fitted to.

## What it costs

Positions are quantised to 16 bits across the model's bounding box, normals are
octahedron-encoded to two bytes, and shapes are shared. A 1.0 MB glTF comes out
around 225 KB of base64, expanded back to a flat buffer in the browser once at
startup so the screen still gets two draw calls.
