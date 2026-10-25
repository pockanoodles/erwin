import { claimKeys, planLinks } from "@/lib/erwin/goal-rules";

const goal = (id: string, externalId: string | null, taskSources: string[] = [], extra = {}) => ({
  id,
  externalId,
  isBoss: false,
  status: "active",
  taskSources,
  ...extra,
});
const school = goal("school", "venture:school-f25", ["CANVAS"]);
const coop = goal("coop", "venture:coop-2027");
const pitch = goal("pitch", "venture:school-f25#boss:pitch", [], { isBoss: true });
const goals = [school, coop, pitch];

const task = (id: string, source: string | null, goalIds: string[] = [], extra = {}) => ({
  id,
  source,
  claims: [] as string[],
  projectId: null,
  status: "todo",
  goalLinks: goalIds.map((goalId) => ({ id: `${id}>${goalId}`, goalId })),
  ...extra,
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

  it("lets a goal made in Erwin claim a course or a project", () => {
    const marketing = goal("mktg", null, ["course:c-mktg"]);
    const thesis = goal("thesis", null, ["project:p-thesis"]);
    const plan = planLinks([marketing, thesis], new Map(), [
      task("quiz", "CANVAS", [], { claims: ["course:c-mktg"] }),
      task("draft", "MANUAL", [], { projectId: "p-thesis" }),
      task("other", "CANVAS", [], { claims: ["course:c-intb"] }),
    ]);
    expect(plan.create).toEqual([
      { taskId: "quiz", goalId: "mktg" },
      { taskId: "draft", goalId: "thesis" },
    ]);
    expect(claimKeys({ source: "CANVAS", claims: ["course:c"], projectId: null })).toEqual(["CANVAS", "course:c"]);
  });

  it("keeps a set-aside goal's finished work, and lets its open work go", () => {
    const parked = goal("gym", "venture:gym", ["MANUAL"], { status: "dropped" });
    const plan = planLinks([parked], new Map(), [
      task("ran", "MANUAL", ["gym"], { status: "completed" }),
      task("run", "MANUAL", ["gym"]),
      task("new", "MANUAL"),
    ]);
    // History stays credited; nothing new is filed under it.
    expect(plan).toEqual({ create: [], stale: ["run>gym"] });
  });

  it("files nothing new under a goal that is done, but keeps what it earned", () => {
    const shipped = goal("site", null, ["project:p-site"], { status: "done" });
    const plan = planLinks([shipped], new Map(), [
      task("launch", "MANUAL", ["site"], { projectId: "p-site", status: "completed" }),
      task("polish", "MANUAL", [], { projectId: "p-site" }),
    ]);
    expect(plan).toEqual({ create: [], stale: [] });
  });
});
