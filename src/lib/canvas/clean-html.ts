/**
 * Canvas HTML → HTML that is safe to render inside Erwin. Pure — the caller
 * supplies what's mirrored locally (`material-html.ts` does the lookup).
 *
 * Two jobs at once:
 *  1. Sanitize. Assignment descriptions, page bodies and syllabi are
 *     instructor-authored HTML; only structural markup survives — no script,
 *     style, iframes, event handlers or inline styling.
 *  2. Point links at the local mirror. A link to a course file that's already
 *     on disk opens Erwin's copy instead of a Canvas login page; a link to a
 *     mirrored page opens it in the library. Anything else Canvas-relative is
 *     made absolute so it still reaches Canvas.
 */
import sanitizeHtml, { type Attributes } from "sanitize-html";

export interface LocalTargets {
  /** Canvas file id → material id, for files cached on disk. */
  files: ReadonlyMap<string, string>;
  /** Canvas page slug → material id, for pages with a mirrored body. */
  pages: ReadonlyMap<string, string>;
}

export interface CleanOptions {
  /** Canvas id of the course the HTML belongs to; links into other courses are left alone. */
  courseCanvasId: string | null;
  /** e.g. https://northeastern.instructure.com — used to absolutize relative links. */
  canvasBaseUrl: string | null;
  targets: LocalTargets;
}

export const NO_TARGETS: LocalTargets = { files: new Map(), pages: new Map() };

export const materialFileHref = (materialId: string) =>
  `/api/erwin/materials/${materialId}/file`;
export const materialLibraryHref = (materialId: string) =>
  `/courses?m=${materialId}`;

type Resolved = { href: string; local: boolean };

function resolve(raw: string, opts: CleanOptions): Resolved | null {
  const href = raw.trim();
  if (!href) return null;

  const base = opts.canvasBaseUrl?.replace(/\/+$/, "") ?? null;
  // Canvas writes course links both relative and absolute; normalise to a path.
  let path: string | null = null;
  if (href.startsWith("/")) path = href;
  else if (base && href.startsWith(base + "/")) path = href.slice(base.length);

  if (path && opts.courseCanvasId) {
    const course = opts.courseCanvasId;
    const file = path.match(new RegExp(`^/courses/${course}/files/(\\d+)`));
    const fileMaterial = file ? opts.targets.files.get(file[1]) : undefined;
    if (fileMaterial) return { href: materialFileHref(fileMaterial), local: true };

    const page = path.match(new RegExp(`^/courses/${course}/pages/([A-Za-z0-9_\\-%.]+)`));
    if (page) {
      let slug = page[1];
      try {
        slug = decodeURIComponent(slug);
      } catch {
        // A malformed escape is just an unknown slug.
      }
      const pageMaterial = opts.targets.pages.get(slug);
      if (pageMaterial) return { href: materialLibraryHref(pageMaterial), local: true };
    }
  }

  if (path) return base ? { href: base + path, local: false } : null;
  if (/^(https?:|mailto:)/i.test(href)) return { href, local: false };
  if (href.startsWith("#")) return { href, local: true };
  return null;
}

export function cleanCanvasHtml(html: string | null | undefined, opts: CleanOptions): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr", "div", "span",
      "h2", "h3", "h4", "h5", "h6",
      "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
      "a", "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
      ol: ["start"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    // The packet's own heading sits above the instructions; an instructor's
    // <h1> shouldn't outrank it.
    transformTags: {
      h1: "h2",
      a: (tagName, attribs) => {
        const target = attribs.href ? resolve(attribs.href, opts) : null;
        if (!target) return { tagName: "span", attribs: {} };
        const out: Attributes = { href: target.href };
        // A local file opens in its own tab like a Canvas one would; a
        // library page is an in-app navigation.
        if (!target.local || target.href.startsWith("/api/")) out.target = "_blank";
        if (!target.local) out.rel = "noopener noreferrer";
        return { tagName, attribs: out };
      },
      // Canvas images live behind Canvas auth, so only a locally mirrored one
      // can actually render; the rest are dropped rather than left broken.
      img: (tagName, attribs) => {
        const target = attribs.src ? resolve(attribs.src, opts) : null;
        const out: Attributes =
          target?.local && target.href.startsWith("/api/")
            ? { src: target.href, alt: attribs.alt ?? "" }
            : {};
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
