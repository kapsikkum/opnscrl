import type Konva from 'konva';
import type { z } from 'zod';
import type { Layer, LayerOf, LayerType, PropsOf } from '../core/types';

/** Anything Konva can draw as an image and whose size we can read. */
export type ImageSource = HTMLImageElement | ImageBitmap;

/** Injected by the host app so storage stays decoupled from rendering. */
export type AssetResolver = (assetId: string) => Promise<ImageSource>;

/** Injected by the renderer / exporter; keeps layers decoupled from storage. */
export interface LayerRenderContext {
  /** 'edit' = live editor scene, 'export' = offscreen export scene (no placeholders/UI). */
  mode: 'edit' | 'export';
  /** Resolve an asset id to a decoded image. Cached by the caller. */
  resolveAsset: AssetResolver;
  /**
   * Register async work (image loads) that must finish before the scene is
   * considered complete. The exporter awaits all tracked promises.
   */
  track(work: Promise<unknown>): void;
}

/**
 * Declarative description of one inspector control for a layer's props. The UI
 * renders any layer type from these specs (see ui/Inspector).
 *
 * Kinds: number / slider (min, max, step), color, text, textarea, select
 * (options), toggle, fill (solid or gradient), font (curated font picker),
 * radius (uniform or per-corner), and group - a nullable object prop (border,
 * shadow, stroke) with an on/off switch whose members are described by
 * `fields`; `initial` is the value when it is switched on.
 */
export interface InspectorFieldSpec {
  /** Key inside `layer.props` (or inside the group object for sub-fields). */
  key: string;
  label: string;
  kind: 'number' | 'slider' | 'color' | 'text' | 'textarea' | 'select' | 'toggle' | 'fill' | 'font' | 'radius' | 'group';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly { value: string | number; label: string }[];
  /** kind 'group': sub-field specs. */
  fields?: readonly InspectorFieldSpec[];
  /** kind 'group': JSON value used when the group is switched on. */
  initial?: unknown;
  /** Only show this field while another prop of the same object has the given value. */
  showWhen?: { key: string; value: string | number | boolean };
}

export type LayerBaseInit = Partial<Omit<Layer, 'id' | 'type' | 'props'>>;

export interface LayerDefinition<T extends LayerType = LayerType> {
  type: T;
  /** Human-readable name (layer list, "Add" menu, default layer name). */
  label: string;
  /** Icon key for the UI (resolved by the UI layer; any short string). */
  icon?: string;
  /** Zod schema of `layer.props` (shared with core serialization). */
  schema: z.ZodType<PropsOf<T>>;
  /** Fresh default props. Must return a new object each call. */
  defaults(): PropsOf<T>;
  /** Defaults for the non-props fields (size, lock state...) used by createLayer(). */
  base?: LayerBaseInit;
  /**
   * Build the Konva node for a layer. The node's `id()` MUST be the layer id,
   * and the node should be a Group whose geometry matches the layer box so
   * the Transformer works (use createLayerGroup / applyBase from ./shared/base).
   */
  render(layer: LayerOf<T>, ctx: LayerRenderContext): Konva.Group;
  /**
   * Update an existing node in place after the layer changed. Optional: when
   * missing (or when it returns false) the reconciler re-renders just this
   * layer and swaps the node.
   */
  update?(node: Konva.Group, layer: LayerOf<T>, ctx: LayerRenderContext): boolean | void;
  /** Inspector controls for this layer's props. */
  inspector?: readonly InspectorFieldSpec[];
}
