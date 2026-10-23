/**
 * Hash routes (work on GitHub Pages sub-paths and from file://):
 *   #/                          library
 *   #/play/<source>/<id>        continue (or start) a game
 *   #/play/<source>/<id>/new    start a new game
 *   #/create  #/settings  #/about
 */

export type Route =
  | { name: "library" }
  | { name: "play"; key: string; fresh: boolean }
  | { name: "create" }
  | { name: "settings" }
  | { name: "about" };

const PACK_ID = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PLAY = new RegExp(`^/play/(builtin|imported)/(${PACK_ID})(/new)?/?$`);

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  const play = PLAY.exec(path);
  if (play) return { name: "play", key: `${play[1]}:${play[2]}`, fresh: play[3] === "/new" };
  switch (path.replace(/\/+$/, "")) {
    case "/create":
      return { name: "create" };
    case "/settings":
      return { name: "settings" };
    case "/about":
      return { name: "about" };
    default:
      return { name: "library" };
  }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case "library":
      return "#/";
    case "play": {
      const [source, id] = route.key.split(":");
      return `#/play/${source}/${id}${route.fresh ? "/new" : ""}`;
    }
    default:
      return `#/${route.name}`;
  }
}
