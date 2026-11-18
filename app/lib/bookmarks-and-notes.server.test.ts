import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-and-notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesLater(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("adds a Bookmark the first time and removes it the second", () => {
    const [lessonId] = lessonIds;

    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
    expect(toggleBookmark(db, base.user.id, lessonId, NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(true);
    expect(toggleBookmark(db, base.user.id, lessonId, NOW)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    const [lessonId] = lessonIds;
    toggleBookmark(db, base.user.id, lessonId, NOW);

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId })
        .run()
    ).toThrow(/UNIQUE/);
    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });

  it("is per Student", () => {
    const other = addStudent("Sam");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(isBookmarked(db, other.id, lessonIds[0])).toBe(false);
  });
});

describe("saving a Note", () => {
  it("creates the Note with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "  # not a heading  ",
      NOW
    );

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "# not a heading",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    const later = minutesLater(30);
    const second = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "Second thought",
      later
    );
    if (!second.ok) throw new Error(second.error);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thought",
      updatedAt: later.toISOString(),
    });
    expect(second.note.createdAt).toBe(NOW.toISOString());
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("never leaves a Student with two Notes on one Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Again" })
        .run()
    ).toThrow(/UNIQUE/);
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW).ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });

  it("refuses a Note over 2,000 characters with a message, and stores nothing", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      NOW
    );

    expect(result).toEqual({
      ok: false,
      error: "Note must be 2000 characters or fewer",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("refuses a Note that is only whitespace", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "   ", NOW).ok).toBe(false);
  });
});

describe("the Saved lists", () => {
  it("lists only the Student's own Bookmarks, newest first, with their Lesson and Course", () => {
    const other = addStudent("Sam");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[2], minutesLater(5));
    toggleBookmark(db, other.id, lessonIds[1], minutesLater(10));

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      {
        lessonId: lessonIds[2],
        lessonTitle: "Lesson 3",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1" },
    ]);
  });

  it("lists only the Student's own Notes, most recently edited first", () => {
    const other = addStudent("Sam");
    saveNote(db, base.user.id, lessonIds[0], "Older note", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Newer note", minutesLater(5));
    saveNote(db, other.id, lessonIds[2], "Not yours", minutesLater(10));
    // Editing the older Note moves it to the top.
    saveNote(db, base.user.id, lessonIds[0], "Edited note", minutesLater(15));

    expect(listNotes(db, base.user.id)).toMatchObject([
      {
        body: "Edited note",
        lessonId: lessonIds[0],
        courseTitle: "Test Course",
        courseSlug: "test-course",
      },
      { body: "Newer note", lessonId: lessonIds[1] },
    ]);
  });
});
