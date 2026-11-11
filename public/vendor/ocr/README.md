# The photograph reader

These files are [tesseract.js](https://github.com/naptha/tesseract.js) 5.1.1,
its WebAssembly core, and the English language data, copied here unmodified.
They are served from this domain, rather than from a CDN, because the privacy
page promises that every asset on every page is, and because a photograph of
somebody's shopping should not be the occasion for telling a third party their
IP address.

They load only when a reader presses "Photograph the label" on the scanner.
Nothing else on the site requests them.

| File | What it is |
|---|---|
| `tesseract.min.js` | The library (`tesseract.js@5.1.1/dist`) |
| `worker.min.js` | Its worker (`tesseract.js@5.1.1/dist`) |
| `tesseract-core-simd-lstm.wasm.js` | The engine, for browsers with WebAssembly SIMD (`tesseract.js-core@5.1.1`) |
| `tesseract-core-lstm.wasm.js` | The same engine without SIMD, for those without |
| `eng.traineddata.gz` | English, `@tesseract.js-data/eng@1.0.0`, `4.0.0_best_int` |
| `LICENSE.md` | Apache License 2.0, as shipped with tesseract.js |

tesseract.js, tesseract.js-core and the Tesseract language data are all
licensed under the Apache License, Version 2.0.
