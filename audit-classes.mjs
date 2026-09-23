// Temporary audit utility: reports which CSS classes the app uses vs. which
// the stylesheet defines. Run with `node audit-classes.mjs`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "src");
const CSS = path.join(SRC, "styles.css");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function readValueExpression(source, start) {
  // start points at the first character after `className=`.
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
    const quote = source[i];
    let j = i + 1;
    while (j < source.length) {
      if (source[j] === "\\") j += 2;
      else if (source[j] === quote) return { text: source.slice(i + 1, j), end: j + 1 };
      else j += 1;
    }
    return { text: source.slice(i + 1), end: source.length };
  }
  if (source[i] === "{") {
    let depth = 0;
    let j = i;
    let quote = null;
    while (j < source.length) {
      const ch = source[j];
      if (quote) {
        if (ch === "\\") j += 2;
        else {
          if (ch === quote) quote = null;
          j += 1;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; j += 1; continue; }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return { text: source.slice(i + 1, j), end: j + 1 };
      }
      j += 1;
    }
    return { text: source.slice(i + 1), end: source.length };
  }
  return { text: "", end: i };
}

function stringLiterals(text) {
  const values = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") j += 2;
        else if (text[j] === ch) break;
        else j += 1;
      }
      values.push(text.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return values;
}

const used = new Map();
for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(SRC, file).replace(/\\/g, "/");
  let index = source.indexOf("className=");
  while (index !== -1) {
    const { text, end } = readValueExpression(source, index + "className=".length);
    for (const literal of stringLiterals(text)) {
      for (const token of literal.split(/\s+/)) {
        if (!CLASS_TOKEN.test(token)) continue;
        if (!used.has(token)) used.set(token, new Set());
        used.get(token).add(relative);
      }
    }
    index = source.indexOf("className=", end);
  }
}

const css = fs.readFileSync(CSS, "utf8");
const defined = new Set();
for (const match of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) defined.add(match[1]);

const missing = [...used.keys()].filter((token) => !defined.has(token)).sort();
const unused = [...defined].filter((token) => !used.has(token)).sort();

console.log(`classes used: ${used.size}`);
console.log(`classes defined: ${defined.size}`);
console.log(`\nUSED BUT NOT DEFINED (${missing.length}):`);
for (const token of missing) console.log(`  ${token}  <- ${[...used.get(token)].join(", ")}`);
console.log(`\nDEFINED BUT NOT USED (${unused.length}):`);
console.log(unused.map((token) => `  ${token}`).join("\n"));
