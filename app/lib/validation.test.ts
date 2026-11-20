import { describe, expect, it } from "vitest";
import { z } from "zod";
import { idParam, parseParams } from "./validation";

describe("idParam", () => {
  it.each([
    ["1", 1],
    ["42", 42],
  ])("parses %j to %d", (raw, id) => {
    expect(idParam.parse(raw)).toBe(id);
  });

  it.each(["", "0", "-1", "1.5", "abc"])("rejects %j", (raw) => {
    expect(idParam.safeParse(raw).success).toBe(false);
  });

  it("turns a bad route param into a 400", () => {
    const schema = z.object({ lessonId: idParam });
    expect(() => parseParams({ lessonId: "0" }, schema)).toThrow(
      expect.objectContaining({
        data: "Invalid parameters",
        init: expect.objectContaining({ status: 400 }),
      })
    );
    expect(parseParams({ lessonId: "7" }, schema)).toEqual({ lessonId: 7 });
  });
});
