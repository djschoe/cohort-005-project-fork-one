import { describe, it, expect, beforeEach } from "vitest";
import { LessonProgressStatus, UserRole } from "~/db/schema";
import {
  addLesson,
  addModule,
  addQuiz,
  addUser,
  CONTENT,
  decisionsFor,
  enroll,
  setUp,
  studentPerson,
  watch,
  type World,
} from "./fixtures";

const NOW = new Date("2026-10-06T12:00:00.000Z");

let world: World;
let first: { id: number };
let second: { id: number };
let third: { id: number };
let studentId: number;

beforeEach(() => {
  world = setUp();
  const m1 = addModule(world.db, world.course.id, 1);
  const m2 = addModule(world.db, world.course.id, 2);
  first = addLesson(world.db, m1.id, { position: 1 });
  second = addLesson(world.db, m1.id, { position: 2, content: CONTENT });
  third = addLesson(world.db, m2.id, { position: 1 });
  studentId = world.user.id;
});

function loadAs(personId: number | null, lessonId: number) {
  const person = personId === null ? null : studentPerson(personId);
  return world.lessonPage.load(decisionsFor(world, person), lessonId);
}

async function loadFull(personId: number | null, lessonId: number) {
  const page = await loadAs(personId, lessonId);
  if (page?.view !== "full")
    throw new Error(`expected full, got ${page?.view}`);
  return page;
}

describe("lessonPage.load", () => {
  it("is null for a lesson that does not exist", async () => {
    expect(await loadAs(null, 9999)).toBeNull();
  });

  it("shows a signed-out visitor the outline and the reason, never the content", async () => {
    const page = await loadAs(null, second.id);
    expect(page).toEqual({
      view: "locked",
      course: {
        id: world.course.id,
        title: "Test Course",
        slug: "test-course",
      },
      curriculum: [
        expect.objectContaining({
          lessons: [
            { id: first.id, title: "Lesson 1" },
            { id: second.id, title: "Lesson 2" },
          ],
        }),
        expect.objectContaining({
          lessons: [{ id: third.id, title: "Lesson 1" }],
        }),
      ],
      module: expect.objectContaining({ title: "Module 1" }),
      lesson: { id: second.id, title: "Lesson 2" },
      enrolled: false,
      lockedReason: { kind: "signed-out" },
    });
  });

  it("gives an enrolled Student the full lesson and records the visit", async () => {
    enroll(world.db, studentId, world.course.id);
    const page = await loadFull(studentId, second.id);

    expect(page).toMatchObject({
      lessonStatus: LessonProgressStatus.InProgress,
      lessonProgressMap: { [second.id]: LessonProgressStatus.InProgress },
      prevLesson: { id: first.id, moduleTitle: "Module 1" },
      nextLesson: { id: third.id, moduleTitle: "Module 2" },
      currentUserId: studentId,
      canModerate: false,
      instructorName: "Test Instructor",
      bookmarked: false,
      note: null,
      quiz: null,
      bestAttempt: null,
      comments: [],
    });
    expect(page.contentHtml).toContain("<strong>content</strong>");
  });

  it("has no previous lesson on the first and no next lesson on the last", async () => {
    enroll(world.db, studentId, world.course.id);
    expect((await loadFull(studentId, first.id)).prevLesson).toBeNull();
    expect((await loadFull(studentId, third.id)).nextLesson).toBeNull();
  });

  it("keeps a completed lesson completed when it is visited again", async () => {
    enroll(world.db, studentId, world.course.id);
    world.lessonPage.markComplete(
      { userId: studentId, lessonId: first.id },
      NOW
    );
    const page = await loadFull(studentId, first.id);
    expect(page.lessonStatus).toBe(LessonProgressStatus.Completed);
  });

  it("lets the owning Instructor view and moderate without recording progress", async () => {
    const page = await loadFull(world.instructor.id, first.id);
    expect(page).toMatchObject({
      canModerate: true,
      lessonStatus: null,
      lessonProgressMap: {},
      lastWatchPosition: 0,
    });
    const again = await loadFull(world.instructor.id, first.id);
    expect(again.lessonStatus).toBeNull();
  });

  it("shows the Student's own Note and Bookmark", async () => {
    enroll(world.db, studentId, world.course.id);
    const key = { userId: studentId, lessonId: first.id };
    world.lessonPage.saveNote(key, "  remember this ", NOW);
    world.lessonPage.toggleBookmark(key, NOW);

    const page = await loadFull(studentId, first.id);
    expect(page.note).toEqual({
      body: "remember this",
      updatedAt: NOW.toISOString(),
    });
    expect(page.bookmarked).toBe(true);
  });
});

