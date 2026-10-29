/**
 * The People module's HTTP handlers. The route files under
 * src/app/api/sigwald/people only forward here, so the module's server code
 * lives in one folder. Every handler answers 409 module_off while People is
 * off.
 */
import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";
import { tasksChanged } from "@/modules/hooks";
import { nextCheckIn } from "@/modules/people/cadence";
import { logInteraction, syncReachOutTask } from "@/modules/people/reach-out";
import type { PersonRow } from "@/modules/people/types";

const LOG_SOURCE = "PeopleAPI";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional();

const personFields = {
  name: z.string().trim().min(1, "A person needs a name").max(200),
  org: text(200),
  role: text(200),
  email: text(320),
  phone: text(60),
  link: text(500),
  notes: text(5000),
  cadenceDays: z.number().int().min(1).max(3650).nullable().optional(),
};

const createSchema = z.object(personFields);
const updateSchema = z
  .object({ ...personFields, name: personFields.name.optional() })
  .extend({ archived: z.boolean().optional() });

const interactionSchema = z.object({
  at: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s))
    .optional(),
  kind: z.enum(["message", "call", "meeting", "email"]),
  note: text(5000),
});

type Ctx = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth;
  const off = await moduleOffResponse(auth.userId, "people");
  return off ? { response: off } : auth;
}

function toRow(p: {
  id: string;
  name: string;
  org: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  link: string | null;
  notes: string | null;
  cadenceDays: number | null;
  lastContactAt: Date | null;
  archived: boolean;
  createdAt: Date;
}): PersonRow {
  const next = nextCheckIn(p);
  return {
    ...p,
    lastContactAt: p.lastContactAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    nextCheckIn: next?.toISOString() ?? null,
  };
}

function failed(message: string, error: unknown) {
  logger.error(
    message,
    { error: error instanceof Error ? error.message : String(error) },
    LOG_SOURCE
  );
  return NextResponse.json({ error: message }, { status: 500 });
}

function invalid(error: z.ZodError) {
  return NextResponse.json(
    { error: error.issues.map((i) => i.message).join("; ") },
    { status: 400 }
  );
}

/** GET /api/sigwald/people[?archived=1]: everyone, or the archived. */
export async function listPeople(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const archived = request.nextUrl.searchParams.get("archived") === "1";
    const people = await prisma.person.findMany({
      where: { userId: auth.userId, archived },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ people: people.map(toRow) });
  } catch (error) {
    return failed("Failed to list people", error);
  }
}

/** POST /api/sigwald/people: adds someone, and their reach-out if they have a cadence. */
export async function createPerson(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const parsed = createSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);

    const person = await prisma.person.create({
      data: { ...parsed.data, userId: auth.userId },
    });
    const taskId = await syncReachOutTask(prisma, auth.userId, person.id);
    if (taskId) await tasksChanged(prisma, auth.userId, [taskId]);
    return NextResponse.json({ person: toRow(person) }, { status: 201 });
  } catch (error) {
    return failed("Failed to add person", error);
  }
}

/** PATCH /api/sigwald/people/:id: edits, archives or restores someone. */
export async function updatePerson(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = updateSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);

    const found = await prisma.person.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });
    if (!found) {
      return NextResponse.json({ error: "No such person" }, { status: 404 });
    }
    const person = await prisma.person.update({
      where: { id },
      data: parsed.data,
    });
    const taskId = await syncReachOutTask(prisma, auth.userId, id);
    if (taskId) await tasksChanged(prisma, auth.userId, [taskId]);
    return NextResponse.json({ person: toRow(person) });
  } catch (error) {
    return failed("Failed to change person", error);
  }
}

/** GET /api/sigwald/people/:id/interactions: their conversations, newest first. */
export async function listInteractions(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const interactions = await prisma.interaction.findMany({
      where: { personId: id, person: { userId: auth.userId } },
      orderBy: { at: "desc" },
      take: 200,
    });
    return NextResponse.json({
      interactions: interactions.map((i) => ({
        id: i.id,
        at: i.at.toISOString(),
        kind: i.kind,
        note: i.note,
      })),
    });
  } catch (error) {
    return failed("Failed to list conversations", error);
  }
}

/**
 * POST /api/sigwald/people/:id/interactions  { kind, note?, at? }
 *
 * Logs a conversation. It finishes the open reach-out task and plans the
 * next one. `at` defaults to now.
 */
export async function createInteraction(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = interactionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);

    const interaction = await logInteraction(auth.userId, id, {
      at: parsed.data.at ?? newDate(),
      kind: parsed.data.kind,
      note: parsed.data.note ?? null,
    });
    if (!interaction) {
      return NextResponse.json({ error: "No such person" }, { status: 404 });
    }
    return NextResponse.json(
      {
        interaction: {
          id: interaction.id,
          at: interaction.at.toISOString(),
          kind: interaction.kind,
          note: interaction.note,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return failed("Failed to log conversation", error);
  }
}
