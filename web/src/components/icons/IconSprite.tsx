import { SPRITE_DEFS } from "./sprite";

/** The icon definitions, rendered once so every <Icon> can point at them. */
export function IconSprite() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
      // Static, trusted markup from our own source: the icon drawings.
      dangerouslySetInnerHTML={{ __html: `<defs>${SPRITE_DEFS}</defs>` }}
    />
  );
}
