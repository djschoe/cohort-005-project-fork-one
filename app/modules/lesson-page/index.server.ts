import { db } from "~/db";
import type { Db } from "./lib/db";
import { loadLessonPage, type FoundDecisions } from "./lib/page";
import { markLessonComplete, type LessonKey } from "./lib/progress";
import { findLessonComment } from "./lib/thread";
import { findLessonQuiz } from "./lib/quiz";
import { submitQuiz, type QuizSubmission } from "./lib/scoring";

/**
 * The lesson page's data, bound to a database. The app uses `lessonPage`,
 * which reads the app database; tests build their own against a test
 * database. Permission checks stay with the caller: pass in the decisions
 * from `coursePermissions`.
 */
export function createLessonPage(database: Db) {
  return {
    /**
     * Everything the lesson page shows: `view: "locked"` when the person may
     * not view the content, otherwise `view: "full"`. Records the visit as
     * progress for someone who can take the course. Null when the lesson or
     * its module is missing.
     */
    load(decisions: FoundDecisions, lessonId: number) {
      return loadLessonPage(database, decisions, lessonId);
    },

    markComplete(key: LessonKey, now: Date) {
      return markLessonComplete(database, key, now);
    },

    /** The comment, or undefined when it is not on this lesson. */
    findComment(lessonId: number, commentId: number) {
      return findLessonComment(database, lessonId, commentId);
    },

    /** The quiz, or undefined when it is not on this lesson. */
    findQuiz(lessonId: number, quizId: number) {
      return findLessonQuiz(database, lessonId, quizId);
    },

    /**
     * Scores the answers, records the attempt and returns the result. Null
     * when the quiz is missing or the attempt could not be saved.
     */
    submitQuiz(submission: QuizSubmission) {
      return submitQuiz(database, submission);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonPage = /* @__PURE__ */ createLessonPage(db);
