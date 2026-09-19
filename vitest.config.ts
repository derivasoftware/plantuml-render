import { defineConfig } from "vitest/config";

// The layout router (elkjs) and the wasm parser both pay a start-up cost per
// worker; under a parallel run that cost lands on whichever test comes first.
export default defineConfig({
  test: { testTimeout: 30000, hookTimeout: 30000 },
});
