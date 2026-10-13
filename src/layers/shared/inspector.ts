import type { InspectorFieldSpec } from '../types';

/** Reusable inspector field specs shared by several layer types. */

export const radiusField: InspectorFieldSpec = {
  key: 'cornerRadius',
  label: 'Corner radius',
  kind: 'radius',
  min: 0,
  max: 600,
  step: 1,
  unit: 'px',
};

export const borderField: InspectorFieldSpec = {
  key: 'border',
  label: 'Border',
  kind: 'group',
  initial: { width: 12, color: '#ffffff' },
  fields: [
    { key: 'width', label: 'Width', kind: 'slider', min: 1, max: 120, step: 1, unit: 'px' },
    { key: 'color', label: 'Color', kind: 'color' },
  ],
};

export const shadowField: InspectorFieldSpec = {
  key: 'shadow',
  label: 'Shadow',
  kind: 'group',
  initial: { color: '#000000', blur: 40, offsetX: 0, offsetY: 16, opacity: 0.35 },
  fields: [
    { key: 'color', label: 'Color', kind: 'color' },
    { key: 'blur', label: 'Blur', kind: 'slider', min: 0, max: 200, step: 1, unit: 'px' },
    { key: 'offsetX', label: 'Offset X', kind: 'slider', min: -200, max: 200, step: 1, unit: 'px' },
    { key: 'offsetY', label: 'Offset Y', kind: 'slider', min: -200, max: 200, step: 1, unit: 'px' },
    { key: 'opacity', label: 'Opacity', kind: 'slider', min: 0, max: 1, step: 0.01 },
  ],
};

export const fitField: InspectorFieldSpec = {
  key: 'fit',
  label: 'Fit',
  kind: 'select',
  options: [
    { value: 'cover', label: 'Fill (crop)' },
    { value: 'contain', label: 'Fit (letterbox)' },
  ],
};
