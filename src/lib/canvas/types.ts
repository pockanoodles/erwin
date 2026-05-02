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
}
