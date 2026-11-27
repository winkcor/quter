import { renderQuter } from './vanilla';
import type { QuterOptions } from './vanilla';

export interface AngularElementRef {
  readonly nativeElement: HTMLElement;
}

export function renderAngularQuter(
  elementRef: AngularElementRef,
  options: QuterOptions,
): () => void {
  return renderQuter(elementRef.nativeElement, options);
}
