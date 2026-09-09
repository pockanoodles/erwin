/**
 * This module ends up in the client bundle: the extension is attached where the
 * Prisma singleton is created, and that module is reachable from client code.
 * There, `@prisma/client` resolves to a browser stub that still exports
 * `Prisma.defineExtension` but has no `Prisma.dmmf`.
 *
 * A version of this file read `Prisma.dmmf.datamodel.models` at module scope.
 * Every server test passed — Jest runs in Node, where `dmmf` is populated —
 * while in the browser the import threw during hydration and the whole app
 * rendered as "Application error: a client-side exception has occurred".
 *
 * So: importing must stay inert. The datamodel may only be read when a query
 * actually runs, which never happens in the browser.
 */

describe("importing in a browser-like build", () => {
  afterEach(() => {
    jest.dontMock("@prisma/client");
    jest.resetModules();
  });

  it("does not read Prisma.dmmf at module scope", () => {
    jest.resetModules();

    let dmmfReads = 0;
    jest.doMock("@prisma/client", () => ({
      Prisma: {
        defineExtension: (extension: unknown) => extension,
        get dmmf() {
          dmmfReads += 1;
          return undefined;
        },
      },
    }));

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/lib/crypto/prisma-encryption");
    }).not.toThrow();

    expect(dmmfReads).toBe(0);
  });
});
