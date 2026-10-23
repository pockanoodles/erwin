/**
 * Guards `jest.setup.js`: unit tests must not reach a database. If this
 * fails, the suite can write to a real one, most likely the live database
 * named in `.env`.
 */
import { PrismaClient } from "@prisma/client";

describe("the unit-test environment", () => {
  it("can't reach a database", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/fluid_calendar/);
    const client = new PrismaClient();
    await expect(client.$connect()).rejects.toThrow();
    await client.$disconnect();
  });
});