describe("lessonPage.load — video", () => {
  let video: { id: number };

  beforeEach(() => {
    enroll(world.db, studentId, world.course.id);
    const mod = addModule(world.db, world.course.id, 3);
    video = addLesson(world.db, mod.id, {
      position: 1,
      videoUrl: "https://youtu.be/x",
      durationMinutes: 10,
    });
  });

  it("resumes from the latest position and reports the furthest point reached", async () => {
    const key = { userId: studentId, lessonId: video.id };
    watch(world.db, key, { positionSeconds: 300, createdAt: "2026-01-01" });
    watch(world.db, key, { positionSeconds: 60, createdAt: "2026-01-02" });

    const page = await loadFull(studentId, video.id);
    expect(page.lastWatchPosition).toBe(60);
    expect(page.watchProgress).toBe(50);
  });

  it("caps watch progress at 100%", async () => {
    const key = { userId: studentId, lessonId: video.id };
    watch(world.db, key, { positionSeconds: 900, createdAt: "2026-01-01" });
    expect((await loadFull(studentId, video.id)).watchProgress).toBe(100);
  });

  it("ignores watch events on a lesson without a video", async () => {
    const key = { userId: studentId, lessonId: first.id };
    watch(world.db, key, { positionSeconds: 300, createdAt: "2026-01-01" });
    const page = await loadFull(studentId, first.id);
    expect(page).toMatchObject({ lastWatchPosition: 0, watchProgress: 0 });
  });
});

describe("lessonPage.load — quiz", () => {
  it("hides which options are correct and shows the best attempt", async () => {
    enroll(world.db, studentId, world.course.id);
    const { quiz, options } = addQuiz(world.db, first.id, [[false, true]]);
    const right = { [options[0][0].questionId]: options[0][1].id };
    const wrong = { [options[0][0].questionId]: options[0][0].id };
    world.lessonPage.submitQuiz({
      userId: studentId,
      quizId: quiz.id,
      answers: wrong,
    });
    world.lessonPage.submitQuiz({
      userId: studentId,
      quizId: quiz.id,
      answers: right,
    });

    const page = await loadFull(studentId, first.id);
    expect(page.quiz).toEqual({
      id: quiz.id,
      title: "Check yourself",
      passingScore: 0.7,
      questions: [
        expect.objectContaining({
          questionText: "Question 1",
          options: [
            { id: options[0][0].id, optionText: "Option 1" },
            { id: options[0][1].id, optionText: "Option 2" },
          ],
        }),
      ],
    });
    expect(page.bestAttempt).toEqual({ score: 1, passed: true });
  });

  it("shows the quiz but no attempt to someone who is not taking the course", async () => {
    addQuiz(world.db, first.id, [[true]]);
    const admin = addUser(world.db, "Pat Admin", UserRole.Admin);
    const page = await world.lessonPage.load(
      decisionsFor(world, {
        id: admin.id,
        role: "platform-admin",
        country: null,
      }),
      first.id
    );
    expect(page).toMatchObject({ view: "full", bestAttempt: null });
    expect(page).toHaveProperty("quiz.title", "Check yourself");
  });
});
