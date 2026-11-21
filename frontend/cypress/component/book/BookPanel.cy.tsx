import { BookPanel, LADDER_LEVELS, TAPE_ROWS } from "../../../src/book/BookPanel";
import type { DepthLevel, Trade } from "../../../src/protocol/messages";
import { withI18n } from "../../support/render";

// A ladder of `count` levels a tick (0.01) apart: bids falling from 299.17 and asks rising from 299.21, sizes by level.
const ladder = (count = 12): { bids: DepthLevel[]; asks: DepthLevel[] } => ({
  bids: Array.from({ length: count }, (_, i): DepthLevel => [29917 - i, 1000 + i * 100]),
  asks: Array.from({ length: count }, (_, i): DepthLevel => [29921 + i, 2000 + i * 100]),
});
const trade = (n: number, side: Trade["side"] = "buy", overrides: Partial<Trade> = {}): Trade => ({ ts: 1_700_000_000_000 + n * 1000, price: 29900 + n, size: 100 * (n + 1), side, ...overrides });
const mountBook = (depth: ReturnType<typeof ladder> | null, tape: Trade[] = [], decimals = 2) => cy.mount(withI18n(<BookPanel depth={depth} tape={tape} decimals={decimals} />));

describe("BookPanel", () => {
  it("shows a skeleton, announced as loading, until the first order book arrives", () => {
    mountBook(null);
    cy.get("[role=status] .visually-hidden").should("have.text", "Loading the order book");
    cy.get("svg.skeleton").should("exist");
    cy.get("table").should("not.exist");
  });

  it("shows the order book and the trades side by side, each under its own heading", () => {
    mountBook(ladder(), [trade(0)]);
    cy.get("#book-title").should("have.text", "Order book");
    cy.get("#tape-title").should("have.text", "Recent trades");
    cy.get("section[aria-labelledby=book-title] table.book").should("exist");
    cy.get("section[aria-labelledby=tape-title] table.tape").should("exist");
    cy.get("#book-title").then(($book) => {
      cy.get("#tape-title").then(($tape) => {
        const book = $book[0]!.getBoundingClientRect();
        const tape = $tape[0]!.getBoundingClientRect();
        expect(tape.left, "the tape is to the right").to.be.greaterThan(book.right - 1);
        expect(Math.abs(tape.top - book.top), "on the same row").to.be.lessThan(2);
      });
    });
  });

  it("puts them one above the other on a narrow screen", () => {
    cy.viewport(600, 800);
    mountBook(ladder(), [trade(0)]);
    cy.get("#book-title").then(($book) => {
      cy.get("#tape-title").then(($tape) => expect($tape[0]!.getBoundingClientRect().top).to.be.greaterThan($book[0]!.getBoundingClientRect().bottom));
    });
  });

  describe("the order book", () => {
    it("has ten levels per side, however many the server sends", () => {
      expect(LADDER_LEVELS).to.equal(10);
      mountBook(ladder(12));
      cy.get("table.book tbody tr").should("have.length", 10);
    });

    it("shows fewer rows' worth of data, and leaves the rest of each row blank, when the server sends fewer levels", () => {
      mountBook(ladder(3));
      cy.get("table.book tbody tr").should("have.length", 10);
      cy.get("table.book tbody tr").eq(2).find("td").eq(1).should("have.text", "299.15");
      cy.get("table.book tbody tr").eq(3).find("td").each(($cell) => expect($cell.text()).to.equal(""));
    });

    it("has bid size, bid, ask and ask size columns, with headers for assistive technology", () => {
      mountBook(ladder());
      cy.get("table.book thead th").then(($headers) => expect([...$headers].map((h) => h.textContent)).to.deep.equal(["Bid size", "Bid", "Ask", "Ask size"]));
      cy.get("table.book thead th").each(($h) => expect($h.attr("scope")).to.equal("col"));
      cy.get("table.book caption").should("have.class", "visually-hidden");
    });

    it("puts the best bid and best ask at the top, with the worse levels below", () => {
      mountBook(ladder());
      cy.get("table.book tbody tr").eq(0).find("td").then(($cells) => {
        expect([...$cells].map((c) => c.textContent)).to.deep.equal(["1,000", "299.17", "299.21", "2,000"]);
      });
      cy.get("table.book tbody tr").eq(1).find("td").eq(1).should("have.text", "299.16");
      cy.get("table.book tbody tr").eq(1).find("td").eq(2).should("have.text", "299.22");
    });

    it("marks the top row as the best", () => {
      mountBook(ladder());
      cy.get("table.book tbody tr").eq(0).should("have.class", "book-best").find("td").should("have.css", "font-weight", "700");
      cy.get("table.book tbody tr").eq(1).should("not.have.class", "book-best");
    });

    it("formats prices with the instrument's own decimals", () => {
      mountBook({ bids: [[47213, 500]], asks: [[47217, 600]] }, [], 0);
      cy.get("table.book tbody tr").eq(0).find("td").eq(1).should("have.text", "47,213");
      mountBook({ bids: [[12801, 500]], asks: [[12809, 600]] }, [], 4);
      cy.get("table.book tbody tr").eq(0).find("td").eq(1).should("have.text", "1.2801");
    });

    describe("the size bars", () => {
      it("make the biggest size on screen a full-length bar, and the others shorter in proportion", () => {
        mountBook({ bids: [[100, 500], [99, 250]], asks: [[101, 1000], [102, 100]] });
        const bar = (row: number, column: number) => cy.get("table.book tbody tr").eq(row).find("td").eq(column).then(($c) => parseFloat($c[0]!.style.getPropertyValue("--bar")));
        bar(0, 3).should("equal", 100); // the biggest: 1,000
        bar(0, 0).should("equal", 50); // 500 of 1,000
        bar(1, 0).should("equal", 25);
        bar(1, 3).should("equal", 10);
      });

      it("have no bar where there is no size", () => {
        mountBook({ bids: [[100, 500]], asks: [] });
        cy.get("table.book tbody tr").eq(0).find("td").eq(3).then(($c) => expect(parseFloat($c[0]!.style.getPropertyValue("--bar"))).to.equal(0));
      });

      it("are green behind the bid sizes and red behind the ask sizes, so a bar is never the only sign of the side", () => {
        mountBook(ladder());
        cy.get("table.book tbody tr").eq(0).find("td.book-bid").should("have.css", "background-image").and("contain", "gradient");
        cy.get("table.book tbody tr").eq(0).find("td.book-ask").should("have.css", "background-image").and("contain", "gradient");
        cy.get("table.book thead th").eq(0).should("have.text", "Bid size"); // the column names say which side it is
      });
    });
  });

  describe("the trades tape", () => {
    it("says there are no trades yet, instead of an empty table", () => {
      mountBook(ladder(), []);
      cy.get(".book-empty").should("have.text", "No trades yet.");
      cy.get("table.tape").should("not.exist");
    });

    it("shows time, price, size and side for each trade, newest first", () => {
      mountBook(ladder(), [trade(2, "sell"), trade(1, "buy")]);
      cy.get("table.tape thead th").then(($h) => expect([...$h].map((c) => c.textContent)).to.deep.equal(["Time", "Price", "Size", "Side"]));
      cy.get("table.tape tbody tr").should("have.length", 2);
      cy.get("table.tape tbody tr").eq(0).find("td").then(($c) => {
        expect($c[1]!.textContent).to.equal("299.02");
        expect($c[2]!.textContent).to.equal("300");
        expect($c[3]!.textContent).to.equal("▼ Sell");
      });
      cy.get("table.tape tbody tr").eq(1).find("td").eq(3).should("have.text", "▲ Buy");
    });

    it("formats the time of day in the current locale", () => {
      mountBook(ladder(), [trade(0)]);
      cy.get("table.tape tbody tr").first().find("td").first().invoke("text").should("match", /\d{1,2}:\d{2}:\d{2}/);
    });

    it("writes the side out as well as coloring it, so it never relies on color alone", () => {
      mountBook(ladder(), [trade(0, "buy"), trade(1, "sell")]);
      cy.get("tr.tape-buy td").last().should("contain.text", "Buy");
      cy.get("tr.tape-sell td").last().should("contain.text", "Sell");
    });

    it("colors a buy green and a sell red", () => {
      mountBook(ladder(), [trade(0, "buy"), trade(1, "sell")]);
      const token = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      cy.get("tr.tape-buy td").first().should("have.css", "color", token("--color-up"));
      cy.get("tr.tape-sell td").first().should("have.css", "color", token("--color-down"));
    });

    it("shows only the latest ten, however many it is given", () => {
      expect(TAPE_ROWS).to.equal(10);
      mountBook(ladder(), Array.from({ length: 30 }, (_, i) => trade(i)));
      cy.get("table.tape tbody tr").should("have.length", 10);
      cy.get("table.tape tbody tr").first().find("td").eq(1).should("have.text", "299.00"); // the first given is the newest
    });

    describe("when new trades come in, they replace the old ones and the list does not grow", () => {
      it("keeps the same number of rows and shows the new trades", () => {
        const first = Array.from({ length: 10 }, (_, i) => trade(i));
        mountBook(ladder(), first);
        cy.get("table.tape tbody tr").should("have.length", 10);
        const second = Array.from({ length: 10 }, (_, i) => trade(i + 100));
        mountBook(ladder(), second);
        cy.get("table.tape tbody tr").should("have.length", 10);
        cy.get("table.tape tbody tr").first().find("td").eq(1).should("have.text", "300.00");
        cy.get("table.tape tbody").should("not.contain.text", "299.05");
      });

      it("keeps ten rows when several trades match in time, price, size and side (rows that share a key used to pile up)", () => {
        const same = trade(0, "buy", { ts: 1_700_000_000_000, price: 29921, size: 300 });
        mountBook(ladder(), Array.from({ length: 10 }, () => ({ ...same })));
        cy.get("table.tape tbody tr").should("have.length", 10);
        mountBook(ladder(), [trade(5), ...Array.from({ length: 9 }, () => ({ ...same }))]);
        cy.get("table.tape tbody tr").should("have.length", 10);
        cy.get("table.tape tbody tr").first().find("td").eq(1).should("have.text", "299.05");
        mountBook(ladder(), Array.from({ length: 4 }, () => ({ ...same })));
        cy.get("table.tape tbody tr").should("have.length", 4); // and shrinks when there are fewer
      });
    });
  });

  it("is not a live region, so a screen reader is not flooded with every change", () => {
    mountBook(ladder(), [trade(0)]);
    cy.get(".book-panel [aria-live]").should("not.exist");
    cy.get(".book-panel [role=status]").should("not.exist");
  });

  it("names the sections and columns in Japanese", () => {
    localStorage.setItem("locale", "ja-JP");
    mountBook(ladder(), [trade(0)]);
    cy.get("#book-title").should("have.text", "板情報");
    cy.get("#tape-title").should("have.text", "最近の約定");
    cy.get("table.book thead th").first().should("have.text", "買い数量");
    cy.get("tr.tape-buy td").last().should("contain.text", "買い");
  });
});
