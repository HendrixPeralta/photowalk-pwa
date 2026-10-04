import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { configureI18n } from "@/lib/i18n/core";
import ja from "@/lib/i18n/ja";
import { renderMarkup, Trans } from "./Trans";

describe("Trans", () => {
  it("renders bold parts and inserts values as text", () => {
    const { container } = render(<Trans k="<strong>{hours}</strong> shot · <strong>{walks}</strong> walks" values={{ hours: "12h", walks: 4 }} />);
    expect(container.innerHTML).toBe("<strong>12h</strong> shot · <strong>4</strong> walks");
  });

  it("follows the Japanese word order", () => {
    configureI18n("ja", ja);
    const { container } = render(<Trans k="<strong>{hours}</strong> shot · <strong>{walks}</strong> walks" values={{ hours: "12h", walks: 4 }} />);
    expect(container.innerHTML).toBe("撮影 <strong>12h</strong>・ウォーク <strong>4</strong> 回");
  });

  it("never turns a value into markup", () => {
    const { container } = render(<>{renderMarkup("Hi {name}", { name: "<strong>x</strong>" })}</>);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toBe("Hi <strong>x</strong>");
  });

  it("handles line breaks and stray tags", () => {
    const { container } = render(<>{renderMarkup("a<br>b <span>c")}</>);
    expect(container.innerHTML).toBe("a<br>b c");
  });
});
