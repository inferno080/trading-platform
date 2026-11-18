import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
const commit = sha ? `${sha}${dirty ? "-dirty" : ""}` : "unknown";

export default defineConfig({
  plugins: [react()],
  define: { __GIT_COMMIT__: JSON.stringify(commit) },
});
