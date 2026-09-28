/**
 * Minimal Canvas LMS REST types used by Erwin sync (assignments + submissions).
 * @see https://canvas.instructure.com/doc/api/
 */

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  enrollment_term_id?: number;
  workflow_state?: string;
  /** Present with include[]=syllabus_body */
  syllabus_body?: string | null;
  /** Present with include[]=term */
  term?: { name?: string | null } | null;
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
  group_weight?: number | null;
  rules?: {
    drop_lowest?: number;
    drop_highest?: number;
    never_drop?: number[];
  } | null;
}

export interface CanvasSubmission {
  id: number;
  workflow_state?: string;
  submitted_at?: string | null;
  score?: number | null;
  late?: boolean;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description?: string | null;
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
  has_submitted_submissions?: boolean | null;
  /** Present when using include[]=submission */
  submission?: CanvasSubmission | null;
  rubric?: CanvasRubricCriterion[] | null;
  /** Graded quizzes and discussions are backed by an assignment; these point back. */
  quiz_id?: number | null;
  discussion_topic?: { id: number } | null;
}
