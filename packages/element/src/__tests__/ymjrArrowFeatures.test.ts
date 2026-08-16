import { ROUNDNESS } from "@excalidraw/common";
import { pointFrom, type LocalPoint } from "@excalidraw/math";

import {
  getBlockArrowPolygon,
  getArrowSnapPointRatios,
  getCurveArrowGeometry,
  snapPointToConnectionPoint,
  snapPointToElementEdge,
} from "../ymjrArrowFeatures";
import { getArrowheadPoints, getElementBounds } from "../bounds";
import { normalizeArrowhead } from "../arrowheads";
import { newArrowElement, newLinearElement } from "../newElement";
import { generateLinearCollisionShape, ShapeCache } from "../shape";

import type {
  ExcalidrawArrowElement,
  ExcalidrawBindableElement,
  NonDeleted,
  NonDeletedSceneElementsMap,
} from "../types";

const bindable = (
  type: "rectangle" | "ellipse" | "diamond",
): NonDeleted<ExcalidrawBindableElement> =>
  ({
    id: type,
    type,
    x: 100,
    y: 200,
    width: 200,
    height: 100,
    angle: 0,
    isDeleted: false,
  } as NonDeleted<ExcalidrawBindableElement>);

describe("YMJR-compatible arrow geometry", () => {
  it("renders and hit-tests the exact svgPathShape used by brace Actions", () => {
    const svgPathShape =
      "M 0 0 Q 0 20, 25 20 L 128.965 20 " +
      "Q 153.965 20, 153.965 35 Q 153.965 20, 178.965 20 " +
      "L 282.93 20 Q 307.93 20, 307.93 0";
    const element = newLinearElement({
      type: "line",
      x: 0,
      y: 0,
      width: 307.93,
      height: 35,
      points: [
        pointFrom(0, 0),
        pointFrom(25, 20),
        pointFrom(128.965, 20),
        pointFrom(153.965, 35),
        pointFrom(178.965, 20),
        pointFrom(282.93, 20),
        pointFrom(307.93, 0),
      ],
      roundness: null,
      roughness: 0,
      customData: { svgPathShape },
    });

    const [shape] = ShapeCache.generateElementShape(element, null);
    const paintOps = shape.sets.flatMap((set) => set.ops);
    const collisionOps = generateLinearCollisionShape(element, new Map());

    expect(shape.shape).toBe("path");
    expect(paintOps.some((op) => op.op === "bcurveTo")).toBe(true);
    expect(collisionOps.some((op) => op.op === "bcurveTo")).toBe(true);
    expect(getElementBounds(element, new Map())).toEqual([0, 0, 307.93, 35]);
  });

  it("honors the dash contract written by add animation for line", () => {
    const element = newLinearElement({
      type: "line",
      x: 0,
      y: 0,
      width: 120,
      height: 0,
      points: [pointFrom(0, 0), pointFrom(120, 0)],
      strokeStyle: "solid",
      customData: {
        animation: {
          type: "arrow",
          style: "dash",
          strokeLineDash: [12, 6],
          speed: 3,
        },
      },
    });

    const [shape] = ShapeCache.generateElementShape(element, null);
    expect(shape.options.strokeLineDash).toEqual([12, 6]);
    expect(shape.options.disableMultiStroke).toBe(true);
  });

  it.each([
    "chevron",
    "chevron_outline",
    "block_arrow",
    "block_arrow_outline",
  ] as const)("preserves the %s arrowhead value", (arrowhead) => {
    expect(normalizeArrowhead(arrowhead)).toBe(arrowhead);
  });

  it.each([
    "chevron",
    "chevron_outline",
    "block_arrow",
    "block_arrow_outline",
  ] as const)("renders the %s arrowhead", (arrowhead) => {
    const element = newArrowElement({
      type: "arrow",
      x: 0,
      y: 0,
      points: [pointFrom(0, 0), pointFrom(120, 0)],
      endArrowhead: arrowhead,
    });
    const shape = ShapeCache.generateElementShape(element, null);
    expect(shape.length).toBeGreaterThan(0);
    expect(shape.every((drawable) => drawable.sets.length > 0)).toBe(true);
  });

  it.each(["block_arrow", "block_arrow_outline"] as const)(
    "matches the verified YMJR full-length %s geometry",
    (arrowhead) => {
      const element = newArrowElement({
        type: "arrow",
        x: 0,
        y: 0,
        points: [pointFrom(0, 0), pointFrom(122.62230588625539, 0)],
        endArrowhead: arrowhead,
        strokeWidth: 2,
        roughness: 0,
        strokeColor: "#e8590c",
      });

      expect(getBlockArrowPolygon(element)).toEqual([
        [0, 8],
        [90.62230588625539, 8],
        [90.62230588625539, 20],
        [122.62230588625539, 0],
        [90.62230588625539, -20],
        [90.62230588625539, -8],
        [0, -8],
      ]);
      expect(getElementBounds(element, new Map())).toEqual([
        0, -20, 122.62230588625539, 20,
      ]);

      const [shape] = ShapeCache.generateElementShape(element, null);
      expect(shape.options.fillStyle).toBe("solid");
      expect(shape.options.stroke).toBe("#e8590c");
      expect(shape.options.fill).toBe(
        arrowhead === "block_arrow" ? "#e8590c" : "#ffffff",
      );
    },
  );

  it("matches the verified YMJR elbow block-arrow silhouette", () => {
    const element = newArrowElement({
      type: "arrow",
      x: 0,
      y: 0,
      points: [
        pointFrom(0, 0),
        pointFrom(0, -40),
        pointFrom(382.49777836622775, -40),
        pointFrom(382.49777836622775, 0),
      ],
      elbowed: true,
      endArrowhead: "block_arrow",
      strokeWidth: 2,
      roughness: 0,
    });

    expect(getBlockArrowPolygon(element)).toEqual([
      [8, 0],
      [8, -32],
      [374.49777836622775, -32],
      [374.49777836622775, -32],
      [362.49777836622775, -32],
      [382.49777836622775, 0],
      [402.49777836622775, -32],
      [390.49777836622775, -32],
      [390.49777836622775, -48],
      [-8, -48],
      [-8, 0],
    ]);
  });

  it.each([
    {
      arrowType: "round",
      props: {
        points: [
          pointFrom<LocalPoint>(0, 0),
          pointFrom<LocalPoint>(100, 100),
          pointFrom<LocalPoint>(220, 20),
        ],
        roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
      },
    },
    {
      arrowType: "elbow",
      props: {
        points: [
          pointFrom<LocalPoint>(0, 0),
          pointFrom<LocalPoint>(0, 120),
          pointFrom<LocalPoint>(220, 120),
          pointFrom<LocalPoint>(220, 20),
        ],
        elbowed: true,
      },
    },
    {
      arrowType: "automatic curve",
      props: {
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(220, 196)],
        customData: { curveArrow: true },
      },
    },
  ])(
    "renders $arrowType with both complex block-arrow styles",
    ({ arrowType, props }) => {
      for (const arrowhead of ["block_arrow", "block_arrow_outline"] as const) {
        const element = newArrowElement({
          type: "arrow",
          x: 0,
          y: 0,
          ...props,
          endArrowhead: arrowhead,
          strokeWidth: 2,
          roughness: 0,
          strokeColor: "#e8590c",
        });

        const polygon = getBlockArrowPolygon(element);
        expect(polygon).not.toBeNull();
        expect(polygon!.length).toBeGreaterThan(7);
        expect(polygon).toContainEqual(element.points.at(-1));
        if (arrowType === "round") {
          expect(polygon!.length).toBeGreaterThan(30);
        } else if (arrowType === "automatic curve") {
          // This point lies on the cubic's early horizontal run. A polygon
          // generated around the direct start-to-end segment cannot satisfy
          // this range, so the assertion guards against a straight fallback.
          expect(
            polygon!.some(([x, y]) => x >= 55 && x <= 80 && y >= 15 && y <= 45),
          ).toBe(true);
        }

        const shape = ShapeCache.generateElementShape(element, null);
        expect(shape).toHaveLength(1);
        expect(shape[0].options.fillStyle).toBe("solid");
        expect(shape[0].options.stroke).toBe("#e8590c");
        expect(shape[0].options.fill).toBe(
          arrowhead === "block_arrow" ? "#e8590c" : "#ffffff",
        );

        const collision = generateLinearCollisionShape(element, new Map());
        expect(collision.length).toBe(polygon!.length + 1);
        expect(collision[0].op).toBe("move");
        expect(collision.at(-1)?.data).toEqual(collision[0].data);

        const bounds = getElementBounds(element, new Map());
        const polygonMinX = Math.min(...polygon!.map(([x]) => x));
        const polygonMinY = Math.min(...polygon!.map(([, y]) => y));
        const polygonMaxX = Math.max(...polygon!.map(([x]) => x));
        const polygonMaxY = Math.max(...polygon!.map(([, y]) => y));
        expect(bounds).toEqual([
          polygonMinX,
          polygonMinY,
          polygonMaxX,
          polygonMaxY,
        ]);
      }
    },
  );

  it("renders a curveArrow as a cubic drawable", () => {
    const element = newArrowElement({
      type: "arrow",
      x: 0,
      y: 0,
      points: [pointFrom(0, 0), pointFrom(220, 196)],
      endArrowhead: "arrow",
      customData: { curveArrow: true, snap: "edge" },
    });
    const shape = ShapeCache.generateElementShape(element, null);
    const mainOps = shape[0].sets.flatMap((set) => set.ops);
    expect(mainOps.some((op) => op.op === "bcurveTo")).toBe(true);
    expect(shape.slice(1).map((drawable) => drawable.shape)).toEqual([
      "line",
      "line",
    ]);
  });

  it.each([
    { arrowhead: null, markerShapes: [], fill: undefined },
    { arrowhead: "arrow", markerShapes: ["line", "line"], fill: undefined },
    { arrowhead: "bar", markerShapes: ["line", "line"], fill: undefined },
    { arrowhead: "triangle", markerShapes: ["polygon"], fill: "#e8590c" },
    {
      arrowhead: "triangle_outline",
      markerShapes: ["polygon"],
      fill: "#ffffff",
    },
    { arrowhead: "chevron", markerShapes: ["polygon"], fill: "#e8590c" },
    {
      arrowhead: "chevron_outline",
      markerShapes: ["polygon"],
      fill: "#ffffff",
    },
    { arrowhead: "circle", markerShapes: ["circle"], fill: "#e8590c" },
    {
      arrowhead: "circle_outline",
      markerShapes: ["circle"],
      fill: "#ffffff",
    },
    { arrowhead: "diamond", markerShapes: ["polygon"], fill: "#e8590c" },
    {
      arrowhead: "diamond_outline",
      markerShapes: ["polygon"],
      fill: "#ffffff",
    },
    {
      arrowhead: "cardinality_one",
      markerShapes: ["line"],
      fill: undefined,
    },
    {
      arrowhead: "cardinality_many",
      markerShapes: ["line", "line"],
      fill: undefined,
    },
    {
      arrowhead: "cardinality_one_or_many",
      markerShapes: ["line", "line", "line"],
      fill: undefined,
    },
    {
      arrowhead: "cardinality_exactly_one",
      markerShapes: ["line", "line"],
      fill: undefined,
    },
    {
      arrowhead: "cardinality_zero_or_one",
      markerShapes: ["circle", "line"],
      fill: undefined,
    },
    {
      arrowhead: "cardinality_zero_or_many",
      markerShapes: ["line", "line", "circle"],
      fill: undefined,
    },
  ] as const)(
    "renders an automatic curve with the selected $arrowhead end marker",
    ({ arrowhead, markerShapes, fill }) => {
      const element = newArrowElement({
        type: "arrow",
        x: 0,
        y: 0,
        points: [pointFrom(0, 0), pointFrom(220, 196)],
        endArrowhead: arrowhead,
        customData: { curveArrow: true },
        strokeColor: "#e8590c",
        roughness: 0,
      });

      expect(element.endArrowhead).toBe(arrowhead);

      const shape = ShapeCache.generateElementShape(element, null);
      const mainOps = shape[0].sets.flatMap((set) => set.ops);
      expect(mainOps.some((op) => op.op === "bcurveTo")).toBe(true);
      expect(shape.slice(1).map((drawable) => drawable.shape)).toEqual(
        markerShapes,
      );

      if (fill !== undefined) {
        expect(shape[1].options.fill).toBe(fill);
        expect(shape[1].options.stroke).toBe("#e8590c");
        expect(shape[1].options.fillStyle).toBe("solid");
      }
    },
  );

  it("renders independently selected markers at both ends of an automatic curve", () => {
    const element = newArrowElement({
      type: "arrow",
      x: 0,
      y: 0,
      points: [pointFrom(0, 0), pointFrom(220, 196)],
      startArrowhead: "circle_outline",
      endArrowhead: "diamond",
      customData: { curveArrow: true },
      strokeColor: "#e8590c",
      roughness: 0,
    });

    const shape = ShapeCache.generateElementShape(element, null);
    expect(shape.slice(1).map((drawable) => drawable.shape)).toEqual([
      "circle",
      "polygon",
    ]);
    expect(shape[1].options.fill).toBe("#ffffff");
    expect(shape[2].options.fill).toBe("#e8590c");
  });

  it.each(["arrow", "triangle", "diamond", "chevron"] as const)(
    "aligns an automatic curve's %s markers to the canonical endpoint tangents",
    (arrowhead) => {
      const element = newArrowElement({
        type: "arrow",
        x: 0,
        y: 0,
        points: [pointFrom(0, 0), pointFrom(310, 400)],
        startArrowhead: arrowhead,
        endArrowhead: arrowhead,
        customData: { curveArrow: true },
        roughness: 2,
      });
      const shape = ShapeCache.generateElementShape(element, null);
      const start = getArrowheadPoints(element, shape, "start", arrowhead);
      const end = getArrowheadPoints(element, shape, "end", arrowhead);

      expect(start).not.toBeNull();
      expect(end).not.toBeNull();
      const secondWingIndex = arrowhead === "diamond" ? 6 : 4;
      const [, startTipY, startWing1X, startWing1Y] = start!;
      const startWing2X = start![secondWingIndex];
      const startWing2Y = start![secondWingIndex + 1];
      const [, endTipY, endWing1X, endWing1Y] = end!;
      const endWing2X = end![secondWingIndex];
      const endWing2Y = end![secondWingIndex + 1];

      // This fixture's automatic cubic leaves and enters vertically. Both
      // wings therefore stay on the body side of their tip and straddle the
      // endpoint x-coordinate, independent of RoughJS roughness.
      expect(startWing1Y).toBeGreaterThan(startTipY);
      expect(startWing2Y).toBeGreaterThan(startTipY);
      expect(startWing1X * startWing2X).toBeLessThanOrEqual(0);
      expect(endWing1Y).toBeLessThan(endTipY);
      expect(endWing2Y).toBeLessThan(endTipY);
      expect((endWing1X - 310) * (endWing2X - 310)).toBeLessThanOrEqual(0);
    },
  );

  it.each([
    { customData: undefined, route: "Sharp" },
    { customData: { curveArrow: true }, route: "Automatic curve" },
  ])(
    "preserves the ordinary marker opposite a Block endpoint on a $route arrow",
    ({ customData }) => {
      const ordinaryStart = newArrowElement({
        type: "arrow",
        x: 0,
        y: 0,
        points: [pointFrom(0, 0), pointFrom(220, 80)],
        startArrowhead: "circle_outline",
        endArrowhead: "block_arrow",
        customData,
        roughness: 0,
      });
      const ordinaryEnd = newArrowElement({
        type: "arrow",
        x: 0,
        y: 0,
        points: [pointFrom(0, 0), pointFrom(220, 80)],
        startArrowhead: "block_arrow_outline",
        endArrowhead: "diamond",
        customData,
        roughness: 0,
      });

      expect(
        ShapeCache.generateElementShape(ordinaryStart, null).map(
          (drawable) => drawable.shape,
        ),
      ).toEqual(["polygon", "circle"]);
      expect(
        ShapeCache.generateElementShape(ordinaryEnd, null).map(
          (drawable) => drawable.shape,
        ),
      ).toEqual(["polygon", "polygon"]);
    },
  );

  it("derives a stable two-point cubic path", () => {
    const geometry = getCurveArrowGeometry({
      points: [pointFrom(0, 0), pointFrom(220, 196)],
      startBinding: null,
      endBinding: null,
    } as unknown as ExcalidrawArrowElement);

    expect(geometry).toEqual({
      path: "M 0 0 C 110 0, 110 196, 220 196",
      start: [0, 0],
      end: [220, 196],
      startControl: [110, 0],
      endControl: [110, 196],
    });
  });

  it("uses binding sides as the curve endpoint tangents", () => {
    const geometry = getCurveArrowGeometry({
      points: [pointFrom(0, 0), pointFrom(140, 60)],
      startBinding: {
        elementId: "a",
        mode: "inside",
        fixedPoint: [1, 0.25],
      },
      endBinding: {
        elementId: "b",
        mode: "inside",
        fixedPoint: [0.04, 0.31],
      },
    } as unknown as ExcalidrawArrowElement);

    expect(geometry?.startControl).toEqual([70, 0]);
    expect(geometry?.endControl).toEqual([70, 60]);
  });

  it("offers the 16 boundary points and center from the YMJR rectangle fixture", () => {
    const points = getArrowSnapPointRatios(bindable("rectangle"));
    expect(points).toHaveLength(17);
    expect(points).toContainEqual([1, 0.25]);
    expect(points).toContainEqual([0.5, 1]);
    expect(points).toContainEqual([0.5, 0.5]);
  });

  it("snaps Points to the nearest rotated-safe candidate", () => {
    const rectangle = bindable("rectangle");
    const elementsMap = new Map([
      [rectangle.id, rectangle],
    ]) as NonDeletedSceneElementsMap;
    expect(
      snapPointToConnectionPoint(rectangle, pointFrom(303, 223), elementsMap),
    ).toEqual([300, 225]);
  });

  it("projects Edge onto an ellipse instead of its bounding box", () => {
    const ellipse = bindable("ellipse");
    const elementsMap = new Map([
      [ellipse.id, ellipse],
    ]) as NonDeletedSceneElementsMap;
    const edge = snapPointToElementEdge(
      ellipse,
      pointFrom(300, 225),
      elementsMap,
    );
    expect(edge[0]).toBeCloseTo(289.44, 1);
    expect(edge[1]).toBeCloseTo(227.64, 1);
  });
});
