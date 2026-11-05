import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createScanner, type Scanner } from "typescript/unstable/ast/scanner";

export interface Problem {
  file: string;
  line: number;
  rule: string;
  message: string;
}

type Frame = "object" | "array" | "block" | "paren" | "type" | "template";

interface Comment {
  line: number;
  text: string;
  doc: boolean;
  frame: Frame | undefined;
  /** Code earlier on its line. */
  trailing: boolean;
  /** Only whitespace, and no blank line, since the comment before it. */
  touchesPrevious: boolean;
  /** A blank line before the next code, or none comes. */
  detached: boolean;
}

// The scanner's token kinds, which the unstable API does not export by name.
const KIND = {
  endOfFile: 1,
  singleLineComment: 2,
  multiLineComment: 3,
  newLine: 4,
  whitespace: 5,
  templateHead: 15,
  templateTail: 17,
  openBrace: 18,
  closeBrace: 19,
  openParen: 20,
  closeParen: 21,
  openBracket: 22,
  closeBracket: 23,
  slash: 43,
} as const;

/** Exported docs here are the published or documented surface, so they may run longer. */
const PUBLIC = [
  /^src\/adapter\//,
  /^src\/core\/target\/contract\.ts$/,
  /^src\/core\/product\.ts$/,
  /^src\/core\/env\.ts$/,
  /^src\/cli\/commands\/[^/]+\/spec\.ts$/,
  /^src\/cli\/commands\/command\.ts$/,
];
/** Declarative tables whose notes explain the entry they sit on. */
const TABLE_NOTES = [/^src\/targets\//, /^test\/conformance\//];
/** Tokens after which `{` or `[` opens a value and `/` starts a regular expression. */
const BEFORE_VALUE = new Set([
  "",
  "=",
  "(",
  ",",
  ":",
  "[",
  "?",
  "??",
  "||",
  "&&",
  "!",
  "{",
  ";",
  "return",
  "=>",
  "...",
  "yield",
  "await",
  "in",
  "of",
]);

export function checkText(file: string, text: string): Problem[] {
  const isPublic = PUBLIC.some((pattern) => pattern.test(file));
  const isTable = TABLE_NOTES.some((pattern) => pattern.test(file));
  const isTest = file.startsWith("test/") || file.endsWith(".test.ts");
  const problems: Problem[] = [];
  const report = (line: number, rule: string, message: string) =>
    problems.push({ file, line, rule, message });
  for (const comment of commentsOf(text)) {
    if (comment.trailing && !comment.text.startsWith("// biome-ignore")) {
      report(comment.line, "trailing", "A comment trails code; put it above the statement.");
    }
    if (comment.doc && comment.touchesPrevious) {
      report(
        comment.line,
        "stacked",
        "Two doc comments in a row; the upper one documents nothing.",
      );
    }
    if (comment.doc && comment.detached && comment.line > 1) {
      report(
        comment.line,
        "detached",
        "A blank line separates this doc comment from what it documents.",
      );
    }
    const inValue = comment.frame === "object" || comment.frame === "array";
    if (comment.doc && inValue && !isPublic && !isTable && !isTest) {
      report(
        comment.line,
        "in-value",
        "A doc comment sits inside a value; document the declaration, or use a // note.",
      );
    }
    if (comment.doc && !isPublic && textLines(comment.text) > 2) {
      report(
        comment.line,
        "long-doc",
        "An internal doc comment runs past two lines; keep the why.",
      );
    }
    if (/biome-ignore/.test(comment.text) && !/biome-ignore\S*\s+\S+:\s*\S/.test(comment.text)) {
      report(comment.line, "directive", "A biome-ignore needs its reason after the colon.");
    }
  }
  if (!isPublic) problems.push(...longRuns(file, text));
  return problems;
}

/** Every comment, with the context the rules read, from one pass of the scanner. */
function commentsOf(text: string): Comment[] {
  const walker = new Walker(text);
  const scanner = createScanner(false, 0, text);
  for (let kind = scanner.scan(); kind !== KIND.endOfFile; kind = scanner.scan()) {
    walker.take(scanner, kind);
  }
  walker.settle(text.length);
  return walker.comments;
}

class Walker {
  readonly comments: Comment[] = [];
  readonly #text: string;
  readonly #lineOf: (offset: number) => number;
  readonly #frames: Frame[] = [];
  #previous = "";
  #codeOnLine = false;
  #lastEnd = -1;
  #typeStatement = false;

  constructor(text: string) {
    this.#text = text;
    this.#lineOf = lineFinder(text);
  }

  take(scanner: Scanner, scanned: number): void {
    if (scanned === KIND.closeBrace && this.#frames.at(-1) === "template") {
      if (scanner.reScanTemplateToken(false) === KIND.templateTail) this.#frames.pop();
      this.#code("`");
      return;
    }
    const kind =
      scanned === KIND.slash && BEFORE_VALUE.has(this.#previous)
        ? scanner.reScanSlashToken()
        : scanned;
    if (kind === KIND.newLine) this.#codeOnLine = false;
    else if (kind === KIND.singleLineComment || kind === KIND.multiLineComment) {
      this.#comment(scanner.getTokenStart(), scanner.getTokenText(), scanner.getTokenEnd());
    } else if (kind !== KIND.whitespace) {
      this.settle(scanner.getTokenStart());
      this.#token(kind, scanner.getTokenText());
    }
  }

  /** Marks the comment just before code as detached when a blank line sits between them. */
  settle(start: number): void {
    const last = this.comments.at(-1);
    if (last !== undefined && this.#lastEnd >= 0) {
      last.detached =
        start === this.#text.length || /\n[ \t]*\n/.test(this.#text.slice(this.#lastEnd, start));
    }
    this.#lastEnd = -1;
  }

  #comment(start: number, token: string, end: number): void {
    const between = this.#lastEnd < 0 ? "x" : this.#text.slice(this.#lastEnd, start);
    this.comments.push({
      line: this.#lineOf(start),
      text: token,
      doc: token.startsWith("/**"),
      frame: this.#frames.at(-1),
      trailing: this.#codeOnLine,
      touchesPrevious:
        between.trim() === "" && !between.includes("\n\n") && this.comments.at(-1)?.doc === true,
      detached: false,
    });
    this.#lastEnd = end;
  }

  #token(kind: number, token: string): void {
    const starts = ["", ";", "}", "{", "export", "declare"].includes(this.#previous);
    if ((token === "type" || token === "interface") && starts) this.#typeStatement = true;
    this.#typeStatement = track(this.#frames, kind, this.#previous, this.#typeStatement);
    if (token === ";" && !this.#frames.includes("type")) this.#typeStatement = false;
    this.#code(token);
  }

  #code(token: string): void {
    this.#previous = token;
    this.#codeOnLine = true;
  }
}

/** Pushes or pops the bracket the token opens or closes; returns whether a type statement continues. */
function track(frames: Frame[], kind: number, previous: string, typeStatement: boolean): boolean {
  if (kind === KIND.templateHead) frames.push("template");
  else if (kind === KIND.openBrace) frames.push(braceFrame(previous, frames.at(-1), typeStatement));
  else if (kind === KIND.openBracket) frames.push(BEFORE_VALUE.has(previous) ? "array" : "paren");
  else if (kind === KIND.openParen) frames.push("paren");
  else if (kind === KIND.closeBrace || kind === KIND.closeBracket || kind === KIND.closeParen) {
    frames.pop();
    return typeStatement && frames.includes("type");
  }
  return typeStatement;
}

/** A `{` after `:` is a type unless it is a property's value inside an object. */
function braceFrame(previous: string, top: Frame | undefined, typeStatement: boolean): Frame {
  if (typeStatement || top === "type") return "type";
  if (previous === ":") return top === "object" ? "object" : "type";
  if (previous === "=>" || previous === "") return "block";
  return BEFORE_VALUE.has(previous) && previous !== "{" && previous !== ";" ? "object" : "block";
}

function textLines(comment: string): number {
  return comment.split("\n").filter((line) => !/^\s*\/?\*+\/?\s*$/.test(line)).length;
}

/** Runs of `//` lines over two, directives aside. */
function longRuns(file: string, text: string): Problem[] {
  const problems: Problem[] = [];
  const lines = text.split("\n");
  let run = 0;
  for (let index = 0; index <= lines.length; index++) {
    const line = lines[index]?.trim() ?? "";
    if (line.startsWith("//") && !line.startsWith("// biome-ignore")) {
      run++;
      continue;
    }
    if (run > 2) {
      problems.push({
        file,
        line: index - run + 1,
        rule: "long-run",
        message: "A comment runs past two lines; keep the why.",
      });
    }
    run = 0;
  }
  return problems;
}

function lineFinder(text: string): (offset: number) => number {
  const starts = [0];
  for (let index = 0; index < text.length; index++)
    if (text[index] === "\n") starts.push(index + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((starts[middle] as number) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__snapshots__" ? [] : sources(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** Every problem in the CLI's TypeScript, as paths relative to `root`. */
export function checkTree(root: string): Problem[] {
  return ["src", "test", "scripts", "packaging"]
    .flatMap((dir) => sources(join(root, dir)))
    .flatMap((path) =>
      checkText(relative(root, path).split("\\").join("/"), readFileSync(path, "utf8")),
    );
}

if (process.argv[1]?.endsWith("check.ts") === true) {
  const problems = checkTree(join(import.meta.dirname, "..", ".."));
  for (const problem of problems) {
    console.error(`${problem.file}:${problem.line} ${problem.rule}: ${problem.message}`);
  }
  if (problems.length > 0) {
    console.error(`${problems.length} comment problems. See "Comments" in ARCHITECTURE.md.`);
    process.exitCode = 1;
  }
}
