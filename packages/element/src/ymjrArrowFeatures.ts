/**
 * Obsidian fork helpers for the independently reconstructed YMJR arrow
 * serialization contract.
 *
 * Purpose:
 *   Keep `customData.snap`, `customData.curveArrow`, and the full-length
 *   `block_arrow` geometry isolated from upstream Excalidraw code so the fork
 *   can be rebased and regression-tested against newer upstream releases.
 *
 * Author:
 *   OpenAI Codex, for the local zsviczian/Obsidian fork.
 *
 * Reference:
 *   The user's read-only YMJR sample drawing serializes the full block arrow as
 *   `endArrowhead: "block_arrow"` with a 16 px shaft, 40 px head, and 32 px
 *   head length at stroke width 2.
 *
 * zsviczian -- local YMJR-parity reconstruction for the Obsidian consumer.
 */
import {
  bezierEquation,
  clamp,
  curve,
  curveCatmullRomCubicApproxPoints,
  pointDistanceSq,
  pointFrom,
  pointRotateRads,
  type GlobalPoint,
  type LocalPoint,
  type Radians,
} from "@excalidraw/math";

import { elementCenterPoint } from "./bounds";

import type {
  ElementsMap,
  ExcalidrawArrowElement,
  ExcalidrawBindableElement,
  FixedPoint,
} from "./types";

export type ArrowSnapMode = "none" | "points" | "edge";

export type BlockArrowGeometryElement = Pick<
  ExcalidrawArrowElement,
  | "points"
  | "startArrowhead"
  | "endArrowhead"
  | "strokeWidth"
  | "roundness"
  | "elbowed"
  | "customData"
  | "startBinding"
  | "endBinding"
>;

const BLOCK_ARROW_MIN_SHAFT_WIDTH = 16;
const BLOCK_ARROW_HEAD_WIDTH_RATIO = 2.5;
const BLOCK_ARROW_HEAD_LENGTH_RATIO = 0.8;
const BLOCK_ARROW_MAX_HEAD_PATH_RATIO = 0.45;
const BLOCK_ARROW_CURVE_SAMPLE_SPACING = 8;
const BLOCK_ARROW_MIN_CURVE_STEPS = 12;
const BLOCK_ARROW_MAX_CURVE_STEPS = 64;
const BLOCK_ARROW_MITER_LIMIT = 4;
const BLOCK_ARROW_POINT_EPSILON = 0.000001;

const pointsAreEqual = (a: LocalPoint, b: LocalPoint) =>
  Math.abs(a[0] - b[0]) <= BLOCK_ARROW_POINT_EPSILON &&
  Math.abs(a[1] - b[1]) <= BLOCK_ARROW_POINT_EPSILON;

const removeConsecutiveDuplicatePoints = (
  points: readonly LocalPoint[],
): LocalPoint[] => {
  const result: LocalPoint[] = [];
  for (const point of points) {
    if (!result.length || !pointsAreEqual(result[result.length - 1], point)) {
      result.push(pointFrom<LocalPoint>(point[0], point[1]));
    }
  }
  return result;
};

const sampleCubicCurve = (
  start: LocalPoint,
  startControl: LocalPoint,
  endControl: LocalPoint,
  end: LocalPoint,
): LocalPoint[] => {
  const estimatedLength =
    Math.hypot(startControl[0] - start[0], startControl[1] - start[1]) +
    Math.hypot(
      endControl[0] - startControl[0],
      endControl[1] - startControl[1],
    ) +
    Math.hypot(end[0] - endControl[0], end[1] - endControl[1]);
  const steps = clamp(
    Math.ceil(estimatedLength / BLOCK_ARROW_CURVE_SAMPLE_SPACING),
    BLOCK_ARROW_MIN_CURVE_STEPS,
    BLOCK_ARROW_MAX_CURVE_STEPS,
  );
  const cubic = curve(start, startControl, endControl, end);
  return Array.from({ length: steps + 1 }, (_, index) =>
    bezierEquation(cubic, index / steps),
  );
};

