import { RecordButton } from "../hud/Hud";
import type { HudState } from "../hud/useHud";
import { WatchlistToggle } from "../watchlist/WatchlistToggle";

/** The right-hand end of a tab's toolbar: the record button beside the watchlist toggle. */
export function ToolbarEnd({ hud, watchlistOpen, onToggleWatchlist }: { hud: HudState; watchlistOpen: boolean; onToggleWatchlist: () => void }) {
  return (
    <div className="toolbar-end">
      <RecordButton hud={hud} />
      <WatchlistToggle open={watchlistOpen} onToggle={onToggleWatchlist} />
    </div>
  );
}
