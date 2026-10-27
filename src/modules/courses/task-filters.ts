/**
 * Courses' fields in the Tasks page's filter menu (components/tasks/filters),
 * read off the facts Courses adds to its tasks: `courseLabel` and
 * `submissionStatus`. Its Tasks lens (tasks.tsx) hands them to the page.
 */
import {
  NO_VALUE,
  type TaskFilterField,
} from "@/components/tasks/filters/fields";
import { formatEnumValue } from "@/components/tasks/utils/task-list-utils";

/** The course as the rows name it (SCHM2301), its full title on hover. */
export const COURSE_FILTER: TaskFilterField = {
  id: "course",
  label: "Course",
  after: "dueDate",
  open: true,
  values: (t) => [t.courseLabel || NO_VALUE],
  options: (tasks) => {
    const titles = new Map<string, string | undefined>();
    let other = false;
    for (const t of tasks) {
      if (t.courseLabel) titles.set(t.courseLabel, t.courseName ?? undefined);
      else other = true;
    }
    return [
      ...[...titles]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, title]) => ({ value, label: value, title })),
      ...(other ? [{ value: NO_VALUE, label: "Not a course" }] : []),
    ];
  },
};

/** Canvas's words, in the order work moves through them. */
const SUBMISSION_ORDER = [
  "unsubmitted",
  "missing",
  "missed",
  "submitted",
  "pending_review",
  "graded",
  "excused",
];

/** Canvas's word on the submission, with Erwin's corrections applied. */
export const SUBMISSION_FILTER: TaskFilterField = {
  id: "submission",
  label: "Submission",
  after: "dueDate",
  open: true,
  values: (t) => [t.submissionStatus || NO_VALUE],
  options: (tasks) => {
    const seen = new Set(tasks.map((t) => t.submissionStatus || NO_VALUE));
    const rank = (s: string) => {
      const at = SUBMISSION_ORDER.indexOf(s);
      return at === -1 ? SUBMISSION_ORDER.length : at;
    };
    return [
      ...[...seen]
        .filter((s) => s !== NO_VALUE)
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
        .map((value) => ({ value, label: formatEnumValue(value) })),
      ...(seen.has(NO_VALUE)
        ? [{ value: NO_VALUE, label: "Not on Canvas" }]
        : []),
    ];
  },
};
