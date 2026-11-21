import type { ReactNode } from "react";

/**
 * The row above the quotes: the open chart panel on the left (70% of the width) and the watchlist on the right (30%).
 * With no chart open, the watchlist has the row to itself, so there is no hole; with the watchlist collapsed, the chart
 * panel has it. With neither, there is no row at all. On a narrow screen the two stack. The quotes go below, full width.
 */
export function Workspace({ open, panel, children }: { open: boolean; panel: ReactNode; children?: ReactNode }) {
  if (!children && !open) return null;
  return (
    <div className="workspace" data-watchlist={open ? "open" : "closed"} data-main={children ? "chart" : "empty"}>
      {children && <div className="workspace-main">{children}</div>}
      {open && <aside className="workspace-side">{panel}</aside>}
    </div>
  );
}
