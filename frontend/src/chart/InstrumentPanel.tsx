import type { ReactNode } from "react";
import type { InstrumentReference } from "../protocol/messages";
import type { RfqPort } from "../rfq/bridge";
import { RfqModal } from "../rfq/RfqModal";
import { SymbolDetail } from "./SymbolDetail";
import type { HistoryRange } from "./range";

/** What the person can do with the open chart, and how it is shown: the same on both tabs. */
export interface ChartControls {
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClose: () => void;
  /** Whether keyboard focus moves into the panel when it opens (not when it was open from the start). */
  takeFocus: boolean;
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  /** The server has no price history for this instrument. */
  unavailable: boolean;
}

interface InstrumentPanelProps extends Omit<ChartControls, "unavailable"> {
  id: number;
  symbol: string;
  instrument: InstrumentReference;
  rfq: RfqPort;
  /** The order book and the trades, the price with its move, and the chart: each tab draws them its own way. */
  side: ReactNode;
  price: ReactNode;
  children: ReactNode;
}

/**
 * The panel for the open instrument, shared by both tabs so that they look and behave the same: its heading and buttons,
 * the range buttons, and the dialog for asking a dealer for a quote. What differs between the tabs (how the chart, the book
 * and the price are drawn and kept current) is handed in.
 */
export function InstrumentPanel({ id, symbol, instrument, rfq, side, price, children, ...controls }: InstrumentPanelProps) {
  return (
    <SymbolDetail
      symbol={symbol}
      name={instrument.name}
      currency={instrument.currency}
      tickSize={instrument.tickSize}
      decimals={instrument.decimals}
      side={side}
      price={price}
      ticket={<RfqModal key={id} port={rfq} instrumentId={id} symbol={symbol} decimals={instrument.decimals} />}
      {...controls}
    >
      {children}
    </SymbolDetail>
  );
}
