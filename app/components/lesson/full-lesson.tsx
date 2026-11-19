import { useFetcher } from "react-router";
import { Clock, Github } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { CommentThread } from "~/components/comment-thread";
import { LessonNote } from "~/components/lesson-note";
import { YouTubePlayer } from "~/components/youtube-player";
import { formatDuration } from "~/lib/utils";
import type { LessonPageData } from "~/modules/lesson-page";
import { BookmarkToggle } from "./bookmark-toggle";
import { CurriculumSidebar } from "./curriculum-sidebar";
import { LessonBreadcrumb } from "./lesson-breadcrumb";
import { CompletionControls, LessonPager } from "./lesson-navigation";
import { QuizSection } from "./quiz-section";
import { useAutoplay } from "./use-autoplay";

type FullLessonData = Extract<LessonPageData, { view: "full" }>;

export function FullLesson({ data }: { data: FullLessonData }) {
  const { course, lesson, currentUserId, enrolled, nextLesson } = data;

  return (
    <div className="flex">
      <CurriculumSidebar
        course={course}
        curriculum={data.curriculum}
        currentLessonId={lesson.id}
        lessonProgressMap={data.lessonProgressMap}
        enrolled={enrolled}
      />

      <div className="flex-1 p-6 lg:p-8">
        <LessonBreadcrumb
          course={course}
          mod={data.module}
          lessonTitle={lesson.title}
        />

        <div className="mx-auto max-w-4xl">
          <LessonHeader data={data} />
          <LessonVideo data={data} />

          {/* Note — under the video, so the Student can write while they watch */}
          {currentUserId && <LessonNote key={lesson.id} note={data.note} />}

          <LessonContent data={data} />

          {enrolled && currentUserId && <LessonActivity data={data} />}

          {/* Questions & Discussion — confidential to people with access */}
          <CommentThread
            comments={data.comments}
            currentUserId={currentUserId}
            canModerate={data.canModerate}
            canPost
            instructorName={data.instructorName}
          />

          <LessonPager
            course={course}
            prevLesson={data.prevLesson}
            nextLesson={nextLesson}
          />
        </div>
      </div>
    </div>
  );
}

function LessonHeader({ data }: { data: FullLessonData }) {
  const { lesson, currentUserId, bookmarked } = data;
  return (
    <>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold">{lesson.title}</h1>
        {currentUserId && <BookmarkToggle bookmarked={bookmarked} />}
      </div>
      <div className="mb-6 flex items-center gap-3">
        {lesson.durationMinutes && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-4" />
            {formatDuration(lesson.durationMinutes, true, false, false)}
          </div>
        )}
        {lesson.githubRepoUrl && (
          <a
            href={lesson.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <Github className="mr-1.5 size-4" />
              Open Code
            </Button>
          </a>
        )}
      </div>
    </>
  );
}

function LessonVideo({ data }: { data: FullLessonData }) {
  const [autoplay, toggleAutoplay] = useAutoplay();
  const { lesson } = data;
  if (!lesson.videoUrl) return null;
  return (
    <YouTubePlayer
      videoUrl={lesson.videoUrl}
      lessonId={lesson.id}
      title={lesson.title}
      startPosition={data.lastWatchPosition}
      durationMinutes={lesson.durationMinutes}
      watchProgress={data.watchProgress}
      trackingEnabled={data.enrolled && !!data.currentUserId}
      autoplay={autoplay}
      onToggleAutoplay={toggleAutoplay}
    />
  );
}

function LessonContent({ data }: { data: FullLessonData }) {
  const { contentHtml, lesson } = data;
  if (contentHtml) {
    return (
      <div
        className="prose prose-neutral dark:prose-invert mb-8 max-w-none"
        // oxlint-disable-next-line react/no-danger -- the instructor wrote this Markdown
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
    );
  }
  if (lesson.videoUrl) return null;
  return (
    <Card className="mb-8">
      <CardContent className="py-12 text-center text-muted-foreground">
        No content has been added to this lesson yet.
      </CardContent>
    </Card>
  );
}

function LessonQuiz({
  lessonId,
  quiz,
  bestAttempt,
}: {
  lessonId: number;
  quiz: NonNullable<FullLessonData["quiz"]>;
  bestAttempt: FullLessonData["bestAttempt"];
}) {
  const quizFetcher = useFetcher({ key: `quiz-${lessonId}` });
  return (
    <QuizSection
      quiz={quiz}
      bestAttempt={bestAttempt}
      quizResult={quizFetcher.data?.quizResult ?? null}
      quizFetcher={quizFetcher}
      isSubmitting={quizFetcher.state !== "idle"}
    />
  );
}

// Quiz and completion: only for someone enrolled.
function LessonActivity({ data }: { data: FullLessonData }) {
  const { lesson, quiz } = data;
  return (
    <>
      {quiz && (
        <LessonQuiz
          lessonId={lesson.id}
          quiz={quiz}
          bestAttempt={data.bestAttempt}
        />
      )}
      <CompletionControls
        lessonId={lesson.id}
        courseSlug={data.course.slug}
        lessonStatus={data.lessonStatus}
        nextLesson={data.nextLesson}
      />
    </>
  );
}
