import { useState } from "react";
import { RfqBridge } from "../../../src/rfq/bridge";
import { RfqTicket } from "../../../src/rfq/RfqTicket";
import { parseQuantity } from "../../../src/rfq/ticketText";
import { ANSWER_TIMEOUT_MS } from "../../../src/rfq/useRfq";
import type { RfqQuote, RfqResult } from "../../../src/protocol/messages";
import { withI18n } from "../../support/render";

const setup = () => {
  const send = { request: cy.stub().as("request"), accept: cy.stub().as("accept"), reject: cy.stub().as("reject") };
  const bridge = new RfqBridge(send);
  const ref = () => (send.request.firstCall.args[0] as { ref: number }).ref;
  const quote = (overrides: Partial<RfqQuote> = {}) =>
    cy.then(() => bridge.emit({ type: "quote", quote: { t: "rfqQuote", ref: ref(), id: 7, side: "buy", quantity: 4888, price: 30398, screenPrice: 30396, validForMs: 10_000, ...overrides } }));
  const result = (overrides: Partial<RfqResult>) => cy.then(() => bridge.emit({ type: "result", result: { t: "rfqResult", ref: ref(), outcome: "filled", ...overrides } }));
  const mount = () => cy.mount(withI18n(<RfqTicket port={bridge.port} instrumentId={7} symbol="AAA" decimals={2} />));
  const request = (quantity = "4888") => {
    cy.get("#rfq-quantity").clear().type(quantity);
    cy.contains("button", "Request quote").click();
  };
  return { bridge, mount, request, quote, result };
};

describe("parseQuantity", () => {
  it("accepts whole numbers from 1 to a million", () => {
    expect(parseQuantity("1")).to.equal(1);
    expect(parseQuantity(" 4888 ")).to.equal(4888);
    expect(parseQuantity("1000000")).to.equal(1_000_000);
  });

  it("refuses everything else", () => {
    for (const text of ["", "0", "1000001", "1.5", "-3", "1e3", "abc", "1,000"]) expect(parseQuantity(text), text).to.equal(null);
  });
});

