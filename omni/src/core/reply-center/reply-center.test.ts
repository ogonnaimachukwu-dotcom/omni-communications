import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findConversationById,
  updateConversation,
  listThreadMessages,
} from "./reply-center.repository";
import { db } from "@/db";

vi.mock("@/db", () => {
  const createQueryMock = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockArr: any = [];
    mockArr.limit = vi.fn(() => mockArr);
    mockArr.offset = vi.fn(() => mockArr);
    mockArr.orderBy = vi.fn(() => mockArr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockArr.then = (onfulfilled: any) => onfulfilled(mockArr);
    return mockArr;
  };

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => {
          const mock = createQueryMock();
          mock.leftJoin = vi.fn(() => mock);
          mock.where = vi.fn(() => mock);
          return mock;
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          const mock = createQueryMock();
          mock.returning = vi.fn(() => mock);
          return mock;
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => {
          const mock = createQueryMock();
          mock.where = vi.fn(() => mock);
          mock.returning = vi.fn(() => mock);
          return mock;
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => {
          const mock = createQueryMock();
          mock.returning = vi.fn(() => mock);
          return mock;
        }),
      })),
    },
  };
});

describe("Reply Center Repository & Database Threading Mock Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attempts to retrieve conversation by ID correctly", async () => {
    const spySelect = vi.spyOn(db, "select");
    await findConversationById("d11ff74a-3311-4742-ce12-01941be5c202");
    expect(spySelect).toHaveBeenCalled();
  });

  it("updates conversation details correctly", async () => {
    const spyUpdate = vi.spyOn(db, "update");
    await updateConversation("d11ff74a-3311-4742-ce12-01941be5c202", {
      status: "interested",
    });
    expect(spyUpdate).toHaveBeenCalled();
  });

  it("queries thread messages list correctly", async () => {
    const spySelect = vi.spyOn(db, "select");
    await listThreadMessages("d11ff74a-3311-4742-ce12-01941be5c202");
    expect(spySelect).toHaveBeenCalled();
  });
});