const getBlockArrowCenterline = (
  element: BlockArrowGeometryElement,
): LocalPoint[] => {
  if (element.customData?.curveArrow) {
    const geometry = getCurveArrowGeometry(element);
    if (geometry) {
      return sampleCubicCurve(
        geometry.start,
        geometry.startControl,
        geometry.endControl,
        geometry.end,
      );
    }
  }

  if (!element.elbowed && element.roundness && element.points.length > 2) {
    const curves = curveCatmullRomCubicApproxPoints(
      element.points.map((point) => pointFrom<LocalPoint>(point[0], point[1])),
    );
    if (curves) {
      const sampled: LocalPoint[] = [];
      curves.forEach(([start, startControl, endControl, end], index) => {
        const segment = sampleCubicCurve(start, startControl, endControl, end);
        sampled.push(...(index === 0 ? segment : segment.slice(1)));
      });
      return removeConsecutiveDuplicatePoints(sampled);
    }
  }

  // The verified YMJR elbow examples use the serialized orthogonal points as
  // sharp polygon corners rather than the rounded path used by normal elbows.
  return removeConsecutiveDuplicatePoints(element.points);
};

const getPolylineMetrics = (points: readonly LocalPoint[]) => {
  const vertexDistances = [0];
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index++) {
    const length = Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    );
    segmentLengths.push(length);
    totalLength += length;
    vertexDistances.push(totalLength);
  }
  return { segmentLengths, totalLength, vertexDistances };
};

const pointAtPolylineDistance = (
  points: readonly LocalPoint[],
  segmentLengths: readonly number[],
  distance: number,
): LocalPoint => {
  let traversed = 0;
  for (let index = 0; index < segmentLengths.length; index++) {
    const segmentLength = segmentLengths[index];
    if (distance <= traversed + segmentLength || index === points.length - 2) {
      const ratio = segmentLength
        ? clamp((distance - traversed) / segmentLength, 0, 1)
        : 0;
      return pointFrom<LocalPoint>(
        points[index][0] + (points[index + 1][0] - points[index][0]) * ratio,
        points[index][1] + (points[index + 1][1] - points[index][1]) * ratio,
      );
    }
    traversed += segmentLength;
  }
  return points[points.length - 1];
};

const slicePolyline = (
  points: readonly LocalPoint[],
  startDistance: number,
  endDistance: number,
): LocalPoint[] => {
  const { segmentLengths, vertexDistances } = getPolylineMetrics(points);
  const result = [
    pointAtPolylineDistance(points, segmentLengths, startDistance),
  ];
  for (let index = 1; index < points.length - 1; index++) {
    if (
      vertexDistances[index] > startDistance &&
      vertexDistances[index] < endDistance
    ) {
      result.push(points[index]);
    }
  }
  const end = pointAtPolylineDistance(points, segmentLengths, endDistance);
  if (!pointsAreEqual(result[result.length - 1], end)) {
    result.push(end);
  }
  return result;
};

const normalizedDirection = (
  start: LocalPoint,
  end: LocalPoint,
): readonly [number, number] => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  return [dx / length, dy / length];
};

const offsetPoint = (
  point: LocalPoint,
  direction: readonly [number, number],
  distance: number,
): LocalPoint =>
  pointFrom<LocalPoint>(
    point[0] - direction[1] * distance,
    point[1] + direction[0] * distance,
  );

const intersectOffsetLines = (
  point: LocalPoint,
  previousDirection: readonly [number, number],
  nextDirection: readonly [number, number],
  distance: number,
): LocalPoint => {
  const previousOffset = offsetPoint(point, previousDirection, distance);
  const nextOffset = offsetPoint(point, nextDirection, distance);
  const cross =
    previousDirection[0] * nextDirection[1] -
    previousDirection[1] * nextDirection[0];
  if (Math.abs(cross) <= BLOCK_ARROW_POINT_EPSILON) {
    return previousOffset;
  }
  const offsetDeltaX = nextOffset[0] - previousOffset[0];
  const offsetDeltaY = nextOffset[1] - previousOffset[1];
  const intersectionDistance =
    (offsetDeltaX * nextDirection[1] - offsetDeltaY * nextDirection[0]) / cross;
  const intersection = pointFrom<LocalPoint>(
    previousOffset[0] + previousDirection[0] * intersectionDistance,
    previousOffset[1] + previousDirection[1] * intersectionDistance,
  );
  if (
    Math.hypot(intersection[0] - point[0], intersection[1] - point[1]) <=
    Math.abs(distance) * BLOCK_ARROW_MITER_LIMIT
  ) {
    return intersection;
  }

  const normalX =
    -previousDirection[1] * Math.sign(distance) -
    nextDirection[1] * Math.sign(distance);
  const normalY =
    previousDirection[0] * Math.sign(distance) +
    nextDirection[0] * Math.sign(distance);
  const normalLength = Math.hypot(normalX, normalY);
  return normalLength
    ? pointFrom<LocalPoint>(
        point[0] + (normalX / normalLength) * Math.abs(distance),
        point[1] + (normalY / normalLength) * Math.abs(distance),
      )
    : previousOffset;
};

