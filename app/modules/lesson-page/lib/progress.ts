import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  videoWatchEvents,
} from "~/db/schema";
import type { Db } from "./db";

export type LessonKey = { userId: number; lessonId: number };

function getLessonProgress(db: Db, { userId, lessonId }: LessonKey) {
  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lessonId)
      )
    )
    .get();
}

function getLessonProgressForCourse(db: Db, userId: number, courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id))))
    .all();

  if (courseLessons.length === 0) return [];

  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        or(...courseLessons.map((l) => eq(lessonProgress.lessonId, l.id)))
      )
    )
    .all();
}

export function markLessonComplete(db: Db, key: LessonKey, now: Date) {
  const existing = getLessonProgress(db, key);
  const completed = {
    status: LessonProgressStatus.Completed,
    completedAt: now.toISOString(),
  };

  if (existing) {
    return db
      .update(lessonProgress)
      .set(completed)
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({ ...key, ...completed })
    .returning()
    .get();
}

function markLessonInProgress(db: Db, key: LessonKey) {
  const existing = getLessonProgress(db, key);

  if (existing) {
    if (existing.status === LessonProgressStatus.Completed) {
      return existing;
    }
    return db
      .update(lessonProgress)
      .set({ status: LessonProgressStatus.InProgress })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({ ...key, status: LessonProgressStatus.InProgress })
    .returning()
    .get();
}

function watchedBy({ userId, lessonId }: LessonKey) {
  return and(
    eq(videoWatchEvents.userId, userId),
    eq(videoWatchEvents.lessonId, lessonId)
  );
}

function getLastWatchPosition(db: Db, key: LessonKey) {
  const lastEvent = db
    .select()
    .from(videoWatchEvents)
    .where(watchedBy(key))
    .orderBy(desc(videoWatchEvents.createdAt))
    .limit(1)
    .get();

  return lastEvent?.positionSeconds ?? 0;
}

function calculateWatchProgress(
  db: Db,
  key: LessonKey,
  videoDurationSeconds: number
) {
  const result = db
    .select({ maxPos: sql<number>`max(${videoWatchEvents.positionSeconds})` })
    .from(videoWatchEvents)
    .where(watchedBy(key))
    .get();

  const maxPosition = result?.maxPos ?? 0;

  return Math.min(Math.round((maxPosition / videoDurationSeconds) * 100), 100);
}

type WatchedLesson = {
  id: number;
  videoUrl: string | null;
  durationMinutes: number | null;
};

function getWatchState(db: Db, userId: number, lesson: WatchedLesson) {
  if (!lesson.videoUrl) return { lastWatchPosition: 0, watchProgress: 0 };
  const key = { userId, lessonId: lesson.id };
  const videoDurationSeconds = (lesson.durationMinutes ?? 0) * 60;
  return {
    lastWatchPosition: getLastWatchPosition(db, key),
    watchProgress:
      videoDurationSeconds > 0
        ? calculateWatchProgress(db, key, videoDurationSeconds)
        : 0,
  };
}

/**
 * Viewing the lesson marks it in progress (a completed lesson stays
 * completed), then reads the Student's progress for the page.
 */
export function recordVisit(
  db: Db,
  { userId, courseId }: { userId: number; courseId: number },
  lesson: WatchedLesson
) {
  const key = { userId, lessonId: lesson.id };
  markLessonInProgress(db, key);
  const lessonStatus: string | null =
    getLessonProgress(db, key)?.status ?? null;

  const lessonProgressMap: Record<number, string> = {};
  for (const record of getLessonProgressForCourse(db, userId, courseId)) {
    lessonProgressMap[record.lessonId] = record.status;
  }

  return {
    lessonStatus,
    lessonProgressMap,
    ...getWatchState(db, userId, lesson),
  };
}
