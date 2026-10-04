"use client";

import { useAppStore } from "@/state/appStore";
import { setChallengeChecked } from "./actions";

/**
 * The open walk's mini-challenges as checkboxes. Bound to the saved walk, so
 * every copy on screen (brief, Live Walk) stays in step.
 */
export function ChallengeList({ challenges }: { challenges: readonly string[] }) {
  const checked = useAppStore((s) => s.activeWalk?.challengesChecked);

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
