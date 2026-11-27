#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { toSVGString } from './core';
import { generateQRMatrix } from './core/matrix';
import { resolveGeometry } from './core/shapes';
import type {
  CornerDotStyle,
  CornerSquareStyle,
  DotStyle,
  SVGStringOptions,
} from './core';

interface CliOptions extends Omit<SVGStringOptions, 'value'> {
  value?: string;
  output?: string;
  logoPath?: string;
  logoSize?: number;
  imagePath?: string;
  imageDotSize?: number;
  help: boolean;
}

const HELP = `Usage: quter <text> [options]

Options:
  -o, --output <file>          Write SVG to a file (default: stdout)
      --size <pixels>          QR code size (default: 256)
      --dot-style <style>      square, circle, or rounded
      --dot-color <color>      QR dot color
      --background-color <color>
                               Background color
      --logo <file>            Embed a logo image from a local file
      --logo-size <0-1>        Logo size (default: 0.4)
      --image <file>           Blend an image into QR modules
      --image-dot-size <0-1>   Protected module-center size (default: 0.4)
      --corner-style <style>   square, rounded, extra-rounded, or circle
      --corner-color <color>   Finder-pattern color
      --corner-dot-style <style>
                               square, rounded, or circle
      --corner-dot-color <color>
                               Inner finder-pattern dot color
  -h, --help                   Show this help
`;

const MIME_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function isCornerSquareStyle(value: string): value is CornerSquareStyle {
  return (
    value === 'square' ||
    value === 'rounded' ||
    value === 'extra-rounded' ||
    value === 'circle'
  );
}

function isCornerDotStyle(value: string): value is CornerDotStyle {
  return value === 'square' || value === 'rounded' || value === 'circle';
}

function isDotStyle(value: string): value is DotStyle {
  return value === 'square' || value === 'circle' || value === 'rounded';
}

