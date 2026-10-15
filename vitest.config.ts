import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several tests create real git repos; spawning git is slow on Windows (antivirus, synced folders).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
