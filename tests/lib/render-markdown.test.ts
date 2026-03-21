// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";

/**
 * renderMarkdown is inlined in serve-ui.html. We recreate the same logic here
 * to test the [[link]] preservation mechanism and marked integration.
 */

let marked: any;

beforeAll(async () => {
  marked = await import("marked");
});

function renderMarkdown(text: string): string {
  const preserved = text.replace(/\[\[([^\]]+)\]\]/g, "%%MEMEXLINK:$1%%");
  let html = marked.parse(preserved, { breaks: true }) as string;
  html = html.replace(
    /%%MEMEXLINK:(.+?)%%/g,
    '<span class="chip" data-link="$1">[[$1]]</span>'
  );
  return html;
}

describe("renderMarkdown", () => {
  it("renders basic markdown", () => {
    const html = renderMarkdown("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders headings", () => {
    const html = renderMarkdown("## Section Title");
    expect(html).toContain("<h2");
    expect(html).toContain("Section Title");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- item 1\n- item 2");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item 1</li>");
    expect(html).toContain("<li>item 2</li>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("first");
    expect(html).toContain("second");
  });

  it("renders code blocks", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("renders inline code", () => {
    const html = renderMarkdown("use `npm install`");
    expect(html).toContain("<code>npm install</code>");
  });

  it("renders tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdown("> quoted text");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("quoted text");
  });

  it("renders images", () => {
    const html = renderMarkdown("![alt](https://example.com/img.png)");
    expect(html).toContain("<img");
    expect(html).toContain('src="https://example.com/img.png"');
    expect(html).toContain('alt="alt"');
  });

  it("renders horizontal rules", () => {
    const html = renderMarkdown("above\n\n---\n\nbelow");
    expect(html).toContain("<hr");
  });

  it("converts line breaks with breaks:true", () => {
    const html = renderMarkdown("line 1\nline 2");
    expect(html).toContain("<br");
  });

  // [[link]] preservation tests
  it("converts [[links]] to chips", () => {
    const html = renderMarkdown("see [[my-card]]");
    expect(html).toContain('<span class="chip" data-link="my-card">[[my-card]]</span>');
  });

  it("handles multiple [[links]]", () => {
    const html = renderMarkdown("[[card-a]] and [[card-b]]");
    expect(html).toContain('data-link="card-a"');
    expect(html).toContain('data-link="card-b"');
  });

  it("preserves [[links]] with special characters", () => {
    const html = renderMarkdown("see [[my card (2026)]]");
    expect(html).toContain('data-link="my card (2026)"');
  });

  it("preserves [[links]] with slashes (subdirectory slugs)", () => {
    const html = renderMarkdown("see [[sub/nested-card]]");
    expect(html).toContain('data-link="sub/nested-card"');
  });

  // Known limitation: [[links]] inside code blocks ARE converted to chips
  // because the replacement happens before marked.parse(). Fixing this would
  // require post-parse AST walking, which is not worth the complexity given
  // that [[slug]] inside code blocks is rare in practice.
  it("converts [[links]] inside code blocks (known limitation)", () => {
    const html = renderMarkdown("```\n[[not-a-link]]\n```");
    expect(html).toContain('data-link="not-a-link"');
  });

  it("converts [[links]] inside inline code (known limitation)", () => {
    const html = renderMarkdown("use `[[not-a-link]]`");
    expect(html).toContain('data-link="not-a-link"');
  });

  it("handles mixed markdown and [[links]]", () => {
    const md = "## Title\n\nSome **bold** text with [[card-a]].\n\n- item with [[card-b]]";
    const html = renderMarkdown(md);
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('data-link="card-a"');
    expect(html).toContain('data-link="card-b"');
    expect(html).toContain("<li>");
  });
});
