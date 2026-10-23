/**
 * Unit tests never touch a database. Left unset, DATABASE_URL comes from
 * `.env` (Prisma loads it), which put the suite on the live database: the real
 * logger wrote test errors into its Log table. Point Prisma at a port nothing
 * listens on, so a test that reaches it fails loudly instead, and stub the
 * logger, which writes through Prisma. A test can still mock the logger with
 * its own factory.
 */
process.env.DATABASE_URL = "postgresql://unit-tests@127.0.0.1:9/no_database";

jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
