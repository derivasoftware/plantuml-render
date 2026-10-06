import { configDefaults, defineConfig } from "vitest/config";

// The layout router (elkjs) and the wasm parser both pay a start-up cost per
// worker; under a parallel run that cost lands on whichever test comes first.
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    // Another session's worktree is a checkout of this same repo: without
    // this its tests run too, twice the time to say the same thing.
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
});
