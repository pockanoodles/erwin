import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { storedComments } from "@/lib/canvas/gradebook-plan";
import { cleanCourseHtml } from "@/lib/canvas/material-html";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinTaskMaterialsAPI";

// Linked from the description first (the instructor pointed at it), then by module order.
const REASON_ORDER: Record<string, number> = { DESCRIPTION: 0, MODULE: 1 };

/**
 * GET /api/erwin/tasks/[id]/materials
 *
 * A task's packet: its instructions (Canvas description, sanitized and with
 * links re-pointed at the local mirror), rubric, Canvas link, linked
 * materials with why each is linked, and — for Canvas work — the gradebook
 * row: score, feedback, quiz rules. The one read both Focus and the Tasks
 * packet pane use.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const { id } = await params;
    const task = await prisma.task.findFirst({
      where: { id, userId: auth.userId },
      select: {
        id: true,
        title: true,
        description: true,
        externalUrl: true,
        source: true,
        dueDate: true,
        courseAssignment: {
          select: {
            id: true,
            rubric: true,
            pointsPossible: true,
            gradeWeightPercent: true,
            course: { select: { canvasId: true, name: true } },
            state: true,
            score: true,
            grade: true,
            submittedAt: true,
            gradedAt: true,
            late: true,
            pointsDeducted: true,
            scoreStatistics: true,
            comments: true,
            rubricAssessment: true,
            quizTimeLimit: true,
            quizAllowedAttempts: true,
            quizQuestionCount: true,
            lockdownBrowser: true,
          },
        },
        materialLinks: {
          select: {
            reason: true,
            material: {
              select: {
                id: true,
                kind: true,
                title: true,
                position: true,
                htmlUrl: true,
                locked: true,
                fileName: true,
                contentType: true,
                sizeBytes: true,
                localPath: true,
                downloadError: true,
                module: { select: { name: true, position: true } },
              },
            },
          },
        },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { materialLinks, description, courseAssignment: ca, ...rest } = task;
    // What Canvas says about the assignment, from the gradebook row behind it.
    const assignment = {
      rubric: ca?.rubric ?? null,
      pointsPossible: ca?.pointsPossible ?? null,
      gradeWeightPercent:
        ca?.gradeWeightPercent == null ? null : Math.round(ca.gradeWeightPercent * 10) / 10,
      submissionStatus: ca?.state ?? null,
      courseId: ca?.course.canvasId ?? null,
      courseName: ca?.course.name ?? null,
    };
    const materials = materialLinks
      .map(({ reason, material: { localPath, ...m } }) => ({ ...m, reason, cached: Boolean(localPath) }))
      .sort(
        (a, b) =>
          (REASON_ORDER[a.reason] ?? 9) - (REASON_ORDER[b.reason] ?? 9) ||
          (a.module?.position ?? 0) - (b.module?.position ?? 0) ||
          (a.position ?? 0) - (b.position ?? 0)
      );

    // Only Canvas descriptions are HTML; a hand-made task's notes are text
    // and the packet doesn't show them.
    const instructionsHtml =
      task.source === "CANVAS" ? await cleanCourseHtml(auth.userId, assignment.courseId, description) : null;

    const grade = ca
      ? {
          assignmentId: ca.id,
          state: ca.state,
          score: ca.score,
          grade: ca.grade,
          submittedAt: ca.submittedAt,
          gradedAt: ca.gradedAt,
          late: ca.late,
          pointsDeducted: ca.pointsDeducted,
          scoreStatistics: ca.scoreStatistics,
          comments: storedComments(ca.comments),
          rubricAssessment: ca.rubricAssessment,
          quiz:
            ca.quizTimeLimit != null || ca.quizAllowedAttempts != null || ca.lockdownBrowser
              ? {
                  timeLimit: ca.quizTimeLimit,
                  allowedAttempts: ca.quizAllowedAttempts,
                  questionCount: ca.quizQuestionCount,
                  lockdownBrowser: ca.lockdownBrowser,
                }
              : null,
        }
      : null;

    return NextResponse.json({ ...rest, ...assignment, instructionsHtml, materials, grade });
  } catch (error) {
    logger.error(
      "Erwin task materials failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load task materials" }, { status: 500 });
  }
}
