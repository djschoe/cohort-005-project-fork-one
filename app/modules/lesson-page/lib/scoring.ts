import { and, eq } from "drizzle-orm";
import {
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";
import type { Db } from "./db";

function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

type Question = typeof quizQuestions.$inferSelect;

function getCorrectOptionId(db: Db, question: Question) {
  const correctOpt = db
    .select()
    .from(quizOptions)
    .where(
      and(
        eq(quizOptions.questionId, question.id),
        eq(quizOptions.isCorrect, true)
      )
    )
    .get();
  return correctOpt ? correctOpt.id : null;
}

function scoreQuestion(
  db: Db,
  question: Question,
  selected: number | undefined
): QuestionResult {
  if (!selected) {
    return {
      questionId: question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    };
  }
  const correctOptionId = getCorrectOptionId(db, question);
  return {
    questionId: question.id,
    correct: selected === correctOptionId,
    selectedOptionId: selected,
    correctOptionId,
  };
}

function saveAttempt(
  db: Db,
  attempt: { userId: number; quizId: number; score: number; passed: boolean },
  questionResults: QuestionResult[]
) {
  const saved = db.insert(quizAttempts).values(attempt).returning().get();
  for (const result of questionResults) {
    if (result.selectedOptionId !== null) {
      db.insert(quizAnswers)
        .values({
          attemptId: saved.id,
          questionId: result.questionId,
          selectedOptionId: result.selectedOptionId,
        })
        .run();
    }
  }
  return saved;
}

export type QuizSubmission = {
  userId: number;
  quizId: number;
  /** Selected option id, by question id. */
  answers: Record<number, number>;
};

function scoreQuiz(db: Db, { userId, quizId, answers }: QuizSubmission) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) {
    console.error("quiz not found");
    return null;
  }

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const questionResults = questions.map((q) =>
    scoreQuestion(db, q, answers[q.id])
  );
  const correct = questionResults.filter((r) => r.correct).length;
  const total = questions.length;
  const score = total > 0 ? correct / total : 0;
  const passed = score > 0.7;

  const attempt = saveAttempt(
    db,
    { userId, quizId, score, passed },
    questionResults
  );

  return {
    attemptId: attempt.id,
    score,
    passed,
    grade: calculateGrade(score),
    totalCorrect: correct,
    totalQuestions: total,
    questionResults,
  };
}

/** Scores and records an attempt. Null when the quiz is missing or saving fails. */
export function submitQuiz(db: Db, submission: QuizSubmission) {
  try {
    return scoreQuiz(db, submission);
  } catch (error) {
    console.error(error);
    return null;
  }
}

export type QuizResult = NonNullable<ReturnType<typeof submitQuiz>>;
