import { Fragment, type ReactNode } from "react";
import { interpolate, t, type TParams } from "@/lib/i18n/core";

/**
 * A translated sentence that carries inline markup, e.g.
 *   <Trans k="<strong>{hours}</strong> shots · <strong>{walks}</strong> walks" values={...} />
 * The translation decides where the markup goes (Japanese word order often
 * moves it). Only <strong>, <span> and <br> are understood; values are always
 * inserted as text, never as markup.
 */
export function Trans({ k, values }: { k: string; values?: TParams }) {
  return <>{renderMarkup(t(k), values)}</>;
}

const TAG = /<(\/?)(strong|span|br)\s*\/?>/g;

export function renderMarkup(template: string, values?: TParams): ReactNode[] {
  const root: ReactNode[] = [];
  const stack: { tag: string; children: ReactNode[] }[] = [];
  const top = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = 0;
  let key = 0;

  const pushText = (text: string) => {
    if (text) top().push(<Fragment key={key++}>{interpolate(text, values)}</Fragment>);
  };

  for (const match of template.matchAll(TAG)) {
    pushText(template.slice(last, match.index));
    last = match.index! + match[0].length;
    const [, closing, tag] = match;
    if (tag === "br") {
      top().push(<br key={key++} />);
    } else if (!closing) {
      stack.push({ tag, children: [] });
    } else {
      const open = stack.pop();
      if (!open) continue;
      const Tag = open.tag as "strong" | "span";
      top().push(<Tag key={key++}>{open.children}</Tag>);
    }
  }
  pushText(template.slice(last));
  // Unclosed tags: keep their text rather than drop it.
  while (stack.length) {
    const open = stack.pop()!;
    top().push(...open.children);
  }
  return root;
}
