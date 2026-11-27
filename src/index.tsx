import { useEffect, useMemo, useRef, useState } from 'react';
import { buildQR, toSVGString } from './core';
import type { QRCodeOptions } from './core';
import { QRCode } from './react';
import type { QRCodeComponentProps, QRCodeProps } from './react';
import {
  blendQuterPixels,
  paintQuterBackground,
  resolveImageDotSize,
  resolveImageFilter,
} from './quter-pixels';
import type { QuterFilter } from './quter-pixels';

export { QRCode };
export type { QRCodeProps } from './react';
export type { QuterFilter } from './quter-pixels';
export type { QRGradient } from './core';

export type QuterProps = Omit<QRCodeComponentProps, 'logo' | 'version' | 'filter'> & {
  imagePath?: string;
  imageDotStyle?: QRCodeProps['dotStyle'];
  imageDotSize?: number;
  /** Color blended over image pixels outside each QR dot, including alpha. */
  imageGapColor?: string;
  transparentFinderBackground?: boolean;
  logo?: QRCodeProps['logo'];
  imageColor?: boolean;
  dotGradient?: QRCodeOptions['dotGradient'];
  backgroundGradient?: QRCodeOptions['backgroundGradient'];
  filter?: QuterFilter;
  fillType?: 'scale_to_fit' | 'fill';
  background?: string;
  version?: number;
  onImageError?: (error: Error) => void;
};

function safeImageSource(source: string): boolean {
  return !/^\s*(?:javascript|vbscript):/i.test(source) && !/^data:(?!image\/)/i.test(source);
}

function reportImageError(error: Error, onImageError?: (error: Error) => void): void {
  if (onImageError) {
    onImageError(error);
  } else {
    console.error('quter: unable to render the image-based QR code.', error);
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('An image could not be loaded for the QR code.'));
    image.src = source;
  });
}

