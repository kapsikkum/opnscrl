/** Template workflows that need storage: instantiate, import/export files, save, share. */
import type { Project } from '../core/types';
import { getAsset, projectAssetIds, putAsset, saveTemplate, templateStore } from '../storage';
import {
  builtinSource,
  createLocalSource,
  decodeShareLink,
  decodeTemplateFile,
  projectToTemplate,
  templateToProject,
  type Template,
  type TemplateSource,
} from '../templates';
import { openNewProject, type Session } from './session';
import { blobToDataUrl, dataUrlToBlob } from './services';

export const localSource = createLocalSource(templateStore);

/** Sources shown in the template browser. A future online gallery is added here. */
export const templateSources: readonly TemplateSource[] = [builtinSource, localSource];

/** Create a project from a template (embedded photos are written to storage) and open it. */
export async function createProjectFromTemplate(template: Template, name?: string): Promise<Session> {
  const pending: Promise<unknown>[] = [];
  const project = templateToProject(template, {
    name,
    onAsset: (id, asset) => {
      pending.push(putAsset(dataUrlToBlob(asset.dataUrl), id));
    },
  });
  await Promise.all(pending);
  return openNewProject(project);
}

/** Parse a user-chosen `.opnscrl.json` file. */
export async function readTemplateFile(file: File): Promise<Template> {
  return decodeTemplateFile(await file.text());
}

/** Template from `location.hash`, or null if the hash carries none. Throws if the hash is damaged. */
export function templateFromLocation(): Template | null {
  return decodeShareLink(location.hash);
}

/** Make a template from the open project, loading photo bytes from storage when they are included. */
export async function buildTemplate(
  project: Project,
  opts: { name: string; description?: string; tags: string[]; includeAssets: boolean },
): Promise<Template> {
  const assetDataUrls: Record<string, string> = {};
  if (opts.includeAssets) {
    for (const id of projectAssetIds(project)) {
      const blob = await getAsset(id);
      if (blob) assetDataUrls[id] = await blobToDataUrl(blob);
    }
  }
  return projectToTemplate(project, { ...opts, assetDataUrls });
}

export async function saveToMyTemplates(template: Template): Promise<void> {
  await saveTemplate(template);
}
