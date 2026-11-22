import { RfqBridge } from "../../../src/rfq/bridge";
import { RfqModal } from "../../../src/rfq/RfqModal";
import { withI18n } from "../../support/render";

const setup = () => {
  const send = { request: cy.stub().as("request"), accept: cy.stub().as("accept"), reject: cy.stub().as("reject") };
  const bridge = new RfqBridge(send);
  cy.mount(withI18n(<RfqModal port={bridge.port} instrumentId={7} symbol="AAA" decimals={2} />));
  const quote = () =>
    cy.then(() => {
      const { ref } = send.request.firstCall.args[0] as { ref: number };
      bridge.emit({ type: "quote", quote: { t: "rfqQuote", ref, id: 7, side: "buy", quantity: 10, price: 30398, screenPrice: 30396, validForMs: 10_000 } });
    });
  return { quote };
};

const openIt = () => cy.contains("button", "Request a quote").click();

describe("RfqModal", () => {
  it("shows only a button until it is pressed, and mounts no ticket", () => {
    setup();
    cy.contains("button", "Request a quote").should("exist");
    cy.get("dialog").should("not.have.attr", "open");
    cy.get("section.rfq").should("not.exist");
  });

  it("opens the ticket in a modal dialog labelled by the ticket's title", () => {
    setup();
    openIt();
    cy.get("dialog.rfq-modal").should("have.attr", "aria-labelledby", "rfq-title");
    cy.get("dialog.rfq-modal[open]").should("exist");
    cy.get("dialog section.rfq").should("be.visible");
    cy.get("dialog").then(($dialog) => expect(($dialog[0] as HTMLDialogElement).matches(":modal")).to.equal(true));
  });

  it("closes with its close button, and focus goes back to the button that opened it", () => {
    setup();
    openIt();
    cy.get(".rfq-close").should("have.attr", "aria-label", "Close").click();
    cy.get("dialog").should("not.have.attr", "open");
    cy.get("section.rfq").should("not.exist");
    cy.contains("button", "Request a quote").should("be.focused");
  });

  it("closes on Escape without Escape reaching the rest of the page", () => {
    setup();
    const seen = cy.stub().as("pageKey");
    cy.document().then((doc) => doc.addEventListener("keydown", seen));
    openIt();
    cy.get("#rfq-quantity").focus();
    cy.realPress("Escape");
    cy.get("dialog").should("not.have.attr", "open");
    cy.get("@pageKey").should("not.have.been.called");
  });

  it("turns an open quote down on the first Escape, and closes on the second", () => {
    const { quote } = setup();
    openIt();
    cy.get("#rfq-quantity").type("10{enter}");
    quote();
    cy.get(".rfq-message").should("contain.text", "You buy 10 AAA");
    cy.get(".rfq-status").should("be.focused");
    cy.realPress("Escape");
    cy.get("@reject").should("have.been.calledOnce");
    cy.get("dialog").should("have.attr", "open");
    cy.realPress("Escape");
    cy.get("dialog").should("not.have.attr", "open");
  });

  it("turns an open quote down when the dialog is closed with the button", () => {
    const { quote } = setup();
    openIt();
    cy.get("#rfq-quantity").type("10{enter}");
    quote();
    cy.get(".rfq-message").should("contain.text", "You buy 10 AAA");
    cy.get(".rfq-close").click();
    cy.get("@reject").should("have.been.calledOnce");
  });
});
