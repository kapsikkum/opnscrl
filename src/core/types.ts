import type { z } from 'zod';
import type {
  assetMetaSchema,
  aspectSchema,
  backgroundLayerSchema,
  backgroundPropsSchema,
  canvasSchema,
  cropSchema,
  fillSchema,
  frameLayerSchema,
  framePropsSchema,
  imageLayerSchema,
  imagePropsSchema,
  lineLayerSchema,
  linePropsSchema,
  borderSchema,
  boxShadowSchema,
  cornerRadiusSchema,
  layerSchema,
  projectSchema,
  shapeLayerSchema,
  shapePropsSchema,
  textLayerSchema,
  textPropsSchema,
  adjustSchema,
  stickerLayerSchema,
  stickerPropsSchema,
  drawingLayerSchema,
  drawingPropsSchema,
  strokeSchema,
  textBackgroundSchema,
} from './schema';

export type Aspect = z.infer<typeof aspectSchema>;
export type Fill = z.infer<typeof fillSchema>;
export type Crop = z.infer<typeof cropSchema>;
export type AssetMeta = z.infer<typeof assetMetaSchema>;
export type CanvasSettings = z.infer<typeof canvasSchema>;

export type CornerRadius = z.infer<typeof cornerRadiusSchema>;
export type Border = z.infer<typeof borderSchema>;
export type BoxShadow = z.infer<typeof boxShadowSchema>;
export type LineProps = z.infer<typeof linePropsSchema>;
export type ImageProps = z.infer<typeof imagePropsSchema>;
export type TextProps = z.infer<typeof textPropsSchema>;
export type ShapeProps = z.infer<typeof shapePropsSchema>;
export type FrameProps = z.infer<typeof framePropsSchema>;
export type BackgroundProps = z.infer<typeof backgroundPropsSchema>;
export type Adjust = z.infer<typeof adjustSchema>;
export type AdjustKey = keyof Adjust;
export type StickerProps = z.infer<typeof stickerPropsSchema>;
export type DrawingProps = z.infer<typeof drawingPropsSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type TextBackground = z.infer<typeof textBackgroundSchema>;

export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;
export type FrameLayer = z.infer<typeof frameLayerSchema>;
export type LineLayer = z.infer<typeof lineLayerSchema>;
export type BackgroundLayer = z.infer<typeof backgroundLayerSchema>;
export type StickerLayer = z.infer<typeof stickerLayerSchema>;
export type DrawingLayer = z.infer<typeof drawingLayerSchema>;

export type Layer = z.infer<typeof layerSchema>;
export type LayerType = Layer['type'];
export type LayerOf<T extends LayerType> = Extract<Layer, { type: T }>;
export type PropsOf<T extends LayerType> = LayerOf<T>['props'];

export type Project = z.infer<typeof projectSchema>;

/** Fields of a layer that an updateLayer patch may change (id/type are immutable). */
export type LayerPatch = Partial<Omit<Layer, 'id' | 'type' | 'props'>> & {
  /** Shallow-merged into the layer's props. */
  props?: Partial<Layer['props']>;
};
