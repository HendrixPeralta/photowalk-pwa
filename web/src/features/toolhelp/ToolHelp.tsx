"use client";

import Link from "next/link";
import { Trans } from "@/components/Trans";
import { interpolate, t } from "@/lib/i18n/core";
import { ROUTES } from "@/routes";
import { openModal } from "@/state/ui";
import { toolHelp, type HelpRef, type ToolHelp as ToolHelpInfo, type ToolKey } from "./content";

function RefItem({ item }: { item: HelpRef }) {
  const label = item.url
    ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.text}</a>
    : item.text;
  if (!item.note) return <li>{label}</li>;
  // The translation decides where the label goes ("{label}: {note}").
  const [before, after = ""] = t("{label}: {note}").split("{label}");
  return <li>{before}{label}{interpolate(after, { note: item.note })}</li>;
}

/** The short take on a tool, with links into its tutorial and related ones. */
export function ToolHelpModal({ tool }: { tool: ToolKey }) {
  const info = toolHelp(tool);
  return (
    <>
      <h3>{info.title}</h3>
      <p className="card-text">{info.tip}</p>
      <h4 className="subsection-title">{t("Tutorials")}</h4>
      {/* Leaving the screen closes the pop-up. */}
      <ul className="tool-help-refs">
        {[tool, ...(info.related ?? [])].map((key) => (
          <li key={key}><Link href={`${ROUTES.learn}#${key}`}>{toolHelp(key).article}</Link></li>
        ))}
      </ul>
    </>
  );
}

/** Everything under a Tutorials article's title. */
export function ToolHelpBody({ info }: { info: ToolHelpInfo }) {
  return (
    <>
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
 * The "Learn more" beside a tool. If one sits inside a <summary>, the click must not
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
      {t("Learn more")}
    </button>
  );
}
