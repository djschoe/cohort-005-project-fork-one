import * as fs from "node:fs";

type Finding = { path: string; line: number; title: string; body: string };

// The verdict names each finding the review left. The finding's text goes
// once, in its inline comment, so the human reads it once. A finding outside
// the diff cannot go inline, so the verdict carries its text instead.
export const leftFindings = (inline: Finding[], dropped: Finding[]): string => {
  if (inline.length === 0 && dropped.length === 0) return "";
  const where = ({ path, line }: Finding) => `\`${path}:${line}\``;
  const sections = ["", "## Left for you", ""];
  if (inline.length > 0) {
    sections.push("Each one is an inline comment on its line.", "");
    sections.push(...inline.map((f) => `- ${where(f)}: ${f.title}`));
  }
  if (dropped.length > 0) {
    sections.push("", "These are outside the diff, so not inline:", "");
    sections.push(
      ...dropped.map((f) => `- ${where(f)}: **${f.title}.** ${f.body}`)
    );
  }
  return `${sections.join("\n")}\n`;
};

// Appends to the agent's verdict. A missing or empty verdict stays as it is,
// so the workflow still posts its "no verdict" fallback.
export const appendToVerdict = (file: string, text: string): void => {
  if (!text || !fs.existsSync(file) || fs.statSync(file).size === 0) return;
  fs.appendFileSync(file, text);
};
