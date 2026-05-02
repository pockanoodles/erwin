import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { createCanvasClient } from "@/lib/canvas/canvas-client";
import { syncCanvasTasksForUser } from "@/lib/canvas/sync-canvas-tasks";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinCanvasAPI";

const credentialsSchema = z.object({
  baseUrl: z.string().min(1).url(),
  accessToken: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
});

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    baseUrl: z.string().min(1).url(),
    accessToken: z.string().min(1),
    name: z.string().min(1).max(100).optional(),
  }),
  z.object({
    action: z.literal("validate"),
    baseUrl: z.string().min(1).url(),
    accessToken: z.string().min(1),
  }),
  z.object({
    action: z.literal("sync"),
    baseUrl: z.string().min(1).url().optional(),
    accessToken: z.string().min(1).optional(),
    name: z.string().min(1).max(100).optional(),
  }),
]);

/**
 * GET /api/erwin/canvas
 * Returns Canvas provider status for the current user (no secrets).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const row = await prisma.taskProvider.findFirst({
      where: { userId: auth.userId, type: "CANVAS" },
    });

    if (!row) {
      return NextResponse.json({ configured: false, provider: null });
    }

    return NextResponse.json({
      configured: Boolean(row.accessToken && row.serverUrl),
      provider: {
        id: row.id,
        name: row.name,
        serverUrl: row.serverUrl,
        lastSyncedAt: row.lastSyncedAt,
        error: row.error,
        syncIntervalMinutes: row.syncIntervalMinutes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  } catch (error) {
    logger.error(
      "Erwin Canvas GET failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load Canvas settings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/erwin/canvas
 * Discriminated body: save | validate | sync
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const json: unknown = await request.json();
    const parsed = postSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;

    if (body.action === "validate") {
      const client = createCanvasClient({
        baseUrl: body.baseUrl.replace(/\/+$/, ""),
        accessToken: body.accessToken,
      });
      await client.validateConnection();
      return NextResponse.json({ ok: true });
    }

    if (body.action === "save") {
      const baseUrl = body.baseUrl.replace(/\/+$/, "");
      const provider = await prisma.taskProvider.upsert({
        where: {
          userId_type: {
            userId,
            type: "CANVAS",
          },
        },
        create: {
          userId,
          type: "CANVAS",
          name: body.name ?? "Canvas LMS",
          enabled: true,
          syncEnabled: true,
          serverUrl: baseUrl,
          accessToken: body.accessToken,
          syncIntervalMinutes: 120,
        },
        update: {
          name: body.name ?? "Canvas LMS",
          serverUrl: baseUrl,
          accessToken: body.accessToken,
          error: null,
        },
      });

      return NextResponse.json({
        ok: true,
        providerId: provider.id,
      });
    }

    // sync
    if (body.baseUrl && body.accessToken) {
      const creds = credentialsSchema.safeParse({
        baseUrl: body.baseUrl,
        accessToken: body.accessToken,
        name: body.name,
      });
      if (creds.success) {
        await prisma.taskProvider.upsert({
          where: { userId_type: { userId, type: "CANVAS" } },
          create: {
            userId,
            type: "CANVAS",
            name: creds.data.name ?? "Canvas LMS",
            enabled: true,
            syncEnabled: true,
            serverUrl: creds.data.baseUrl.replace(/\/+$/, ""),
            accessToken: creds.data.accessToken,
            syncIntervalMinutes: 120,
          },
          update: {
            serverUrl: creds.data.baseUrl.replace(/\/+$/, ""),
            accessToken: creds.data.accessToken,
            error: null,
          },
        });
      }
    }

    const result = await syncCanvasTasksForUser(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error(
      "Erwin Canvas POST failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Canvas operation failed",
      },
      { status: 500 }
    );
  }
}
