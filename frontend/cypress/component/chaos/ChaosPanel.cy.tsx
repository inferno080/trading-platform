import { BURST, ChaosPanel, LATENCY } from "../../../src/chaos/ChaosPanel";
import { withI18n } from "../../support/render";

const mount = (connected = true) => {
  const onSend = cy.stub().as("send");
  cy.mount(withI18n(<ChaosPanel connected={connected} onSend={onSend} />));
  cy.contains("summary", "Chaos controls").click();
};
const press = (label: string) => cy.contains("button", label).click();

describe("ChaosPanel", () => {
  it("is closed until it is opened, so it stays out of the way", () => {
    cy.mount(withI18n(<ChaosPanel connected onSend={cy.stub()} />));
    cy.get("details.chaos").should("not.have.attr", "open");
    cy.contains("summary", "Chaos controls").click();
    cy.get("details.chaos").should("have.attr", "open");
  });

  it("warns that it affects every client connected to the server", () => {
    mount();
    cy.get(".chaos-note").first().should("contain.text", "every client");
  });

  it("explains every control next to its button, and ties the text to the button for screen readers", () => {
    mount();
    cy.get(".chaos-row").should("have.length", 7);
    cy.get(".chaos-row").each(($row) => {
      const button = $row.find("button")[0]!;
      const help = $row.find(".chaos-help")[0]!;
      expect(help.textContent!.length).to.be.greaterThan(10);
      expect(button.getAttribute("aria-describedby")).to.equal(help.id);
    });
  });

  it("sends each action with no number, and says what it sent", () => {
    mount();
    for (const [label, action] of [
      ["Pause the feed", "pause"],
      ["Resume the feed", "resume"],
      ["Lose a frame", "gap"],
      ["Drop the connection", "drop"],
      ["Reset all faults", "reset"],
    ] as const) {
      press(label);
      cy.get("@send").should("have.been.calledWith", action);
      cy.get(".chaos-sent").should("have.text", `Sent: ${label}`);
    }
  });

  it("sends a burst with the seconds in its box, and says so with the unit", () => {
    mount();
    cy.contains(".chaos-row", "Send a burst").find("input").clear().type("12");
    press("Send a burst");
    cy.get("@send").should("have.been.calledWith", "burst", 12);
    cy.get(".chaos-sent").should("have.text", "Sent: Send a burst (12 s)");
  });

  it("sends latency with the milliseconds in its box, and starts with the defaults", () => {
    mount();
    cy.contains(".chaos-row", "Send a burst").find("input").should("have.value", String(BURST.start));
    cy.contains(".chaos-row", "Add latency").find("input").should("have.value", String(LATENCY.start));
    press("Add latency");
    cy.get("@send").should("have.been.calledWith", "latency", 500);
    cy.get(".chaos-sent").should("have.text", "Sent: Add latency (500 ms)");
  });

  it("stops what is typed at the largest allowed value", () => {
    mount();
    cy.contains(".chaos-row", "Add latency").find("input").clear().type("99999").should("have.value", String(LATENCY.max));
    cy.contains(".chaos-row", "Send a burst").find("input").clear().type("999").should("have.value", String(BURST.max));
  });

  it("puts a value that is too small, or empty, back in range when the box is left", () => {
    mount();
    cy.contains(".chaos-row", "Send a burst").find("input").clear().type("0").blur().should("have.value", String(BURST.min));
    cy.contains(".chaos-row", "Send a burst").find("input").clear().blur().should("have.value", String(BURST.min));
    cy.contains(".chaos-row", "Add latency").find("input").clear().blur().should("have.value", "0");
  });

  it("sends only a value in range even if the box holds something else", () => {
    mount();
    cy.contains(".chaos-row", "Send a burst").find("input").clear().type("-5");
    press("Send a burst");
    cy.get("@send").should("have.been.calledWith", "burst", BURST.min);
  });

  it("is disabled, and says why, while the connection is not live", () => {
    mount(false);
    cy.get(".chaos-row button").each(($button) => expect($button).to.have.attr("disabled"));
    cy.get(".chaos-note").last().should("contain.text", "while the connection is live");
  });

  it("is in Japanese when the language is", () => {
    localStorage.setItem("locale", "ja-JP");
    cy.mount(withI18n(<ChaosPanel connected onSend={cy.stub()} />));
    cy.contains("summary", "障害テスト").should("exist");
    cy.contains("button", "接続を切断").should("exist");
  });
});
