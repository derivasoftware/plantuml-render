// @covers render.shared.esc, render.shared.idPrefix, render.shared.linked, render.shared.memberMarkup, render.shared.noticeMarkup
// @covers render.shared.refAttrs, render.shared.splitParams, render.shared.svgRoot, render.shared.tokenStyle, render.shared.tooltip
import { describe, expect, it } from "vitest";

import {
  esc,
  idPrefix,
  linked,
  memberMarkup,
  noticeMarkup,
  refAttrs,
  splitParams,
  svgRoot,
  tokenStyle,
  tooltip,
} from "../../src/render/shared.js";

const name = (text: string, cls = "pr-name") => `<tspan class="${cls}">${text}</tspan>`;
const punct = (text: string) => `<tspan class="pr-punct">${text}</tspan>`;
const param = (text: string) => `<tspan class="pr-param">${text}</tspan>`;
const type = (text: string) => `<tspan class="pr-type">${text}</tspan>`;

describe("esc", () => {
  it("escapes the four characters that break markup or a double-quoted attribute", () => {
    expect(esc(`<a href="x">`)).toBe("&lt;a href=&quot;x&quot;&gt;");
  });

  it("escapes ampersands first, so its own entities are not escaped twice", () => {
    expect(esc("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });

  it("escapes an existing entity as literal text", () => {
    expect(esc("&lt;")).toBe("&amp;lt;");
  });

  it("leaves plain text and the empty string as they are", () => {
    expect(esc("plain text 123")).toBe("plain text 123");
    expect(esc("")).toBe("");
  });
});

describe("idPrefix", () => {
  it("hashes the title with 32-bit FNV-1a, in base 36, between pr and a dash", () => {
    // Published FNV-1a test vectors.
    expect(idPrefix("a")).toBe(`pr${(0xe40c292c).toString(36)}-`);
    expect(idPrefix("foobar")).toBe(`pr${(0xbf9cf968).toString(36)}-`);
  });

  it("gives an untitled diagram the offset basis, the same as an empty title", () => {
    const basis = `pr${(0x811c9dc5).toString(36)}-`;
    expect(idPrefix(undefined)).toBe(basis);
    expect(idPrefix("")).toBe(basis);
  });

  it("is deterministic and tells different titles apart", () => {
    expect(idPrefix("Orders")).toBe(idPrefix("Orders"));
    expect(idPrefix("Orders")).not.toBe(idPrefix("orders"));
  });

  it("produces a prefix usable at the start of an XML id", () => {
    for (const title of ["", "a", "with spaces", "ñandú <&>", "x".repeat(500)]) {
      expect(idPrefix(title)).toMatch(/^pr[0-9a-z]+-$/);
    }
  });
});

describe("tokenStyle", () => {
  it("emits nothing without tokens", () => {
    expect(tokenStyle(undefined)).toBe("");
    expect(tokenStyle({})).toBe("");
  });

  it("writes one scoped rule holding every token, in order", () => {
    expect(tokenStyle({ "--pr-text": "red", "--pr-font": "serif" })).toBe(
      "\n  .pr-diagram { --pr-text: red; --pr-font: serif; }",
    );
  });

  it("drops names that are not custom properties, and the rule if none is left", () => {
    expect(tokenStyle({ color: "red", "--bad name": "x", "--a;b": "y" })).toBe("");
    expect(tokenStyle({ color: "red", "--PR-Ok-1": "blue" })).toBe("\n  .pr-diagram { --PR-Ok-1: blue; }");
  });

  it("removes from a value the characters that could leave the declaration", () => {
    expect(tokenStyle({ "--x": "red;}</style><b>{" })).toBe("\n  .pr-diagram { --x: red/styleb; }");
  });
});

describe("svgRoot", () => {
  it("writes the viewBox from all four numbers and the natural size from the last two", () => {
    expect(svgRoot(-5, 10, 300, 200)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 10 300 200" width="300" height="200" style="max-width:100%;height:auto" class="pr-diagram" role="img">',
    );
  });
});

describe("splitParams", () => {
  it("splits on commas and keeps the surrounding whitespace for the caller", () => {
    expect(splitParams("a: int, b: str")).toEqual(["a: int", " b: str"]);
  });

  it("keeps commas nested in any bracket inside their parameter", () => {
    expect(splitParams("m: Map<K, V>, f: (x, y), l: [1, 2], o: {a, b}")).toEqual([
      "m: Map<K, V>",
      " f: (x, y)",
      " l: [1, 2]",
      " o: {a, b}",
    ]);
    expect(splitParams("deep: A<B<C, D>, E>, x")).toEqual(["deep: A<B<C, D>, E>", " x"]);
  });

  it("returns nothing for an empty or blank list", () => {
    expect(splitParams("")).toEqual([]);
    expect(splitParams("   ")).toEqual([]);
  });

  it("returns a single parameter whole", () => {
    expect(splitParams("only")).toEqual(["only"]);
  });

  it("drops a blank tail after a trailing comma", () => {
    expect(splitParams("a, ")).toEqual(["a"]);
  });
});

describe("memberMarkup", () => {
  it.each([
    ["+", "public"],
    ["-", "private"],
    ["#", "protected"],
    ["~", "package"],
  ])("reads the visibility %s as %s", (mark, visibility) => {
    expect(memberMarkup(`${mark} x`).visibility).toBe(visibility);
  });

  it("has no visibility without a mark", () => {
    expect(memberMarkup("x").visibility).toBeUndefined();
  });

  it("tokenises an attribute into name and type", () => {
    expect(memberMarkup("  + count : int").inner).toBe(name("count") + punct(" : ") + type("int"));
  });

  it("draws a line with neither parentheses nor a type as a bare name", () => {
    expect(memberMarkup("# some words")).toEqual({ visibility: "protected", inner: name("some words") });
  });

  it("tokenises a method with typed and untyped parameters and a return type", () => {
    expect(memberMarkup("- find(id: int, raw) : Order").inner).toBe(
      name("find") +
        punct("(") +
        param("id") +
        punct(": ") +
        type("int") +
        punct(", ") +
        param("raw") +
        punct(")") +
        punct(" : ") +
        type("Order"),
    );
  });

  it("draws a method with no parameters and no return type", () => {
    expect(memberMarkup("run()").inner).toBe(name("run") + punct("(") + punct(")"));
  });

  it("does not split a generic parameter type on its inner comma", () => {
    expect(memberMarkup("f(m: Map<K, V>)").inner).toBe(
      name("f") + punct("(") + param("m") + punct(": ") + type("Map&lt;K, V&gt;") + punct(")"),
    );
  });

  it("marks static and abstract members on the name", () => {
    expect(memberMarkup("+ {static} a : int").inner).toContain('class="pr-name pr-static"');
    expect(memberMarkup("{abstract} b()").inner).toContain('class="pr-name pr-abstract-member"');
    expect(memberMarkup("{static} {abstract} c").inner).toContain('class="pr-name pr-static pr-abstract-member"');
    expect(memberMarkup("+ {static} a : int").visibility).toBe("public");
  });

  it("escapes every piece it draws", () => {
    expect(memberMarkup("<x> : List<&>").inner).toBe(name("&lt;x&gt;") + punct(" : ") + type("List&lt;&amp;&gt;"));
    expect(memberMarkup("<plain words>").inner).toBe(name("&lt;plain words&gt;"));
  });

  it("gives a blank line an empty name", () => {
    expect(memberMarkup("   ")).toEqual({ visibility: undefined, inner: name("") });
  });
});

describe("refAttrs", () => {
  it("emits nothing without references", () => {
    expect(refAttrs(undefined)).toBe("");
    expect(refAttrs({})).toBe("");
  });

  it("emits one data-ref attribute per key, each with its leading space", () => {
    expect(refAttrs({ reqs: "REQ-1", code: "a.ts" })).toBe(' data-ref-reqs="REQ-1" data-ref-code="a.ts"');
  });

  it("joins a list with spaces", () => {
    expect(refAttrs({ reqs: ["REQ-1", "REQ-2"] })).toBe(' data-ref-reqs="REQ-1 REQ-2"');
  });

  it("escapes values for the attribute", () => {
    expect(refAttrs({ k: `"<&>"` })).toBe(' data-ref-k="&quot;&lt;&amp;&gt;&quot;"');
  });
});

describe("linked", () => {
  it("wraps the markup in an anchor with the escaped href", () => {
    expect(linked("/a?x=1&y=2", "<g/>")).toBe('<a href="/a?x=1&amp;y=2" class="pr-link"><g/></a>');
  });

  it("returns the markup untouched without an href", () => {
    expect(linked(undefined, "<g/>")).toBe("<g/>");
    expect(linked("", "<g/>")).toBe("<g/>");
  });
});

describe("tooltip", () => {
  it("emits an escaped title element", () => {
    expect(tooltip("a < b")).toBe("<title>a &lt; b</title>");
  });

  it("emits nothing without a title", () => {
    expect(tooltip(undefined)).toBe("");
    expect(tooltip("")).toBe("");
  });
});

describe("noticeMarkup", () => {
  it("sizes a one-line box from the text and the metrics", () => {
    const { markup, w, h } = noticeMarkup("abcd", 0, 0);
    expect(w).toBe(52); // 4 chars * 8 + 2 * 10
    expect(h).toBe(34); // 1 line * 18 + 2 * 10 - 4
    expect(markup).toBe(
      '<g class="pr-notice"><rect x="0" y="0" width="52" height="34" rx="3"/><text x="10" y="14">abcd</text></g>',
    );
  });

  it("breaks on a newline and on a literal backslash-n, and sizes to the longest line", () => {
    for (const text of ["ab\nabcdef", "ab\\nabcdef"]) {
      const { markup, w, h } = noticeMarkup(text, 0, 0);
      expect(w).toBe(68);
      expect(h).toBe(52);
      expect(markup).toContain('<text x="10" y="14">ab</text><text x="10" y="32">abcdef</text>');
    }
  });

  it("offsets the box and every line by the position given", () => {
    const { markup } = noticeMarkup("a\nb", 5, 7);
    expect(markup).toContain('<rect x="5" y="7"');
    expect(markup).toContain('<text x="15" y="21">a</text><text x="15" y="39">b</text>');
  });

  it("escapes the text", () => {
    expect(noticeMarkup("<&>", 0, 0).markup).toContain(">&lt;&amp;&gt;</text>");
  });
});
