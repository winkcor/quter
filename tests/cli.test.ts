import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/cli';

describe('quter CLI arguments', () => {
  it('parses an SVG output path and styling options', () => {
    expect(
      parseCliArgs([
        'https://example.com',
        '--output',
        'qr.svg',
        '--size',
        '320',
        '--dot-style',
        'circle',
        '--dot-color',
        '#123456',
        '--logo',
        'logo.svg',
        '--logo-size',
        '0.3',
        '--image',
        'photo.jpg',
        '--image-dot-size',
        '0.35',
        '--corner-style',
        'extra-rounded',
        '--corner-color',
        '#008080',
        '--corner-dot-style',
        'rounded',
        '--corner-dot-color',
        '#008080',
      ]),
    ).toEqual({
      help: false,
      value: 'https://example.com',
      output: 'qr.svg',
      size: 320,
      dotStyle: 'circle',
      dotColor: '#123456',
      logoPath: 'logo.svg',
      logoSize: 0.3,
      imagePath: 'photo.jpg',
      imageDotSize: 0.35,
      corner: {
        square: { style: 'extra-rounded', color: '#008080' },
        dot: { style: 'rounded', color: '#008080' },
      },
    });
  });

  it('rejects invalid styling options and missing values', () => {
    expect(() => parseCliArgs(['https://example.com', '--size', '0'])).toThrow(
      '--size must be a positive number.',
    );
    expect(() => parseCliArgs(['https://example.com', '--dot-style', 'oval'])).toThrow(
      '--dot-style must be square, circle, or rounded.',
    );
    expect(() => parseCliArgs(['https://example.com', '--output'])).toThrow(
      'Missing value for --output.',
    );
    expect(() => parseCliArgs(['https://example.com', '--logo-size', '1.1'])).toThrow(
      '--logo-size must be between 0 and 1.',
    );
  });
});
