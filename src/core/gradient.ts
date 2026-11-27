import type { QRGradient } from './types';

export function gradientId(prefix: string, name: string): string {
  return `${prefix}${name}`;
}

export function gradientRotation(gradient: QRGradient): number {
  const angle = gradient.angle ?? 0;
  return Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0;
}

export function gradientCoordinates(gradient: QRGradient) {
  const radians = (gradientRotation(gradient) * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return {
    x1: `${Math.round((0.5 - dx) * 100)}%`,
    y1: `${Math.round((0.5 - dy) * 100)}%`,
    x2: `${Math.round((0.5 + dx) * 100)}%`,
    y2: `${Math.round((0.5 + dy) * 100)}%`,
  };
}

export function svgGradient(
  id: string,
  gradient: QRGradient,
): string {
  const { x1, y1, x2, y2 } = gradientCoordinates(gradient);
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0%" stop-color="${escapeAttribute(gradient.startColor)}"/><stop offset="100%" stop-color="${escapeAttribute(gradient.endColor)}"/></linearGradient>`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
