import { useEffect } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { LessonProgressStatus } from "~/db/schema";

type LessonLink = { id: number; title: string };

export function CompletionControls({
  lessonId,
  courseSlug,
  lessonStatus,
  nextLesson,
}: {
  lessonId: number;
  courseSlug: string;
  lessonStatus: string | null;
  nextLesson: LessonLink | null;
}) {
  const fetcher = useFetcher({ key: `mark-complete-${lessonId}` });
  const navigate = useNavigate();

  const isMarking =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "mark-complete";
  const justCompleted = fetcher.data?.success;
  const isCompleted =
    lessonStatus === LessonProgressStatus.Completed || justCompleted;

  // Navigate to next lesson after marking complete
  useEffect(() => {
    if (justCompleted && nextLesson) {
      navigate(`/courses/${courseSlug}/lessons/${nextLesson.id}`);
    }
  }, [justCompleted, nextLesson, courseSlug, navigate]);

  if (isCompleted) {
    return <CompletedBanner courseSlug={courseSlug} nextLesson={nextLesson} />;
  }

  return (
    <div className="mb-8">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="mark-complete" />
        <MarkCompleteButton isMarking={isMarking} nextLesson={nextLesson} />
      </fetcher.Form>
    </div>
  );
}

function CompletedBanner({
  courseSlug,
  nextLesson,
}: {
  courseSlug: string;
  nextLesson: LessonLink | null;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="size-5" />
          <span className="font-medium">Lesson completed</span>
        </div>
        {nextLesson && (
          <Link to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}>
            <Button variant="outline" size="sm">
              Up next: {nextLesson.title}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export function LessonPager({
  course,
  prevLesson,
  nextLesson,
}: {
  course: { title: string; slug: string };
  prevLesson: LessonLink | null;
  nextLesson: LessonLink | null;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-6">
      {prevLesson ? (
        <Link
          to={`/courses/${course.slug}/lessons/${prevLesson.id}`}
          className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          <PagerLabel label="Previous" title={prevLesson.title} />
        </Link>
      ) : (
        <div />
      )}

      <Link
        to={
          nextLesson
            ? `/courses/${course.slug}/lessons/${nextLesson.id}`
            : `/courses/${course.slug}`
        }
        className={
          nextLesson
            ? "flex items-center gap-2 text-right text-sm hover:text-foreground text-muted-foreground"
            : "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        }
      >
        {nextLesson ? (
          <PagerLabel label="Next" title={nextLesson.title} />
        ) : (
          <PagerLabel label="Back to" title={course.title} />
        )}
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

function PagerLabel({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{title}</div>
    </div>
  );
}

function MarkCompleteButton({
  isMarking,
  nextLesson,
}: {
  isMarking: boolean;
  nextLesson: LessonLink | null;
}) {
  if (nextLesson) {
    return (
      <Button disabled={isMarking}>
        {isMarking ? (
          "Completing..."
        ) : (
          <>
            Up next: {nextLesson.title}
            <ChevronRight className="ml-1 size-4" />
          </>
        )}
      </Button>
    );
  }
  return (
    <Button disabled={isMarking}>
      <CheckCircle2 className="mr-2 size-4" />
      {isMarking ? "Marking..." : "Mark as Complete"}
    </Button>
  );
}
