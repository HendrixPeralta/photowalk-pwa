// Fails the build when UI text and the Japanese dictionary drift apart.
//
// Collects every string literal passed to t() or N(), including both sides of
// a `cond ? t("a") : t("b")`, plus <Trans k="..."> keys, from src/ (tests
// excluded). Then checks that each one has a Japanese entry whose {placeholders}
// match, and that the dictionary itself has no HTML entities or em dashes.
// Dictionary entries nothing uses are reported but don't fail the build.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as jaModule from "../src/lib/i18n/ja";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const EM_DASH = String.fromCharCode(0x2014);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "test") files(path, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.endsWith("i18n/ja.ts")) {
      out.push(path);
    }
  }
  return out;
}

const used = new Map<string, string>(); // key -> first place it was seen

function literals(node: ts.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literals(node.expression);
  if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue), ...literals(node.whenFalse)];
  return [];
}

for (const file of files(SRC)) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const where = (node: ts.Node) => `${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "N"].includes(node.expression.text) && node.arguments[0]) {
      for (const key of literals(node.arguments[0])) if (!used.has(key)) used.set(key, where(node));
    }
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === "Trans") {
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name.getText() === "k" && attr.initializer && ts.isStringLiteral(attr.initializer)) {
          if (!used.has(attr.initializer.text)) used.set(attr.initializer.text, where(node));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// tsx loads ja.ts as CommonJS here, so its default export can arrive wrapped.
const loaded = jaModule as unknown as { default: Record<string, string> | { default: Record<string, string> } };
const dict = ("default" in loaded.default ? loaded.default.default : loaded.default) as Record<string, string>;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const problems: string[] = [];

for (const [key, at] of used) {
  if (!(key in dict)) problems.push(`${at}  no Japanese for: ${JSON.stringify(key)}`);
  else if (placeholders(key) !== placeholders(dict[key])) problems.push(`${at}  placeholders differ: ${JSON.stringify(key)}`);
}
for (const [key, value] of Object.entries(dict)) {
  if (/&[a-z]+;/.test(key + value)) problems.push(`ja.ts  HTML entity in: ${JSON.stringify(key)}`);
  if ((key + value).includes(EM_DASH)) problems.push(`ja.ts  em dash in: ${JSON.stringify(key)}`);
}

const unused = Object.keys(dict).filter((key) => !used.has(key));
console.log(`check-i18n: ${used.size} strings in use, ${unused.length} dictionary entries not used yet`);

if (problems.length) {
  console.error(`check-i18n: ${problems.length} problem(s)\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("check-i18n: ok");
