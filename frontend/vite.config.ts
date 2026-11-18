import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import istanbul from "vite-plugin-istanbul";

// Run a git command and return its trimmed output, or null if git is unavailable.
const git = (cmd: string): string | null => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
};

// Commit hash baked into the build so benchmark result files say which code produced them.
const sha = git("git rev-parse --short HEAD");
const dirty = (git("git status --porcelain") ?? "") !== "";
const suffix = dirty ? "-dirty" : "";
const commit = sha ? `${sha}${suffix}` : "unknown";

export default defineConfig({
  plugins: [
    react(),
    // Coverage instrumentation (Istanbul). Only active when VITE_COVERAGE=true, which `npm run test:ct` sets,
    // so normal dev and production builds are never instrumented.
    istanbul({
      include: ["src/**"],
      exclude: ["src/main.tsx"],
      extension: [".ts", ".tsx"],
      requireEnv: true,
    }),
  ],
  define: { __GIT_COMMIT__: JSON.stringify(commit) },
});