const offsetPolyline = (
  points: readonly LocalPoint[],
  distance: number,
): LocalPoint[] => {
  const result = [
    offsetPoint(points[0], normalizedDirection(points[0], points[1]), distance),
  ];
  for (let index = 1; index < points.length - 1; index++) {
    result.push(
      intersectOffsetLines(
        points[index],
        normalizedDirection(points[index - 1], points[index]),
        normalizedDirection(points[index], points[index + 1]),
        distance,
      ),
    );
  }
  result.push(
    offsetPoint(
      points[points.length - 1],
      normalizedDirection(points[points.length - 2], points[points.length - 1]),
      distance,
    ),
  );
  return result;
};

/**
 * Returns the closed, full-length block-arrow outline in element-local
 * coordinates. Orthogonal routes use exact mitered offsets matching the
 * verified YMJR elbow samples. Round and automatic curves first sample their
 * canonical cubic centerline, then use the same closed-outline construction.
 *
 * The point order deliberately matches the sample SVG for a left-to-right end
 * block arrow: shaft bottom, head shoulder bottom, tip, head shoulder top,
 * shaft top, then back to the start.
 */
export const getBlockArrowPolygon = (
  element: BlockArrowGeometryElement,
): readonly LocalPoint[] | null => {
  const startIsBlock = element.startArrowhead?.startsWith("block_arrow");
  const endIsBlock = element.endArrowhead?.startsWith("block_arrow");
  if (!startIsBlock && !endIsBlock) {
    return null;
  }

  const centerline = getBlockArrowCenterline(element);
  if (centerline.length < 2) {
    return null;
  }
  const { totalLength } = getPolylineMetrics(centerline);
  if (totalLength < 1) {
    return null;
  }

  const start = centerline[0];
  const end = centerline[centerline.length - 1];
  const shaftWidth = Math.max(
    BLOCK_ARROW_MIN_SHAFT_WIDTH,
    element.strokeWidth * 6,
  );
  const shaftHalfWidth = shaftWidth / 2;
  const headWidth = shaftWidth * BLOCK_ARROW_HEAD_WIDTH_RATIO;
  const headHalfWidth = headWidth / 2;
  const headLength = Math.min(
    headWidth * BLOCK_ARROW_HEAD_LENGTH_RATIO,
    totalLength * BLOCK_ARROW_MAX_HEAD_PATH_RATIO,
  );
  const body = slicePolyline(
    centerline,
    startIsBlock ? headLength : 0,
    totalLength - (endIsBlock ? headLength : 0),
  );
  if (body.length < 2) {
    return null;
  }

  const positiveSide = offsetPolyline(body, shaftHalfWidth);
  const negativeSide = offsetPolyline(body, -shaftHalfWidth);
  const bodyStart = body[0];
  const bodyEnd = body[body.length - 1];
  const polygon: LocalPoint[] = [];

  if (startIsBlock) {
    const startDirection = normalizedDirection(start, bodyStart);
    polygon.push(
      start,
      offsetPoint(bodyStart, startDirection, headHalfWidth),
      ...positiveSide,
    );
  } else {
    polygon.push(...positiveSide);
  }
  if (endIsBlock) {
    const endDirection = normalizedDirection(bodyEnd, end);
    polygon.push(
      offsetPoint(bodyEnd, endDirection, headHalfWidth),
      end,
      offsetPoint(bodyEnd, endDirection, -headHalfWidth),
    );
  }
  polygon.push(...negativeSide.reverse());
  if (startIsBlock) {
    const startDirection = normalizedDirection(start, bodyStart);
    polygon.push(offsetPoint(bodyStart, startDirection, -headHalfWidth));
  }

  return polygon;
};

export const getArrowSnapMode = (
  element: Pick<ExcalidrawArrowElement, "customData">,
): ArrowSnapMode => {
  const snap = element.customData?.snap;
  if (snap === true || snap === "points") {
    return "points";
  }
  return snap === "edge" ? "edge" : "none";
};

/**
 * Connection points are expressed as ratios of an element's unrotated bounds.
 * Keeping the ratios in the binding makes connections stable across move,
 * resize and rotation operations.
 */
