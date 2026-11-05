import {buildDiagramSvg} from "@utils/diagramSnapshot";

describe("utils/diagramSnapshot", () => {
    const build = () => {
        const host = document.createElement("div");
        host.innerHTML = `<style>.token { stroke: rgb(1, 2, 3); }</style>
            <svg><defs><marker id="arrow"></marker></defs><g id="layer">
                <g class="djs-element"><rect class="djs-hit"></rect><rect class="djs-outline"></rect><rect class="shape"></rect></g>
                <circle class="token" style="visibility: hidden"></circle>
            </g></svg>`;
        document.body.appendChild(host);
        const svg = host.querySelector("svg");
        const layer = host.querySelector<SVGGElement>("#layer");
        (layer as unknown as {getBBox: () => DOMRect}).getBBox = () => ({x: 10, y: 20, width: 100, height: 50}) as DOMRect;
        return buildDiagramSvg(svg, layer, "2024-01-01 · 3 cases in progress");
    };

    it("keeps the diagram and its dots, with their styles, and adds the moment", () => {
        const {markup, width, height} = build();
        const doc = new DOMParser().parseFromString(markup, "image/svg+xml");

        expect([width, height]).toEqual([140, 118]);
        expect(doc.querySelector("marker")).not.toBeNull();
        expect(doc.querySelector("rect.shape")).not.toBeNull();
        expect(doc.querySelector("circle.token").getAttribute("style")).toContain("visibility: hidden");
        expect(doc.querySelector("circle.token").getAttribute("style")).toContain("stroke: rgb(1, 2, 3)");
        expect(doc.documentElement.lastElementChild.textContent).toBe("2024-01-01 · 3 cases in progress");
    });

    it("leaves out the invisible hit areas", () => {
        const {markup} = build();
        expect(markup).not.toContain("djs-hit");
        expect(markup).not.toContain("djs-outline");
    });
});
