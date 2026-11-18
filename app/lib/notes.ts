import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

/**
 * A Note body as it may be stored: plain text, trimmed, not empty, and no
 * longer than the cap. Shared by the Lesson action and the notes service so
 * the rule lives in one place.
 */
export const noteBodySchema = z
  .string()
  .trim()
  .min(1, "Write something before saving your note")
  .max(MAX_NOTE_LENGTH, `Note must be ${MAX_NOTE_LENGTH} characters or fewer`);
