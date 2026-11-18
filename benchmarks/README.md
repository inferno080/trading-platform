# Benchmarks

Each file in [`results/`](results/) is one recorded run from the HUD in the app.

## Record a run

1. Start the backend: `cd backend && npm start`
2. Serve the production build: `cd frontend && npm run serve:prod`
3. Open http://localhost:4173 in a normal (not headless) browser window, and keep that tab visible.
4. Close other heavy tabs and apps, so the numbers are not skewed.
5. Wait for the status to show **Live**, then click **Record 30-second run**.
6. After about 33 seconds the browser downloads a file such as `2026-11-18T14-30_naive_50k.json`.
7. Move it into `benchmarks/results/` and commit it.

Always use `serve:prod`. The development build (`npm run dev`) is much slower and its numbers are not comparable. The file records which build produced it.

## What is in a result file

| Field | Meaning |
| --- | --- |
| `mode` | `naive` or `optimized` pipeline |
| `build` | `production` or `development` |
| `commit` | git commit the build came from; `-dirty` means uncommitted changes |
| `load` | instruments and updates/sec the server reported |
| `environment` | browser, CPU cores, memory, screen size |
| `tabHidden` | true if the tab was hidden during the run, which makes the numbers unreliable |
| `summary` | average and minimum FPS, worst frame, message and update rates, latency p50 and p99, sequence gaps |
| `samples` | the per-second values behind the summary |

Numbers depend on the machine, so compare runs only against others from the same machine and browser.
