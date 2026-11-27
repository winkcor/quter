import {
  forwardRef,
  memo,
  useEffect,
  useId,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
  useState,
} from 'react';
import { buildQR } from './core';
import type { CoreLogoOptions, QRCodeOptions } from './core';
import type { QRGradient } from './core';
import { gradientCoordinates } from './core/gradient';

export type LogoOptions = CoreLogoOptions & { element?: ReactNode };
export type QRCodeProps = Omit<QRCodeOptions, 'logo'> & {
  logo?: LogoOptions;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  idPrefix?: string;
};
export type QRCodeComponentProps = QRCodeProps &
  Omit<
    SVGProps<SVGSVGElement>,
    | keyof QRCodeProps
    | 'children'
    | 'ref'
    | 'width'
    | 'height'
    | 'viewBox'
    | 'role'
    | 'aria-labelledby'
    | 'dangerouslySetInnerHTML'
  >;

const QRCodeRoot = forwardRef<SVGSVGElement, QRCodeComponentProps>(
  function QRCodeRoot(
    {
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
      className,
      style,
      ariaLabel,
      idPrefix: _idPrefix,
      ...svgProps
    },
    ref,
  ) {
    const generatedId = useId().replace(/:/g, '');
    const logoSource = logo?.element ? undefined : logo?.src;
    const [measuredLogo, setMeasuredLogo] = useState<
      { src: string; aspectRatio: number } | undefined
    >();
    useEffect(() => {
      if (!logoSource) {
        setMeasuredLogo(undefined);
        return;
      }

      const image = new Image();
      image.onload = () => {
        if (image.naturalHeight > 0) {
          setMeasuredLogo({
            src: logoSource,
            aspectRatio: image.naturalWidth / image.naturalHeight,
          });
        }
      };
      image.onerror = () => setMeasuredLogo(undefined);
      image.src = logoSource;
      return () => {
        image.onload = null;
        image.onerror = null;
      };
    }, [logoSource]);
    const maskId = `${generatedId}m`;
    const clipId = `${generatedId}c`;
    const titleId = `${generatedId}t`;
    const dotGradientId = `${generatedId}d`;
    const backgroundGradientId = `${generatedId}b`;
    const cornerSquareGradientId = `${generatedId}s`;
    const cornerDotGradientId = `${generatedId}p`;
    const gradients: Array<{ id: string; gradient: QRGradient }> = [];
    if (dotGradient) gradients.push({ id: dotGradientId, gradient: dotGradient });
    if (backgroundGradient) {
      gradients.push({ id: backgroundGradientId, gradient: backgroundGradient });
    }
    if (corner?.square?.gradient) {
      gradients.push({ id: cornerSquareGradientId, gradient: corner.square.gradient });
    }
    if (corner?.dot?.gradient) {
      gradients.push({ id: cornerDotGradientId, gradient: corner.dot.gradient });
    }
    const { element, ...logoOptions } = logo ?? {};
    const geometry = buildQR({
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
      logo: logo && {
        ...logoOptions,
        custom: !!element,
        aspectRatio:
          logo.aspectRatio ??
          (measuredLogo && measuredLogo.src === logoSource
            ? measuredLogo.aspectRatio
            : 1),
      },
    });

    return (
      <>
        <svg
          {...svgProps}
          ref={ref}
          role="img"
          aria-labelledby={titleId}
          width={geometry.size}
          height={geometry.size}
          viewBox={`0 0 ${geometry.viewBox} ${geometry.viewBox}`}
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          style={style}
        >
          <title id={titleId}>{ariaLabel ?? `QR code: ${value}`}</title>
          {gradients.length > 0 && (
            <defs>
              {gradients.map(({ id, gradient }) => (
                <linearGradient key={id} id={id} {...gradientCoordinates(gradient)}>
                  <stop offset="0%" stopColor={gradient.startColor} />
                  <stop offset="100%" stopColor={gradient.endColor} />
                </linearGradient>
              ))}
            </defs>
          )}
          {geometry.background !== undefined && (
            <rect
              width={geometry.viewBox}
              height={geometry.viewBox}
              fill={backgroundGradient ? `url(#${backgroundGradientId})` : geometry.background}
            />
          )}
          {geometry.clear && (
            <defs>
              <mask id={maskId}>
                <rect width={geometry.viewBox} height={geometry.viewBox} fill="white" />
                <rect
                  x={geometry.clear.x}
                  y={geometry.clear.y}
                  width={geometry.clear.width}
                  height={geometry.clear.height}
                  fill="black"
                />
              </mask>
            </defs>
          )}
          <g mask={geometry.clear ? `url(#${maskId})` : undefined}>
            {geometry.modules && (
              <path
                d={geometry.modules.d}
                fill={dotGradient ? `url(#${dotGradientId})` : geometry.modules.fill}
              />
            )}
            {geometry.finders.map((finder, index) => (
              <g key={index}>
                {finder.background && (
                  <rect
                    x={finder.background.x}
                    y={finder.background.y}
                    width={finder.background.width}
                    height={finder.background.height}
                    fill={finder.background.fill}
                  />
                )}
                <path
                  d={finder.square.d}
                  fill={corner?.square?.gradient ? `url(#${cornerSquareGradientId})` : finder.square.fill}
                  fillRule="evenodd"
                />
                <path
                  d={finder.dot.d}
                  fill={corner?.dot?.gradient ? `url(#${cornerDotGradientId})` : finder.dot.fill}
                />
              </g>
            ))}
          </g>
          {geometry.logo && (element || geometry.logo.src) && (
            <>
              {geometry.logo.radius > 0 && (
                <defs>
                  <clipPath id={clipId}>
                    <rect
                      x={geometry.logo.x}
                      y={geometry.logo.y}
                      width={geometry.logo.width}
                      height={geometry.logo.height}
                      rx={geometry.logo.radius}
                      ry={geometry.logo.radius}
                    />
                  </clipPath>
                </defs>
              )}
              {element ? (
                <foreignObject
                  x={geometry.logo.x}
                  y={geometry.logo.y}
                  width={geometry.logo.width}
                  height={geometry.logo.height}
                  clipPath={geometry.logo.radius > 0 ? `url(#${clipId})` : undefined}
                >
                  {element}
                </foreignObject>
              ) : (
                <image
                  href={geometry.logo.src}
                  x={geometry.logo.x}
                  y={geometry.logo.y}
                  width={geometry.logo.width}
                  height={geometry.logo.height}
                  clipPath={geometry.logo.radius > 0 ? `url(#${clipId})` : undefined}
                />
              )}
            </>
          )}
        </svg>
      </>
    );
  },
);

QRCodeRoot.displayName = 'QRCode';

export const QRCode = memo(QRCodeRoot);
