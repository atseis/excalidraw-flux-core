import { reseed, resolvablePromise } from "@excalidraw/common";
import { pointFrom, type LocalPoint } from "@excalidraw/math";
import {
  CaptureUpdateAction,
  getBlockArrowPolygon,
  isArrowElement,
  newElement,
  ShapeCache,
} from "@excalidraw/element";

import { Excalidraw } from "../index";
import { actionChangeArrowType } from "../actions/actionProperties";

import {
  act,
  fireEvent,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
  waitFor,
} from "./test-utils";
import { API } from "./helpers/api";

import type {
  ExcalidrawImperativeAPI,
  ToolShortcutPreferences,
} from "../types";
import type { Arrowhead } from "@excalidraw/element/types";

unmountComponent();

const HOST_TOOL_SHORTCUT_PREFERENCES: ToolShortcutPreferences = {
  eraser: { numeric: true, letter: false },
  selection: { numeric: true, letter: false },
  rectangle: { numeric: true, letter: false },
  diamond: { numeric: true, letter: false },
  ellipse: { numeric: true, letter: false },
  arrow: { numeric: true, letter: false },
  line: { numeric: true, letter: false },
  freedraw: { numeric: true, letter: false },
  text: { numeric: false, letter: true },
};

const ARROWHEAD_SHORTCUTS = [
  ["q", null],
  ["w", "arrow"],
  ["e", "triangle"],
  ["r", "triangle_outline"],
  ["t", "chevron"],
  ["y", "chevron_outline"],
  ["b", "block_arrow"],
  ["n", "block_arrow_outline"],
  ["a", "circle"],
  ["s", "circle_outline"],
  ["d", "diamond"],
  ["f", "diamond_outline"],
  ["z", "bar"],
  ["x", "cardinality_one"],
  ["c", "cardinality_many"],
  ["v", "cardinality_one_or_many"],
] as const satisfies readonly (readonly [string, Arrowhead | null])[];

const pressArrowheadShortcut = (
  secondKey: string,
  position: "start" | "end" = "end",
) => {
  fireEvent.keyDown(document, { key: "a", code: "KeyA" });
  fireEvent.keyDown(document, {
    key: position === "start" ? secondKey.toUpperCase() : secondKey,
    code: `Key${secondKey.toUpperCase()}`,
    shiftKey: position === "start",
  });
};

