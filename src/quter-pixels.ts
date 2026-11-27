import type { QRGradient } from './core/types';
import { gradientCoordinates } from './core/gradient';

export type QuterFilter = 'threshold' | 'color';

export function paintQuterBackground(
  context: CanvasRenderingContext2D,
  size: number,
  color: string,
  gradient?: QRGradient,
): void {
  if (gradient) {
    const coordinates = gradientCoordinates(gradient);
    const x1 = (Number.parseFloat(coordinates.x1) / 100) * size;
    const y1 = (Number.parseFloat(coordinates.y1) / 100) * size;
    const x2 = (Number.parseFloat(coordinates.x2) / 100) * size;
    const y2 = (Number.parseFloat(coordinates.y2) / 100) * size;
    const fill = context.createLinearGradient(x1, y1, x2, y2);
    fill.addColorStop(0, gradient.startColor);
    fill.addColorStop(1, gradient.endColor);
    context.fillStyle = fill;
    context.fillRect(0, 0, size, size);
  } else if (color !== 'transparent') {
    context.fillStyle = color;
    context.fillRect(0, 0, size, size);
  }
}

export function resolveImageDotSize(size = 0): number {
  if (!Number.isFinite(size) || size < 0 || size > 1) {
    throw new RangeError('imageDotSize must be between 0 and 1.');
  }

  return size;
}

export function resolveImageFilter(
  imageColor?: boolean,
  filter?: QuterFilter,
): QuterFilter {
  return imageColor === undefined ? filter ?? 'threshold' : imageColor ? 'color' : 'threshold';
}

interface QuterPixelOptions {
  width: number;
  height: number;
  matrixSize: number;
  margin: number;
  coreSize?: number;
  minCoreSize?: number;
  dotStyle?: 'square' | 'circle' | 'rounded';
  clear?: { x: number; y: number; width: number; height: number };
  filter: QuterFilter;
  backgroundColor: readonly [number, number, number];
  backgroundAlpha: number;
  gapColor?: readonly [number, number, number, number];
  transparentFinderBackground?: boolean;
  finderPixels?: Uint8ClampedArray;
}

