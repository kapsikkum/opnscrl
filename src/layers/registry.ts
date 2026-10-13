import type Konva from 'konva';
import { createId } from '../core/id';
import type { Layer, LayerOf, LayerType, PropsOf } from '../core/types';
import { backgroundLayer } from './background';
import { drawingLayer } from './drawing';
import { frameLayer } from './frame';
import { imageLayer } from './image';
import { lineLayer } from './line';
import { shapeLayer } from './shape';
import { stickerLayer } from './sticker';
import { textLayer } from './text';
import type { LayerDefinition, LayerRenderContext } from './types';

type Registry = { [T in LayerType]: LayerDefinition<T> };

/** The single place where layer types are registered. */
export const layerRegistry: Registry = {
  image: imageLayer,
  text: textLayer,
  shape: shapeLayer,
  frame: frameLayer,
  line: lineLayer,
  sticker: stickerLayer,
  drawing: drawingLayer,
  background: backgroundLayer,
};

export const layerTypes = Object.keys(layerRegistry) as LayerType[];

export function getLayerDefinition<T extends LayerType>(type: T): LayerDefinition<T> {
  const def = layerRegistry[type];
  if (!def) throw new Error(`Unknown layer type: ${type}`);
  return def as LayerDefinition<T>;
}

/** Type-erased view used where the concrete layer type is only known at runtime. */
const erased = (type: LayerType) => getLayerDefinition(type) as unknown as LayerDefinition<LayerType> & {
  render(layer: Layer, ctx: LayerRenderContext): Konva.Group;
  update?(node: Konva.Group, layer: Layer, ctx: LayerRenderContext): boolean | void;
};

export function renderLayer(layer: Layer, ctx: LayerRenderContext): Konva.Group {
  return erased(layer.type).render(layer, ctx);
}

/** Returns true if the node was updated in place, false if the caller must re-render. */
export function updateLayerNode(node: Konva.Group, layer: Layer, ctx: LayerRenderContext): boolean {
  const def = erased(layer.type);
  if (!def.update) return false;
  return def.update(node, layer, ctx) !== false;
}

export type NewLayerInit<T extends LayerType> = Partial<Omit<LayerOf<T>, 'type' | 'props'>> & {
  props?: Partial<PropsOf<T>>;
};

/** Build a complete, valid layer from a type's defaults plus overrides. */
export function createLayer<T extends LayerType>(type: T, init: NewLayerInit<T> = {}): LayerOf<T> {
  const def = getLayerDefinition(type);
  const { props, ...rest } = init;
  return {
    id: createId('lyr'),
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: def.label,
    ...def.base,
    ...rest,
    type,
    props: { ...def.defaults(), ...props },
  } as unknown as LayerOf<T>;
}
