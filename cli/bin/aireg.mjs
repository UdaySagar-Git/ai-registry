#!/usr/bin/env node

import module from "node:module";

if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Compile caching is optional when the runtime cannot initialize it.
  }
}

await import("../dist/main.mjs");
