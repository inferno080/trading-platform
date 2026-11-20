import type { ReactNode } from "react";

/**
 * The quotes on the left (70% of the width) and the watchlist on the right (30%). When the watchlist is collapsed, the
 * quotes take the whole width. On a narrow screen the watchlist goes below instead.
 */
export function Workspace({ open, panel, children }: { open: boolean; panel: ReactNode; children: ReactNode }) {
  return (
    <div className="workspace" data-watchlist={open ? "open" : "closed"}>
      <div className="workspace-main">{children}</div>
      {open && <aside className="workspace-side">{panel}</aside>}
    </div>
  );
}