describe("RfqTicket", () => {
  it("is a labelled section with a Buy and Sell choice (Buy first), a numeric quantity box and a button", () => {
    setup().mount();
    cy.get("section.rfq").should("have.attr", "aria-labelledby", "rfq-title");
    cy.get("#rfq-title").should("have.text", "Request a quote");
    cy.get("input[name=rfq-side]").should("have.length", 2);
    cy.get("input[value=buy]").should("be.checked");
    cy.get("#rfq-quantity").should("have.attr", "type", "number").and("have.attr", "min", "1").and("have.attr", "max", "1000000");
    cy.contains("label", "Quantity").should("exist");
    cy.get(".rfq-hint").should("contain.text", "1,000,000");
  });

  it("refuses a bad quantity before sending anything, says why, and marks the box invalid", () => {
    setup().mount();
    cy.get("#rfq-quantity").type("0");
    cy.contains("button", "Request quote").click();
    cy.get("#rfq-quantity-error").should("have.attr", "role", "alert").and("contain.text", "whole quantity");
    cy.get("#rfq-quantity").should("have.attr", "aria-invalid", "true").and("have.attr", "aria-describedby", "rfq-quantity-error");
    cy.get("@request").should("not.have.been.called");
  });

  it("sends the request for the chosen side, shows that it is asking, and locks the form meanwhile", () => {
    const { mount, request } = setup();
    mount();
    cy.get("input[value=sell]").check();
    request();
    cy.get("@request").should("have.been.calledOnce");
    cy.get("@request").should("have.been.calledWithMatch", { id: 7, side: "sell", quantity: 4888 });
    cy.get(".rfq-message").should("have.text", "Asking for a price for 4,888 AAA…");
    cy.get("#rfq-quantity").should("be.disabled");
    cy.contains("button", "Request quote").should("be.disabled");
    cy.get(".rfq-status").should("be.focused");
  });

  it("sends the request when Enter is pressed in the quantity box", () => {
    setup().mount();
    cy.get("#rfq-quantity").type("250{enter}");
    cy.get("@request").should("have.been.calledWithMatch", { quantity: 250, side: "buy" });
  });

  it("shows the quote with how it compares to the screen, the time left, and Accept and Reject, without focusing Accept", () => {
    const { mount, request, quote } = setup();
    mount();
    request();
    quote();
    cy.get(".rfq-message").should("have.text", "You buy 4,888 AAA at 303.98");
    cy.get(".rfq-detail").should("have.text", "0.02 worse than the screen price, because of the size");
    cy.get(".rfq-countdown").should("contain.text", "10 s left").and("have.attr", "data-low", "false");
    cy.contains("button", "Accept").should("not.be.focused");
    cy.get(".rfq-status").should("be.focused");
    cy.get("[role=status]").should("contain.text", "Quote received: you buy 4,888 AAA at 303.98. It is valid for 10 seconds.");
  });

  it("says so when the quote is at the screen price, and words a sell quote as a sale", () => {
    const { mount, request, quote } = setup();
    mount();
    cy.get("input[value=sell]").check();
    request();
    quote({ side: "sell", price: 30396, screenPrice: 30396 });
    cy.get(".rfq-message").should("have.text", "You sell 4,888 AAA at 303.96");
    cy.get(".rfq-detail").should("have.text", "At the screen price");
  });

  it("measures a sell quote against the screen in the other direction", () => {
    const { mount, request, quote } = setup();
    mount();
    cy.get("input[value=sell]").check();
    request();
    quote({ side: "sell", price: 30394, screenPrice: 30396 });
    cy.get(".rfq-detail").should("contain.text", "0.02 worse");
  });

  it("sends the accept, shows it is accepting, then the fill with its reference and a way to start again", () => {
    const { mount, request, quote, result } = setup();
    mount();
    request();
    quote();
    cy.contains("button", "Accept").click();
    cy.get("@accept").should("have.been.calledOnce");
    cy.get(".rfq-message").should("have.text", "Accepting…");
    result({ price: 30399, tradeId: 42 });
    cy.get(".rfq-message").should("have.text", "Done: bought 4,888 AAA at 303.99");
    cy.get(".rfq-detail").should("have.text", "Trade reference 42");
    cy.contains("button", "New request").click();
    cy.get(".rfq-status").should("be.empty");
    cy.get("#rfq-quantity").should("be.enabled").and("be.focused");
  });

  it("words a filled sale as sold", () => {
    const { mount, request, quote, result } = setup();
    mount();
    cy.get("input[value=sell]").check();
    request();
    quote({ side: "sell" });
    cy.contains("button", "Accept").click();
    result({ price: 30390, tradeId: 1 });
    cy.get(".rfq-message").should("have.text", "Done: sold 4,888 AAA at 303.90");
  });

  it("sends the reject when Reject is pressed, and offers a new request", () => {
    const { mount, request, quote } = setup();
    mount();
    request();
    quote();
    cy.contains("button", "Reject").click();
    cy.get("@reject").should("have.been.calledOnce");
    cy.get(".rfq-message").should("have.text", "You turned the quote down.");
    cy.contains("button", "New request").should("exist");
  });

  it("turns an open quote down with Escape", () => {
    const { mount, request, quote } = setup();
    mount();
    request();
    quote();
    cy.get(".rfq-message").should("contain.text", "You buy");
    cy.get(".rfq-status").should("be.focused").trigger("keydown", { key: "Escape", bubbles: true, cancelable: true });
    cy.get("@reject").should("have.been.calledOnce");
    cy.get(".rfq-message").should("have.text", "You turned the quote down.");
  });

  it("leaves Escape alone when there is no open quote", () => {
    setup().mount();
    cy.get("#rfq-quantity").then(($input) => {
      const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
      $input[0]!.dispatchEvent(event);
      expect(event.defaultPrevented).to.equal(false);
    });
    cy.get("@reject").should("not.have.been.called");
  });

  it("explains each reason the dealer declines, and offers a new request", () => {
    const { mount, request, result } = setup();
    mount();
    request();
    result({ outcome: "declined", reason: "quantity" });
    cy.get(".rfq-message").should("contain.text", "does not quote that size").and("contain.text", "1,000,000");
    cy.contains("button", "New request").should("exist");
  });

  it("explains the other decline reasons", () => {
    for (const [reason, text] of [
      ["unknown-instrument", "not available"],
      ["busy", "Too many requests"],
    ] as const) {
      const { mount, request, result } = setup();
      mount();
      request();
      result({ outcome: "declined", reason });
      cy.get(".rfq-message").should("contain.text", text);
    }
  });

  it("counts down, turns amber in the last 3 seconds and announces it once, then expires and offers to ask again", () => {
    cy.clock(Date.now(), ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"]);
    const { mount, request, quote } = setup();
    mount();
    request();
    quote();
    cy.get(".rfq-countdown").should("exist"); // the countdown's timer is set up once the quote is on screen
    cy.tick(5000);
    cy.get(".rfq-countdown").should("contain.text", "5 s left").and("have.attr", "data-low", "false");
    cy.tick(2500);
    cy.get(".rfq-countdown").should("have.attr", "data-low", "true");
    cy.get("[role=status]").should("contain.text", "expires in");
    cy.tick(3000);
    cy.get(".rfq-message").should("have.text", "The quote expired. The price may have moved.");
    cy.contains("button", "Request again").should("exist");
    cy.contains("button", "Accept").should("not.exist");
  });

  it("shows expired when the server says the accepted quote had run out", () => {
    const { mount, request, quote, result } = setup();
    mount();
    request();
    quote();
    cy.contains("button", "Accept").click();
    result({ outcome: "expired" });
    cy.get(".rfq-message").should("contain.text", "expired");
  });

  it("gives up with a message if the server never answers a request", () => {
    cy.clock(Date.now(), ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"]);
    const { mount, request } = setup();
    mount();
    request();
    cy.get(".rfq-message").should("contain.text", "Asking");
    cy.tick(ANSWER_TIMEOUT_MS - 1);
    cy.get(".rfq-message").should("contain.text", "Asking");
    cy.tick(1);
    cy.get(".rfq-message").should("contain.text", "did not answer");
    cy.contains("button", "Request again").should("exist");
  });

  it("warns that the trade may have happened if the connection is lost while accepting", () => {
    const { bridge, mount, request, quote } = setup();
    mount();
    request();
    quote();
    cy.contains("button", "Accept").click();
    cy.then(() => bridge.emit({ type: "disconnected" }));
    cy.get(".rfq-message").should("contain.text", "may or may not have been done");
  });

  it("fails the request if the connection is lost before it is accepted", () => {
    const { bridge, mount, request } = setup();
    mount();
    request();
    cy.then(() => bridge.emit({ type: "disconnected" }));
    cy.get(".rfq-message").should("contain.text", "request was cancelled");
  });

  it("turns an open quote down when the ticket goes away", () => {
    const { bridge, request, quote } = setup();
    const Host = () => {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button onClick={() => setShown(false)}>away</button>
          {shown && <RfqTicket port={bridge.port} instrumentId={7} symbol="AAA" decimals={2} />}
        </>
      );
    };
    cy.mount(withI18n(<Host />));
    request();
    quote();
    cy.contains("button", "away").click();
    cy.get("@reject").should("have.been.calledOnce");
  });

  it("formats numbers for the language of the page", () => {
    const { bridge, request, quote } = setup();
    cy.mount(
      withI18n(<RfqTicket port={bridge.port} instrumentId={7} symbol="AAA" decimals={2} />),
    );
    request("1234");
    quote({ quantity: 1234 });
    cy.get(".rfq-message").should("contain.text", "1,234");
  });
});
