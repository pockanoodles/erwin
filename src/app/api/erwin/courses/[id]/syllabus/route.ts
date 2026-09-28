import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinCourseSyllabusAPI";

/**
 * GET /api/erwin/courses/[id]/syllabus
 * The course's syllabus as Canvas returns it (raw HTML — sanitize before rendering).
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
    const { id } = await params;
    const course = await prisma.course.findUnique({
      where: { id, userId: auth.userId },
      select: { id: true, name: true, syllabusHtml: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    return NextResponse.json(course);
  } catch (error) {
    logger.error(
      "Erwin course syllabus failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load syllabus" }, { status: 500 });
  }
}
