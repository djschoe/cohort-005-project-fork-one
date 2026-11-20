// Fails when a file is too big for an agent to read and edit in one go.
// Tokens are estimated as bytes / 4, which is close enough for code.
// Usage: node scripts/check-file-tokens.js <file>...
//
// A file that was already over the limit at HEAD passes as long as it does
// not grow. Without that, the first ticket to touch a big legacy file has to
// split it, and a one-line fix turns into a refactor of the whole file.
// Splitting one is a ticket of its own.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;

// Generated files that nobody edits by hand, and workflow files, which
// GitHub reads as one file each and which cannot be split.
const IGNORED = [
  /(^|\/)package-lock\.json$/,
  /^drizzle\//,
  /^\.github\/workflows\/[^/]+\.yml$/,
];

const isBinary = (contents) => contents.subarray(0, 8000).includes(0);

const tokensOf = (bytes) => Math.ceil(bytes / BYTES_PER_TOKEN);

// Each file's size at HEAD, in tokens, from one `git ls-tree` call. A new
// file, or a repository with no commits yet, has no entry.
const tokensAtHead = (files) => {
  if (files.length === 0) return new Map();
  let listing;
  try {
    listing = execFileSync(
      "git",
      ["ls-tree", "-l", "-z", "HEAD", "--", ...files],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch {
    return new Map();
  }
  return new Map(
    listing
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const [meta, file] = entry.split("\t");
        return [file, tokensOf(Number(meta.trim().split(/\s+/)[3]))];
      })
  );
};

const files = process.argv
  .slice(2)
  .map((file) => file.replaceAll("\\", "/").replace(`${process.cwd()}/`, ""))
  .filter((file) => !IGNORED.some((pattern) => pattern.test(file)));
const atHead = tokensAtHead(files);

const oversized = files
  .map((file) => ({ file, contents: readFileSync(file) }))
  .filter(({ contents }) => !isBinary(contents))
  .map(({ file, contents }) => ({
    file,
    tokens: tokensOf(contents.length),
    before: atHead.get(file),
  }))
  .filter(({ tokens }) => tokens > MAX_TOKENS)
  .filter(({ tokens, before }) => before === undefined || tokens > before);

if (oversized.length > 0) {
  console.error(`These files are over ${MAX_TOKENS} tokens (bytes / 4):\n`);
  for (const { file, tokens, before } of oversized) {
    const growth = before > MAX_TOKENS ? `, up from ~${before}` : "";
    console.error(`  ${file}: ~${tokens} tokens${growth}`);
  }
  console.error(`
A file that was already over the limit ("up from") may keep its size but not
grow. Put your addition in a new file, or shrink the old file by as much as
you add. Split it only when the ticket asks you to.

Any other file: split it before you commit. Never delete code or squash it
onto fewer lines to get under the limit.

How to split:
- Find the seams. Look for groups of functions, components, or tests that
  change together and share little with the rest of the file.
- Route modules (app/routes/*): keep the loader, action, and page component in
  the route file. Move the business logic into a module in app/modules/ and
  sub-components into their own files in app/components/.
- Logic that is already in a module (app/modules/<name>/): split it into more
  files under lib/. Keep the entry points (index.ts, index.server.ts) small. Do
  not add a barrel file. See app/modules/README.md.
- Tests: split by the behaviour under test, one file per area (for example
  <name>.refunds.test.ts, <name>.permissions.test.ts). Move shared fixtures
  into a fixtures file in the same tests/ folder.
- Scripts and seed data: move large data literals into their own files and
  import them.

When you are done, run \`npm run check\` and commit again.`);
  process.exit(1);
}
