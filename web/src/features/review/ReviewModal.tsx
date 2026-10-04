"use client";

import { useState } from "react";
import { getLang } from "@/lib/i18n/core";
import { closeModal, openModal, showToast } from "@/state/ui";
import { enqueue, flushQueue, readQueue } from "./queue";
import { FEATURE_KEYS, LEVEL_KEYS, REVIEW_STRINGS, type FeatureKey, type LevelKey, type ReviewLang } from "./strings";

const MAX_TEXT = 2000;
const MAX_NAME = 80;

export function openReview(): void {
  openModal(<ReviewModal />);
}

/**
 * A short review: stars, level, useful features and two open questions. It
 * opens in the app's language, and its own toggle lets someone answer in the
 * other without switching the whole app.
 */
function ReviewModal() {
  const [lang, setLang] = useState<ReviewLang>(getLang() === "ja" ? "ja" : "en");
  const [rating, setRating] = useState(0);
  const [level, setLevel] = useState<LevelKey | "">("");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [improve, setImprove] = useState("");
  const [problem, setProblem] = useState("");
  const [name, setName] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const s = REVIEW_STRINGS[lang];

  const pending = readQueue().length;
  const backlog = pending === 1 ? s.pendingOne : pending > 1 ? s.pendingMany(pending) : "";

  const submit = () => {
    const improveText = improve.trim().slice(0, MAX_TEXT);
    const problemText = problem.trim().slice(0, MAX_TEXT);
    // Sent in English whichever language filled the form, so the sheet reads the same.
    const featureLabels = FEATURE_KEYS.filter((key) => features.includes(key)).map((key) => REVIEW_STRINGS.en.features[key]);
    if (!rating && !level && !featureLabels.length && !improveText && !problemText) {
      setStatus(s.blank);
      return;
    }
    // A real person never fills a field they can't see. A bot gets the same
    // thanks, and no sign that nothing was kept.
    if (!honeypot) {
      enqueue({
        source: "photoeye-web",
        submittedAt: new Date().toISOString(),
        rating: rating || null,
        level,
        features: featureLabels.join(", "),
        improveText,
        problemText,
        name: name.trim().slice(0, MAX_NAME),
      });
      void flushQueue();
    }
    closeModal();
    showToast(s.thanks);
  };

  return (
    <>
      <div className="review-modal-head">
        <span className="label-caps" style={{ color: "var(--accent-strong)" }}>{s.feedback}</span>
        <div className="review-lang-toggle" role="group" aria-label={s.langAria}>
          {(["en", "ja"] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={`chip-btn${lang === code ? " active" : ""}`}
              aria-pressed={lang === code}
              onClick={() => { setLang(code); setStatus(null); }}
            >
              {REVIEW_STRINGS[code].toggleLabel}
            </button>
          ))}
        </div>
      </div>
      <h3 className="subsection-title" style={{ marginTop: 6 }}>{s.title}</h3>
      <p className="muted card-text">{s.subtitle}</p>

      <div className="review-stars" role="radiogroup" aria-label={s.ratingAria}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`review-star${n <= rating ? " on" : ""}`}
            role="radio"
            aria-checked={n === rating}
            aria-label={s.star(n)}
            // Tapping the current rating clears it, so a misfire isn't permanent.
            onClick={() => setRating((r) => (r === n ? 0 : n))}
          >
            ★
          </button>
        ))}
      </div>

      <span className="label-caps review-field-label">{s.levelLabel}</span>
      <div className="review-chip-row" role="radiogroup" aria-label={s.levelLabel}>
        {LEVEL_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`chip-btn${level === key ? " active" : ""}`}
            role="radio"
            aria-checked={level === key}
            onClick={() => setLevel((l) => (l === key ? "" : key))}
          >
            {s.levels[key]}
          </button>
        ))}
      </div>

      <span className="label-caps review-field-label">{s.featuresLabel}</span>
      <span className="review-field-hint review-field-hint-block">{s.featuresHint}</span>
      <div className="review-chip-row" role="group" aria-label={s.featuresLabel}>
        {FEATURE_KEYS.map((key) => {
          const on = features.includes(key);
          return (
            <button
              key={key}
              type="button"
              className={`chip-btn${on ? " active" : ""}`}
              role="checkbox"
              aria-checked={on}
              onClick={() => setFeatures((f) => (on ? f.filter((x) => x !== key) : [...f, key]))}
            >
              {s.features[key]}
            </button>
          );
        })}
      </div>

      <span className="label-caps review-field-label">{s.improveLabel} <span className="review-field-hint">{s.optionalHint}</span></span>
      <textarea
        className="text-input review-text"
        rows={2}
        maxLength={MAX_TEXT}
        aria-label={s.improveLabel}
        placeholder={s.improvePlaceholder}
        value={improve}
        onChange={(e) => setImprove(e.target.value)}
      />
      <span className="label-caps review-field-label">{s.problemLabel} <span className="review-field-hint">{s.optionalHint}</span></span>
      <textarea
        className="text-input review-text"
        rows={2}
        maxLength={MAX_TEXT}
        aria-label={s.problemLabel}
        placeholder={s.problemPlaceholder}
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
      />
      <input
        type="text"
        className="text-input"
        maxLength={MAX_NAME}
        aria-label={s.namePlaceholder}
        placeholder={s.namePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="text"
        className="review-hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
      />
      <button type="button" className="btn btn-accent btn-block" onClick={submit}>{s.send}</button>
      <p className="hint review-hint" role="status">{status ?? backlog}</p>
      <p className="hint review-hint">{s.privacy}</p>
    </>
  );
}
