import { defineComponent, h, onBeforeUnmount, ref, watchEffect } from 'vue';
import type { PropType } from 'vue';
import type { QRCodeOptions } from './core';
import { renderQuter } from './vanilla';
import type { QuterOptions } from './vanilla';
import type { QuterFilter } from './quter-pixels';

export const Quter = defineComponent({
  name: 'Quter',
  props: {
    value: { type: String, required: true },
    size: Number,
    margin: Number,
    dotStyle: String as PropType<QRCodeOptions['dotStyle']>,
    dotColor: String,
    dotGradient: Object as PropType<QRCodeOptions['dotGradient']>,
    backgroundColor: String,
    backgroundGradient: Object as PropType<QRCodeOptions['backgroundGradient']>,
    corner: Object as PropType<QRCodeOptions['corner']>,
    qr: Object as PropType<QRCodeOptions['qr']>,
    logo: Object as PropType<QRCodeOptions['logo']>,
    imagePath: String,
    imageDotStyle: String as PropType<QRCodeOptions['dotStyle']>,
    imageDotSize: Number,
    imageColor: Boolean,
    filter: String as PropType<QuterFilter>,
    fillType: String as PropType<QuterOptions['fillType']>,
    ariaLabel: String,
    onImageError: Function as PropType<QuterOptions['onImageError']>,
  },
  setup(props, { attrs }) {
    const element = ref<HTMLElement | null>(null);
    let dispose: (() => void) | undefined;
    watchEffect(() => {
      if (element.value) {
        dispose?.();
        dispose = renderQuter(element.value, props as QuterOptions);
      }
    });
    onBeforeUnmount(() => dispose?.());
    return () => h('div', { ...attrs, ref: element });
  },
});

export default Quter;
