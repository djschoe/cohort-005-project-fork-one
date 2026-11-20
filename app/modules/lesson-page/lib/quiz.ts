import { and, desc, eq } from "drizzle-orm";
import { quizAttempts, quizOptions, quizQuestions, quizzes } from "~/db/schema";
import type { Db } from "./db";

/** The quiz, only if it belongs to this lesson. */
export function findLessonQuiz(db: Db, lessonId: number, quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  return quiz?.lessonId === lessonId ? quiz : undefined;
}

function getQuizWithQuestions(db: Db, quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const questionsWithOptions = questions.map((question) => {
    const options = db
      .select()
      .from(quizOptions)
      .where(eq(quizOptions.questionId, question.id))
      .all();
    return { ...question, options };
  });

  return { ...quiz, questions: questionsWithOptions };
}

function getBestAttempt(db: Db, userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export type LessonQuiz = {
  id: number;
  title: string;
  passingScore: number;
  questions: Array<{
    id: number;
    questionText: string;
    questionType: string;
    position: number;
    options: Array<{ id: number; optionText: string }>;
  }>;
};

// Strips isCorrect from options so answers aren't leaked to the client.
function toLessonQuiz(
  quizData: NonNullable<ReturnType<typeof getQuizWithQuestions>>
): LessonQuiz {
  return {
    id: quizData.id,
    title: quizData.title,
    passingScore: quizData.passingScore,
    questions: quizData.questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      position: q.position,
      options: q.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
      })),
    })),
  };
}

/** The lesson's quiz without its answers, and the person's best attempt. */
export function getQuizForLesson(
  db: Db,
  lessonId: number,
  userId: number | null
) {
  const quizRecord = db
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .get();
  if (!quizRecord) return { quiz: null, bestAttempt: null };

  const quizData = getQuizWithQuestions(db, quizRecord.id);
  const best = userId ? getBestAttempt(db, userId, quizRecord.id) : undefined;

  return {
    quiz: quizData ? toLessonQuiz(quizData) : null,
    bestAttempt: best ? { score: best.score, passed: best.passed } : null,
  };
}