export const getArrowSnapPointRatios = (
  element: ExcalidrawBindableElement,
): readonly FixedPoint[] => {
  if (element.type === "ellipse") {
    const points: FixedPoint[] = [];
    for (let index = 0; index < 16; index++) {
      const angle = (2 * Math.PI * index) / 16;
      points.push([
        0.5 + 0.5 * Math.cos(angle),
        0.5 + 0.5 * Math.sin(angle),
      ] as FixedPoint);
    }
    return points;
  }

  if (element.type === "diamond") {
    const corners: readonly FixedPoint[] = [
      [0.5, 0] as FixedPoint,
      [1, 0.5] as FixedPoint,
      [0.5, 1] as FixedPoint,
      [0, 0.5] as FixedPoint,
    ];
    const points: FixedPoint[] = [];
    corners.forEach((start, index) => {
      const end = corners[(index + 1) % corners.length];
      for (const ratio of [0, 0.25, 0.5, 0.75]) {
        points.push([
          start[0] + (end[0] - start[0]) * ratio,
          start[1] + (end[1] - start[1]) * ratio,
        ] as FixedPoint);
      }
    });
    return points;
  }

  const points: FixedPoint[] = [];
  for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
    points.push([ratio, 0] as FixedPoint, [ratio, 1] as FixedPoint);
  }
  for (const ratio of [0.25, 0.5, 0.75]) {
    points.push([0, ratio] as FixedPoint, [1, ratio] as FixedPoint);
  }
  if (element.type === "rectangle") {
    // zsviczian -- the authoritative YMJR Points overlay exposes the
    // rectangle center in addition to its 16 boundary candidates.
    points.push([0.5, 0.5] as FixedPoint);
  }
  return points;
};

export const fixedPointToGlobal = (
  fixedPoint: readonly [number, number],
  element: ExcalidrawBindableElement,
  elementsMap: ElementsMap,
): GlobalPoint =>
  pointRotateRads(
    pointFrom<GlobalPoint>(
      element.x + element.width * fixedPoint[0],
      element.y + element.height * fixedPoint[1],
    ),
    elementCenterPoint(element, elementsMap),
    element.angle,
  );

export const snapPointToConnectionPoint = (
  element: ExcalidrawBindableElement,
  point: GlobalPoint,
  elementsMap: ElementsMap,
): GlobalPoint => {
  let nearest = point;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const ratio of getArrowSnapPointRatios(element)) {
    const candidate = fixedPointToGlobal(ratio, element, elementsMap);
    const distance = pointDistanceSq(point, candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
};

/** Projects a pointer to the actual outline of the supported bindable shape. */
export const snapPointToElementEdge = (
  element: ExcalidrawBindableElement,
  point: GlobalPoint,
  elementsMap: ElementsMap,
): GlobalPoint => {
  const center = elementCenterPoint(element, elementsMap);
  const local = pointRotateRads(point, center, -element.angle as Radians);
  const width = Math.max(element.width, 0.0001);
  const height = Math.max(element.height, 0.0001);
  const normalizedX = (local[0] - element.x) / width;
  const normalizedY = (local[1] - element.y) / height;

  let xRatio: number;
  let yRatio: number;

  if (element.type === "ellipse") {
    const dx = normalizedX - 0.5;
    const dy = normalizedY - 0.5;
    const length = Math.hypot(dx / 0.5, dy / 0.5) || 1;
    xRatio = 0.5 + dx / length;
    yRatio = 0.5 + dy / length;
  } else if (element.type === "diamond") {
    const dx = normalizedX - 0.5;
    const dy = normalizedY - 0.5;
    const scale = 0.5 / (Math.abs(dx) + Math.abs(dy) || 1);
    xRatio = 0.5 + dx * scale;
    yRatio = 0.5 + dy * scale;
  } else {
    xRatio = clamp(normalizedX, 0, 1);
    yRatio = clamp(normalizedY, 0, 1);
    const distances = [xRatio, 1 - xRatio, yRatio, 1 - yRatio];
    const nearestSide = distances.indexOf(Math.min(...distances));
    if (nearestSide === 0) {
      xRatio = 0;
    } else if (nearestSide === 1) {
      xRatio = 1;
    } else if (nearestSide === 2) {
      yRatio = 0;
    } else {
      yRatio = 1;
    }
  }

  return fixedPointToGlobal(
    [xRatio, yRatio] as FixedPoint,
    element,
    elementsMap,
  );
};

/**
 * Moves a discrete/edge snap point to the external orbit gap required by
 * Excalidraw elbow bindings. The normal is calculated in the target's local
 * coordinate space so rotated rectangles, ellipses, and diamonds retain the
 * selected connection candidate.
 */
export const offsetArrowSnapPointToOrbit = (
  element: ExcalidrawBindableElement,
  point: GlobalPoint,
  gap: number,
  elementsMap: ElementsMap,
): GlobalPoint => {
  const center = elementCenterPoint(element, elementsMap);
  const local = pointRotateRads(point, center, -element.angle as Radians);
  const width = Math.max(Math.abs(element.width), 0.0001);
  const height = Math.max(Math.abs(element.height), 0.0001);
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const dx = local[0] - centerX;
  const dy = local[1] - centerY;
  let normalX = 0;
  let normalY = 0;

  if (element.type === "ellipse") {
    normalX = dx / Math.pow(width / 2, 2);
    normalY = dy / Math.pow(height / 2, 2);
  } else if (element.type === "diamond") {
    normalX = Math.sign(dx) / (width / 2);
    normalY = Math.sign(dy) / (height / 2);
  } else {
    const xRatio = (local[0] - element.x) / width;
    const yRatio = (local[1] - element.y) / height;
    const distances = [
      Math.abs(xRatio),
      Math.abs(1 - xRatio),
      Math.abs(yRatio),
      Math.abs(1 - yRatio),
    ];
    const nearestDistance = Math.min(...distances);
    // A center candidate is an inside binding focus, not an outline point.
    if (nearestDistance > BLOCK_ARROW_POINT_EPSILON) {
      return point;
    }
    const nearestSide = distances.indexOf(nearestDistance);
    [normalX, normalY] =
      nearestSide === 0
        ? [-1, 0]
        : nearestSide === 1
        ? [1, 0]
        : nearestSide === 2
        ? [0, -1]
        : [0, 1];
  }

  const normalLength = Math.hypot(normalX, normalY);
  if (!normalLength) {
    return point;
  }
  const orbitLocal = pointFrom<GlobalPoint>(
    local[0] + (normalX / normalLength) * gap,
    local[1] + (normalY / normalLength) * gap,
  );
  return pointRotateRads(orbitLocal, center, element.angle);
};

const directionForFixedPoint = (
  fixedPoint: readonly [number, number] | undefined,
  fallback: readonly [number, number],
): readonly [number, number] => {
  if (!fixedPoint) {
    return fallback;
  }
  const dx = fixedPoint[0] - 0.5;
  const dy = fixedPoint[1] - 0.5;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [dx >= 0 ? 1 : -1, 0];
  }
  return [0, dy >= 0 ? 1 : -1];
};

