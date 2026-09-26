import { describe, expect, mock, test } from "bun:test";

mock.module("@raycast/api", () => ({ WindowManagement: {}, showHUD: async () => {} }));
const { stageManagerFrame, workArea } = await import("./almost-maximize-stage-manager");

describe("stageManagerFrame", () => {
  test("keeps Almost Maximize's 5% left inset and fills the rest", () => {
    expect(stageManagerFrame({ x: 0, y: 25, width: 1512, height: 920 })).toEqual({
      x: 76,
      y: 25,
      width: 1436,
      height: 920,
    });
  });

  test("offsets from a secondary display's origin", () => {
    expect(stageManagerFrame({ x: -2560, y: -300, width: 2560, height: 1415 })).toEqual({
      x: -2432,
      y: -300,
      width: 2432,
      height: 1415,
    });
  });
});

describe("workArea", () => {
  const size = { width: 1512, height: 982 };

  test("prefers Tinycast's visible frame", () => {
    const visibleFrame = { position: { x: 0, y: 33 }, size: { width: 1512, height: 870 } };
    expect(workArea({ id: "1", screenId: "1", active: true, type: "User" as never, size, visibleFrame })).toEqual({
      x: 0,
      y: 33,
      width: 1512,
      height: 870,
    });
  });

  test("falls back to the display size under Raycast", () => {
    expect(workArea({ id: "1", screenId: "1", active: true, type: "User" as never, size })).toEqual({
      x: 0,
      y: 0,
      ...size,
    });
  });
});
