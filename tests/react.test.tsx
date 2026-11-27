import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import QuterDefault, { Quter, QRCode } from "../src/index";
import {
  blendQuterPixels,
  resolveImageDotSize,
  resolveImageFilter,
} from "../src/quter-pixels";

describe("QRCode", () => {
  it("keeps the default Quter export available", () => {
    expect(QuterDefault).toBe(Quter);
  });

  it("renders a styled, accessible SVG QR code", () => {
    const markup = renderToStaticMarkup(
      <QRCode
        value="https://example.com"
        dotStyle="rounded"
        corner={{ square: { style: "extra-rounded", color: "#14b8a6" } }}
        ariaLabel="Example QR code"
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("<title");
    expect(markup).toContain("Example QR code");
  });

  it("renders a separate background fill for each finder pattern", () => {
    const markup = renderToStaticMarkup(
      <QRCode
        value="https://example.com"
        backgroundColor="#ffffff"
        corner={{ backgroundColor: "#f3e7d4" }}
      />,
    );

    expect(markup.match(/fill="#f3e7d4"/g)).toHaveLength(3);
  });

  it("renders independent linear gradients for modules, background, and finder parts", () => {
    const markup = renderToStaticMarkup(
      <QRCode
        value="https://example.com"
        dotGradient={{ startColor: "#112233", endColor: "#445566", angle: 45 }}
        backgroundGradient={{ startColor: "#ffffff", endColor: "#eeeeff" }}
        corner={{
          square: {
            style: "extra-rounded",
            gradient: { startColor: "#ff0000", endColor: "#00ff00" },
          },
          dot: {
            style: "circle",
            gradient: { startColor: "#0000ff", endColor: "#ff00ff" },
          },
        }}
      />,
    );

    expect(markup.match(/<linearGradient/g)).toHaveLength(4);
    expect(markup).toContain('fill="url(#');
    expect(markup).toContain("stop-color");
  });

  it("renders the base QR and an image-composited canvas for Quter", () => {
    const markup = renderToStaticMarkup(
      <Quter value="https://example.com" imagePath="/portrait.png" />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("<canvas");
  });

  it("renders a normally styled QR when no artwork image is supplied", () => {
    const markup = renderToStaticMarkup(
      <Quter value="https://example.com" dotStyle="circle" />,
    );

    expect(markup).toContain("<svg");
    expect(markup).not.toContain("<canvas");
  });

  it("supports a separate center logo and image-based QR artwork", () => {
    const markup = renderToStaticMarkup(
      <Quter
        value="https://example.com"
        imagePath="/portrait.png"
        logo={{ src: "/brand.png" }}
        imageColor={false}
        imageDotSize={0.5}
        dotStyle="square"
        imageDotStyle="circle"
        version={4}
      />,
    );

    expect(markup).toContain("/brand.png");
    expect(markup).toContain("<canvas");
  });

  it("does not render a javascript URL as a logo", () => {
    const markup = renderToStaticMarkup(
      <Quter value="https://example.com" imagePath="javascript:alert(1)" />,
    );

    expect(markup).not.toContain("javascript:");
  });

  it("rejects image dot sizes outside the supported range", () => {
    expect(() =>
      renderToStaticMarkup(
        <Quter
          value="https://example.com"
          imagePath="/portrait.png"
          imageDotSize={1.1}
        />,
      ),
    ).toThrow("imageDotSize must be between 0 and 1.");
  });
});

describe("resolveImageFilter", () => {
  it("uses the boolean imageColor option and preserves the filter alias", () => {
    expect(resolveImageFilter(true)).toBe("color");
    expect(resolveImageFilter(false)).toBe("threshold");
    expect(resolveImageFilter(undefined, "color")).toBe("color");
    expect(resolveImageFilter(undefined)).toBe("threshold");
  });
});

describe("resolveImageDotSize", () => {
  it("defaults to the minimum data-dot size", () => {
    expect(resolveImageDotSize()).toBe(0);
  });

  it("accepts sizes from zero through one", () => {
    expect(resolveImageDotSize(0)).toBe(0);
    expect(resolveImageDotSize(0.1)).toBe(0.1);
    expect(resolveImageDotSize(0.38)).toBe(0.38);
    expect(resolveImageDotSize(0.6)).toBe(0.6);
    expect(resolveImageDotSize(1)).toBe(1);
  });
});

describe("blendQuterPixels", () => {
  it("reveals image pixels through unset finder backgrounds while retaining dark finder modules", () => {
    const matrixSize = 21;
    const width = matrixSize * 4;
    const qrPixels = new Uint8ClampedArray(width * width * 4);
    const imagePixels = new Uint8ClampedArray(width * width * 4);
    const whiteFinderPixel = (2 * width + 2) * 4;
    const whiteFinderDotPixel = (4 * width + 4) * 4;
    const darkFinderPixel = (3 * width + 3) * 4;

    for (let index = 0; index < qrPixels.length; index += 4) {
      qrPixels[index] = 255;
      qrPixels[index + 1] = 255;
      qrPixels[index + 2] = 255;
      qrPixels[index + 3] = 255;
      imagePixels[index] = 24;
      imagePixels[index + 1] = 96;
      imagePixels[index + 2] = 160;
      imagePixels[index + 3] = 255;
    }
    qrPixels[darkFinderPixel] = 0;
    qrPixels[darkFinderPixel + 1] = 0;
    qrPixels[darkFinderPixel + 2] = 0;
    const finderPixels = new Uint8ClampedArray(qrPixels);
    finderPixels[whiteFinderPixel + 3] = 0;

    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin: 0,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
      transparentFinderBackground: true,
      finderPixels,
    });

    expect(
      Array.from(result.slice(whiteFinderPixel, whiteFinderPixel + 4)),
    ).toEqual([24, 96, 160, 255]);
    expect(
      Array.from(result.slice(darkFinderPixel, darkFinderPixel + 3)),
    ).toEqual([0, 0, 0]);
    expect(
      Array.from(result.slice(whiteFinderDotPixel, whiteFinderDotPixel + 3)),
    ).toEqual([255, 255, 255]);

    const opaqueResult = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin: 0,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
      transparentFinderBackground: false,
    });
    expect(
      Array.from(opaqueResult.slice(whiteFinderPixel, whiteFinderPixel + 3)),
    ).toEqual([255, 255, 255]);
  });

  it("preserves both QR module values over dark image areas", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 8;
    const width = (matrixSize + margin * 2) * modulePixels;
    const qrPixels = new Uint8ClampedArray(width * width * 4);
    const imagePixels = new Uint8ClampedArray(width * width * 4);
    const darkCell = { x: 10, y: 10 };
    const lightCell = { x: 11, y: 10 };

    for (let y = 0; y < width; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        imagePixels[index] = 255;
        imagePixels[index + 1] = 255;
        imagePixels[index + 2] = 255;
        imagePixels[index + 3] = 255;
      }
    }

    for (const cell of [darkCell, lightCell]) {
      const startX = (margin + cell.x) * modulePixels;
      const startY = (margin + cell.y) * modulePixels;
      for (let y = 0; y < modulePixels; y += 1) {
        for (let x = 0; x < modulePixels; x += 1) {
          const index = ((startY + y) * width + startX + x) * 4;
          qrPixels[index + 3] = 255;
          imagePixels[index] = 20;
          imagePixels[index + 1] = 20;
          imagePixels[index + 2] = 20;
          if (cell === lightCell) {
            qrPixels[index] = 255;
            qrPixels[index + 1] = 255;
            qrPixels[index + 2] = 255;
          }
        }
      }
    }

    const options = {
      width,
      height: width,
      matrixSize,
      margin,
      coreSize: 1,
      filter: "color" as const,
      backgroundColor: [255, 255, 255] as const,
      backgroundAlpha: 255,
    };
    const result = blendQuterPixels(qrPixels, imagePixels, options);
    const pixelAt = (cell: { x: number; y: number }) =>
      (((margin + cell.y) * modulePixels + modulePixels / 2) * width +
        (margin + cell.x) * modulePixels +
        modulePixels / 2) *
      4;
    const darkPixel = pixelAt(darkCell);
    const lightPixel = pixelAt(lightCell);

    expect(Array.from(result.slice(darkPixel, darkPixel + 3))).toEqual([
      0, 0, 0,
    ]);
    expect(Array.from(result.slice(lightPixel, lightPixel + 3))).toEqual([
      255, 255, 255,
    ]);
  });

  it("preserves QR data centers and reveals source image pixels around them", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 8;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const cellX = (margin + 10) * modulePixels;
    const cellY = (margin + 10) * modulePixels;
    const dotIndex = ((cellY + 4) * width + cellX + 4) * 4;
    const imageIndex = ((cellY + 4) * width + cellX) * 4;
    const backgroundIndex = ((cellY + 4) * width + cellX + 7) * 4;
    const finderIndex =
      (margin * modulePixels * width + margin * modulePixels) * 4;

    for (let index = 0; index < pixelCount; index += 4) {
      qrPixels[index] = 255;
      qrPixels[index + 1] = 255;
      qrPixels[index + 2] = 255;
      imagePixels[index] = 255;
      imagePixels[index + 1] = 255;
      imagePixels[index + 2] = 255;
      qrPixels[index + 3] = 255;
      imagePixels[index + 3] = 255;
    }

    for (let y = 2; y < 6; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        const index = ((cellY + y) * width + cellX + x) * 4;
        qrPixels[index] = 0;
        qrPixels[index + 1] = 0;
        qrPixels[index + 2] = 0;
      }
    }
    qrPixels[finderIndex] = 0;
    qrPixels[finderIndex + 1] = 0;
    qrPixels[finderIndex + 2] = 0;
    imagePixels[imageIndex] = 30;
    imagePixels[imageIndex + 1] = 110;
    imagePixels[imageIndex + 2] = 220;
    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
    });

    expect(result[dotIndex]).toBe(0);
    expect(Array.from(result.slice(imageIndex, imageIndex + 3))).toEqual([
      30, 110, 220,
    ]);
    expect(result[backgroundIndex]).toBe(255);
    expect(result[finderIndex]).toBe(0);
    expect(result[0]).toBe(255);
  });

  it("blends an optional custom color over the photo between QR dots", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 8;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const gapIndex =
      ((margin + 10) * modulePixels * width + (margin + 10) * modulePixels) * 4;

    for (let index = 0; index < pixelCount; index += 4) {
      qrPixels[index + 3] = 255;
      imagePixels[index] = 0;
      imagePixels[index + 1] = 100;
      imagePixels[index + 2] = 200;
      imagePixels[index + 3] = 255;
    }

    const options = {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
      gapColor: [200, 0, 0, 128],
    } as const;
    const result = blendQuterPixels(qrPixels, imagePixels, options);

    expect(Array.from(result.slice(gapIndex, gapIndex + 4))).toEqual([
      100, 50, 100, 255,
    ]);
    const transparentResult = blendQuterPixels(qrPixels, imagePixels, {
      ...options,
      gapColor: [200, 0, 0, 0] as const,
    });
    expect(Array.from(transparentResult.slice(gapIndex, gapIndex + 4))).toEqual(
      [0, 100, 200, 255],
    );
  });

  it("lets image pixels show through transparent finder and data modules", () => {
    const matrixSize = 21;
    const modulePixels = 4;
    const width = matrixSize * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    for (let index = 0; index < pixelCount; index += 4) {
      imagePixels[index] = 30;
      imagePixels[index + 1] = 110;
      imagePixels[index + 2] = 220;
      imagePixels[index + 3] = 255;
    }

    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin: 0,
      coreSize: 1,
      dotStyle: "square",
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
    });
    const centerIndex =
      (2 * modulePixels + 2) * width * 4 + (2 * modulePixels + 2) * 4;
    const dataIndex =
      (10 * modulePixels + 2) * width * 4 + (10 * modulePixels + 2) * 4;

    expect(Array.from(result.slice(centerIndex, centerIndex + 4))).toEqual([
      30, 110, 220, 255,
    ]);
    expect(Array.from(result.slice(dataIndex, dataIndex + 4))).toEqual([
      30, 110, 220, 255,
    ]);
  });

  it("renders the source image in monochrome around the QR data centers", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 8;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const darkCellX = (margin + 10) * modulePixels;
    const darkCellY = (margin + 10) * modulePixels;
    const darkIndex = ((darkCellY + 4) * width + darkCellX + 4) * 4;
    const lightIndex =
      ((darkCellY + 4) * width + darkCellX + modulePixels + 4) * 4;

    for (let index = 0; index < pixelCount; index += 4) {
      qrPixels[index] = 255;
      qrPixels[index + 1] = 255;
      qrPixels[index + 2] = 255;
      qrPixels[index + 3] = 255;
      imagePixels[index] = 255;
      imagePixels[index + 1] = 255;
      imagePixels[index + 2] = 255;
      imagePixels[index + 3] = 255;
    }
    for (let y = 2; y < 6; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        const index = ((darkCellY + y) * width + darkCellX + x) * 4;
        qrPixels[index] = 0;
        qrPixels[index + 1] = 0;
        qrPixels[index + 2] = 0;
      }
    }
    imagePixels.fill(20, darkIndex, darkIndex + 3);
    imagePixels.fill(240, lightIndex, lightIndex + 3);

    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "threshold",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
    });

    expect(result[darkIndex]).toBeLessThan(128);
    expect(result[lightIndex]).toBeGreaterThan(200);
  });

  it("keeps the QR code visible when its source image matches the background", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 8;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const cellX = (margin + 10) * modulePixels;
    const cellY = (margin + 10) * modulePixels;

    for (let index = 0; index < pixelCount; index += 4) {
      qrPixels[index] = 255;
      qrPixels[index + 1] = 255;
      qrPixels[index + 2] = 255;
      qrPixels[index + 3] = 255;
      imagePixels[index] = 255;
      imagePixels[index + 1] = 255;
      imagePixels[index + 2] = 255;
      imagePixels[index + 3] = 255;
    }
    for (let y = 2; y < 6; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        const index = ((cellY + y) * width + cellX + x) * 4;
        qrPixels[index] = 0;
        qrPixels[index + 1] = 0;
        qrPixels[index + 2] = 0;
      }
    }
    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
    });

    const imageVisibleIndex = ((cellY + 2) * width + cellX) * 4;
    const dotVisibleIndex = ((cellY + 4) * width + cellX + 4) * 4;
    expect(result[imageVisibleIndex]).toBe(255);
    expect(result[dotVisibleIndex]).toBe(0);
    expect(result[dotVisibleIndex + 1]).toBe(0);
    expect(result[dotVisibleIndex + 2]).toBe(0);
    expect(result[0]).toBe(255);
  });

  it("keeps a reserved center-logo area clear of the artwork", () => {
    const matrixSize = 21;
    const margin = 4;
    const width = (matrixSize + margin * 2) * 3;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const centerIndex = ((margin + 10) * 3 * width + (margin + 10) * 3) * 4;

    for (let index = 3; index < pixelCount; index += 4) {
      qrPixels[index] = 255;
      imagePixels[index] = 255;
    }
    imagePixels.fill(180, 0, pixelCount);

    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin,
      clear: { x: 8, y: 8, width: 5, height: 5 },
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
    });

    expect(result[centerIndex]).toBe(255);
  });

  it("preserves both dark and light module centers over opposing image colors", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 8;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const darkCell = { x: 10, y: 10 };
    const lightCell = { x: 11, y: 10 };

    for (let index = 0; index < pixelCount; index += 4) {
      qrPixels[index] = 255;
      qrPixels[index + 1] = 255;
      qrPixels[index + 2] = 255;
      qrPixels[index + 3] = 255;
      imagePixels[index] = 128;
      imagePixels[index + 1] = 128;
      imagePixels[index + 2] = 128;
      imagePixels[index + 3] = 255;
    }

    for (const [cell, color] of [
      [darkCell, 255],
      [lightCell, 0],
    ] as const) {
      const startX = (margin + cell.x) * modulePixels;
      const startY = (margin + cell.y) * modulePixels;
      for (let y = 0; y < modulePixels; y += 1) {
        for (let x = 0; x < modulePixels; x += 1) {
          const index = ((startY + y) * width + startX + x) * 4;
          imagePixels[index] = color;
          imagePixels[index + 1] = color;
          imagePixels[index + 2] = color;
        }
      }

      if (cell === darkCell) {
        for (let y = 2; y < 6; y += 1) {
          for (let x = 2; x < 6; x += 1) {
            const index = ((startY + y) * width + startX + x) * 4;
            qrPixels[index] = 0;
            qrPixels[index + 1] = 0;
            qrPixels[index + 2] = 0;
          }
        }
      }
    }

    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
    });
    const corePixel = (cell: { x: number; y: number }) =>
      (((margin + cell.y) * modulePixels + 4) * width +
        (margin + cell.x) * modulePixels +
        4) *
      4;
    const darkCoreIndex = corePixel(darkCell);
    const lightCoreIndex = corePixel(lightCell);
    const imagePixel =
      (((margin + darkCell.y) * modulePixels + 1) * width +
        (margin + darkCell.x) * modulePixels +
        1) *
      4;

    expect(Array.from(result.slice(darkCoreIndex, darkCoreIndex + 3))).toEqual([
      0, 0, 0,
    ]);
    expect(
      Array.from(result.slice(lightCoreIndex, lightCoreIndex + 3)),
    ).toEqual([255, 255, 255]);
    expect(Array.from(result.slice(imagePixel, imagePixel + 3))).toEqual([
      255, 255, 255,
    ]);
  });

  it("keeps every data module distinct across a sharp black-and-white image split", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 12;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const splitX = (margin + matrixSize / 2) * modulePixels;

    for (let y = 0; y < width; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const cellX = Math.floor(x / modulePixels) - margin;
        const cellY = Math.floor(y / modulePixels) - margin;
        const isDark = cellX >= 0 && cellY >= 0 && (cellX + cellY) % 2 === 0;
        const imageColor = x < splitX ? 0 : 255;
        qrPixels[index] = isDark ? 0 : 255;
        qrPixels[index + 1] = isDark ? 0 : 255;
        qrPixels[index + 2] = isDark ? 0 : 255;
        qrPixels[index + 3] = 255;
        imagePixels[index] = imageColor;
        imagePixels[index + 1] = imageColor;
        imagePixels[index + 2] = imageColor;
        imagePixels[index + 3] = 255;
      }
    }

    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
    });

    for (let cellY = 0; cellY < matrixSize; cellY += 1) {
      for (let cellX = 0; cellX < matrixSize; cellX += 1) {
        const isFinder =
          (cellX < 8 && cellY < 8) ||
          (cellX >= matrixSize - 8 && cellY < 8) ||
          (cellX < 8 && cellY >= matrixSize - 8);
        if (isFinder) {
          continue;
        }

        const sampleX = (margin + cellX) * modulePixels + modulePixels / 2;
        const sampleY = (margin + cellY) * modulePixels + modulePixels / 2;
        const sampleIndex = (sampleY * width + sampleX) * 4;
        const expected = (cellX + cellY) % 2 === 0 ? 0 : 255;
        expect(result[sampleIndex]).toBe(expected);
      }
    }

    const imageIndex =
      ((margin + 10) * modulePixels + 1) * width * 4 +
      ((margin + 2) * modulePixels + 1) * 4;
    expect(result[imageIndex]).toBe(0);
  });

  it("reveals more artwork with smaller image dots while preserving the module center", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 12;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const cellX = (margin + 10) * modulePixels;
    const cellY = (margin + 10) * modulePixels;

    for (let index = 0; index < pixelCount; index += 4) {
      qrPixels[index] = 255;
      qrPixels[index + 1] = 255;
      qrPixels[index + 2] = 255;
      qrPixels[index + 3] = 255;
      imagePixels[index] = 255;
      imagePixels[index + 1] = 255;
      imagePixels[index + 2] = 255;
      imagePixels[index + 3] = 255;
    }
    for (let y = 0; y < modulePixels; y += 1) {
      for (let x = 0; x < modulePixels; x += 1) {
        const index = ((cellY + y) * width + cellX + x) * 4;
        qrPixels[index] = 0;
        qrPixels[index + 1] = 0;
        qrPixels[index + 2] = 0;
      }
    }

    const baseOptions = {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "color" as const,
      backgroundColor: [255, 255, 255] as const,
      backgroundAlpha: 255,
    };
    const standard = blendQuterPixels(qrPixels, imagePixels, baseOptions);
    const smaller = blendQuterPixels(qrPixels, imagePixels, {
      ...baseOptions,
      coreSize: 0.3,
    });
    const edgeIndex = ((cellY + 6) * width + cellX + 4) * 4;
    const artworkIndex = ((cellY + 6) * width + cellX + 2) * 4;
    const centerIndex = ((cellY + 6) * width + cellX + 6) * 4;

    expect(standard[edgeIndex]).toBe(0);
    expect(smaller[edgeIndex]).toBe(255);
    expect(standard[artworkIndex]).toBe(255);
    expect(smaller[centerIndex]).toBe(0);
  });

  it("keeps a zero-size setting visible as one output pixel per module", () => {
    const matrixSize = 21;
    const margin = 4;
    const modulePixels = 12;
    const width = (matrixSize + margin * 2) * modulePixels;
    const pixelCount = width * width * 4;
    const qrPixels = new Uint8ClampedArray(pixelCount);
    const imagePixels = new Uint8ClampedArray(pixelCount);
    const cellX = (margin + 10) * modulePixels;
    const cellY = (margin + 10) * modulePixels;

    for (let index = 0; index < pixelCount; index += 4) {
      qrPixels[index] = 255;
      qrPixels[index + 1] = 255;
      qrPixels[index + 2] = 255;
      qrPixels[index + 3] = 255;
      imagePixels[index] = 255;
      imagePixels[index + 1] = 255;
      imagePixels[index + 2] = 255;
      imagePixels[index + 3] = 255;
    }
    for (let y = 0; y < modulePixels; y += 1) {
      for (let x = 0; x < modulePixels; x += 1) {
        const index = ((cellY + y) * width + cellX + x) * 4;
        qrPixels[index] = 0;
        qrPixels[index + 1] = 0;
        qrPixels[index + 2] = 0;
      }
    }

    const result = blendQuterPixels(qrPixels, imagePixels, {
      width,
      height: width,
      matrixSize,
      margin,
      filter: "color",
      backgroundColor: [255, 255, 255],
      backgroundAlpha: 255,
      coreSize: 0,
      minCoreSize: 1 / modulePixels,
    });
    const centerIndex = ((cellY + 6) * width + cellX + 6) * 4;
    const surroundingIndex = ((cellY + 4) * width + cellX + 4) * 4;

    expect(result[centerIndex]).toBe(0);
    expect(result[surroundingIndex]).toBe(255);
  });
});
