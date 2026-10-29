import { GoogleTaskProvider } from "@/lib/task-sync/providers/google-provider";

describe("GoogleTaskProvider - pagination and retry", () => {
  it("fetches tasks across multiple pages", async () => {
    // First call returns one item and a nextPageToken
    const fakeClient = {
      tasks: {
        list: jest
          .fn()
          .mockResolvedValueOnce({
            data: { items: [{ id: "a", title: "one" }], nextPageToken: "t1" },
          })
          .mockResolvedValueOnce({
            data: { items: [{ id: "b", title: "two" }] },
          }),
      },
      tasklists: { list: jest.fn().mockResolvedValue({ data: { items: [] } }) },
    } as unknown as ReturnType<typeof import("googleapis").google.tasks>;

    const provider = new GoogleTaskProvider(fakeClient, "acc", "user");

    const tasks = await provider.getTasks("list-1");

    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.id)).toEqual(["a", "b"]);
  });

  // Google Tasks has one date, `due`, and it is the task's due date both ways.
  // startDate stays local: Google has nowhere to keep it.
  function capturing(method: "insert" | "patch") {
    const captured: { body?: Record<string, unknown> } = {};
    const fakeClient = {
      tasks: {
        [method]: jest
          .fn()
          .mockImplementation(
            ({ requestBody }: { requestBody: Record<string, unknown> }) => {
              captured.body = requestBody;
              return { data: { id: "x" } };
            }
          ),
      },
      tasklists: { list: jest.fn().mockResolvedValue({ data: { items: [] } }) },
    } as unknown as ReturnType<typeof import("googleapis").google.tasks>;
    return {
      provider: new GoogleTaskProvider(fakeClient, "acc", "user"),
      captured,
    };
  }

  it("reads external `due` as dueDate and `completed` as completedDate", async () => {
    const fakeClient = {
      tasks: {
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: "a",
                title: "one",
                due: "2025-07-01T00:00:00.000Z",
                completed: "2025-07-02T12:00:00.000Z",
              },
            ],
          },
        }),
      },
      tasklists: { list: jest.fn().mockResolvedValue({ data: { items: [] } }) },
    } as unknown as ReturnType<typeof import("googleapis").google.tasks>;

    const provider = new GoogleTaskProvider(fakeClient, "acc", "user");
    const [task] = await provider.getTasks("list-1");

    expect(task.dueDate?.toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(task.completedDate?.toISOString()).toBe("2025-07-02T12:00:00.000Z");
    expect(task.startDate).toBeUndefined();
  });

  it("sends dueDate as `due` on create, and never startDate", async () => {
    const { provider, captured } = capturing("insert");

    await provider.createTask("list-1", {
      title: "t",
      dueDate: new Date("2025-08-01T00:00:00.000Z"),
      startDate: new Date("2025-07-25T00:00:00.000Z"),
    });

    expect(captured.body?.due).toBe("2025-08-01T00:00:00.000Z");
    expect(captured.body?.start).toBeUndefined();
  });

  it("patches `due` from dueDate, clears it with null, and ignores startDate", async () => {
    const { provider, captured } = capturing("patch");

    await provider.updateTask("list-1", "t1", {
      dueDate: new Date("2025-09-01T00:00:00.000Z"),
    });
    expect(captured.body?.due).toBe("2025-09-01T00:00:00.000Z");

    await provider.updateTask("list-1", "t1", { dueDate: null });
    expect(captured.body).toHaveProperty("due", null);

    await provider.updateTask("list-1", "t1", {
      startDate: new Date("2025-09-05T00:00:00.000Z"),
    });
    expect(captured.body).not.toHaveProperty("due");
  });

  it("retries transient errors and succeeds", async () => {
    const transientError = Object.assign(new Error("Timeout"), {
      code: "ETIMEDOUT",
    });

    const fakeClient = {
      tasks: {
        list: jest
          .fn()
          .mockRejectedValueOnce(transientError)
          .mockResolvedValueOnce({
            data: { items: [{ id: "c", title: "three" }] },
          }),
      },
      tasklists: { list: jest.fn().mockResolvedValue({ data: { items: [] } }) },
    } as unknown as ReturnType<typeof import("googleapis").google.tasks>;

    const provider = new GoogleTaskProvider(fakeClient, "acc", "user");

    const tasks = await provider.getTasks("list-1");

    expect(tasks).toHaveLength(1);
    expect(fakeClient.tasks.list).toHaveBeenCalledTimes(2);
  });

  it("throws on permanent errors without retry", async () => {
    const permanentError = new Error("Bad request");

    const fakeClient = {
      tasks: {
        list: jest.fn().mockRejectedValue(permanentError),
      },
      tasklists: { list: jest.fn().mockResolvedValue({ data: { items: [] } }) },
    } as unknown as ReturnType<typeof import("googleapis").google.tasks>;

    const provider = new GoogleTaskProvider(fakeClient, "acc", "user");

    await expect(provider.getTasks("list-1")).rejects.toThrow("Bad request");
    expect(fakeClient.tasks.list).toHaveBeenCalledTimes(1);
  });
});
