import { spawnSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import istanbul from "vite-plugin-istanbul";

// Run a git command without a shell and return its trimmed output, or null if git is unavailable.
const git = (args: string[]): string | null => {
  const result = spawnSync("/usr/bin/git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};

// Commit hash baked into the build so benchmark result files say which code produced them.
const sha = git(["rev-parse", "--short", "HEAD"]);
const dirty = (git(["status", "--porcelain"]) ?? "") !== "";
const suffix = dirty ? "-dirty" : "";
const commit = sha ? `${sha}${suffix}` : "unknown";

export default defineConfig({
  plugins: [
    react(),
    // Coverage instrumentation (Istanbul). Only active when VITE_COVERAGE=true, which `npm run test:ct` sets,
    // so normal dev and production builds are never instrumented.
    istanbul({
      include: ["src/**"],
      exclude: ["src/main.tsx", "src/feed/feedWorker.ts"], // neither can report coverage: one is the entry point, one runs in a worker
      extension: [".ts", ".tsx"],
      requireEnv: true,
    }),
  ],
  define: { __GIT_COMMIT__: JSON.stringify(commit) },
  worker: { format: "es" }, // Web Workers are built as modules, matching `new Worker(..., { type: "module" })`
});
