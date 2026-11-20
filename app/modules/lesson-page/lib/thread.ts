import { asc, eq } from "drizzle-orm";
import {
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { renderComment } from "~/lib/comment-markdown.server";
import { markdown, type Markdown } from "~/lib/text";
import type { Db } from "./db";

// Bodies arrive pre-rendered from the server (renderComment), because comments
// are untrusted markdown and the sanitising renderer is server-only.
export type RenderedComment = {
  id: number;
  /** Raw markdown — only used to populate the edit box. */
  body: string;
  bodyHtml: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
    isInstructor: boolean;
    isPlatformAdmin: boolean;
  };
  replies: RenderedComment[];
};

type ThreadComment = {
  id: number;
  body: Markdown;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
    isInstructor: boolean;
    isPlatformAdmin: boolean;
  };
  replies: ThreadComment[];
};

function getInstructorIdForLesson(db: Db, lessonId: number) {
  return db
    .select({ instructorId: courses.instructorId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get()?.instructorId;
}

/** The comment, only if it is on this lesson. */
export function findLessonComment(db: Db, lessonId: number, commentId: number) {
  const comment = db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .get();
  return comment?.lessonId === lessonId ? comment : undefined;
}

function getThreadRows(db: Db, lessonId: number) {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      parentId: comments.parentId,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      deletedAt: comments.deletedAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.lessonId, lessonId))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .all();
}

type ThreadRow = ReturnType<typeof getThreadRows>[number];

function toThreadComment(row: ThreadRow, instructorId: number): ThreadComment {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    body: deleted ? markdown("") : row.body,
    createdAt: row.createdAt,
    editedAt: deleted ? null : row.editedAt,
    deleted,
    author: {
      id: row.authorId,
      name: row.authorName,
      avatarUrl: row.authorAvatarUrl,
      isInstructor: row.authorId === instructorId,
      isPlatformAdmin: row.authorRole === UserRole.Admin,
    },
    replies: [],
  };
}

function getLessonThread(db: Db, lessonId: number): ThreadComment[] {
  const instructorId = getInstructorIdForLesson(db, lessonId);
  if (instructorId === undefined) return [];

  const rows = getThreadRows(db, lessonId);
  const topLevel: ThreadComment[] = [];
  const byId = new Map<number, ThreadComment>();

  for (const row of rows) {
    if (row.parentId !== null) continue;
    const comment = toThreadComment(row, instructorId);
    byId.set(comment.id, comment);
    topLevel.push(comment);
  }

  for (const row of rows) {
    if (row.parentId === null || row.deletedAt !== null) continue;
    byId.get(row.parentId)?.replies.push(toThreadComment(row, instructorId));
  }

  // A deleted question with no replies left has nothing worth showing.
  return topLevel.filter((c) => !c.deleted || c.replies.length > 0);
}

/**
 * Renders every comment body to sanitised HTML, preserving the reply nesting.
 * Comments are untrusted input, so this must be renderComment — never
 * renderMarkdown, which lets raw HTML through for trusted lesson content.
 */
async function renderThread(
  nodes: ThreadComment[]
): Promise<RenderedComment[]> {
  return Promise.all(
    nodes.map(async (node) => ({
      ...node,
      bodyHtml: node.deleted ? "" : await renderComment(node.body),
      replies: await renderThread(node.replies),
    }))
  );
}

export function getRenderedThread(db: Db, lessonId: number) {
  return renderThread(getLessonThread(db, lessonId));
}
