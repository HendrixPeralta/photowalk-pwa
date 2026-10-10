"use client";

import { useState } from "react";
import { ToolHelpBody } from "@/features/toolhelp/ToolHelp";
import { toolHelp, type ToolKey } from "@/features/toolhelp/content";
import { t } from "@/lib/i18n/core";

// The same split as the Analysis screen: the readouts everyone sees, then the
// ones under Advanced Tools.
const SECTIONS: { title: () => string; tools: ToolKey[] }[] = [
  { title: () => t("Basics"), tools: ["composition", "gamut", "histogram", "tonalkey"] },
  { title: () => t("Advanced Tools"), tools: ["waveform", "parade", "vectorscope", "cie", "tonecurve"] },
];

/** One article per Analysis tool: the "Learn more" text, to read any time. */
export function TutorialsScreen() {
  const [open, setOpen] = useState<ToolKey | null>(null);

  const show = (tool: ToolKey | null) => {
    setOpen(tool);
    // A new page of text starts at its top, not where the list was scrolled to.
    document.querySelector(".views")?.scrollTo({ top: 0 });
  };

  if (open) {
    const info = toolHelp(open);
    return (
      <section className="view" data-view="learn">
        <button type="button" className="btn btn-ghost btn-sm partners-back" onClick={() => show(null)}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("Back")}
        </button>
        <article className="theme-card tutorial-article">
          <h2 className="tutorial-title">{info.title}</h2>
          <ToolHelpBody info={info} />
        </article>
      </section>
    );
  }

  return (
    <section className="view" data-view="learn">
      <p className="muted card-text">{t("How to read each tool on the Analysis tab, one article at a time.")}</p>
      {SECTIONS.map(({ title, tools }) => (
        <div key={tools[0]}>
          <h2 className="section-title">{title()}</h2>
          <ul className="tutorial-list">
            {tools.map((tool) => {
              const info = toolHelp(tool);
              return (
                <li key={tool}>
                  <button type="button" className="tutorial-card" onClick={() => show(tool)}>
                    <strong>{info.title}</strong>
                    <span>{info.what}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
