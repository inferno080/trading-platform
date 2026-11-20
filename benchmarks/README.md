# Benchmarks

Each file in [`results/`](results/) is one recorded run from the HUD in the app.

## Record a run

1. Start the backend: `cd backend && npm start`
2. Serve the production build: `cd frontend && npm run serve:prod`
3. Open http://localhost:4173 in a normal (not headless) browser window, and keep that tab visible.
4. Close other heavy tabs and apps, so the numbers are not skewed.
5. If you are recording the **Optimized** tab, set **Refresh every (seconds)** to **0**. The default (1.5 s) makes the screen refresh only now and then, which makes FPS and worst-frame look much better than they are. The panel shows a warning while the interval is above 0.
6. Wait for the status to show **Live**, then click **Record 30-second run**.
7. After about 33 seconds the browser downloads a file such as `2026-11-18T14-30_naive_50k.json`.
8. Move it into `benchmarks/results/` and commit it.

Always use `serve:prod`. The development build (`npm run dev`) is much slower and its numbers are not comparable. The file records which build produced it.

## What is in a result file

| Field | Meaning |
| --- | --- |
| `schema` | version of this file layout; 2 added `settings` (files with schema 1 have no `settings`) |
| `mode` | `naive` or `optimized` pipeline |
| `settings` | `refreshSeconds`: how often the display refreshed (0 = every change, `null` for Naive, which has no such setting); `changedDuringRun`: true if it was edited mid-run. Only a run at 0 is a fair comparison. |
| `build` | `production` or `development` |
| `commit` | git commit the build came from; `-dirty` means uncommitted changes |
| `load` | instruments and updates/sec the server reported |
| `environment` | browser, CPU cores, memory, screen size |
| `tabHidden` | true if the tab was hidden during the run, which makes the numbers unreliable |
| `summary` | average and minimum FPS, worst frame, message and update rates, latency p50 and p99, sequence gaps |
| `samples` | the per-second values behind the summary |

Numbers depend on the machine, so compare runs only against others from the same machine and browser.
