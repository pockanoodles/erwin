import type { Db } from "@/lib/prisma";

import {
  moduleClaimKeys,
  moduleRankSignals,
  moduleTaskFacts,
} from "@/modules/hooks";
import type { FactsRequest } from "@/modules/server";
import type { ModuleId } from "@/modules/types";

// Stand-in contributions, so these tests pin the merging, not the modules.
jest.mock("@/modules/server", () => ({
  SERVER_MODULES: {
    courses: {
      taskFacts: jest.fn(
        async (_db: unknown, _user: string, tasks: FactsRequest[]) =>
          new Map(
            tasks.map((t) => [
              t.id,
              { courseName: "MKTG", projected: Boolean(t.danger) },
            ])
          )
      ),
      claimKeys: jest.fn(
        async (_db: unknown, _user: string, ids: string[]) =>
          new Map(ids.map((id) => [id, [`course:${id}`]]))
      ),
      rankSignals: jest.fn(
        async () => new Map([["a", { stakes: 100, stakesGroup: "c1" }]])
      ),
    },
    ladder: {
      taskFacts: jest.fn(async () => new Map([["a", { ladderGoals: ["g"] }]])),
      rankSignals: jest.fn(
        async () =>
          new Map([
            ["a", { lift: 0.4 }],
            ["b", { lift: 0.9 }],
          ])
      ),
      claimKeys: jest.fn(async () => new Map([["a", ["venture:x"]]])),
    },
    people: {
      rankSignals: jest.fn(
        async () =>
          new Map([
            ["a", { lift: 0.7 }],
            ["b", { lift: 0.2 }],
          ])
      ),
    },
  },
}));

const db = {} as Db;
const on =
  (...ids: ModuleId[]) =>
  (id: ModuleId) =>
    ids.includes(id);

describe("moduleTaskFacts", () => {
  it("merges what each module that's on adds, per task", async () => {
    const facts = await moduleTaskFacts(
      db,
      "u",
      [{ id: "a", danger: true }, { id: "b" }],
      on("courses", "ladder")
    );
    expect(facts.get("a")).toEqual({
      courseName: "MKTG",
      projected: true,
      ladderGoals: ["g"],
    });
    expect(facts.get("b")).toEqual({ courseName: "MKTG", projected: false });
  });

  it("never asks a module that's off", async () => {
    const facts = await moduleTaskFacts(db, "u", [{ id: "a" }], on("ladder"));
    expect(facts.get("a")).toEqual({ ladderGoals: ["g"] });
  });

  it("asks nothing for no tasks", async () => {
    expect((await moduleTaskFacts(db, "u", [], on("courses"))).size).toBe(0);
  });
});

describe("moduleRankSignals", () => {
  it("keeps the strongest lift, and the owner's stakes", async () => {
    const signals = await moduleRankSignals(
      db,
      "u",
      ["a", "b"],
      on("courses", "ladder", "people")
    );
    expect(signals.get("a")).toEqual({
      lift: 0.7,
      stakes: 100,
      stakesGroup: "c1",
    });
    expect(signals.get("b")).toEqual({ lift: 0.9 });
  });

  it("leaves out a module that's off", async () => {
    const signals = await moduleRankSignals(db, "u", ["a", "b"], on("people"));
    expect(signals.get("a")).toEqual({ lift: 0.7 });
    expect(signals.get("b")).toEqual({ lift: 0.2 });
  });
});

describe("moduleClaimKeys", () => {
  it("asks every module, on or off, and keeps every key", async () => {
    const keys = await moduleClaimKeys(db, "u", ["a", "b"]);
    expect(keys.get("a")).toEqual(["course:a", "venture:x"]);
    expect(keys.get("b")).toEqual(["course:b"]);
  });
});
