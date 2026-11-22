import { RfqBridge, type RfqPortEvent } from "../../../src/rfq/bridge";

const request = { ref: 1, id: 2, side: "buy", quantity: 3 } as const;

describe("RfqBridge", () => {
  it("passes the three ways to send straight through its port", () => {
    const send = { request: cy.stub(), accept: cy.stub(), reject: cy.stub() };
    const { port } = new RfqBridge(send);
    port.request(request);
    port.accept(1);
    port.reject(1);
    expect(send.request).to.have.been.calledWith(request);
    expect(send.accept).to.have.been.calledWith(1);
    expect(send.reject).to.have.been.calledWith(1);
  });

  it("tells every listener what the connection owner emits, until they stop listening", () => {
    const bridge = new RfqBridge({ request: cy.stub(), accept: cy.stub(), reject: cy.stub() });
    const first: RfqPortEvent[] = [];
    const second: RfqPortEvent[] = [];
    const stopFirst = bridge.port.subscribe((event) => first.push(event));
    bridge.port.subscribe((event) => second.push(event));
    bridge.emit({ type: "disconnected" });
    stopFirst();
    bridge.emit({ type: "disconnected" });
    expect(first).to.have.length(1);
    expect(second).to.have.length(2);
  });
});
