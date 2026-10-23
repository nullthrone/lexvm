/** Line icons (24×24, stroked). Built with createElementNS; path data is static and trusted. */

const PATHS = {
  menu: "M4 7h16M4 12h16M4 17h16",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6L6 18",
  bag: "M5.5 8h13l-1.2 12.5H6.7L5.5 8zM9 8V6.5a3 3 0 0 1 6 0V8",
  notebook:
    "M6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6M9 11h4",
  bulb: "M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z",
  keyboard: "M3 6.5h18v11H3zM6.5 10h1M10 10h1M13.5 10h1M17 10h1M7.5 14h9",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  npc: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0",
  container: "M3.5 8l8.5-4.5L20.5 8v8.5L12 21l-8.5-4.5zM3.5 8l8.5 4.5L20.5 8M12 12.5V21",
  item: "M3.5 12.5V4h8.5l9 9-8.5 8.5zM8 8.5h.01",
  clue: "M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h4",
  scenery: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  arrow: "M12 19.5V5M6 11l6-6 6 6",
  stairsUp: "M3 20h5v-4.5h4.5V11H17V6.5h4M14 3.5h7v7",
  stairsDown: "M3 6.5h4.5V11H12v4.5h4.5V20H21M3 13.5v7h7",
  doorIn: "M13 4h6v16h-6M3 12h11M10 8l4 4-4 4",
  doorOut: "M11 4H5v16h6M9 12h12M17 8l4 4-4 4",
  chevron: "M9 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7",
  download: "M12 4v11.5M7 10.5l5 5 5-5M5 20h14",
  upload: "M12 20V8.5M7 13.5l5-5 5 5M5 4h14",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  pencil: "M4 20l4.2-1L19.5 7.7a2.1 2.1 0 0 0-3-3L5.2 15.8 4 20z",
  sliders: "M4 6.5h9M17 6.5h3M15 4.5v4M4 12h3M11 12h9M9 10v4M4 17.5h11M19 17.5h1M17 15.5v4",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01",
  trash: "M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13",
  play: "M7.5 4.5l12 7.5-12 7.5z",
  restart: "M4 4.5V10h5.5M5.2 15a8 8 0 1 0 1.6-8.1L4 10",
  book: "M3.5 5.5c3-1.5 5.7-1.5 8.5.3 2.8-1.8 5.5-1.8 8.5-.3v13.5c-3-1.5-5.7-1.5-8.5.3-2.8-1.8-5.5-1.8-8.5-.3zM12 5.8v13.5",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
} as const;

export type IconName = keyof typeof PATHS;

const SVG_NS = "http://www.w3.org/2000/svg";

export function icon(name: IconName, options: { class?: string; rotate?: number } = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", options.class ? `icon ${options.class}` : "icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", PATHS[name]);
  if (options.rotate) path.setAttribute("transform", `rotate(${options.rotate} 12 12)`);
  svg.appendChild(path);
  return svg;
}

const EXIT_ROTATION: Record<string, number> = {
  north: 0,
  northeast: 45,
  east: 90,
  southeast: 135,
  south: 180,
  southwest: 225,
  west: 270,
  northwest: 315,
};

/** Icon for an exit chip: a compass arrow for standard directions, stairs/doors for up/down/in/out. */
export function exitIcon(exitId: string): SVGSVGElement {
  const rotation = EXIT_ROTATION[exitId];
  if (rotation !== undefined) return icon("arrow", { rotate: rotation });
  if (exitId === "up") return icon("stairsUp");
  if (exitId === "down") return icon("stairsDown");
  if (exitId === "in") return icon("doorIn");
  if (exitId === "out") return icon("doorOut");
  return icon("chevron");
}
