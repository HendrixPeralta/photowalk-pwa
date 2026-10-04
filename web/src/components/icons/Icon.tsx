import type { CSSProperties } from "react";
import type { IconName } from "./sprite";

/** One icon from the sprite. Decorative by default; label the control around it instead. */
export function Icon({ name, className, style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={style}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
