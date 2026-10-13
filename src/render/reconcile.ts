import type Konva from 'konva';
import type { Layer } from '../core/types';
import { renderLayer, updateLayerNode } from '../layers/registry';
import type { LayerRenderContext } from '../layers/types';

interface Entry {
  layer: Layer;
  node: Konva.Group;
}

/**
 * Keeps a Konva container's children in sync with a list of layers, keyed by
 * layer id. Layers whose object identity did not change are skipped entirely
 * (the model is updated immutably with structural sharing), changed layers are
 * updated in place when the layer definition supports it, and only
 * added/removed layers create/destroy nodes.
 */
export class Reconciler {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly parent: Konva.Container,
    private readonly ctx: LayerRenderContext,
    /** Hook for editor-only node setup (draggable, listening...). */
    private readonly decorate?: (node: Konva.Group, layer: Layer) => void,
  ) {}

  /** Returns true if any node was added, replaced or removed (selection must be re-attached). */
  sync(layers: readonly Layer[], forceIds?: ReadonlySet<string>): boolean {
    let structural = false;
    const live = new Set<string>();
    for (const l of layers) live.add(l.id);

    for (const [id, entry] of this.entries) {
      if (!live.has(id)) {
        entry.node.destroy();
        this.entries.delete(id);
        structural = true;
      }
    }

    layers.forEach((layer, index) => {
      let entry = this.entries.get(layer.id);
      if (!entry) {
        const node = renderLayer(layer, this.ctx);
        this.parent.add(node);
        entry = { layer, node };
        this.entries.set(layer.id, entry);
        this.decorate?.(node, layer);
        structural = true;
      } else if (entry.layer !== layer || forceIds?.has(layer.id)) {
        const sameType = entry.layer.type === layer.type;
        if (!(sameType && updateLayerNode(entry.node, layer, this.ctx))) {
          const node = renderLayer(layer, this.ctx);
          this.parent.add(node);
          entry.node.destroy();
          entry.node = node;
          structural = true;
        }
        entry.layer = layer;
        this.decorate?.(entry.node, layer);
      }
      if (entry.node.zIndex() !== index) entry.node.zIndex(index);
    });
    return structural;
  }

  /**
   * Re-render a node from a transient layer (e.g. live geometry mid-resize)
   * without recording it: the next sync() compares against the last synced
   * layer, so the model stays the source of truth. Returns false if the layer
   * type cannot update in place.
   */
  preview(id: string, layer: Layer): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.layer.type !== layer.type) return false;
    return updateLayerNode(entry.node, layer, this.ctx);
  }

  getNode(id: string): Konva.Group | undefined {
    return this.entries.get(id)?.node;
  }

  destroy(): void {
    for (const e of this.entries.values()) e.node.destroy();
    this.entries.clear();
  }
}
