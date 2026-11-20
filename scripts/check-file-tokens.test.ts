import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the check the way lint-staged does: as a process, in a git repository,
// with the staged file names as arguments.

const SCRIPT = new URL("./check-file-tokens.js", import.meta.url).pathname;
const LIMIT_BYTES = 5000 * 4;

let repo: string;

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });

const write = (file: string, bytes: number) =>
  writeFileSync(join(repo, file), "x".repeat(bytes));

const commit = (file: string, bytes: number) => {
  write(file, bytes);
  git("add", file);
  git("commit", "--quiet", "--no-verify", "-m", file);
};

const check = (...files: string[]) =>
  spawnSync("node", [SCRIPT, ...files], { cwd: repo, encoding: "utf8" });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "check-file-tokens-"));
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("check-file-tokens", () => {
  it("passes a file under the limit", () => {
    write("small.ts", LIMIT_BYTES);
    expect(check("small.ts").status).toBe(0);
  });

  it("fails a new file over the limit", () => {
    write("big.ts", LIMIT_BYTES + 4);
    const result = check("big.ts");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("big.ts: ~5001 tokens");
  });

  it("fails a file that grows past the limit", () => {
    commit("grows.ts", LIMIT_BYTES);
    write("grows.ts", LIMIT_BYTES + 4);
    expect(check("grows.ts").status).toBe(1);
  });

  it("passes a file already over the limit that does not grow", () => {
    commit("legacy.ts", LIMIT_BYTES * 3);
    write("legacy.ts", LIMIT_BYTES * 3);
    expect(check("legacy.ts").status).toBe(0);
  });

  it("passes a file already over the limit that shrinks", () => {
    commit("legacy.ts", LIMIT_BYTES * 3);
    write("legacy.ts", LIMIT_BYTES * 2);
    expect(check("legacy.ts").status).toBe(0);
  });

  it("fails a file already over the limit that grows, naming both sizes", () => {
    commit("legacy.ts", LIMIT_BYTES * 3);
    write("legacy.ts", LIMIT_BYTES * 3 + 4);
    const result = check("legacy.ts");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("legacy.ts: ~15001 tokens, up from ~15000");
  });

  it("ignores generated files", () => {
    write("package-lock.json", LIMIT_BYTES * 2);
    expect(check("package-lock.json").status).toBe(0);
  });
});
