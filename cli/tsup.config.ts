import { defineConfig } from "tsup";
import { releaseDefines } from "#packaging/defines.ts";

export default defineConfig({
  // Two entries: the command the bin runs, and the contract an adapter imports.
  entry: { main: "src/main.ts", adapter: "src/adapter/index.ts" },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  outExtension: () => ({ js: ".mjs" }),
  bundle: true,
  noExternal: [
    "yaml",
    // The console imports these, and a packed CLI has no node_modules beside it
    // to resolve them from. They sit behind a dynamic import.
    "ink",
    "react",
    "react/jsx-runtime",
    "react-devtools-core",
  ],
  splitting: true,
  treeshake: true,
  minify: true,
  clean: true,
  sourcemap: false,
  define: releaseDefines(),
  // yaml is CJS; without this, esbuild's ESM shim throws on `require("process")`.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
