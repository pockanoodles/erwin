/**
 * The Nutrition module's HTTP handlers. The route files under
 * src/app/api/erwin/nutrition only forward here, so the module's server code
 * lives in one folder. Every handler answers 409 module_off while Nutrition
 * is off.
 *
 * A day is a calendar day, "2026-10-25". The page sends its own; a caller
 * that leaves it out (ops) gets today in the person's time zone.
 */
import { NextRequest, NextResponse } from "next/server";

import type { Food, FoodEntry, NutritionTarget } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { dayIn, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { userTimeZone } from "@/lib/user-time-zone";

import { moduleOffResponse } from "@/modules/api";
import { NO_TARGETS, type Targets, isDay } from "@/modules/nutrition/macros";
import type { DayRow, EntryRow, FoodRow } from "@/modules/nutrition/types";

const LOG_SOURCE = "NutritionAPI";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional();

const kcal = z.number().min(0).max(100_000);
const grams = z.number().min(0).max(10_000);

const foodFields = {
  name: z.string().trim().min(1, "A food needs a name").max(200),
  serving: text(100),
  calories: kcal,
  protein: grams,
  carbs: grams,
  fat: grams,
};

const daySchema = z.string().refine(isDay, "A day is written 2026-10-25");
const servings = z.number().positive().max(100);

const entrySchema = z.union([
  z.object({ day: daySchema, servings, foodId: z.string().min(1) }),
  z.object({
    day: daySchema,
    servings,
    food: z.object(foodFields),
    save: z.boolean().default(false),
  }),
]);

const entryEditSchema = z
  .object({ ...foodFields, day: daySchema, servings })
  .partial();

const foodSchema = z.object(foodFields);
const foodEditSchema = z
  .object(foodFields)
  .partial()
  .extend({ archived: z.boolean().optional() });

const target = z.number().int().min(0).max(100_000).nullable();
const targetsSchema = z.object({
  calories: target,
  protein: target,
  carbs: target,
  fat: target,
});

type Ctx = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth;
  const off = await moduleOffResponse(auth.userId, "nutrition");
  return off ? { response: off } : auth;
}

/** "2026-10-25" as the database's DATE column holds it. */
const dateOf = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

const macrosOf = (row: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) => ({
  calories: row.calories,
  protein: row.protein,
  carbs: row.carbs,
  fat: row.fat,
});

function toEntryRow(e: FoodEntry): EntryRow {
  return {
    id: e.id,
    day: dayOf(e.day),
    foodId: e.foodId,
    name: e.name,
    serving: e.serving,
    servings: e.servings,
    ...macrosOf(e),
  };
}

function toFoodRow(f: Food): FoodRow {
  return {
    id: f.id,
    name: f.name,
    serving: f.serving,
    lastUsedAt: f.lastUsedAt?.toISOString() ?? null,
    archived: f.archived,
    ...macrosOf(f),
  };
}

const toTargets = (t: NutritionTarget | null): Targets =>
  t
    ? { calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat }
    : NO_TARGETS;

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

const notFound = (what: string) =>
  NextResponse.json({ error: `No such ${what}` }, { status: 404 });

/** GET /api/erwin/nutrition/day[?day=2026-10-25]: a day's entries and the targets. */
export async function getDay(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const asked = request.nextUrl.searchParams.get("day");
    if (asked !== null && !isDay(asked)) {
      return NextResponse.json(
        { error: "A day is written 2026-10-25" },
        { status: 400 }
      );
    }
    const day =
      asked ?? dayIn(newDate(), await userTimeZone(prisma, auth.userId));
    const [entries, targets] = await Promise.all([
      prisma.foodEntry.findMany({
        where: { userId: auth.userId, day: dateOf(day) },
        orderBy: [{ at: "asc" }, { createdAt: "asc" }],
      }),
      prisma.nutritionTarget.findUnique({ where: { userId: auth.userId } }),
    ]);
    const body: DayRow = {
      day,
      entries: entries.map(toEntryRow),
      targets: toTargets(targets),
    };
    return NextResponse.json(body);
  } catch (error) {
    return failed("Failed to load the day", error);
  }
}