describe("YMJR-compatible arrow interaction", () => {
  let excalidrawAPI: ExcalidrawImperativeAPI;
  let interactiveCanvas: HTMLCanvasElement;
  let legacyLineAnimationCallback: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  beforeEach(async () => {
    localStorage.clear();
    reseed(7);
    legacyLineAnimationCallback = vi.fn();
    const apiPromise = resolvablePromise<ExcalidrawImperativeAPI>();
    const renderResult = await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        toolShortcutPreferences={HOST_TOOL_SHORTCUT_PREFERENCES}
        onLineAnimationShortcut={legacyLineAnimationCallback}
        onExcalidrawAPI={(api) => api && apiPromise.resolve(api)}
      />,
    );
    excalidrawAPI = await apiPromise;
    interactiveCanvas =
      renderResult.container.querySelector("canvas.interactive")!;
  });

  afterEach(() => {
    unmountComponent();
  });

  it("snaps the initial Points endpoint and persists its fixedPoint binding", async () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    act(() => {
      excalidrawAPI.updateScene({
        elements: [rectangle],
        appState: { currentItemSnap: "points" },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      excalidrawAPI.setActiveTool({ type: "arrow" });
    });
    await waitFor(() => {
      expect(excalidrawAPI.getAppState().activeTool.type).toBe("arrow");
    });
    expect(excalidrawAPI.getAppState().currentItemSnap).toBe("points");
    expect(excalidrawAPI.getSceneElements()).toHaveLength(1);
    expect(interactiveCanvas).toBeInstanceOf(HTMLCanvasElement);

    // This is close to, but not exactly on, the right-edge quarter point
    // [1, 0.25] => [300, 125]. The first pointer-down must move there.
    act(() => {
      fireEvent.mouseMove(document, {
        clientX: 303,
        clientY: 123,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerMove(interactiveCanvas, {
        clientX: 303,
        clientY: 123,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerDown(interactiveCanvas, {
        clientX: 303,
        clientY: 123,
        pointerId: 1,
        pointerType: "mouse",
      });
    });

    let arrow = excalidrawAPI.getSceneElements().find(isArrowElement);
    expect(arrow).toBeDefined();
    expect(arrow!.x).toBe(300);
    expect(arrow!.y).toBe(125);
    expect(arrow!.startBinding).toEqual({
      elementId: rectangle.id,
      mode: "inside",
      fixedPoint: [1, 0.25],
    });

    act(() => {
      fireEvent.pointerMove(interactiveCanvas, {
        clientX: 500,
        clientY: 200,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(interactiveCanvas, {
        clientX: 500,
        clientY: 200,
        pointerId: 1,
        pointerType: "mouse",
      });
    });

    await waitFor(() => {
      arrow = excalidrawAPI.getSceneElements().find(isArrowElement);
      expect(arrow).toBeDefined();
      expect(arrow!.x).toBe(300);
      expect(arrow!.y).toBe(125);
      expect(arrow!.startBinding?.fixedPoint).toEqual([1, 0.25]);
    });
  });

  it("keeps Elbow Points bindings on the YMJR orbit gap at the selected quarter point", async () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    act(() => {
      excalidrawAPI.updateScene({
        elements: [rectangle],
        appState: {
          currentItemArrowType: "elbow",
          currentItemSnap: "points",
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      excalidrawAPI.setActiveTool({ type: "arrow" });
    });
    await waitFor(() => {
      expect(excalidrawAPI.getAppState().activeTool.type).toBe("arrow");
      expect(excalidrawAPI.getAppState().currentItemArrowType).toBe("elbow");
      expect(excalidrawAPI.getAppState().currentItemSnap).toBe("points");
    });

    act(() => {
      fireEvent.mouseMove(document, {
        clientX: 153,
        clientY: 98,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerMove(interactiveCanvas, {
        clientX: 153,
        clientY: 98,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerDown(interactiveCanvas, {
        clientX: 153,
        clientY: 98,
        pointerId: 1,
        pointerType: "mouse",
      });
    });

    await waitFor(() => {
      const arrow = excalidrawAPI.getSceneElements().find(isArrowElement)!;
      expect(arrow).toBeDefined();
      expect(arrow.elbowed).toBe(true);
      expect(arrow.startBinding?.mode).toBe("orbit");
      expect(arrow.startBinding?.fixedPoint[0]).toBeCloseTo(0.25, 5);
      expect(arrow.startBinding?.fixedPoint[1]).toBeCloseTo(-0.06, 5);
    });

    act(() => {
      fireEvent.pointerMove(interactiveCanvas, {
        clientX: 400,
        clientY: 200,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(interactiveCanvas, {
        clientX: 400,
        clientY: 200,
        pointerId: 1,
        pointerType: "mouse",
      });
    });
  });

  it.each(["block_arrow", "block_arrow_outline"] as const)(
    "creates an automatic curve when %s is selected before drawing",
    async (arrowhead) => {
      act(() => {
        excalidrawAPI.setActiveTool({ type: "arrow" });
        excalidrawAPI.updateScene({
          appState: { currentItemArrowType: "curve" },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        excalidrawAPI.updateScene({
          appState: { currentItemEndArrowhead: arrowhead },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      });

      await waitFor(() => {
        expect(excalidrawAPI.getAppState().activeTool.type).toBe("arrow");
        expect(excalidrawAPI.getAppState().currentItemArrowType).toBe("curve");
        expect(excalidrawAPI.getAppState().currentItemEndArrowhead).toBe(
          arrowhead,
        );
      });

      act(() => {
        fireEvent.mouseMove(document, {
          clientX: 50,
          clientY: 50,
          pointerId: 1,
          pointerType: "mouse",
        });
        fireEvent.pointerMove(interactiveCanvas, {
          clientX: 50,
          clientY: 50,
          pointerId: 1,
          pointerType: "mouse",
        });
        fireEvent.pointerDown(interactiveCanvas, {
          clientX: 50,
          clientY: 50,
          pointerId: 1,
          pointerType: "mouse",
        });
        fireEvent.pointerMove(interactiveCanvas, {
          clientX: 270,
          clientY: 246,
          pointerId: 1,
          pointerType: "mouse",
        });
        fireEvent.pointerUp(interactiveCanvas, {
          clientX: 270,
          clientY: 246,
          pointerId: 1,
          pointerType: "mouse",
        });
      });

      await waitFor(() => {
        expect(
          excalidrawAPI.getSceneElements().filter(isArrowElement),
        ).toHaveLength(1);
      });

      const arrow = excalidrawAPI.getSceneElements().find(isArrowElement)!;
      expect(arrow.endArrowhead).toBe(arrowhead);
      expect(arrow.customData?.curveArrow).toBe(true);

      const polygon = getBlockArrowPolygon(arrow);
      expect(polygon).not.toBeNull();
      expect(polygon!.length).toBeGreaterThan(7);
      expect(polygon).toContainEqual(arrow.points.at(-1));

      const shape = ShapeCache.generateElementShape(arrow, null);
      expect(shape).toHaveLength(1);
      expect(shape[0].options.fill).toBe(
        arrowhead === "block_arrow" ? arrow.strokeColor : "#ffffff",
      );
    },
  );

  it("collapses a multipoint arrow to the two-point Automatic curve data contract", async () => {
    const arrow = API.createElement({
      type: "arrow",
      x: 50,
      y: 50,
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(100, 80),
        pointFrom<LocalPoint>(220, 20),
      ],
      roundness: null,
    });

    API.setElements([arrow]);
    API.setSelectedElements([arrow]);
    act(() => {
      window.h.app.actionManager.executeAction(
        actionChangeArrowType,
        "api",
        "curve",
      );
    });

    await waitFor(() => {
      const converted = excalidrawAPI.getSceneElements().find(isArrowElement)!;
      expect(converted.customData?.curveArrow).toBe(true);
      expect(converted.points).toEqual([
        [0, 0],
        [220, 20],
      ]);
    });
  });

  it.each([
    ["dashed", [8, 8]],
    ["dotted", [1.5, 6]],
  ] as const)(
    "applies a dialog-free %s animation through la",
    async (strokeStyle, strokeLineDash) => {
      const line = API.createElement({
        type: "line",
        x: 40,
        y: 40,
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(180, 40)],
        strokeStyle,
      });
      API.setElements([line]);
      API.setSelectedElements([line]);

      act(() => {
        fireEvent.keyDown(document, { key: "l", code: "KeyL" });
        fireEvent.keyDown(document, { key: "a", code: "KeyA" });
      });

      await waitFor(() => {
        expect(
          excalidrawAPI.getSceneElements()[0].customData?.animation,
        ).toEqual({
          type: "arrow",
          style: "dash",
          strokeLineDash: [...strokeLineDash],
          speed: 2,
        });
      });
      expect(legacyLineAnimationCallback).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["s", "solid"],
    ["d", "dashed"],
    ["t", "dotted"],
  ] as const)("changes the selected line through l%s", (secondKey, style) => {
    const line = {
      ...API.createElement({
        type: "line",
        x: 40,
        y: 40,
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(180, 40)],
        strokeStyle: style === "solid" ? "dashed" : "solid",
      }),
      customData: {
        keepMe: true,
        animation: {
          type: "arrow",
          style: "dash",
          strokeLineDash: [8, 8],
          speed: 2,
        },
      },
    };
    API.setElements([line]);
    API.setSelectedElements([line]);

    act(() => {
      fireEvent.keyDown(document, { key: "l", code: "KeyL" });
      fireEvent.keyDown(document, {
        key: secondKey,
        code: `Key${secondKey.toUpperCase()}`,
      });
    });
    const changedLine = excalidrawAPI.getSceneElements()[0];
    expect(changedLine.strokeStyle).toBe(style);
    expect(changedLine.customData?.animation).toBeUndefined();
    expect(changedLine.customData?.keepMe).toBe(true);
  });

  it("requires dashed or dotted stroke style before la and no longer reserves d", () => {
    const line = API.createElement({
      type: "line",
      x: 40,
      y: 40,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(180, 40)],
      strokeStyle: "solid",
    });
    API.setElements([line]);
    API.setSelectedElements([line]);

    act(() => {
      fireEvent.keyDown(document, { key: "d", code: "KeyD" });
    });
    expect(window.h.state.openMenu).not.toBe("shape");

    act(() => {
      fireEvent.keyDown(document, { key: "l", code: "KeyL" });
      fireEvent.keyDown(document, { key: "a", code: "KeyA" });
    });
    expect(excalidrawAPI.getSceneElements()[0].customData?.animation).toBe(
      undefined,
    );
    expect(legacyLineAnimationCallback).not.toHaveBeenCalled();
  });

  it.each(ARROWHEAD_SHORTCUTS)(
    "sets the selected arrow's end and start Arrowheads through a%s",
    (secondKey, arrowhead) => {
      const arrow = API.createElement({
        type: "arrow",
        x: 50,
        y: 50,
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(220, 80)],
        startArrowhead: "arrow",
        endArrowhead: "arrow",
      });
      API.setElements([arrow]);
      API.setSelectedElements([arrow]);

      act(() => {
        pressArrowheadShortcut(secondKey);
      });

      let changedArrow = excalidrawAPI.getSceneElements().find(isArrowElement)!;
      expect(changedArrow.endArrowhead).toBe(arrowhead);
      expect(changedArrow.startArrowhead).toBe("arrow");

      act(() => {
        pressArrowheadShortcut(secondKey, "start");
      });

      changedArrow = excalidrawAPI.getSceneElements().find(isArrowElement)!;
      expect(changedArrow.startArrowhead).toBe(arrowhead);
      expect(changedArrow.endArrowhead).toBe(arrowhead);
    },
  );

  it.each(ARROWHEAD_SHORTCUTS)(
    "sets the default end and start Arrowheads through a%s when nothing is selected",
    (secondKey, arrowhead) => {
      act(() => {
        pressArrowheadShortcut(secondKey);
      });
      expect(excalidrawAPI.getAppState().currentItemEndArrowhead).toBe(
        arrowhead,
      );

      act(() => {
        pressArrowheadShortcut(secondKey, "start");
      });
      expect(excalidrawAPI.getAppState().currentItemStartArrowhead).toBe(
        arrowhead,
      );
    },
  );

  it("changes Arrowheads without changing the selected Automatic Curve path", () => {
    const arrow = {
      ...API.createElement({
        type: "arrow",
        x: 50,
        y: 50,
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(220, 80)],
        roundness: { type: 2 },
      }),
      customData: { curveArrow: true, keepMe: true },
    };
    API.setElements([arrow]);
    API.setSelectedElements([arrow]);
    act(() => {
      excalidrawAPI.updateScene({
        appState: { currentItemArrowType: "curve" },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });

    act(() => {
      pressArrowheadShortcut("b");
    });

    const changedArrow = excalidrawAPI.getSceneElements().find(isArrowElement)!;
    expect(changedArrow.endArrowhead).toBe("block_arrow");
    expect(changedArrow.roundness).toEqual({ type: 2 });
    expect(changedArrow.elbowed).toBe(false);
    expect(changedArrow.customData).toEqual({
      curveArrow: true,
      keepMe: true,
    });
    expect(excalidrawAPI.getAppState().currentItemArrowType).toBe("curve");
  });
});
