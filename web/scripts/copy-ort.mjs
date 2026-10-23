// onnxruntime-web loads its .wasm files at runtime. Serving them from our own
// origin (public/ort, git-ignored) keeps them valid under cross-origin isolation.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/ort", { recursive: true });
for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
  cpSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
}
