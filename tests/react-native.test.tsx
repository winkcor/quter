import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-svg', async () => {
  const { createElement } = await import('react');
  return {
    ClipPath: 'clipPath',
    Defs: 'defs',
    G: 'g',
    Image: 'image',
    Mask: 'mask',
    Path: 'path',
    Rect: 'rect',
    Svg: ({
      accessibilityLabel,
      accessibilityRole,
      children,
      viewBox,
    }: {
      accessibilityLabel?: string;
      accessibilityRole?: string;
      children?: ReactNode;
      viewBox?: string;
    }) =>
      createElement(
        'svg',
        { 'aria-label': accessibilityLabel, role: accessibilityRole, viewBox },
        children,
      ),
  };
});

import Quter from '../src/react-native';

describe('React Native Quter', () => {
  it('renders native SVG QR paths and an optional local logo source', () => {
    const markup = renderToStaticMarkup(
      <Quter
        value="https://example.com"
        ariaLabel="Example QR code"
        logo={{ source: 17, size: 0.25, radius: 0.5 }}
      />,
    );

    expect(markup).toContain('<svg');
    expect(markup).toContain('<path');
    expect(markup).toContain('aria-label="Example QR code"');
    expect(markup).toContain('<image href="17"');
    expect(markup).toContain('clip-path="url(#');
    expect(markup).not.toContain('<canvas');
  });
});
