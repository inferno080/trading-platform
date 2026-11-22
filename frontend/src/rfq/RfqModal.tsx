import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { useT } from "../i18n/useT";
import { RfqTicket, type TicketProps } from "./RfqTicket";

/**
 * A button that opens the quote ticket in a modal dialog. The native dialog traps focus, makes the page behind it inert,
 * returns focus to the button when it closes, and closes on Escape (an open quote is turned down by the first Escape
 * instead, see RfqTicket). The ticket is only mounted while the dialog is open, so closing it with a quote open
 * turns that quote down.
 */
export function RfqModal(props: TicketProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  // The dialog's own Escape handling cannot be held back once a browser has decided to close it, so it is switched off
  // (closedby="none", and the cancel event is refused where that is allowed) and Escape is handled here instead.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation(); // Escape closes only the dialog, not the chart panel behind it
    if (!event.defaultPrevented) setOpen(false); // the ticket marks the Escape it uses to turn a quote down; this runs after it
  };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <>
      <button type="button" className="rfq-open" onClick={() => setOpen(true)}>
        {t("rfq.open")}
      </button>
      <dialog
        ref={dialog}
        className="rfq-modal"
        aria-labelledby="rfq-title"
        onClose={() => setOpen(false)}
        onKeyDown={onKeyDown}
        onCancel={(event) => event.preventDefault()}
        {...{ closedby: "none" }}
      >
        {open && (
          <>
            <button type="button" className="rfq-close" aria-label={t("rfq.close")} onClick={() => setOpen(false)}>
              <Icon name="x" />
            </button>
            <RfqTicket {...props} />
          </>
        )}
      </dialog>
    </>
  );
}
