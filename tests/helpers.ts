import { createProject } from '../src/core/project';
import type { Layer, Project } from '../src/core/types';

export function rectLayer(id: string, patch: Partial<Layer> = {}): Layer {
  return {
    id,
    type: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: id,
    props: { kind: 'rect', fill: { kind: 'solid', color: '#f00' }, stroke: '#000', strokeWidth: 0, cornerRadius: 0 },
    ...patch,
  } as Layer;
}

export function sampleProject(layerIds: string[] = []): Project {
  const p = createProject({ id: 'p1', name: 'Test', now: 1000 });
  return { ...p, layers: layerIds.map((id) => rectLayer(id)) };
}
