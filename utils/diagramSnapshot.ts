const SVG_NS = "http://www.w3.org/2000/svg";
const STYLED = ".token, .load-pill rect, .load-pill text, .selected-task .djs-visual > *, .case-path .djs-visual > *";
const COPIED_STYLES = ["fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight", "text-anchor"];
const PADDING = 20;
const CAPTION_HEIGHT = 28;
const PNG_SCALE = 2;
const MAX_PNG_SIDE = 16000;

export const buildDiagramSvg = (svg: SVGSVGElement, layer: SVGGElement, caption: string): {markup: string; width: number; height: number} => {
    const box = layer.getBBox();
    const copy = layer.cloneNode(true) as SVGGElement;

    const originals = layer.querySelectorAll(STYLED);
    copy.querySelectorAll(STYLED).forEach((element, index) => {
        const computed = getComputedStyle(originals[index]);
        COPIED_STYLES.forEach(name => (element as SVGElement).style.setProperty(name, computed.getPropertyValue(name)));
    });
    copy.querySelectorAll(".djs-hit, .djs-outline").forEach(element => element.remove());

    const width = Math.ceil(box.width + 2 * PADDING);
    const height = Math.ceil(box.height + 2 * PADDING + CAPTION_HEIGHT);
    const x = box.x - PADDING;
    const y = box.y - PADDING;

    const root = document.createElementNS(SVG_NS, "svg");
    root.setAttribute("width", String(width));
    root.setAttribute("height", String(height));
    root.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);

    const background = document.createElementNS(SVG_NS, "rect");
    Object.entries({x, y, width, height, fill: "#ffffff"}).forEach(([name, value]) => background.setAttribute(name, String(value)));
    root.appendChild(background);

    const defs = svg.querySelector("defs");
    if (defs) root.appendChild(defs.cloneNode(true));
    root.appendChild(copy);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(box.x));
    text.setAttribute("y", String(box.y + box.height + PADDING + 12));
    text.setAttribute("style", "font: 14px Arial, sans-serif; fill: #334155");
    text.textContent = caption;
    root.appendChild(text);

    return {markup: new XMLSerializer().serializeToString(root), width, height};
};

const download = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadSvg = (markup: string, fileName: string) =>
    download(new Blob([markup], {type: "image/svg+xml"}), fileName);

export const downloadPng = async (markup: string, width: number, height: number, fileName: string) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await image.decode();

    const scale = Math.min(PNG_SCALE, MAX_PNG_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not encode the image");
    download(blob, fileName);
};
