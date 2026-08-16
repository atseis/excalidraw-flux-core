import { queries, buildQueries } from "@testing-library/react";

import { TOOL_TYPE } from "@excalidraw/common";

import type { ToolType } from "@excalidraw/excalidraw/types";

const _getAllByToolName = (container: HTMLElement, tool: ToolType | "lock") => {
  //zsviczian: Obsidian exposes extra ToolType values such as mermaid that are
  // not keys in the upstream toolbar constant.
  const toolTitle =
    tool === "lock"
      ? "lock"
      : tool in TOOL_TYPE
      ? TOOL_TYPE[tool as keyof typeof TOOL_TYPE]
      : tool;
  return (
    queries
      .getAllByTestId(container, `toolbar-${toolTitle}`)
      // an open ToolPopover renders options with the same testids as the
      // toolbar buttons — "by tool name" means the toolbar-level button
      .filter((el) => !el.closest(".tool-popover-content"))
  );
};

const getMultipleError = (_container: any, tool: any) =>
  `Found multiple elements with tool name: ${tool}`;
const getMissingError = (_container: any, tool: any) =>
  `Unable to find an element with tool name: ${tool}`;

export const [
  queryByToolName,
  getAllByToolName,
  getByToolName,
  findAllByToolName,
  findByToolName,
] = buildQueries<(ToolType | "lock")[]>(
  _getAllByToolName,
  getMultipleError,
  getMissingError,
);
