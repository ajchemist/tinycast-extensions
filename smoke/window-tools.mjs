// Almost Maximize (Stage Manager) against stubbed displays, through the built bundle.

const COMMAND = "almost-maximize-stage-manager";

const rect = (x, y, width, height) => ({ position: { x, y }, size: { width, height } });

const window = (overrides = {}) => ({
  id: "42",
  active: true,
  desktopId: "1",
  positionable: true,
  resizable: true,
  fullScreenSettable: true,
  bounds: rect(200, 120, 800, 600),
  ...overrides,
});

const builtIn = {
  id: "1",
  screenId: "1",
  active: true,
  type: "User",
  size: { width: 1512, height: 982 },
  frame: rect(0, 0, 1512, 982),
  visibleFrame: rect(0, 33, 1512, 949),
};

const external = {
  id: "2",
  screenId: "2",
  active: false,
  type: "User",
  size: { width: 2560, height: 1440 },
  frame: rect(-2560, -300, 2560, 1440),
  visibleFrame: rect(-2560, -275, 2560, 1415),
};

export default function (t) {
  const run = async (active, desktops) => {
    const session = t.launch(COMMAND, {
      stubs: {
        "windowManagement.activeWindow": () => active,
        "windowManagement.desktops": () => desktops,
        "windowManagement.setWindowBounds": () => null,
      },
    });
    await session.until(() => session.state.finished, "the command to finish");
    return session;
  };

  t.test("fills the work area but keeps Almost Maximize's left inset", async () => {
    const session = await run(window(), [builtIn, external]);
    t.assert.deepEqual(session.called("windowManagement.setWindowBounds"), [
      [{ id: "42", bounds: { position: { x: 76, y: 33 }, size: { width: 1436, height: 949 } } }],
    ]);
  });

  t.test("uses the display the window is on, not the active one", async () => {
    const session = await run(window({ desktopId: "2" }), [builtIn, external]);
    t.assert.deepEqual(session.called("windowManagement.setWindowBounds")[0][0].bounds, {
      position: { x: -2432, y: -275 },
      size: { width: 2432, height: 1415 },
    });
  });

  t.test("falls back to the display size where visibleFrame is missing (Raycast)", async () => {
    const raycastDesktop = { ...builtIn };
    delete raycastDesktop.frame;
    delete raycastDesktop.visibleFrame;
    const session = await run(window({ desktopId: "unknown" }), [raycastDesktop]);
    t.assert.deepEqual(session.called("windowManagement.setWindowBounds")[0][0].bounds, {
      position: { x: 76, y: 0 },
      size: { width: 1436, height: 982 },
    });
  });

  t.test("leaves a full-screen window alone", async () => {
    const session = await run(window({ bounds: "fullscreen" }), [builtIn]);
    t.assert.equal(session.called("windowManagement.setWindowBounds").length, 0);
    t.assert.deepEqual(session.called("feedback.showHUD").map((args) => args[0]), ["Leave full screen first"]);
  });
}
