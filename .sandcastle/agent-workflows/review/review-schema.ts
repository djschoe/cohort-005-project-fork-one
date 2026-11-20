import { z } from "zod/v4";

// The findings the review left unfixed. The workflow posts each one as an
// inline comment on the pull request, on its file and line.
export const reviewSchema = z
  .strictObject({
    comments: z
      .array(
        z.strictObject({
          path: z
            .string()
            .min(1)
            .describe("The file, relative to the repository root."),
          line: z
            .number()
            .int()
            .positive()
            .describe(
              "A line in the file as it is now, inside a hunk of the diff against the base. A comment outside the hunks is dropped."
            ),
          title: z
            .string()
            .min(1)
            .describe(
              'The axis and the rule, in a few words, e.g. "Spec: scope creep" or "Standards: Arrange tests through the module under test". The verdict lists the finding by this title alone.'
            ),
          body: z
            .string()
            .min(1)
            .describe(
              "The finding, in Markdown, after the title: what is wrong on this line, and the decision the human has to make. The only full statement of the finding."
            ),
        })
      )
      .describe("One entry per finding you left unfixed. Empty is fine."),
  })
  .describe("The review's inline comments.");