export type CurveArrowGeometry = {
  path: string;
  start: LocalPoint;
  end: LocalPoint;
  startControl: LocalPoint;
  endControl: LocalPoint;
};

/**
 * Builds the automatic orthogonal-tangent cubic used by YMJR-compatible
 * `customData.curveArrow` elements. Only the first and final user points are
 * authoritative; the control points are derived deterministically.
 */
export const getCurveArrowGeometry = (
  element: Pick<
    ExcalidrawArrowElement,
    "points" | "startBinding" | "endBinding"
  >,
): CurveArrowGeometry | null => {
  if (element.points.length < 2) {
    return null;
  }

  const start = element.points[0];
  const end = element.points[element.points.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const startFallback: readonly [number, number] = horizontal
    ? [dx >= 0 ? 1 : -1, 0]
    : [0, dy >= 0 ? 1 : -1];
  const endFallback: readonly [number, number] = [
    -startFallback[0],
    -startFallback[1],
  ];
  const startDirection = directionForFixedPoint(
    element.startBinding?.fixedPoint,
    startFallback,
  );
  const endDirection = directionForFixedPoint(
    element.endBinding?.fixedPoint,
    endFallback,
  );
  const startDimension = startDirection[0] !== 0 ? Math.abs(dx) : Math.abs(dy);
  const endDimension = endDirection[0] !== 0 ? Math.abs(dx) : Math.abs(dy);
  const startDistance = clamp(startDimension * 0.5, 30, 300);
  const endDistance = clamp(endDimension * 0.5, 30, 300);
  const startControl = pointFrom<LocalPoint>(
    start[0] + startDirection[0] * startDistance,
    start[1] + startDirection[1] * startDistance,
  );
  const endControl = pointFrom<LocalPoint>(
    end[0] + endDirection[0] * endDistance,
    end[1] + endDirection[1] * endDistance,
  );

  return {
    path: `M ${start[0]} ${start[1]} C ${startControl[0]} ${startControl[1]}, ${endControl[0]} ${endControl[1]}, ${end[0]} ${end[1]}`,
    start,
    end,
    startControl,
    endControl,
  };
};
