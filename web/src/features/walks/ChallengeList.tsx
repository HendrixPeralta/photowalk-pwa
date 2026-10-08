"use client";

import { setChallengeChecked } from "./actions";
import { useBriefWalk } from "./walkUi";

/**
 * The walk's mini-challenges as checkboxes. Bound to the open walk (or the
 * one being set up on the brief), so every copy on screen stays in step.
 */
export function ChallengeList({ challenges }: { challenges: readonly string[] }) {
  const checked = useBriefWalk()?.challengesChecked;

  return (
    <ul className="challenges-list">
      {challenges.map((challenge, i) => (
        <li key={i}>
          <label className="challenge-item">
            <input
              type="checkbox"
              className="challenge-check"
              checked={Boolean(checked?.[i])}
              onChange={(e) => setChallengeChecked(i, e.target.checked)}
            />
            <span>{challenge}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
