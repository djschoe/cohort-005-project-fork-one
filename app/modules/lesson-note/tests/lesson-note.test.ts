import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("cannot save an empty or whitespace-only draft", () => {
    expect(describeNoteDraft("   \n ", null)).toMatchObject({
      length: 0,
      status: "empty",
      canSave: false,
    });
  });

  it("can save a new draft when there is no saved note", () => {
    expect(describeNoteDraft("Remember to rollback", null)).toMatchObject({
      length: 20,
      maxLength: MAX_NOTE_LENGTH,
      status: "unsaved",
      canSave: true,
    });
  });

  it("reports saved when the draft matches the saved note, ignoring surrounding whitespace", () => {
    expect(describeNoteDraft("  same text \n", "same text")).toMatchObject({
      status: "saved",
      canSave: false,
    });
  });

  it("reports unsaved when the draft differs from the saved note", () => {
    expect(describeNoteDraft("edited text", "same text")).toMatchObject({
      status: "unsaved",
      canSave: true,
    });
  });

  it("allows a draft exactly at the limit", () => {
    const draft = "a".repeat(MAX_NOTE_LENGTH);
    expect(describeNoteDraft(draft, null)).toMatchObject({
      length: MAX_NOTE_LENGTH,
      status: "unsaved",
      canSave: true,
    });
  });

  it("refuses a draft over the limit, counting the trimmed text", () => {
    const draft = ` ${"a".repeat(MAX_NOTE_LENGTH + 1)} `;
    expect(describeNoteDraft(draft, null)).toMatchObject({
      length: MAX_NOTE_LENGTH + 1,
      status: "too-long",
      canSave: false,
    });
  });
});
