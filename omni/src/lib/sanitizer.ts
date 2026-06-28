import sanitizeHtmlLib from "sanitize-html";

let sanitizationFailures = 0;

export function sanitizeHtml(html: string): string {
  if (!html) return "";

  return sanitizeHtmlLib(html, {
    allowedTags: [
      "a", "b", "i", "u", "strong", "em", "p", "br", "span", "div", 
      "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", 
      "table", "thead", "tbody", "tr", "th", "td", "img", "blockquote", 
      "pre", "code", "hr", "section", "header", "footer", "main", "aside", 
      "font"
    ],
    allowedAttributes: {
      "*": ["style", "class", "id", "align", "valign", "width", "height"],
      "a": ["href", "name", "target", "title"],
      "img": ["src", "alt", "title", "border"],
      "table": ["cellpadding", "cellspacing", "border"],
      "font": ["color", "face", "size"]
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto", "tel"],
      img: ["http", "https", "cid"]
    },
    transformTags: {
      "*": (tagName, attribs) => {
        let modified = false;
        for (const key of Object.keys(attribs)) {
          if (key.toLowerCase().startsWith("on")) {
            delete attribs[key];
            modified = true;
          }
        }
        if (modified) {
          sanitizationFailures++;
        }
        return { tagName, attribs };
      }
    },
    exclusiveFilter: (frame) => {
      const allowed = new Set([
        "a", "b", "i", "u", "strong", "em", "p", "br", "span", "div", 
        "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", 
        "table", "thead", "tbody", "tr", "th", "td", "img", "blockquote", 
        "pre", "code", "hr", "section", "header", "footer", "main", "aside", 
        "font"
      ]);
      if (!allowed.has(frame.tag)) {
        sanitizationFailures++;
      }
      return false; 
    }
  });
}

export function getSanitizationFailuresCount(): number {
  return sanitizationFailures;
}
