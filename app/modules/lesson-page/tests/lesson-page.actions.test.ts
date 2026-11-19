import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { LessonProgressStatus, UserRole } from "~/db/schema";
import { createComment, deleteComment } from "~/lib/comments.server";
import { fakeNotifications } from "~/lib/notifications.fake.server";
import {
  addLesson,
  addModule,
  addQuiz,
  addUser,
  decisionsFor,
  enroll,
  setUp,
  studentPerson,
  type World,
} from "./fixtures";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const LATER = new Date("2026-10-07T12:00:00.000Z");

let world: World;
let lesson: { id: number };
let otherLesson: { id: number };
let studentId: number;

beforeEach(() => {
  world = setUp();
  const mod = addModule(world.db, world.course.id, 1);
  lesson = addLesson(world.db, mod.id, { position: 1 });
  otherLesson = addLesson(world.db, mod.id, { position: 2 });
  studentId = world.user.id;
  enroll(world.db, studentId, world.course.id);
});

async function comment(
  authorId: number,
  parentId: number | null,
  body: string
) {
  const created = await createComment(
    world.db,
    authorId,
    lesson.id,
    parentId,
    body,
    NOW,
    fakeNotifications()
  );
  if (!created.ok) throw new Error(created.error);
  return created.comment;
}

describe("lessonPage.markComplete", () => {
  it("records the lesson as completed at the given time", () => {
    const key = { userId: studentId, lessonId: lesson.id };
    expect(world.lessonPage.markComplete(key, NOW)).toMatchObject({
      status: LessonProgressStatus.Completed,
      completedAt: NOW.toISOString(),
    });
  });

  it("completes a lesson already in progress rather than adding a row", async () => {
    await world.lessonPage.load(
      decisionsFor(world, studentPerson(studentId)),
      lesson.id
    );
    const key = { userId: studentId, lessonId: lesson.id };
    world.lessonPage.markComplete(key, LATER);

    const rows = world.db.select().from(schema.lessonProgress).all();
    expect(rows).toEqual([
      expect.objectContaining({
        status: LessonProgressStatus.Completed,
        completedAt: LATER.toISOString(),
      }),
    ]);
  });
});

describe("lessonPage.findComment and findQuiz", () => {
  it("finds a comment only on its own lesson", async () => {
    const posted = await comment(studentId, null, "Where is the code?");
    expect(world.lessonPage.findComment(lesson.id, posted.id)?.id).toBe(
      posted.id
    );
    expect(
      world.lessonPage.findComment(otherLesson.id, posted.id)
    ).toBeUndefined();
    expect(world.lessonPage.findComment(lesson.id, 9999)).toBeUndefined();
  });

  it("finds a quiz only on its own lesson", () => {
    const { quiz } = addQuiz(world.db, lesson.id, [[true]]);
    expect(world.lessonPage.findQuiz(lesson.id, quiz.id)?.id).toBe(quiz.id);
    expect(world.lessonPage.findQuiz(otherLesson.id, quiz.id)).toBeUndefined();
    expect(world.lessonPage.findQuiz(lesson.id, 9999)).toBeUndefined();
  });
});

