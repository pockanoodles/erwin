/**
 * Minimal Canvas LMS REST types used by Erwin sync: courses and grades,
 * assignments and submissions, modules and materials, announcements, inbox.
 * @see https://canvas.instructure.com/doc/api/
 */

/** This student's enrollment, as the course list returns it with include[]=total_scores. */
export interface CanvasCourseEnrollment {
  type?: string;
  user_id?: number;
  computed_current_score?: number | null;
  computed_current_grade?: string | null;
  computed_final_score?: number | null;
  computed_final_grade?: string | null;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  enrollment_term_id?: number;
  workflow_state?: string;
  time_zone?: string | null;
  /** Assignment groups are weighted; otherwise the grade is total points. */
  apply_assignment_group_weights?: boolean;
  /** Present with include[]=syllabus_body */
  syllabus_body?: string | null;
  /** Present with include[]=term */
  term?: { name?: string | null } | null;
  /** Present with include[]=total_scores */
  enrollments?: CanvasCourseEnrollment[];
  /** Present with include[]=grading_scheme: [letter, lowest fraction], best first. */
  grading_scheme?: Array<[string, number]> | null;
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  position: number;
  indent?: number;
  /** File | Page | Discussion | Assignment | Quiz | SubHeader | ExternalUrl | ExternalTool */
  type: string;
  /** Id of the file/assignment/quiz/topic behind the item. Absent for Page/SubHeader/ExternalUrl. */
  content_id?: number;
  page_url?: string;
  external_url?: string;
  html_url?: string;
  /** API URL for the item's content (file metadata, page, …). */
  url?: string;
  /** Present with include[]=content_details */
  content_details?: { locked_for_user?: boolean } | null;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at?: string | null;
  items_count?: number;
  /** Present with include[]=items, but Canvas omits it for large modules. */
  items?: CanvasModuleItem[];
}

export interface CanvasPage {
  url: string;
  title: string;
  body?: string | null;
  html_url?: string;
  locked_for_user?: boolean;
}

export interface CanvasFile {
  id: number;
  display_name: string;
  filename?: string;
  "content-type"?: string;
  size?: number;
  updated_at?: string;
  /** Signed download URL. */
  url?: string;
  locked_for_user?: boolean;
}

export interface CanvasRubricCriterion {
  id: string;
  description?: string;
  long_description?: string;
  points?: number;
  ratings?: Array<{ id: string; description?: string; long_description?: string; points?: number }>;
}

export interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position?: number;
  group_weight?: number | null;
  rules?: {
    drop_lowest?: number;
    drop_highest?: number;
    never_drop?: number[];
  } | null;
}

export interface CanvasSubmissionComment {
  id: number;
  author_id?: number | null;
  author_name?: string | null;
  comment?: string | null;
  created_at?: string | null;
}

export interface CanvasRubricMark {
  points?: number | null;
  rating_id?: string | null;
  comments?: string | null;
}

export interface CanvasSubmission {
  id: number;
  assignment_id?: number;
  user_id?: number;
  workflow_state?: string;
  submitted_at?: string | null;
  score?: number | null;
  grade?: string | null;
  graded_at?: string | null;
  posted_at?: string | null;
  attempt?: number | null;
  late?: boolean;
  /** Past due with nothing handed in. Canvas keeps it set even after the assignment locks. */
  missing?: boolean;
  excused?: boolean | null;
  seconds_late?: number | null;
  points_deducted?: number | null;
  /** Present from the submissions endpoint with include[]=submission_comments */
  submission_comments?: CanvasSubmissionComment[];
  /** Present with include[]=rubric_assessment, keyed by criterion id */
  rubric_assessment?: Record<string, CanvasRubricMark> | null;
}

/** Class statistics, when the instructor hasn't hidden them (include[]=score_statistics). */
export interface CanvasScoreStatistics {
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  lower_q?: number;
  upper_q?: number;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description?: string | null;
  position?: number | null;
  due_at?: string | null;
  lock_at?: string | null;
  unlock_at?: string | null;
  points_possible?: number | null;
  submission_types?: string[];
  grading_type?: string | null;
  assignment_group_id?: number | null;
  course_id: number;
  html_url?: string | null;
  omit_from_final_grade?: boolean | null;
  /** Present when using include[]=submission */
  submission?: CanvasSubmission | null;
  /** Present with include[]=score_statistics */
  score_statistics?: CanvasScoreStatistics | null;
  rubric?: CanvasRubricCriterion[] | null;
  /** Graded quizzes and discussions are backed by an assignment; these point back. */
  quiz_id?: number | null;
  discussion_topic?: { id: number } | null;
}

/** A classic quiz's settings. New Quizzes are LTI tools and never show up here. */
export interface CanvasQuiz {
  id: number;
  title: string;
  assignment_id?: number | null;
  /** Minutes; null when untimed. */
  time_limit?: number | null;
  /** -1 means unlimited. */
  allowed_attempts?: number | null;
  question_count?: number | null;
  require_lockdown_browser?: boolean;
}

/** An announcement (a discussion topic flagged as one). */
export interface CanvasAnnouncement {
  id: number;
  title: string;
  /** HTML body. */
  message?: string | null;
  posted_at?: string | null;
  delayed_post_at?: string | null;
  user_name?: string | null;
  author?: { display_name?: string | null } | null;
  html_url?: string | null;
  read_state?: "read" | "unread" | string;
  /** "course_<id>" */
  context_code?: string;
}

export interface CanvasConversationMessage {
  id: number;
  created_at: string;
  /** Plain text. */
  body?: string | null;
  author_id?: number | null;
}

/** A Canvas Inbox thread. `messages` is only present when fetched by id. */
export interface CanvasConversation {
  id: number;
  subject?: string | null;
  last_message_at?: string | null;
  message_count?: number;
  workflow_state?: string;
  /** "course_<id>" when sent in a course. */
  context_code?: string | null;
  participants?: Array<{ id: number; name?: string | null }>;
  messages?: CanvasConversationMessage[];
}
