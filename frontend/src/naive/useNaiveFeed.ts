import { useEffect, useState } from "react";
import { collector } from "../hud/collector";
import { decodeServerMessage, encodeClientMessage } from "../protocol/codec";
import { PROTOCOL_VERSION, type Quote, type Session } from "../protocol/messages";

export type FeedStatus = "connecting" | "live" | "closed" | "error";

const WS_URL: string = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

/**
 * DELIBERATELY NAIVE baseline: every WebSocket message goes straight into React state,
 * and the whole table re-renders. No worker, no batching, no memoization.
 * It exists to be measured and beaten by the optimized pipeline.
 */
export function useNaiveFeed() {
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [session, setSession] = useState<Session | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [badVersion, setBadVersion] = useState<number | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    let lastSeq = -1; // -1 means "waiting for a snapshot": deltas are ignored until one arrives

    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus((s) => (s === "error" ? s : "closed"));
    ws.onerror = () => setStatus("error");

    ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const msg = decodeServerMessage(new Uint8Array(event.data));

      if (msg.t === "session") {
        // Refuse to talk to a server speaking a protocol we don't understand.
        if (msg.v !== PROTOCOL_VERSION) {
          setBadVersion(msg.v);
          setStatus("error");
          ws.close();
          return;
        }
        setSession(msg);
      } else if (msg.t === "snapshot") {
        lastSeq = msg.seq;
        setQuotes(msg.quotes);
      } else {
        if (lastSeq < 0) return; // gap recovery in progress
        if (msg.seq !== lastSeq + 1) {
          // Missed a frame: ask for a fresh snapshot and ignore deltas until it arrives.
          collector.onGap();
          lastSeq = -1;
          ws.send(encodeClientMessage({ t: "resync" }));
          return;
        }
        lastSeq = msg.seq;
        collector.onDelta(msg.updates.length, Date.now() - msg.ts);
        // Naive on purpose: copy the whole array on every frame.
        setQuotes((prev) => {
          const next = prev.slice();
          for (const update of msg.updates) {
            const current = next[update.id];
            if (current) next[update.id] = { ...current, ...update };
          }
          return next;
        });
      }
    };

    return () => {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
    };
  }, []);

  return { status, session, quotes, badVersion };
}
