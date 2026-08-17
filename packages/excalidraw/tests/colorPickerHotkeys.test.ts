import {
  COLOR_PALETTE,
  DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
} from "@excalidraw/common";

import type { ColorPaletteCustom } from "@excalidraw/common";

import { colorPickerKeyNavHandler } from "../components/ColorPicker/keyboardNavHandlers";

const handlerArgs = (
  key: string,
  palette: ColorPaletteCustom,
  onChange: (color: string) => void,
  excludedColors?: readonly string[],
  options: {
    code?: string;
    shiftKey?: boolean;
    color?: string | null;
  } = {},
) => ({
  event: {
    key,
    code: options.code ?? key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: options.shiftKey ?? false,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as React.KeyboardEvent,
  activeColorPickerSection: null,
  palette,
  color: options.color ?? null,
  onChange,
  customColors: [],
  setActiveColorPickerSection: () => {},
  updateData: () => {},
  activeShade: 1,
  onEyeDropperToggle: () => {},
  onEscape: () => {},
  excludedColors,
});

describe("color picker hotkeys", () => {
  it("reports an excluded (hidden) entry's hotkey as handled without selecting it", () => {
    // regression: returning "unhandled" let the key escape the modal and hit
    // global shortcuts (`q` toggles the tool lock; see the integration
    // regression in bucketFill.test.tsx)
    const onChange = vi.fn();
    const palette = {
      transparent: COLOR_PALETTE.transparent,
      red: "#ff0000",
    } as ColorPaletteCustom;

    const handled = colorPickerKeyNavHandler(
      handlerArgs("q", palette, onChange, [COLOR_PALETTE.transparent]),
    );

    expect(handled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports a hotkey past the end of a short custom palette as handled", () => {
    // a host-provided palette with fewer entries than hotkey bindings must
    // not leak the unbound keys either
    const onChange = vi.fn();
    const palette = { red: "#ff0000" } as ColorPaletteCustom;

    // `b` is the 15th binding — far past the single palette entry
    const handled = colorPickerKeyNavHandler(
      handlerArgs("b", palette, onChange),
    );

    expect(handled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still selects a present, non-excluded entry", () => {
    const onChange = vi.fn();
    const palette = {
      transparent: COLOR_PALETTE.transparent,
      red: "#ff0000",
    } as ColorPaletteCustom;

    const handled = colorPickerKeyNavHandler(
      handlerArgs("w", palette, onChange, [COLOR_PALETTE.transparent]),
    );

    expect(handled).toBe(true);
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it.each([
    ["n", "navy"],
    ["l", "lime"],
    ["m", "mint"],
    ["o", "olive"],
    ["p", "plum"],
    ["h", "coral"],
    ["j", "amber"],
    ["k", "chartreuse"],
    ["u", "forest"],
    ["y", "turquoise"],
    ["[", "azure"],
    ["]", "indigo"],
    [";", "lavender"],
    ["'", "magenta"],
    [",", "burgundy"],
  ] as const)("selects the expanded %s color family", (key, colorName) => {
    const onChange = vi.fn();
    const handled = colorPickerKeyNavHandler(
      handlerArgs(key, DEFAULT_ELEMENT_STROKE_COLOR_PALETTE, onChange),
    );

    expect(handled).toBe(true);
    expect(onChange).toHaveBeenCalledWith(COLOR_PALETTE[colorName][1]);
  });

  it.each([0, 1, 2, 3, 4] as const)(
    "keeps Shift+%s shade selection for an expanded color",
    (shade) => {
      const onChange = vi.fn();
      const handled = colorPickerKeyNavHandler(
        handlerArgs(
          "!",
          DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
          onChange,
          undefined,
          {
            code: `Digit${shade + 1}`,
            shiftKey: true,
            color: COLOR_PALETTE.navy[1],
          },
        ),
      );

      expect(handled).toBe(true);
      expect(onChange).toHaveBeenCalledWith(COLOR_PALETTE.navy[shade]);
    },
  );
});
