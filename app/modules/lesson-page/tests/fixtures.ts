import * as schema from "~/db/schema";
import { QuestionType, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { createCoursePermissions } from "~/modules/permissions/course-permissions.server";
import { createLessonPage } from "../index.server";

// Course content, enrollments and quizzes have no service that writes them,
// so these fixtures insert rows directly. Kept here so a schema change
// touches only this file.

export function setUp() {
  const db = createTestDb();
  const base = seedBaseData(db);
  return {
    db,
    ...base,
    lessonPage: createLessonPage(db),
    permissions: createCoursePermissions(db),
  };
}

export type World = ReturnType<typeof setUp>;

export function addModule(db: TestDb, courseId: number, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId, title: `Module ${position}`, position })
    .returning()
    .get();
}

export function addLesson(
  db: TestDb,
  moduleId: number,
  values: Partial<typeof schema.lessons.$inferInsert> & { position: number }
) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title: `Lesson ${values.position}`, ...values })
    .returning()
    .get();
}

export function addUser(db: TestDb, name: string, role = UserRole.Student) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.replaceAll(" ", ".")}@example.com`, role })
    .returning()
    .get();
}

export function enroll(db: TestDb, userId: number, courseId: number) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
}

export function watch(
  db: TestDb,
  key: { userId: number; lessonId: number },
  event: { positionSeconds: number; createdAt: string }
) {
  db.insert(schema.videoWatchEvents)
    .values({ ...key, eventType: "progress", ...event })
    .run();
}

/** A quiz with one question per entry; each entry is [correct?] per option. */
export function addQuiz(db: TestDb, lessonId: number, questions: boolean[][]) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check yourself", passingScore: 0.7 })
    .returning()
    .get();
  const options = questions.map((correctness, i) => {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Question ${i + 1}`,
        questionType: QuestionType.MultipleChoice,
        position: i,
      })
      .returning()
      .get();
    return correctness.map((isCorrect, j) =>
      db
        .insert(schema.quizOptions)
        .values({
          questionId: question.id,
          optionText: `Option ${j + 1}`,
          isCorrect,
        })
        .returning()
        .get()
    );
  });
  return { quiz, options };
}

export function studentPerson(id: number) {
  return { id, role: "student" as const, country: null };
}

type Person = Parameters<World["permissions"]["decide"]>[0];

export function decisionsFor(world: World, person: Person) {
  const decisions = world.permissions.decide(person, {
    courseId: world.course.id,
  });
  if (!decisions.found) throw new Error("course not found");
  return decisions;
}

export const CONTENT = markdown("# Hello\n\nSome **content**.");
