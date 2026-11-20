import { WATCHLIST_LIMIT, useWatchlist } from "../../../src/watchlist/useWatchlist";
import { withI18n } from "../../support/render";

let api: ReturnType<typeof useWatchlist>;

function Host() {
  api = useWatchlist();
  return <output data-testid="state">{JSON.stringify({ ids: api.ids, open: api.open, toast: api.toast?.text ?? null })}</output>;
}

const mount = () => {
  cy.mount(withI18n(<Host />));
  cy.get("[data-testid=state]").should("exist"); // rendered, so `api` is this test's hook and not the last test's
};
type State = { ids: number[]; open: boolean; toast: string | null };
// Checks the hook's state as shown on the page, trying again until the check passes (React updates a moment after an action).
const shouldState = (check: (state: State) => void) => cy.get("[data-testid=state]").should(($o) => check(JSON.parse($o.text()) as State));
// Runs an action on the hook, then waits for React to re-render, so the next action sees the new state (the hook's
// functions are recreated on each render, and calling an old one would work from the old list).
const act = (action: () => void) => {
  let before: typeof api;
  cy.then(() => {
    before = api;
    action();
  });
  cy.wrap(null).should(() => expect(api, "React re-rendered").not.to.equal(before));
};

describe("useWatchlist", () => {
  it("starts empty and open", () => {
    mount();
    shouldState((s) => expect(s).to.deep.equal({ ids: [], open: true, toast: null }));
  });

  it("holds at most four symbols", () => {
    expect(WATCHLIST_LIMIT).to.equal(4);
  });

  describe("adding", () => {
    it("puts symbols on the list in the order they were added", () => {
      mount();
      act(() => api.toggle(3));
      cy.get("[data-testid=state]").should("contain.text", '"ids":[3]');
      act(() => api.toggle(1));
      shouldState((s) => expect(s.ids).to.deep.equal([3, 1]));
    });

    it("opens the panel when a symbol is added, so it can be seen", () => {
      mount();
      act(() => api.setOpen(false));
      shouldState((s) => expect(s.open).to.equal(false));
      act(() => api.toggle(5));
      shouldState((s) => expect(s.open).to.equal(true));
    });

    it("refuses a fifth symbol with a message that says the list is full, and leaves the list as it was", () => {
      mount();
      for (const id of [1, 2, 3, 4]) act(() => api.toggle(id));
      shouldState((s) => expect(s.ids).to.deep.equal([1, 2, 3, 4]));
      act(() => api.toggle(9));
      shouldState((value) => {
        expect(value.ids).to.deep.equal([1, 2, 3, 4]);
        expect(value.toast).to.equal("The watchlist is full (4 symbols). Remove one to add another.");
      });
    });

    it("shows the full-list message again each time it is refused (a new message every time)", () => {
      mount();
      for (const id of [1, 2, 3, 4]) act(() => api.toggle(id));
      act(() => api.toggle(9));
      cy.get("[data-testid=state]").should("contain.text", "full");
      let first = 0;
      act(() => {
        first = api.toast!.nonce;
        api.dismissToast();
      });
      shouldState((s) => expect(s.toast).to.equal(null));
      act(() => api.toggle(9));
      cy.then(() => expect(api.toast!.nonce).not.to.equal(first));
    });
  });

  describe("removing", () => {
    it("takes a symbol off when toggled again", () => {
      mount();
      act(() => api.toggle(1));
      act(() => api.toggle(2));
      cy.get("[data-testid=state]").should("contain.text", "[1,2]");
      act(() => api.toggle(1));
      shouldState((s) => expect(s.ids).to.deep.equal([2]));
    });

    it("takes a symbol off with remove, and does nothing for one that is not there", () => {
      mount();
      act(() => api.toggle(1));
      act(() => api.toggle(2));
      cy.get("[data-testid=state]").should("contain.text", "[1,2]");
      act(() => api.remove(1));
      shouldState((s) => expect(s.ids).to.deep.equal([2]));
      cy.then(() => api.remove(99)); // nothing to remove, so nothing changes
      shouldState((s) => expect(s.ids).to.deep.equal([2]));
    });

    it("makes room for another symbol after one is removed from a full list", () => {
      mount();
      for (const id of [1, 2, 3, 4]) act(() => api.toggle(id));
      act(() => api.remove(2));
      act(() => api.toggle(9));
      shouldState((value) => {
        expect(value.ids).to.deep.equal([1, 3, 4, 9]);
        expect(value.toast).to.equal(null);
      });
    });
  });

  describe("keeping the list between visits", () => {
    it("saves the symbols and whether the panel is open", () => {
      mount();
      act(() => api.toggle(7));
      act(() => api.setOpen(false));
      cy.get("[data-testid=state]").should("contain.text", '"open":false');
      cy.then(() => {
        expect(localStorage.getItem("watchlist")).to.equal("[7]");
        expect(localStorage.getItem("watchlist.open")).to.equal("false");
      });
    });

    it("restores them when it starts", () => {
      localStorage.setItem("watchlist", "[2,4]");
      localStorage.setItem("watchlist.open", "false");
      mount();
      shouldState((s) => expect(s).to.deep.equal({ ids: [2, 4], open: false, toast: null }));
    });

    it("starts empty and open when what was saved is not a list", () => {
      localStorage.setItem("watchlist", "not json {");
      mount();
      shouldState((s) => expect(s).to.deep.equal({ ids: [], open: true, toast: null }));
    });

    it("ignores saved entries that are not whole numbers, and keeps no more than the limit", () => {
      localStorage.setItem("watchlist", JSON.stringify([1, "x", 2.5, 3, null, 4, 5, 6]));
      mount();
      shouldState((s) => expect(s.ids).to.deep.equal([1, 3, 4, 5]));
    });

    it("starts empty when what was saved is not an array", () => {
      localStorage.setItem("watchlist", '{"a":1}');
      mount();
      shouldState((s) => expect(s.ids).to.deep.equal([]));
    });

    it("still works when storage is blocked", () => {
      cy.stub(Storage.prototype, "getItem").throws(new Error("blocked"));
      cy.stub(Storage.prototype, "setItem").throws(new Error("blocked"));
      mount();
      shouldState((s) => expect(s).to.deep.equal({ ids: [], open: true, toast: null }));
      act(() => api.toggle(3));
      shouldState((s) => expect(s.ids).to.deep.equal([3]));
    });
  });
});