/**
 * POST /api/erwin/nutrition/entries
 *   { day, servings, foodId }                  a saved food
 *   { day, servings, food: {...}, save? }      one typed in, saved too if asked
 *
 * The entry keeps its own copy of the amounts per serving.
 */
export async function createEntry(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const parsed = entrySchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;
    const userId = auth.userId;
    const now = newDate();

    const entry = await prisma.$transaction(async (tx) => {
      let values;
      if ("foodId" in input) {
        const food = await tx.food.findFirst({
          where: { id: input.foodId, userId },
        });
        if (!food) return null;
        await tx.food.update({
          where: { id: food.id },
          data: { lastUsedAt: now },
        });
        values = {
          name: food.name,
          serving: food.serving,
          ...macrosOf(food),
          foodId: food.id,
        };
      } else {
        const saved = input.save
          ? await tx.food.create({
              data: { ...input.food, userId, lastUsedAt: now },
            })
          : null;
        values = {
          ...input.food,
          serving: input.food.serving ?? null,
          foodId: saved?.id ?? null,
        };
      }
      return tx.foodEntry.create({
        data: {
          ...values,
          userId,
          day: dateOf(input.day),
          at: now,
          servings: input.servings,
        },
      });
    });
    if (!entry) return notFound("food");
    return NextResponse.json({ entry: toEntryRow(entry) }, { status: 201 });
  } catch (error) {
    return failed("Failed to log food", error);
  }
}

/** PATCH /api/erwin/nutrition/entries/:id: changes servings, amounts, name or day. */
export async function updateEntry(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = entryEditSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);

    const found = await prisma.foodEntry.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });
    if (!found) return notFound("entry");
    const { day, ...rest } = parsed.data;
    const entry = await prisma.foodEntry.update({
      where: { id },
      data: { ...rest, ...(day ? { day: dateOf(day) } : {}) },
    });
    return NextResponse.json({ entry: toEntryRow(entry) });
  } catch (error) {
    return failed("Failed to change entry", error);
  }
}

/** DELETE /api/erwin/nutrition/entries/:id */
export async function deleteEntry(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const { count } = await prisma.foodEntry.deleteMany({
      where: { id, userId: auth.userId },
    });
    if (count === 0) return notFound("entry");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("Failed to delete entry", error);
  }
}

/** GET /api/erwin/nutrition/foods[?archived=1]: saved foods, the usual first. */
export async function listFoods(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const archived = request.nextUrl.searchParams.get("archived") === "1";
    const foods = await prisma.food.findMany({
      where: { userId: auth.userId, archived },
      orderBy: [
        { lastUsedAt: { sort: "desc", nulls: "last" } },
        { name: "asc" },
      ],
    });
    return NextResponse.json({ foods: foods.map(toFoodRow) });
  } catch (error) {
    return failed("Failed to list foods", error);
  }
}

/** POST /api/erwin/nutrition/foods: saves a food. */
export async function createFood(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const parsed = foodSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const food = await prisma.food.create({
      data: { ...parsed.data, userId: auth.userId },
    });
    return NextResponse.json({ food: toFoodRow(food) }, { status: 201 });
  } catch (error) {
    return failed("Failed to save food", error);
  }
}

/** PATCH /api/erwin/nutrition/foods/:id: edits, archives or restores a food. What's already eaten keeps its own amounts. */
export async function updateFood(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = foodEditSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);
    const found = await prisma.food.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });
    if (!found) return notFound("food");
    const food = await prisma.food.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ food: toFoodRow(food) });
  } catch (error) {
    return failed("Failed to change food", error);
  }
}

/** PUT /api/erwin/nutrition/targets { calories, protein, carbs, fat }: null stops tracking one. */
export async function putTargets(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const parsed = targetsSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);
    const targets = await prisma.nutritionTarget.upsert({
      where: { userId: auth.userId },
      create: { ...parsed.data, userId: auth.userId },
      update: parsed.data,
    });
    return NextResponse.json({ targets: toTargets(targets) });
  } catch (error) {
    return failed("Failed to save targets", error);
  }
}
