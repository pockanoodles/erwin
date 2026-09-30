import { planLinks } from "@/lib/erwin/goal-rules";

const school = { id: "school", externalId: "venture:school-f25", isBoss: false, taskSources: ["CANVAS"] };
const coop = { id: "coop", externalId: "venture:coop-2027", isBoss: false, taskSources: [] };
const pitch = { id: "pitch", externalId: "venture:school-f25#boss:pitch", isBoss: true, taskSources: [] };
const goals = [school, coop, pitch];

const task = (id: string, source: string | null, goalIds: string[] = []) => ({
  id,
  source,
  goalLinks: goalIds.map((goalId) => ({ id: `${id}>${goalId}`, goalId })),
});

describe("planLinks", () => {
  it("files a Canvas task under the Lord whose sources claim it", () => {
    expect(planLinks(goals, new Map(), [task("hw", "CANVAS")])).toEqual({
      create: [{ taskId: "hw", goalId: "school" }],
      stale: [],
    });
  });

  it("files a vault task under the Lord its venture source names", () => {
    expect(planLinks(goals, new Map(), [task("apply", "venture:coop-2027")]).create).toEqual([
      { taskId: "apply", goalId: "coop" },
    ]);
  });

  it("adds the bound boss beside the Lord, and leaves correct links alone", () => {
    const plan = planLinks(goals, new Map([["final", ["pitch"]]]), [task("final", "CANVAS", ["school"])]);
    expect(plan).toEqual({ create: [{ taskId: "final", goalId: "pitch" }], stale: [] });
  });

  it("drops a link no rule produces anymore", () => {
    // Unpinned, so its links are the rules' — a boss that lost its canvas: line.
    const plan = planLinks(goals, new Map(), [task("final", "CANVAS", ["school", "pitch"])]);
    expect(plan).toEqual({ create: [], stale: ["final>pitch"] });
  });

  it("never claims a task by a boss's externalId or for an unknown source", () => {
    const plan = planLinks(goals, new Map(), [
      task("a", "venture:school-f25#boss:pitch"),
      task("b", "OUTLOOK"),
      task("c", null),
    ]);
    expect(plan).toEqual({ create: [], stale: [] });
  });
});
