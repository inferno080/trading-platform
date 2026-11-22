import { RECONNECT_BASE_MS, RECONNECT_MAX_MS, Reconnector, backoffDelay, type ReconnectInfo } from "../../../src/feed/reconnect";

describe("backoffDelay", () => {
  it("doubles the wait with each attempt, from one second", () => {
    const full = () => 1; // the longest the random part can make it
    expect([1, 2, 3, 4].map((attempt) => backoffDelay(attempt, full))).to.deep.equal([1000, 2000, 4000, 8000]);
    expect(RECONNECT_BASE_MS).to.equal(1000);
  });

  it("never waits longer than the cap, however many attempts have failed", () => {
    expect(backoffDelay(5, () => 1)).to.equal(RECONNECT_MAX_MS);
    expect(backoffDelay(50, () => 1)).to.equal(RECONNECT_MAX_MS);
  });

  it("keeps half the wait fixed and randomises the rest, so clients cut off together do not return together", () => {
    expect(backoffDelay(3, () => 0)).to.equal(2000);
    expect(backoffDelay(3, () => 0.5)).to.equal(3000);
    expect(backoffDelay(3, () => 1)).to.equal(4000);
  });
});

describe("Reconnector", () => {
  // A reconnector on a fake clock, with no randomness, that records what it does. The clock is installed first (cy.clock is
  // a command, so the test body runs inside `then`, once it is in place).
  const withReconnector = (test: (r: { reconnector: Reconnector; reconnect: sinon.SinonStub; waiting: ReconnectInfo[] }) => void) =>
    cy.clock(0, ["setTimeout", "clearTimeout"]).then(() => {
      const waiting: ReconnectInfo[] = [];
      const reconnect = cy.stub();
      test({ reconnector: new Reconnector(reconnect, (info) => waiting.push(info), () => 10_000, () => 1), reconnect, waiting });
    });

  it("schedules an attempt when the connection is lost, and says which attempt it is and when it will be made", () => {
    withReconnector(({ reconnector, reconnect, waiting }) => {
      reconnector.lost();
      expect(waiting).to.deep.equal([{ attempt: 1, retryAt: 11_000 }]);
      expect(reconnector.waiting).to.equal(true);
      cy.tick(999).then(() => expect(reconnect).to.have.callCount(0));
      cy.tick(1).then(() => {
        expect(reconnect).to.have.callCount(1);
        expect(reconnector.waiting).to.equal(false);
      });
    });
  });

  it("waits longer after each failed attempt", () => {
    withReconnector(({ reconnector, reconnect, waiting }) => {
      reconnector.lost();
      cy.tick(1000).then(() => reconnector.lost()); // the attempt failed too
      cy.then(() => expect(waiting.map((info) => info.attempt)).to.deep.equal([1, 2]));
      cy.tick(1999).then(() => expect(reconnect).to.have.callCount(1));
      cy.tick(1).then(() => expect(reconnect).to.have.callCount(2));
    });
  });

  it("starts again from the shortest wait once a connection has worked", () => {
    withReconnector(({ reconnector, waiting }) => {
      reconnector.lost();
      reconnector.lost();
      reconnector.succeeded();
      reconnector.lost();
      expect(waiting.map((info) => info.attempt)).to.deep.equal([1, 2, 1]);
    });
  });

  it("replaces a scheduled attempt when it is lost again, instead of making two", () => {
    withReconnector(({ reconnector, reconnect }) => {
      reconnector.lost();
      reconnector.lost();
      cy.tick(5000).then(() => expect(reconnect).to.have.callCount(1));
    });
  });

  it("tries at once when asked to, and the scheduled attempt does not then happen as well", () => {
    withReconnector(({ reconnector, reconnect }) => {
      reconnector.lost();
      reconnector.retryNow();
      expect(reconnect).to.have.callCount(1);
      cy.tick(5000).then(() => expect(reconnect).to.have.callCount(1));
    });
  });

  it("ignores a request to retry when nothing is scheduled", () => {
    withReconnector(({ reconnector, reconnect }) => {
      reconnector.retryNow();
      expect(reconnect).to.have.callCount(0);
    });
  });

  it("stops: no attempt is made, and the count starts again", () => {
    withReconnector(({ reconnector, reconnect, waiting }) => {
      reconnector.lost();
      reconnector.lost();
      reconnector.stop();
      expect(reconnector.waiting).to.equal(false);
      cy.tick(20_000).then(() => {
        expect(reconnect).to.have.callCount(0);
        reconnector.lost();
        expect(waiting.at(-1)?.attempt).to.equal(1);
      });
    });
  });
});
