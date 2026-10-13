import { validateTemplate } from '../templates/codec';
import type { Template } from '../templates/schema';
import type { TemplateStore } from '../templates/sources';
import { getDb } from './db';

export async function saveTemplate(template: Template): Promise<void> {
  const valid = validateTemplate(template);
  const db = await getDb();
  await db.put('templates', valid);
}

export async function getTemplate(id: string): Promise<Template | null> {
  const db = await getDb();
  const raw = await db.get('templates', id);
  if (!raw) return null;
  try {
    return validateTemplate(raw);
  } catch {
    return null;
  }
}

export async function listTemplates(): Promise<Template[]> {
  const db = await getDb();
  const out: Template[] = [];
  for (const raw of await db.getAll('templates')) {
    try {
      out.push(validateTemplate(raw));
    } catch {
      /* skip corrupt records */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('templates', id);
}

/** Adapter for `createLocalSource` in templates/. */
export const templateStore: TemplateStore = { listTemplates, getTemplate, deleteTemplate };
