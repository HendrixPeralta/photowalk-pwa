"use client";

import { Trans } from "@/components/Trans";
import { interpolate, t } from "@/lib/i18n/core";
import { openModal } from "@/state/ui";
import { toolHelp, type HelpRef, type ToolKey } from "./content";

function RefItem({ item }: { item: HelpRef }) {
  const label = item.url
    ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.text}</a>
    : item.text;
  if (!item.note) return <li>{label}</li>;
  // The translation decides where the label goes ("{label}: {note}").
  const [before, after = ""] = t("{label}: {note}").split("{label}");
  return <li>{before}{label}{interpolate(after, { note: item.note })}</li>;
}

/** What a tool shows, how to read it, good and bad examples, and where to learn more. */
export function ToolHelpModal({ tool }: { tool: ToolKey }) {
  const info = toolHelp(tool);
  return (
    <>
      <h3>{info.title}</h3>
      <p className="muted card-text">{info.what}</p>
      <h4 className="subsection-title">{t("How to read it")}</h4>
      <p className="card-text">{info.read}</p>
      {info.list && (
        <ul className="tool-help-list">
          {info.list.map(([name, text]) => (
            <li key={name}><Trans k="<strong>{name}:</strong> {text}" values={{ name, text }} /></li>
          ))}
        </ul>
      )}
      <h4 className="subsection-title">{t("What good looks like")}</h4>
      <p className="card-text">{info.good}</p>
      <h4 className="subsection-title">{t("What to watch out for")}</h4>
      <p className="card-text">{info.bad}</p>
      {info.extra && <p className="card-text muted">{info.extra}</p>}
      <h4 className="subsection-title">{t("Learn more")}</h4>
      <ul className="tool-help-refs">
        {info.refs.map((item) => <RefItem key={item.text} item={item} />)}
      </ul>
    </>
  );
}

/**
 * The "?" beside a tool. Several sit inside a <summary>, so the click must not
 * also open or close the panel around it.
 */
export function ToolHelpButton({ tool, label }: { tool: ToolKey; label: string }) {
  return (
    <button
      type="button"
      className="tool-help-btn"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(<ToolHelpModal tool={tool} />);
      }}
    >
      ?
    </button>
  );
}
