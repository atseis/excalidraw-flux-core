import { getFontFamilyString } from "@excalidraw/common";

import type { FontFamilyValues } from "@excalidraw/element/types";

import { getFontFamilies, registerCustomFont } from "../obsidianUtils";

describe("YMJR-compatible vault fonts", () => {
  it("registers a stable numeric font that is available to rendering and the picker", () => {
    const family = "YMJR Test Font";
    const familyId = 1_901_814_001;

    expect(
      registerCustomFont(
        family,
        familyId,
        {
          metrics: {
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            lineHeight: 1.2,
          },
        },
        "data:font/woff2;base64,d09GMg==",
      ),
    ).toBe(familyId);

    expect(
      getFontFamilyString({
        fontFamily: familyId as FontFamilyValues,
      }),
    ).toBe(`${family}, sans-serif, Segoe UI Emoji`);
    expect(getFontFamilies()).toContain(family);
  });

  it("renders legacy YMJR string font-family values as CSS families", () => {
    expect(
      getFontFamilyString({
        fontFamily: '"JTNC"' as unknown as FontFamilyValues,
      }),
    ).toBe('"JTNC", sans-serif');
  });
});
