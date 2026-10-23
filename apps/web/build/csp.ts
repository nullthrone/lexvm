/**
 * Content-Security-Policy for the built index.html files, as a meta tag
 * (GitHub Pages cannot send headers, and the single-file build runs from
 * file://). Inline code is allowed by its SHA-256 hash only, so the policy is
 * computed from the final HTML, after vite-plugin-singlefile has inlined the
 * bundle:
 * - PWA build: scripts, styles, images, fetches, the manifest and the service
 *   worker from the app's own origin, plus the inline theme script.
 * - Single-file build: nothing from anywhere; the inline scripts and the
 *   inline stylesheet by hash, images only as data: URLs (the favicon).
 * Both require Trusted Types for script sinks. The only sink the app uses is
 * the service worker URL, through the "lexvm" policy (src/services/pwa.ts).
 * frame-ancestors cannot be set from a meta tag (see SECURITY.md).
 */
import { createHash } from "node:crypto";

export const CSP_META = /<meta http-equiv="Content-Security-Policy"[^>]*>\n?/g;

function sha256(text: string): string {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/** Hashes of the inline <script> elements (those without src) and of the inline <style> elements. */
export function inlineHashes(html: string): { scripts: string[]; styles: string[] } {
  const scripts: string[] = [];
  const styles: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(m[1] ?? "")) scripts.push(sha256(m[2] ?? ""));
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) styles.push(sha256(m[1] ?? ""));
  return { scripts: [...new Set(scripts)], styles: [...new Set(styles)] };
}

/** The policy for a built index.html. */
export function contentSecurityPolicy(html: string, singlefile: boolean): string {
  const { scripts, styles } = inlineHashes(html);
  const list = (...sources: string[]) => sources.join(" ") || "'none'";
  const directives = singlefile
    ? ["default-src 'none'", `script-src ${list(...scripts)}`, `style-src ${list(...styles)}`, "img-src data:"]
    : [
        "default-src 'none'",
        `script-src ${list("'self'", ...scripts)}`,
        `style-src ${list("'self'", ...styles)}`,
        "img-src 'self'",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
      ];
  directives.push(
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types lexvm",
  );
  return directives.join("; ");
}

/** The HTML with its policy as the first element of <head> (replacing an older one). */
export function withContentSecurityPolicy(html: string, singlefile: boolean): string {
  const base = html.replace(CSP_META, "");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(base, singlefile)}" />`;
  // Right after <meta charset>, before every script and stylesheet it governs.
  const charset = /<meta charset="[^"]*"\s*\/?>/i.exec(base);
  if (charset) {
    const at = charset.index + charset[0].length;
    return `${base.slice(0, at)}\n    ${meta}${base.slice(at)}`;
  }
  return base.replace(/<head>/i, `<head>\n    ${meta}`);
}
