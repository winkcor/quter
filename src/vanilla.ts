import { buildQR, toSVGString } from "./core";
import type { CoreLogoOptions, QRCodeOptions } from "./core";
import {
  blendQuterPixels,
  paintQuterBackground,
  resolveImageDotSize,
  resolveImageFilter,
} from "./quter-pixels";
import type { QuterFilter } from "./quter-pixels";

export type QuterOptions = QRCodeOptions & {
  imagePath?: string;
  imageDotStyle?: QRCodeOptions["dotStyle"];
  imageDotSize?: number;
  imageColor?: boolean;
  filter?: QuterFilter;
  fillType?: "scale_to_fit" | "fill";
  ariaLabel?: string;
  onImageError?: (error: Error) => void;
};

function safeImageSource(source: string): boolean {
  return (
    !/^\s*(?:javascript|vbscript):/i.test(source) &&
    !/^data:(?!image\/)/i.test(source)
  );
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("An image could not be loaded for the QR code."));
    image.src = source;
  });
}

function readColor(color: string): [number, number, number, number] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return [pixel[0], pixel[1], pixel[2], pixel[3]];
}

function drawImageInArea(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fillType: "scale_to_fit" | "fill",
): void {
  const scale =
    fillType === "fill"
      ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
      : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function appendSVG(target: HTMLElement, options: QuterOptions): void {
  const svg = toSVGString({
    ...options,
    ariaLabel: options.ariaLabel ?? `QR code: ${options.value}`,
  });
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  target.replaceChildren(document.importNode(parsed.documentElement, true));
}

async function renderImageQR(
  target: HTMLElement,
  options: QuterOptions,
  isDisposed: () => boolean,
): Promise<void> {
  const {
    imagePath,
    imageDotSize,
    imageDotStyle,
    imageColor,
    filter,
    fillType = "scale_to_fit",
    logo,
    ...qrOptions
  } = options;
  if (!imagePath || !safeImageSource(imagePath)) {
    throw new Error("The image URL uses an unsupported scheme.");
  }
  if (logo?.src && !safeImageSource(logo.src)) {
    throw new Error("The center image URL uses an unsupported scheme.");
  }
  if (fillType !== "scale_to_fit" && fillType !== "fill") {
    throw new Error('The image fill type must be "scale_to_fit" or "fill".');
  }
  const artworkImagePromise = loadImage(imagePath);
  const logoImagePromise = logo?.src
    ? loadImage(logo.src)
    : Promise.resolve(undefined);
  const [artworkImage, logoImage] = await Promise.all([
    artworkImagePromise,
    logoImagePromise,
  ]);
  if (isDisposed()) {
    return;
  }

  const coreLogo: CoreLogoOptions | undefined = logo
    ? {
        ...logo,
        src: undefined,
        custom: true,
        aspectRatio:
          logo.aspectRatio ??
          (logoImage ? logoImage.naturalWidth / logoImage.naturalHeight : 1),
      }
    : undefined;
  const qrProps = {
    ...qrOptions,
    dotStyle: imageDotStyle ?? qrOptions.dotStyle,
    backgroundColor: qrOptions.backgroundColor ?? "#ffffff",
    qr: {
      errorCorrectionLevel: "H" as const,
      ...qrOptions.qr,
    },
    logo: coreLogo,
  };
  const geometry = buildQR(qrProps);
  const grid = buildQR({
    ...qrProps,
    corner: { square: { style: "square" }, dot: { style: "square" } },
  });
  const finderPath = grid.finders[0].square.d;
  const finderWidth = Number(finderPath.match(/h([\d.]+)v/)?.[1]);
  const moduleUnit = finderWidth / 7;
  const margin = Number(finderPath.match(/^M([\d.]+),/)?.[1]) / moduleUnit;
  const matrixSize = Math.round(grid.viewBox / moduleUnit - margin * 2);
  const totalModules = matrixSize + margin * 2;
  if (
    !Number.isFinite(moduleUnit) ||
    !Number.isFinite(margin) ||
    matrixSize < 21
  ) {
    throw new Error("Unable to determine QR module dimensions.");
  }

  const svg = toSVGString({
    ...qrProps,
    dotColor: qrProps.dotColor ?? "#000000",
    backgroundColor: "#ffffff",
    ariaLabel: options.ariaLabel ?? `QR code: ${options.value}`,
  });
  const svgURL = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml" }),
  );
  try {
    const qrImage = await loadImage(svgURL);
    if (isDisposed()) {
      return;
    }
    const size = qrProps.size ?? 256;
    const sampleSize = Math.max(
      Math.ceil(totalModules * 8),
      Math.ceil(size * 2),
    );
    const qrCanvas = document.createElement("canvas");
    qrCanvas.width = sampleSize;
    qrCanvas.height = sampleSize;
    const qrContext = qrCanvas.getContext("2d", { willReadFrequently: true });
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = sampleSize;
    imageCanvas.height = sampleSize;
    const imageContext = imageCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!qrContext || !imageContext) {
      throw new Error("Canvas 2D context is unavailable.");
    }
    qrContext.drawImage(qrImage, 0, 0, sampleSize, sampleSize);
    const backgroundColor = options.backgroundColor ?? "#ffffff";
    const safeBackgroundColor =
      backgroundColor === "transparent" ? "#ffffff" : backgroundColor;
    const backgroundRGBA = readColor(safeBackgroundColor);
    const backgroundRGB: [number, number, number] = [
      backgroundRGBA[0],
      backgroundRGBA[1],
      backgroundRGBA[2],
    ];
    paintQuterBackground(
      imageContext,
      sampleSize,
      backgroundColor,
      qrProps.backgroundGradient,
    );
    const modulePixels = sampleSize / totalModules;
    const areaPosition = margin * modulePixels;
    const areaSize = matrixSize * modulePixels;
    drawImageInArea(
      imageContext,
      artworkImage,
      areaPosition,
      areaPosition,
      areaSize,
      areaSize,
      fillType,
    );
    const blended = blendQuterPixels(
      qrContext.getImageData(0, 0, sampleSize, sampleSize).data,
      imageContext.getImageData(0, 0, sampleSize, sampleSize).data,
      {
        width: sampleSize,
        height: sampleSize,
        matrixSize,
        margin,
        minCoreSize: Math.min(1, totalModules / Math.max(1, Math.round(size))),
        coreSize: resolveImageDotSize(imageDotSize),
        dotStyle: imageDotStyle ?? qrOptions.dotStyle,
        clear: geometry.clear
          ? {
              x: geometry.clear.x / moduleUnit - margin,
              y: geometry.clear.y / moduleUnit - margin,
              width: geometry.clear.width / moduleUnit,
              height: geometry.clear.height / moduleUnit,
            }
          : undefined,
        filter: resolveImageFilter(imageColor, filter),
        backgroundColor: backgroundRGB,
        backgroundAlpha:
          backgroundColor === "transparent" ? 0 : backgroundRGBA[3],
      },
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(size);
    canvas.height = Math.round(size);
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      options.ariaLabel ?? `QR code: ${options.value}`,
    );
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const output = canvas.getContext("2d");
    const blendedCanvas = document.createElement("canvas");
    blendedCanvas.width = sampleSize;
    blendedCanvas.height = sampleSize;
    const blendedContext = blendedCanvas.getContext("2d");
    if (!output || !blendedContext) {
      throw new Error("Canvas 2D context is unavailable.");
    }
    const pixels = blendedContext.createImageData(sampleSize, sampleSize);
    pixels.data.set(blended);
    blendedContext.putImageData(pixels, 0, 0);
    if (logoImage && geometry.logo) {
      const scale = sampleSize / geometry.viewBox;
      const x = geometry.logo.x * scale;
      const y = geometry.logo.y * scale;
      const width = geometry.logo.width * scale;
      const height = geometry.logo.height * scale;
      if (geometry.logo.radius > 0) {
        blendedContext.save();
        blendedContext.beginPath();
        blendedContext.roundRect(
          x,
          y,
          width,
          height,
          geometry.logo.radius * scale,
        );
        blendedContext.clip();
        blendedContext.drawImage(logoImage, x, y, width, height);
        blendedContext.restore();
      } else {
        blendedContext.drawImage(logoImage, x, y, width, height);
      }
    }
    output.drawImage(blendedCanvas, 0, 0, canvas.width, canvas.height);
    if (!isDisposed()) {
      target.replaceChildren(canvas);
    }
  } finally {
    URL.revokeObjectURL(svgURL);
  }
}

export function renderQuter(
  target: HTMLElement,
  options: QuterOptions,
): () => void {
  let disposed = false;
  if (options.imagePath) {
    void renderImageQR(target, options, () => disposed).catch(
      (error: unknown) => {
        if (disposed) {
          return;
        }
        if (options.onImageError) {
          options.onImageError(error as Error);
        } else {
          console.error(
            "quter: unable to render the image-based QR code.",
            error,
          );
        }
      },
    );
  } else {
    appendSVG(target, options);
  }
  return () => {
    disposed = true;
    target.replaceChildren();
  };
}