function readColor(color: string): [number, number, number, number] {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const context = colorCanvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
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
  fillType: 'scale_to_fit' | 'fill',
): void {
  const scale =
    fillType === 'fill'
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

type QuterCanvasProps = {
  imagePath: string;
  imageDotSize: number;
  imageGapColor?: string;
  transparentFinderBackground: boolean;
  logo?: QRCodeProps['logo'];
  filter: QuterFilter;
  fillType: 'scale_to_fit' | 'fill';
  qrOptions: QRCodeOptions;
  svgProps: Omit<QRCodeComponentProps, keyof QRCodeOptions | 'logo'>;
  onImageError?: (error: Error) => void;
};

function QuterCanvas({
  imagePath,
  imageDotSize,
  imageGapColor,
  transparentFinderBackground,
  logo,
  filter,
  fillType,
  onImageError,
  qrOptions,
  svgProps,
}: QuterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [logoGeometry, setLogoGeometry] = useState<
    (NonNullable<ReturnType<typeof buildQR>['logo']> & { viewBox: number }) | undefined
  >();
  const size = qrOptions.size ?? 256;
  const logoElement = logo?.element;
  const { className, style, ...otherSvgProps } = svgProps;

  useEffect(() => {
    let disposed = false;
    let svgUrl: string | undefined;
    let finderSvgUrl: string | undefined;
    setIsReady(false);

    const render = async () => {
      try {
        if (!imagePath || !safeImageSource(imagePath)) {
          throw new Error('The image URL uses an unsupported scheme.');
        }

        if (filter !== 'threshold' && filter !== 'color') {
          throw new Error('The image filter must be "threshold" or "color".');
        }

        if (fillType !== 'scale_to_fit' && fillType !== 'fill') {
          throw new Error('The image fill type must be "scale_to_fit" or "fill".');
        }

        const logoSource = logo?.element ? undefined : logo?.src;
        if (logoSource && !safeImageSource(logoSource)) {
          throw new Error('The center image URL uses an unsupported scheme.');
        }

        const [artImage, logoImage] = await Promise.all([
          loadImage(imagePath),
          logoSource ? loadImage(logoSource) : Promise.resolve(undefined),
        ]);

        if (disposed) {
          return;
        }

        const coreLogo = logo
          ? {
              ...logo,
              element: undefined,
              src: undefined,
              aspectRatio:
                logo.aspectRatio ??
                (logoImage ? logoImage.naturalWidth / logoImage.naturalHeight : 1),
              custom: true,
            }
          : undefined;
        const geometry = buildQR({ ...qrOptions, logo: coreLogo });
        const gridGeometry = buildQR({
          ...qrOptions,
          corner: { square: { style: 'square' }, dot: { style: 'square' } },
          logo: coreLogo,
        });
        setLogoGeometry(
          geometry.logo ? { ...geometry.logo, viewBox: geometry.viewBox } : undefined,
        );

        const finderPath = gridGeometry.finders[0].square.d;
        const finderWidth = Number(finderPath.match(/h([\d.]+)v/)?.[1]);
        const moduleUnit = finderWidth / 7;
        const finderOffset = Number(finderPath.match(/^M([\d.]+),/)?.[1]) / moduleUnit;
        const matrixSize = Math.round(gridGeometry.viewBox / moduleUnit - finderOffset * 2);
        const totalModules = matrixSize + finderOffset * 2;

        if (!Number.isFinite(moduleUnit) || !Number.isFinite(finderOffset) || matrixSize < 21) {
          throw new Error('Unable to determine QR module dimensions.');
        }

        const svg = toSVGString({
          ...qrOptions,
          dotColor: qrOptions.dotColor ?? '#000000',
          backgroundColor: '#ffffff',
          backgroundGradient: undefined,
          logo: coreLogo,
          ariaLabel: `QR code: ${qrOptions.value}`,
        });
        svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        const qrImage = await loadImage(svgUrl);
        const sampleSize = Math.max(Math.ceil(totalModules * 8), Math.ceil(size * 2));
        let finderPixels: Uint8ClampedArray | undefined;
        if (transparentFinderBackground) {
          const finderSvg = toSVGString({
            ...qrOptions,
            corner: qrOptions.corner
              ? { ...qrOptions.corner, backgroundColor: undefined }
              : undefined,
            dotColor: qrOptions.dotColor ?? '#000000',
            backgroundColor: 'transparent',
            backgroundGradient: undefined,
            logo: coreLogo,
            ariaLabel: `QR code: ${qrOptions.value}`,
          });
          finderSvgUrl = URL.createObjectURL(
            new Blob([finderSvg], { type: 'image/svg+xml' }),
          );
          const finderImage = await loadImage(finderSvgUrl);
          if (disposed || !canvasRef.current) {
            return;
          }
          const finderCanvas = document.createElement('canvas');
          finderCanvas.width = sampleSize;
          finderCanvas.height = finderCanvas.width;
          const finderContext = finderCanvas.getContext('2d', {
            willReadFrequently: true,
          });
          if (!finderContext) {
            throw new Error('Canvas 2D context is unavailable.');
          }
          finderContext.drawImage(
            finderImage,
            0,
            0,
            finderCanvas.width,
            finderCanvas.height,
          );
          finderPixels = finderContext.getImageData(
            0,
            0,
            finderCanvas.width,
            finderCanvas.height,
          ).data;
        }

        if (disposed || !canvasRef.current) {
          return;
        }

        const qrCanvas = document.createElement('canvas');
        qrCanvas.width = sampleSize;
        qrCanvas.height = sampleSize;
        const qrContext = qrCanvas.getContext('2d', { willReadFrequently: true });

        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = sampleSize;
        imageCanvas.height = sampleSize;
        const imageContext = imageCanvas.getContext('2d', { willReadFrequently: true });

        if (!qrContext || !imageContext) {
          throw new Error('Canvas 2D context is unavailable.');
        }

        qrContext.drawImage(qrImage, 0, 0, sampleSize, sampleSize);
        const backgroundColor = qrOptions.backgroundColor ?? '#ffffff';
        const safeBackgroundColor =
          backgroundColor === 'transparent' ? '#ffffff' : backgroundColor;
        const backgroundRGBA = readColor(safeBackgroundColor);
        const imageGapRGBA = imageGapColor ? readColor(imageGapColor) : undefined;
        const backgroundRGB: [number, number, number] = [
          backgroundRGBA[0],
          backgroundRGBA[1],
          backgroundRGBA[2],
        ];
        paintQuterBackground(
          imageContext,
          sampleSize,
          backgroundColor,
          qrOptions.backgroundGradient,
        );

        const modulePixels = sampleSize / totalModules;
        const margin = finderOffset;
        const areaPosition = margin * modulePixels;
        const areaSize = matrixSize * modulePixels;
        drawImageInArea(
          imageContext,
          artImage,
          areaPosition,
          areaPosition,
          areaSize,
          areaSize,
          fillType,
        );

        const qrPixels = qrContext.getImageData(0, 0, sampleSize, sampleSize).data;
        const imagePixels = imageContext.getImageData(0, 0, sampleSize, sampleSize).data;
        const blendedPixels = blendQuterPixels(qrPixels, imagePixels, {
          width: sampleSize,
          height: sampleSize,
          matrixSize,
          margin,
          minCoreSize: Math.min(1, totalModules / Math.max(1, Math.round(size))),
          coreSize: imageDotSize,
          dotStyle: qrOptions.dotStyle,
          clear: geometry.clear
            ? {
                x: geometry.clear.x / moduleUnit - margin,
                y: geometry.clear.y / moduleUnit - margin,
                width: geometry.clear.width / moduleUnit,
                height: geometry.clear.height / moduleUnit,
              }
            : undefined,
          filter,
          backgroundColor: backgroundRGB,
          backgroundAlpha: backgroundColor === 'transparent' ? 0 : backgroundRGBA[3],
          gapColor: imageGapRGBA,
          transparentFinderBackground,
          finderPixels,
        });

        const outputCanvas = canvasRef.current;
        outputCanvas.width = Math.round(size);
        outputCanvas.height = Math.round(size);
        const outputContext = outputCanvas.getContext('2d');

        if (!outputContext) {
          throw new Error('Canvas 2D context is unavailable.');
        }

        const blendedCanvas = document.createElement('canvas');
        blendedCanvas.width = sampleSize;
        blendedCanvas.height = sampleSize;
        const blendedContext = blendedCanvas.getContext('2d');

        if (!blendedContext) {
          throw new Error('Canvas 2D context is unavailable.');
        }

        const blendedImageData = blendedContext.createImageData(sampleSize, sampleSize);
        blendedImageData.data.set(blendedPixels);
        blendedContext.putImageData(blendedImageData, 0, 0);

        if (logoImage && geometry.logo) {
          const scale = sampleSize / geometry.viewBox;
          const x = geometry.logo.x * scale;
          const y = geometry.logo.y * scale;
          const width = geometry.logo.width * scale;
          const height = geometry.logo.height * scale;
          const radius = geometry.logo.radius * scale;
          blendedContext.save();
          if (radius > 0) {
            blendedContext.beginPath();
            blendedContext.roundRect(x, y, width, height, radius);
            blendedContext.clip();
          }
          blendedContext.drawImage(
            logoImage,
            x,
            y,
            width,
            height,
          );
          blendedContext.restore();
        }

        outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        outputContext.drawImage(blendedCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
        if (!disposed) {
          setIsReady(true);
        }
      } catch (error) {
        if (!disposed) {
          reportImageError(error as Error, onImageError);
        }
      }
    };

    void render();

    return () => {
      disposed = true;
      if (svgUrl) {
        URL.revokeObjectURL(svgUrl);
      }
      if (finderSvgUrl) {
        URL.revokeObjectURL(finderSvgUrl);
      }
    };
  }, [
    filter,
    fillType,
    imageDotSize,
    imageGapColor,
    imagePath,
    logo,
    onImageError,
    qrOptions,
    size,
  ]);

  const logoStyle = useMemo(() => {
    if (!logoGeometry) {
      return undefined;
    }

    return {
      position: 'absolute' as const,
      left: `${(logoGeometry.x / logoGeometry.viewBox) * 100}%`,
      top: `${(logoGeometry.y / logoGeometry.viewBox) * 100}%`,
      width: `${(logoGeometry.width / logoGeometry.viewBox) * 100}%`,
      height: `${(logoGeometry.height / logoGeometry.viewBox) * 100}%`,
      borderRadius: `${(logoGeometry.radius / Math.min(logoGeometry.width, logoGeometry.height)) * 100}%`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      pointerEvents: 'none' as const,
    };
  }, [logoGeometry]);

  return (
    <span
      className={className}
      style={{ position: 'relative', display: 'inline-block', lineHeight: 0, ...style }}
    >
      <QRCode
        {...otherSvgProps}
        {...qrOptions}
        className={className}
        logo={logo}
        style={{
          ...style,
          opacity: isReady ? 0 : style?.opacity,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          ...style,
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          visibility: isReady ? 'visible' : 'hidden',
        }}
      />
      {logoElement && logoStyle && <span style={logoStyle}>{logoElement}</span>}
    </span>
  );
}

export function Quter({
  imagePath,
  imageDotStyle,
  imageDotSize,
  imageGapColor,
  transparentFinderBackground,
  logo,
  imageColor,
  filter,
  fillType = 'scale_to_fit',
  background,
  version,
  onImageError,
  backgroundColor,
  dotGradient,
  backgroundGradient,
  qr,
  value,
  size,
  margin,
  dotStyle,
  dotColor,
  corner,
  ariaLabel,
  ...svgProps
}: QuterProps) {
  const imageFilter = resolveImageFilter(imageColor, filter);
  const resolvedImageDotSize = imagePath
    ? resolveImageDotSize(imageDotSize)
    : imageDotSize ?? 0.4;

  const qrOptions = useMemo<QRCodeOptions>(
    () => ({
      value,
      size,
      margin,
      dotStyle,
      dotColor,
      dotGradient,
      corner,
      backgroundGradient,
      backgroundColor: backgroundColor ?? background ?? '#ffffff',
      qr: {
        errorCorrectionLevel: imagePath ? 'H' : undefined,
        ...qr,
        version: version ?? qr?.version,
      },
    }),
    [
      background,
      backgroundColor,
      backgroundGradient,
      corner,
      dotColor,
      dotGradient,
      dotStyle,
      imagePath,
      margin,
      qr,
      size,
      value,
      version,
    ],
  );
  const imageQrOptions = useMemo<QRCodeOptions>(
    () => ({
      ...qrOptions,
      dotStyle: imageDotStyle ?? qrOptions.dotStyle,
    }),
    [imageDotStyle, qrOptions],
  );

  if (!imagePath) {
    return (
      <QRCode {...svgProps} {...qrOptions} ariaLabel={ariaLabel} logo={logo} />
    );
  }

  return (
    <QuterCanvas
      imagePath={imagePath}
      imageDotSize={resolvedImageDotSize}
      imageGapColor={imageGapColor}
      transparentFinderBackground={
        transparentFinderBackground ??
        qrOptions.corner?.backgroundColor === 'transparent'
      }
      logo={logo}
      filter={imageFilter}
      fillType={fillType}
      onImageError={onImageError}
      qrOptions={imageQrOptions}
      svgProps={{ ...svgProps, ariaLabel }}
    />
  );
}

export default Quter;
