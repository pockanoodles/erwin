import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { cleanCourseHtml } from "@/lib/canvas/material-html";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "SigwaldCourseSyllabusAPI";

/**
 * GET /api/sigwald/courses/[id]/syllabus
 * The course's syllabus, sanitized, with links re-pointed at the local mirror.
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
    const course = await prisma.course.findUnique({
      where: { id, userId: auth.userId },
      select: { id: true, name: true, canvasId: true, syllabusHtml: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: course.id,
      name: course.name,
      syllabusHtml: await cleanCourseHtml(auth.userId, course.canvasId, course.syllabusHtml),
    });
  } catch (error) {
    logger.error(
      "Sigwald course syllabus failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load syllabus" }, { status: 500 });
  }
}
