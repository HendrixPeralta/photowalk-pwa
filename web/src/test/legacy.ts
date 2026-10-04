// The old vanilla-JS modules at the repo root, used for parity tests: the
// ported TypeScript must give the same answers as the code it replaces. They
// are plain JS with no types, so everything here is typed loosely.
//
// Paths resolve from the web/ folder (Vitest's working directory) because,
// under jsdom, import.meta.url is an http URL rather than a file path.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const legacyPath = (file: string) => resolve(process.cwd(), "..", "js", file);

/** Imports an old module as-is (only works for modules with no DOM work at import time). */
export const legacy = (file: string): Promise<any> => import(/* @vite-ignore */ legacyPath(file));

/**
 * Pulls one non-exported function out of an old module's source, so private
 * helpers (computeHistogram, buildLut...) can be parity-tested too. `scope`
 * supplies whatever the function body refers to from its module.
 */
export function legacyFunction(file: string, name: string, scope: Record<string, unknown> = {}): (...args: any[]) => any {
  const src = readFileSync(legacyPath(file), "utf8");
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  let depth = 0;
  let end = src.indexOf("{", start);
  for (; end < src.length; end++) {
    if (src[end] === "{") depth++;
    else if (src[end] === "}" && --depth === 0) break;
  }
  const body = src.slice(start, end + 1);
  return new Function(...Object.keys(scope), `${body}\nreturn ${name};`)(...Object.values(scope));
}
