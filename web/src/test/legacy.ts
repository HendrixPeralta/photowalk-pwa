// The old vanilla-JS modules at the repo root, imported for parity tests: the
// ported TypeScript must give the same answers as the code it replaces. They
// are plain JS with no types, so each import is typed loosely here.
//
// Paths resolve from the web/ folder (Vitest's working directory) because,
// under jsdom, import.meta.url is an http URL rather than a file path.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolve } from "node:path";

export const legacy = (path: string): Promise<any> =>
  import(/* @vite-ignore */ resolve(process.cwd(), "..", "js", path));
