import { toggleBookmark } from "~/lib/bookmarks.server";
import {
  createComment,
  deleteComment,
  editComment,
} from "~/lib/comments.server";
import { saveNote } from "~/lib/notes.server";
import type { Notifications } from "~/lib/notifications.server";
import type { Db } from "./db";
import type { LessonKey } from "./progress";

export type WriteContext = { now: Date; notifications: Notifications };

export type CommentKey = { userId: number; commentId: number };

/** What a person writes on the lesson page: comments, Bookmarks and Notes. */
export function createLessonWrites(database: Db) {
  return {
    createComment(
      key: LessonKey,
      comment: { parentId: number | null; body: string },
      { now, notifications }: WriteContext
    ) {
      return createComment(
        database,
        key.userId,
        key.lessonId,
        comment.parentId,
        comment.body,
        now,
        notifications
      );
    },

    editComment({ userId, commentId }: CommentKey, body: string, now: Date) {
      return editComment(database, commentId, userId, body, now);
    },

    /** Deletes the person's own comment, or anyone's when `canModerate`. */
    deleteComment(
      { userId, commentId }: CommentKey,
      canModerate: boolean,
      { now, notifications }: WriteContext
    ) {
      return deleteComment(
        database,
        commentId,
        userId,
        canModerate,
        now,
        notifications
      );
    },

    toggleBookmark(key: LessonKey, now: Date) {
      return toggleBookmark(database, key.userId, key.lessonId, now);
    },

    saveNote(key: LessonKey, body: string, now: Date) {
      return saveNote(database, key.userId, key.lessonId, body, now);
    },
  };
}
