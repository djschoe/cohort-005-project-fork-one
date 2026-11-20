import type { CourseDecisions } from "~/modules/permissions/course-permissions.server";
import { isBookmarked } from "~/lib/bookmarks.server";
import { getNote } from "~/lib/notes.server";
import { renderMarkdown } from "~/lib/markdown.server";
import type { Db } from "./db";
import {
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getNeighbours,
  getUserById,
  toCurriculum,
  type CourseWithDetails,
} from "./course";
import { recordVisit } from "./progress";
import { getRenderedThread } from "./thread";
import { getQuizForLesson } from "./quiz";

export type FoundDecisions = Extract<CourseDecisions, { found: true }>;

type Lesson = NonNullable<ReturnType<typeof getLessonById>>;

function courseSummary(course: CourseWithDetails) {
  return { id: course.id, title: course.title, slug: course.slug };
}

const NO_PROGRESS = {
  lessonStatus: null as string | null,
  lastWatchPosition: 0,
  watchProgress: 0,
  lessonProgressMap: {} as Record<number, string>,
};

// Progress is recorded only for people who can take the course, so a Student
// under a Country Lock gets none.
function progressFor(db: Db, decisions: FoundDecisions, lesson: Lesson) {
  const { person, take, course } = decisions;
  if (!person || !take.allowed) return NO_PROGRESS;
  return recordVisit(db, { userId: person.id, courseId: course.id }, lesson);
}

// Everything here is confidential to the course: comments, Bookmarks and Notes.
async function viewerContent(
  db: Db,
  decisions: FoundDecisions,
  lesson: Lesson
) {
  const userId = decisions.person?.id ?? null;
  const instructor = getUserById(db, decisions.course.instructorId);
  const note = userId ? getNote(db, userId, lesson.id) : undefined;
  return {
    currentUserId: userId,
    comments: await getRenderedThread(db, lesson.id),
    canModerate: decisions.manage.allowed,
    instructorName: instructor?.name ?? "your instructor",
    bookmarked: userId ? isBookmarked(db, userId, lesson.id) : false,
    note: note ? { body: note.body, updatedAt: note.updatedAt } : null,
    contentHtml: lesson.content ? await renderMarkdown(lesson.content) : null,
    ...getQuizForLesson(db, lesson.id, userId),
  };
}

/**
 * Everything the lesson page shows, or null when the lesson is missing.
 *
 * Someone who can't view the content gets the lesson's title, its module and
 * the course outline — never the body, video or quiz — plus the reason, so
 * the page can show the right call to action.
 */
export async function loadLessonPage(
  db: Db,
  decisions: FoundDecisions,
  lessonId: number
) {
  const course = getCourseWithDetails(db, decisions.course.id);
  const lesson = getLessonById(db, lessonId);
  const mod = lesson ? getModuleById(db, lesson.moduleId) : undefined;
  if (!course || !lesson || !mod) return null;

  const shared = {
    course: courseSummary(course),
    curriculum: toCurriculum(course),
    module: { id: mod.id, title: mod.title },
    enrolled: decisions.enrolled,
  };

  if (!decisions.view.allowed) {
    return {
      ...shared,
      view: "locked" as const,
      lesson: { id: lesson.id, title: lesson.title },
      lockedReason: decisions.view.reason,
    };
  }

  return {
    ...shared,
    view: "full" as const,
    lesson,
    ...progressFor(db, decisions, lesson),
    ...(await viewerContent(db, decisions, lesson)),
    ...getNeighbours(course, lessonId),
  };
}

export type LessonPageData = NonNullable<
  Awaited<ReturnType<typeof loadLessonPage>>
>;
