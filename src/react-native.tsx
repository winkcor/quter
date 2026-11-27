import { useId, useMemo } from 'react';
import {
  ClipPath,
  Defs,
  G,
  Image,
  LinearGradient,
  Mask,
  Path,
  Rect,
  Svg,
  Stop,
  type ImageProps,
  type SvgProps,
} from 'react-native-svg';
import { buildQR } from './core';
import type { CoreLogoOptions, QRCodeOptions } from './core';
import type { QRGradient } from './core';
import { gradientCoordinates } from './core/gradient';

export type ReactNativeLogoOptions = Omit<CoreLogoOptions, 'src' | 'custom'> & {
  source: NonNullable<ImageProps['href']>;
};

export type ReactNativeQRCodeProps = Omit<QRCodeOptions, 'logo'> & {
  logo?: ReactNativeLogoOptions;
  ariaLabel?: string;
  style?: SvgProps['style'];
};

export function QRCode({
  value,
  size,
  margin,
  dotStyle,
  dotColor,
  dotGradient,
  backgroundColor,
  backgroundGradient,
  corner,
  qr,
  logo,
  ariaLabel,
  style,
}: ReactNativeQRCodeProps) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const maskId = `${generatedId}m`;
  const clipId = `${generatedId}c`;
  const dotGradientId = `${generatedId}d`;
  const backgroundGradientId = `${generatedId}b`;
  const cornerSquareGradientId = `${generatedId}s`;
  const cornerDotGradientId = `${generatedId}p`;
  const squareGradient = corner?.square?.gradient;
  const cornerDotGradient = corner?.dot?.gradient;
  const gradients: Array<{ id: string; gradient: QRGradient }> = [];
  if (dotGradient) gradients.push({ id: dotGradientId, gradient: dotGradient });
  if (backgroundGradient) {
    gradients.push({ id: backgroundGradientId, gradient: backgroundGradient });
  }
  if (squareGradient) {
    gradients.push({ id: cornerSquareGradientId, gradient: squareGradient });
  }
  if (cornerDotGradient) {
    gradients.push({ id: cornerDotGradientId, gradient: cornerDotGradient });
  }
  const hasLogo = logo !== undefined;
  const logoSize = logo?.size;
  const logoAspectRatio = logo?.aspectRatio ?? 1;
  const logoMargin = logo?.margin;
  const logoHideDots = logo?.hideDots;
  const logoRadius = logo?.radius;
  const squareStyle = corner?.square?.style;
  const squareColor = corner?.square?.color;
  const cornerBackgroundColor = corner?.backgroundColor;
  const cornerDotStyle = corner?.dot?.style;
  const cornerDotColor = corner?.dot?.color;
  const errorCorrectionLevel = qr?.errorCorrectionLevel;
  const version = qr?.version;

  const geometry = useMemo(
    () =>
      buildQR({
        value,
        size,
        margin,
        dotStyle,
        dotColor,
        backgroundColor,
        dotGradient,
        backgroundGradient,
        corner: {
          backgroundColor: cornerBackgroundColor,
          square: { style: squareStyle, color: squareColor, gradient: squareGradient },
          dot: { style: cornerDotStyle, color: cornerDotColor, gradient: cornerDotGradient },
        },
        qr: { errorCorrectionLevel, version },
        logo: hasLogo
          ? {
              size: logoSize,
              aspectRatio: logoAspectRatio,
              margin: logoMargin,
              hideDots: logoHideDots,
              radius: logoRadius,
              custom: true,
            }
          : undefined,
      }),
    [
      backgroundColor,
      backgroundGradient,
      cornerDotColor,
      cornerBackgroundColor,
      cornerDotGradient,
      cornerDotStyle,
      dotColor,
      dotGradient,
      dotStyle,
      errorCorrectionLevel,
      hasLogo,
      logoAspectRatio,
      logoHideDots,
      logoMargin,
      logoRadius,
      logoSize,
      margin,
      size,
      squareColor,
      squareGradient,
      squareStyle,
      value,
      version,
    ],
  );
  const imageClip = geometry.logo?.radius
    ? `url(#${clipId})`
    : undefined;

  return (
    <Svg
      width={geometry.size}
      height={geometry.size}
      viewBox={`0 0 ${geometry.viewBox} ${geometry.viewBox}`}
      accessible
      accessibilityLabel={ariaLabel ?? `QR code: ${value}`}
      accessibilityRole="image"
      style={style}
    >
      {geometry.background !== undefined && (
        <Rect
          x={0}
          y={0}
          width={geometry.viewBox}
          height={geometry.viewBox}
          fill={backgroundGradient ? `url(#${backgroundGradientId})` : geometry.background}
        />
      )}
      {(geometry.clear || gradients.length > 0) && (
        <Defs>
          {geometry.clear && (
            <Mask id={maskId}>
              <Rect
                x={0}
                y={0}
                width={geometry.viewBox}
                height={geometry.viewBox}
                fill="white"
              />
              <Rect
                x={geometry.clear.x}
                y={geometry.clear.y}
                width={geometry.clear.width}
                height={geometry.clear.height}
                fill="black"
              />
            </Mask>
          )}
          {gradients.map(({ id, gradient }) => (
            <LinearGradient
              key={id}
              id={id}
              {...gradientCoordinates(gradient)}
            >
              <Stop offset="0%" stopColor={gradient.startColor} />
              <Stop offset="100%" stopColor={gradient.endColor} />
            </LinearGradient>
          ))}
        </Defs>
      )}
      <G mask={geometry.clear ? `url(#${maskId})` : undefined}>
        {geometry.modules && (
          <Path
            d={geometry.modules.d}
            fill={dotGradient ? `url(#${dotGradientId})` : geometry.modules.fill}
            fillRule={geometry.modules.fillRule}
          />
        )}
        {geometry.finders.map((finder, index) => (
          <G key={index}>
            {finder.background && (
              <Rect
                x={finder.background.x}
                y={finder.background.y}
                width={finder.background.width}
                height={finder.background.height}
                fill={finder.background.fill}
              />
            )}
            <Path
              d={finder.square.d}
              fill={squareGradient ? `url(#${cornerSquareGradientId})` : finder.square.fill}
              fillRule={finder.square.fillRule}
            />
            <Path
              d={finder.dot.d}
              fill={cornerDotGradient ? `url(#${cornerDotGradientId})` : finder.dot.fill}
            />
          </G>
        ))}
      </G>
      {geometry.logo && logo && (
        <>
          {imageClip && (
            <Defs>
              <ClipPath id={clipId}>
                <Rect
                  x={geometry.logo.x}
                  y={geometry.logo.y}
                  width={geometry.logo.width}
                  height={geometry.logo.height}
                  rx={geometry.logo.radius}
                  ry={geometry.logo.radius}
                />
              </ClipPath>
            </Defs>
          )}
          <Image
            href={logo.source}
            x={geometry.logo.x}
            y={geometry.logo.y}
            width={geometry.logo.width}
            height={geometry.logo.height}
            preserveAspectRatio="xMidYMid meet"
            clipPath={imageClip}
          />
        </>
      )}
    </Svg>
  );
}

export const Quter = QRCode;
export type QuterNativeProps = ReactNativeQRCodeProps;
export default Quter;