describe("lessonPage.load — discussion", () => {
  it("nests replies, marks the Instructor and an Admin, and drops an empty deleted question", async () => {
    const admin = addUser(world.db, "Pat Admin", UserRole.Admin);
    const question = await comment(studentId, null, "How do I start?");
    await comment(world.instructor.id, question.id, "Run npm start.");
    const lonely = await comment(admin.id, null, "Off topic");
    await deleteComment(
      world.db,
      lonely.id,
      admin.id,
      true,
      NOW,
      fakeNotifications()
    );

    const page = await world.lessonPage.load(
      decisionsFor(world, studentPerson(studentId)),
      lesson.id
    );
    if (page?.view !== "full") throw new Error("expected full view");

    expect(page.comments).toEqual([
      expect.objectContaining({
        id: question.id,
        deleted: false,
        author: expect.objectContaining({ id: studentId, isInstructor: false }),
        replies: [
          expect.objectContaining({
            bodyHtml: expect.stringContaining("Run npm start."),
            author: expect.objectContaining({
              isInstructor: true,
              isPlatformAdmin: false,
            }),
          }),
        ],
      }),
    ]);
  });

  it("keeps a deleted question that has replies, without its body", async () => {
    const question = await comment(studentId, null, "Secret question");
    await comment(world.instructor.id, question.id, "An answer");
    await deleteComment(
      world.db,
      question.id,
      studentId,
      false,
      NOW,
      fakeNotifications()
    );

    const page = await world.lessonPage.load(
      decisionsFor(world, studentPerson(studentId)),
      lesson.id
    );
    if (page?.view !== "full") throw new Error("expected full view");

    expect(page.comments).toEqual([
      expect.objectContaining({
        deleted: true,
        body: "",
        bodyHtml: "",
        editedAt: null,
        replies: [expect.objectContaining({ deleted: false })],
      }),
    ]);
  });

  it("drops a deleted reply", async () => {
    const question = await comment(studentId, null, "A question");
    const reply = await comment(world.instructor.id, question.id, "Oops");
    await deleteComment(
      world.db,
      reply.id,
      world.instructor.id,
      false,
      NOW,
      fakeNotifications()
    );

    const page = await world.lessonPage.load(
      decisionsFor(world, studentPerson(studentId)),
      lesson.id
    );
    if (page?.view !== "full") throw new Error("expected full view");

    expect(page.comments).toEqual([
      expect.objectContaining({ body: "A question", replies: [] }),
    ]);
  });
});

describe("lessonPage.submitQuiz", () => {
  // Ten one-option-right questions, so each correct answer is 10%.
  function tenQuestionQuiz() {
    const { quiz, options } = addQuiz(
      world.db,
      lesson.id,
      Array.from({ length: 10 }, () => [false, true])
    );
    const answer = (correctCount: number) =>
      Object.fromEntries(
        options.map((opts, i) => [
          opts[0].questionId,
          (i < correctCount ? opts[1] : opts[0]).id,
        ])
      );
    return { quiz, options, answer };
  }

  it.each([
    [10, "A", true],
    [9, "A", true],
    [8, "B", true],
    [7, "C", false],
    [6, "D", false],
    [5, "F", false],
  ])(
    "scores %i of 10 as grade %s (passed: %s)",
    (correctCount, grade, passed) => {
      const { quiz, answer } = tenQuestionQuiz();
      const result = world.lessonPage.submitQuiz({
        userId: studentId,
        quizId: quiz.id,
        answers: answer(correctCount),
      });
      expect(result).toMatchObject({
        score: correctCount / 10,
        grade,
        passed,
        totalCorrect: correctCount,
        totalQuestions: 10,
      });
    }
  );

  it("reports each question and records the attempt with only the answered questions", () => {
    const { quiz, options } = addQuiz(world.db, lesson.id, [
      [true, false],
      [false, true],
    ]);
    const [first, second] = options;
    const result = world.lessonPage.submitQuiz({
      userId: studentId,
      quizId: quiz.id,
      answers: { [first[0].questionId]: first[1].id },
    });

    expect(result?.questionResults).toEqual([
      {
        questionId: first[0].questionId,
        correct: false,
        selectedOptionId: first[1].id,
        correctOptionId: first[0].id,
      },
      {
        questionId: second[0].questionId,
        correct: false,
        selectedOptionId: null,
        correctOptionId: null,
      },
    ]);

    const attempt = world.db.select().from(schema.quizAttempts).get();
    expect(attempt).toMatchObject({
      id: result?.attemptId,
      score: 0,
      passed: false,
    });
    const answers = world.db
      .select()
      .from(schema.quizAnswers)
      .where(eq(schema.quizAnswers.attemptId, result?.attemptId ?? -1))
      .all();
    expect(answers).toEqual([
      expect.objectContaining({
        questionId: first[0].questionId,
        selectedOptionId: first[1].id,
      }),
    ]);
  });

  it("scores a quiz with no questions as zero", () => {
    const { quiz } = addQuiz(world.db, lesson.id, []);
    expect(
      world.lessonPage.submitQuiz({
        userId: studentId,
        quizId: quiz.id,
        answers: {},
      })
    ).toMatchObject({ score: 0, passed: false, grade: "F", totalQuestions: 0 });
  });

  it("is null for a quiz that does not exist", () => {
    expect(
      world.lessonPage.submitQuiz({
        userId: studentId,
        quizId: 9999,
        answers: {},
      })
    ).toBeNull();
  });
});
