/**
 * The gradebook as the UI and ops read it: each mirrored course with Canvas's
 * own totals, Sigwald's estimate beside them, group subtotals after drop rules,
 * and every assignment with its submission, feedback and quiz rules.
 */
import { storedCorrections } from "@/lib/canvas/corrections";
import { storedComments } from "@/lib/canvas/gradebook-plan";
import {
  type LetterScheme,
  coursePercent,
  groupTotals,
  letterFor,
  letterOutlook,
} from "@/lib/sigwald/grade-projection";
import { prisma } from "@/lib/prisma";
import type {
  GradebookCourse,
  RubricMark,
  ScoreStatistics,
  SubmissionState,
} from "@/types/gradebook";
import type { RubricCriterion } from "@/types/course-materials";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const orNull = <T>(list: T[]) => (list.length > 0 ? list : null);

export async function loadGradebooks(
  userId: string,
  courseId?: string
): Promise<GradebookCourse[]> {
  const courses = await prisma.course.findMany({
    where: { userId, ...(courseId ? { id: courseId } : {}) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      canvasId: true,
      code: true,
      name: true,
      currentScore: true,
      currentGrade: true,
      finalScore: true,
      finalGrade: true,
      gradingScheme: true,
      applyGroupWeights: true,
      assignmentGroups: { orderBy: { position: "asc" } },
      assignments: {
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { position: "asc" }],
        include: {
          task: { select: { id: true, status: true } },
          activity: { where: { seenAt: null }, select: { id: true } },
        },
      },
    },
  });

  return courses.map((c) => {
    const scheme = Array.isArray(c.gradingScheme) ? (c.gradingScheme as LetterScheme) : null;
    const entries = c.assignments.map((a) => ({
      canvasId: a.canvasId,
      groupId: a.groupId,
      pointsPossible: a.pointsPossible,
      omitFromFinalGrade: a.omitFromFinalGrade,
      state: a.state,
      score: a.score,
    }));
    const totals = groupTotals(entries, c.assignmentGroups);
    const estimate = coursePercent(entries, c.assignmentGroups, { weighted: c.applyGroupWeights });
    // The top five letters are the decisions that matter mid-term.
    const { remainingPoints, outlook } = letterOutlook(entries, c.assignmentGroups, {
      weighted: c.applyGroupWeights,
      scheme,
      letters: 5,
    });

    return {
      id: c.id,
      canvasId: c.canvasId,
      code: c.code,
      name: c.name,
      currentScore: c.currentScore,
      currentGrade: c.currentGrade,
      finalScore: c.finalScore,
      finalGrade: c.finalGrade,
      applyGroupWeights: c.applyGroupWeights,
      estimate: estimate != null ? Math.round(estimate * 100) / 100 : null,
      estimateLetter: estimate != null ? letterFor(estimate, scheme) : null,
      remainingPoints,
      outlook,
      groups: c.assignmentGroups.map((g) => {
        const t = totals.get(g.id);
        return {
          id: g.id,
          name: g.name,
          position: g.position,
          weight: g.weight,
          dropLowest: g.dropLowest,
          dropHighest: g.dropHighest,
          earned: t?.earned ?? 0,
          possible: t?.possible ?? 0,
          percent: t && t.possible > 0 ? Math.round((t.earned / t.possible) * 1000) / 10 : null,
        };
      }),
      assignments: c.assignments.map((a) => ({
        id: a.id,
        canvasId: a.canvasId,
        name: a.name,
        groupId: a.groupId,
        position: a.position,
        dueAt: iso(a.dueAt),
        unlockAt: iso(a.unlockAt),
        lockAt: iso(a.lockAt),
        pointsPossible: a.pointsPossible,
        gradingType: a.gradingType,
        submissionTypes: a.submissionTypes,
        omitFromFinalGrade: a.omitFromFinalGrade,
        htmlUrl: a.htmlUrl,
        state: a.state as SubmissionState,
        submittedAt: iso(a.submittedAt),
        attempt: a.attempt,
        late: a.late,
        secondsLate: a.secondsLate,
        pointsDeducted: a.pointsDeducted,
        score: a.score,
        grade: a.grade,
        gradedAt: iso(a.gradedAt),
        postedAt: iso(a.postedAt),
        scoreStatistics: (a.scoreStatistics as ScoreStatistics | null) ?? null,
        comments: storedComments(a.comments),
        rubricAssessment: (a.rubricAssessment as Record<string, RubricMark> | null) ?? null,
        rubric: Array.isArray(a.rubric) ? (a.rubric as unknown as RubricCriterion[]) : null,
        quiz:
          a.quizTimeLimit != null || a.quizAllowedAttempts != null || a.lockdownBrowser
            ? {
                timeLimit: a.quizTimeLimit,
                allowedAttempts: a.quizAllowedAttempts,
                questionCount: a.quizQuestionCount,
                lockdownBrowser: a.lockdownBrowser,
              }
            : null,
        task: a.task ? { id: a.task.id, status: a.task.status } : null,
        corrections: orNull(storedCorrections(a.corrections)),
        unseen: a.activity.length > 0,
      })),
    };
  });
}