export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = { help: false };
  let positionalOnly = false;

  const readValue = (flag: string, index: number): string => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}.`);
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (arg === '--help' || arg === '-h')) {
      options.help = true;
      return options;
    }
    if (!positionalOnly && (arg === '--output' || arg === '-o')) {
      options.output = readValue(arg, index);
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--logo') {
      options.logoPath = readValue(arg, index);
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--image') {
      options.imagePath = readValue(arg, index);
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--logo-size') {
      const size = Number(readValue(arg, index));
      if (!Number.isFinite(size) || size < 0 || size > 1) {
        throw new Error('--logo-size must be between 0 and 1.');
      }
      options.logoSize = size;
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--image-dot-size') {
      const size = Number(readValue(arg, index));
      if (!Number.isFinite(size) || size < 0 || size > 1) {
        throw new Error('--image-dot-size must be between 0 and 1.');
      }
      options.imageDotSize = size;
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--size') {
      const size = Number(readValue(arg, index));
      if (!Number.isFinite(size) || size <= 0) {
        throw new Error('--size must be a positive number.');
      }
      options.size = size;
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--dot-style') {
      const dotStyle = readValue(arg, index);
      if (!isDotStyle(dotStyle)) {
        throw new Error('--dot-style must be square, circle, or rounded.');
      }
      options.dotStyle = dotStyle;
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--dot-color') {
      options.dotColor = readValue(arg, index);
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--background-color') {
      options.backgroundColor = readValue(arg, index);
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--corner-style') {
      const style = readValue(arg, index);
      if (!isCornerSquareStyle(style)) {
        throw new Error(
          '--corner-style must be square, rounded, extra-rounded, or circle.',
        );
      }
      options.corner = { ...options.corner, square: { ...options.corner?.square, style } };
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--corner-color') {
      const color = readValue(arg, index);
      options.corner = { ...options.corner, square: { ...options.corner?.square, color } };
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--corner-dot-style') {
      const style = readValue(arg, index);
      if (!isCornerDotStyle(style)) {
        throw new Error('--corner-dot-style must be square, rounded, or circle.');
      }
      options.corner = { ...options.corner, dot: { ...options.corner?.dot, style } };
      index += 1;
      continue;
    }
    if (!positionalOnly && arg === '--corner-dot-color') {
      const color = readValue(arg, index);
      options.corner = { ...options.corner, dot: { ...options.corner?.dot, color } };
      index += 1;
      continue;
    }
    if (!positionalOnly && arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.value !== undefined) {
      throw new Error('Provide only one text value to encode.');
    }
    options.value = arg;
  }

  if (!options.value?.trim()) {
    throw new Error('Provide the text or URL to encode.');
  }
  return options;
}

async function readLocalImage(filePath: string): Promise<string> {
  const path = resolve(filePath);
  const mimeType = MIME_TYPES[extname(path).toLowerCase()];
  if (!mimeType) {
    throw new Error(`Unsupported image format: ${filePath}`);
  }
  const image = await readFile(path);
  return `data:${mimeType};base64,${image.toString('base64')}`;
}

function blendImageIntoSvg(
  svg: string,
  imageSource: string,
  value: string,
  options: CliOptions,
): string {
  const { matrix: qrMatrix, size: qrSize } = generateQRMatrix(
    value,
    'H',
    options.qr?.version,
  );
  const geometry = resolveGeometry(options.size ?? 256, options.margin ?? 4, qrSize);
  const moduleSize = geometry.moduleSize;
  const imageDotSize = options.imageDotSize ?? 0.4;
  const inset = (1 - imageDotSize) / 2;
  const centerRects: string[] = [];
  if (imageDotSize > 0) {
    for (let row = 0; row < qrSize; row += 1) {
      for (let col = 0; col < qrSize; col += 1) {
        const x = geometry.marginPx + col * moduleSize + inset * moduleSize;
        const y = geometry.marginPx + row * moduleSize + inset * moduleSize;
        const side = moduleSize * imageDotSize;
        centerRects.push(
          `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${qrMatrix[row * qrSize + col] ? '#000000' : '#ffffff'}"/>`,
        );
      }
    }
  }

  const modulePath = /<path d="[^"]*" fill="[^"]*"\/>/;
  const match = modulePath.exec(svg);
  if (!match || match.index === undefined) {
    throw new Error('Unable to prepare QR modules for image blending.');
  }
  const parentGroup = svg.lastIndexOf('<g', match.index);
  const groupEnd = svg.indexOf('>', parentGroup) + 1;
  const svgWithoutModules =
    svg.slice(0, match.index) + svg.slice(match.index + match[0].length);
  const imageX = geometry.marginPx;
  const imageSide = qrSize * moduleSize;
  const imageLayer =
    `<image href="${imageSource}" x="${imageX}" y="${imageX}"` +
    ` width="${imageSide}" height="${imageSide}" preserveAspectRatio="xMidYMid slice"/>` +
    centerRects.join('');
  const finderBackgrounds = [
    [0, 0],
    [qrSize - 8, 0],
    [0, qrSize - 8],
  ]
    .map(
      ([col, row]) =>
        `<rect x="${imageX + col * moduleSize}" y="${imageX + row * moduleSize}"` +
        ` width="${8 * moduleSize}" height="${8 * moduleSize}" fill="#ffffff"/>`,
    )
    .join('');
  return (
    svgWithoutModules.slice(0, groupEnd) +
    imageLayer +
    finderBackgrounds +
    svgWithoutModules.slice(groupEnd)
  );
}

async function main(args: string[]): Promise<void> {
  const options = parseCliArgs(args);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const {
    value,
    output,
    logoPath,
    logoSize,
    imagePath,
    imageDotSize: _imageDotSize,
    help: _help,
    ...svgOptions
  } = options;
  if (logoPath) {
    svgOptions.logo = {
      src: await readLocalImage(logoPath),
      size: logoSize,
    };
  }
  if (imagePath) {
    if (
      svgOptions.backgroundColor === undefined ||
      svgOptions.backgroundColor === 'transparent'
    ) {
      svgOptions.backgroundColor = '#ffffff';
    }
    svgOptions.qr = { errorCorrectionLevel: 'H', ...svgOptions.qr };
  }
  const svg = toSVGString({ ...svgOptions, value: value! });
  const outputSvg = imagePath
    ? blendImageIntoSvg(svg, await readLocalImage(imagePath), value!, options)
    : svg;
  if (output) {
    const outputPath = resolve(output);
    await writeFile(outputPath, outputSvg, 'utf8');
    process.stdout.write(`Wrote ${outputPath}\n`);
    return;
  }
  process.stdout.write(outputSvg);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `quter: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
