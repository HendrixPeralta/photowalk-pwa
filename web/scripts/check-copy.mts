// Fails the build if an em dash slips into the app. House style: rewrite with
// a period, comma, or colon instead. Checks source, public assets, and scripts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRS = ["src", "public", "scripts"];
const TEXT = /\.(ts|tsx|mts|js|mjs|css|json|md|webmanifest|svg|html)$/;
// Built from char codes so this file never contains the characters it bans.
const EM_DASH = String.fromCharCode(0x2014);
const BANNED = [
  { label: "em dash (U+2014)", re: new RegExp(EM_DASH) },
  { label: "mdash HTML entity", re: new RegExp("&" + "mdash;") },
];

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT.test(name)) out.push(path);
  }
  return out;
}

const problems: string[] = [];
for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir), [])) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const { label, re } of BANNED) {
        if (re.test(line)) problems.push(`${relative(ROOT, file)}:${i + 1}  ${label}`);
      }
    });
  }
}

if (problems.length) {
  console.error(`check-copy: ${problems.length} problem(s)\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("check-copy: ok");
