/** Client shapes for the Canvas materials APIs (src/app/api/erwin/{tasks,courses,materials}). */

export type MaterialKind =
  | "FILE"
  | "PAGE"
  | "EXTERNAL_URL"
  | "EXTERNAL_TOOL"
  | "ASSIGNMENT"
  | "QUIZ"
  | "DISCUSSION"
  | "SUBHEADER";

export interface MaterialSummary {
  id: string;
  kind: MaterialKind;
  title: string;
  position: number | null;
  htmlUrl: string | null;
  locked: boolean;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  downloadError: string | null;
  cached: boolean;
}

export interface PacketMaterial extends MaterialSummary {
  reason: "DESCRIPTION" | "MODULE";
  module: { name: string; position: number } | null;
}

export interface RubricCriterion {
  id: string;
  description?: string;
  long_description?: string;
  points?: number;
  ratings?: Array<{ id: string; description?: string; long_description?: string; points?: number }>;
}

export interface TaskPacket {
  id: string;
  title: string;
  source: string | null;
  externalUrl: string | null;
  dueDate: string | null;
  pointsPossible: number | null;
  gradeWeightPercent: number | null;
  submissionStatus: string | null;
  courseId: string | null;
  courseName: string | null;
  /** Sanitized server-side; safe to inject. */
  instructionsHtml: string | null;
  rubric: RubricCriterion[] | null;
  materials: PacketMaterial[];
  /** The gradebook row behind a Canvas task: how it went, or the rules for taking it. */
  grade: PacketGrade | null;
}

export interface PacketGrade {
  assignmentId: string;
  state: string;
  score: number | null;
  grade: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  late: boolean;
  pointsDeducted: number | null;
  scoreStatistics: { mean?: number; median?: number; min?: number; max?: number } | null;
  comments: Array<{ id: string; author: string | null; body: string; createdAt: string | null; mine: boolean }>;
  rubricAssessment: Record<string, { points?: number | null; rating_id?: string | null; comments?: string | null }> | null;
  quiz: { timeLimit: number | null; allowedAttempts: number | null; questionCount: number | null; lockdownBrowser: boolean } | null;
}

export interface LibraryMaterial extends MaterialSummary {
  indent: number;
  assignmentCanvasId: string | null;
  moduleId: string | null;
  /** The Erwin task behind an assignment, quiz or discussion row. */
  task: { id: string; dueDate: string | null; status: string } | null;
  /** The soonest open task this material is linked to. */
  nextTask: { id: string; title: string; dueDate: string | null } | null;
  openTaskCount: number;
}

export interface LibraryModule {
  id: string;
  name: string;
  position: number;
  unlockAt: string | null;
  materials: LibraryMaterial[];
}

export interface LibraryCourse {
  id: string;
  canvasId: string;
  code: string | null;
  name: string;
  termName: string | null;
  lastSyncedAt: string | null;
  hasSyllabus: boolean;
  modules: LibraryModule[];
  unfiled: LibraryMaterial[];
}

export interface MaterialDetail extends MaterialSummary {
  /** Sanitized server-side; safe to inject. */
  bodyHtml: string | null;
  fileUpdatedAt: string | null;
  module: { id: string; name: string } | null;
  course: { id: string; name: string; code: string | null };
}
