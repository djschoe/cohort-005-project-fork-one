import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = "empty" | "too-long" | "unsaved" | "saved";

export type NoteDraft = {
  length: number;
  maxLength: number;
  status: NoteDraftStatus;
  canSave: boolean;
};

export function describeDraft(
  draft: string,
  savedBody: string | null
): NoteDraft {
  // The server trims before saving, so a saved body is already trimmed and
  // whitespace around the draft is not an edit.
  const trimmed = draft.trim();
  const length = trimmed.length;

  let status: NoteDraftStatus;
  if (length === 0) status = "empty";
  else if (length > MAX_NOTE_LENGTH) status = "too-long";
  else if (trimmed === savedBody) status = "saved";
  else status = "unsaved";

  return {
    length,
    maxLength: MAX_NOTE_LENGTH,
    status,
    canSave: status === "unsaved",
  };
}
