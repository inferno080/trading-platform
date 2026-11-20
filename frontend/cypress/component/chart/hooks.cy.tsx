import { useRef } from "react";
import { useCanvasSize, useThemeVersion } from "../../../src/chart/hooks";
import { countInk } from "../../support/canvas";
import { afterFrames } from "../../support/frames";

function SizedCanvas({ width, height }: { width: string; height: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  return (
    <div style={{ width, height }}>
      <canvas ref={canvas} data-testid="canvas" style={{ display: "block", width: "100%", height: "100%" }} />
      <output data-testid="size">{`${size.width}x${size.height}@${size.dpr}`}</output>
    </div>
  );
}

function Theme() {
  return <output data-testid="theme">{useThemeVersion()}</output>;
}

describe("useCanvasSize", () => {
  it("reports the size of the canvas in CSS pixels, and sizes the pixel buffer to match", () => {
    cy.mount(<SizedCanvas width="300px" height="120px" />);
    cy.get("[data-testid=size]").should("have.text", "300x120@1");
    cy.get("canvas").should(($c) => {
      expect($c[0]!.width).to.equal(300);
      expect($c[0]!.height).to.equal(120);
    });
  });

  it("makes the buffer bigger on a high-density screen, so the picture stays sharp", () => {
    cy.stub(window, "devicePixelRatio").value(2);
    cy.mount(<SizedCanvas width="300px" height="120px" />);
    cy.get("[data-testid=size]").should("have.text", "300x120@2");
    cy.get("canvas").should(($c) => expect($c[0]!.width).to.equal(600));
  });

  it("follows the canvas when it is resized", () => {
    cy.mount(<SizedCanvas width="300px" height="120px" />);
    cy.get("[data-testid=size]").should("have.text", "300x120@1");
    cy.mount(<SizedCanvas width="200px" height="100px" />);
    cy.get("[data-testid=size]").should("have.text", "200x100@1");
    cy.get("canvas").should(($c) => expect($c[0]!.width).to.equal(200));
  });

  it("does not wipe a drawing when the page is resized by a fraction of a pixel (same whole-pixel size)", () => {
    cy.mount(<SizedCanvas width="300px" height="120px" />);
    cy.get("[data-testid=size]").should("have.text", "300x120@1");
    cy.get("canvas").then(($c) => {
      const canvas = $c[0] as HTMLCanvasElement;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "rgb(255, 0, 0)";
      context.fillRect(0, 0, 50, 50);
      expect(countInk(canvas)).to.be.greaterThan(0);
    });
    // Resize the same canvas's container by 0.4px: the observer fires, but the whole-pixel size is the same.
    cy.get("canvas").parent().then(($box) => {
      $box[0]!.style.width = "300.4px";
    });
    afterFrames(5);
    cy.get("canvas").should(($c) => expect(countInk($c[0] as HTMLCanvasElement), "the drawing is still there").to.be.greaterThan(0));
  });
});

describe("useThemeVersion", () => {
  it("starts at the same number each time, and changes when the theme attribute changes", () => {
    cy.mount(<Theme />);
    cy.get("[data-testid=theme]").invoke("text").then((before) => {
      cy.document().then((doc) => doc.documentElement.setAttribute("data-theme", "dark"));
      cy.get("[data-testid=theme]").should(($o) => expect($o.text()).not.to.equal(before));
    });
  });

  it("changes again for each further change, so a canvas redraws every time", () => {
    cy.mount(<Theme />);
    cy.document().then((doc) => doc.documentElement.setAttribute("data-theme", "dark"));
    cy.get("[data-testid=theme]").invoke("text").then((dark) => {
      cy.document().then((doc) => doc.documentElement.setAttribute("data-theme", "light"));
      cy.get("[data-testid=theme]").should(($o) => expect($o.text()).not.to.equal(dark));
    });
  });
});