export function blendQuterPixels(
  qrPixels: Uint8ClampedArray,
  imagePixels: Uint8ClampedArray,
  options: QuterPixelOptions,
): Uint8ClampedArray {
  const {
    width,
    height,
    matrixSize,
    margin,
    filter,
    backgroundColor,
    backgroundAlpha,
  } = options;
  const gapColor = options.gapColor;
  const output = new Uint8ClampedArray(qrPixels);
  const moduleSize = width / (matrixSize + margin * 2);
  const coreSize = Math.max(options.coreSize ?? 0.4, options.minCoreSize ?? 0);
  const coreInset = (1 - coreSize) / 2;
  const isInsideDot = (x: number, y: number) => {
    if (!options.dotStyle || options.dotStyle === 'square') return true;
    if (options.dotStyle === 'circle') {
      return (x - 0.5) ** 2 + (y - 0.5) ** 2 <= coreSize ** 2 / 4;
    }
    const radius = coreSize * 0.28;
    const dx = Math.max(Math.abs(x - 0.5) - (coreSize / 2 - radius), 0);
    const dy = Math.max(Math.abs(y - 0.5) - (coreSize / 2 - radius), 0);
    return dx ** 2 + dy ** 2 <= radius ** 2;
  };
  const isCleared = (moduleX: number, moduleY: number) =>
    options.clear !== undefined &&
    moduleX >= options.clear.x &&
    moduleY >= options.clear.y &&
    moduleX < options.clear.x + options.clear.width &&
    moduleY < options.clear.y + options.clear.height;
  const isFinder = (cellX: number, cellY: number) =>
    (cellX < 8 && cellY < 8) ||
    (cellX >= matrixSize - 8 && cellY < 8) ||
    (cellX < 8 && cellY >= matrixSize - 8);
  const overlayQrPixel = (
    index: number,
    sourcePixels: Uint8ClampedArray = qrPixels,
  ) => {
    const qrAlpha = sourcePixels[index + 3] / 255;
    const imageAlpha = imagePixels[index + 3] / 255;
    const outputAlpha = qrAlpha + imageAlpha * (1 - qrAlpha);
    const compositeChannel = (qr: number, image: number) =>
      outputAlpha === 0
        ? 0
        : (qr * qrAlpha + image * imageAlpha * (1 - qrAlpha)) / outputAlpha;
    output[index] = compositeChannel(sourcePixels[index], imagePixels[index]);
    output[index + 1] = compositeChannel(
      sourcePixels[index + 1],
      imagePixels[index + 1],
    );
    output[index + 2] = compositeChannel(
      sourcePixels[index + 2],
      imagePixels[index + 2],
    );
    output[index + 3] = outputAlpha * 255;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = x / moduleSize - margin;
      const moduleY = y / moduleSize - margin;
      const qrIndex = (y * width + x) * 4;

      if (moduleX < 0 || moduleY < 0 || moduleX >= matrixSize || moduleY >= matrixSize) {
        output[qrIndex] = imagePixels[qrIndex];
        output[qrIndex + 1] = imagePixels[qrIndex + 1];
        output[qrIndex + 2] = imagePixels[qrIndex + 2];
        output[qrIndex + 3] = imagePixels[qrIndex + 3];
        continue;
      }

      const cellX = Math.floor(moduleX);
      const cellY = Math.floor(moduleY);
      if (isCleared(moduleX, moduleY)) {
        output[qrIndex] = backgroundColor[0];
        output[qrIndex + 1] = backgroundColor[1];
        output[qrIndex + 2] = backgroundColor[2];
        output[qrIndex + 3] = backgroundAlpha;
        continue;
      }

      if (isFinder(cellX, cellY)) {
        overlayQrPixel(
          qrIndex,
          options.transparentFinderBackground && options.finderPixels
            ? options.finderPixels
            : qrPixels,
        );
        continue;
      }

      const centerX = moduleX - cellX;
      const centerY = moduleY - cellY;
      const inCore =
        centerX >= coreInset &&
        centerX < 1 - coreInset &&
        centerY >= coreInset &&
        centerY < 1 - coreInset &&
        isInsideDot(centerX, centerY);

      if (inCore) {
        overlayQrPixel(qrIndex);
        continue;
      }

      if (gapColor) {
        const foregroundAlpha = gapColor[3] / 255;
        const imageAlpha = imagePixels[qrIndex + 3] / 255;
        const outputAlpha = foregroundAlpha + imageAlpha * (1 - foregroundAlpha);
        const compositeChannel = (foreground: number, image: number) =>
          outputAlpha === 0
            ? 0
            : (foreground * foregroundAlpha +
                image * imageAlpha * (1 - foregroundAlpha)) /
              outputAlpha;
        output[qrIndex] = compositeChannel(gapColor[0], imagePixels[qrIndex]);
        output[qrIndex + 1] = compositeChannel(
          gapColor[1],
          imagePixels[qrIndex + 1],
        );
        output[qrIndex + 2] = compositeChannel(
          gapColor[2],
          imagePixels[qrIndex + 2],
        );
        output[qrIndex + 3] = outputAlpha * 255;
        continue;
      }

      const imageIndex = qrIndex;
      if (filter === 'color') {
        output[qrIndex] = imagePixels[imageIndex];
        output[qrIndex + 1] = imagePixels[imageIndex + 1];
        output[qrIndex + 2] = imagePixels[imageIndex + 2];
      } else {
        const luminance =
          imagePixels[imageIndex] * 0.2126 +
          imagePixels[imageIndex + 1] * 0.7152 +
          imagePixels[imageIndex + 2] * 0.0722;
        output[qrIndex] = luminance;
        output[qrIndex + 1] = luminance;
        output[qrIndex + 2] = luminance;
      }
      output[qrIndex + 3] = imagePixels[imageIndex + 3];
    }
  }

  return output;
}
