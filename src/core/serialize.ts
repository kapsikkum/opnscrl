import { migrateDocument, type RawDoc } from './migrations';
import { projectSchema } from './schema';
import type { Project } from './types';

export class ProjectParseError extends Error {
  constructor(
    message: string,
    readonly issues: readonly unknown[] = [],
  ) {
    super(message);
    this.name = 'ProjectParseError';
  }
}

/** Validate and return a plain-JSON-safe copy. Throws ProjectParseError if invalid. */
export function validateProject(value: unknown): Project {
  const r = projectSchema.safeParse(value);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.join('.') || '(root)';
    throw new ProjectParseError(`Invalid project at ${where}: ${first?.message ?? 'unknown error'}`, r.error.issues);
  }
  return r.data;
}

export function serializeProject(project: Project, pretty = false): string {
  const valid = validateProject(project);
  return pretty ? JSON.stringify(valid, null, 2) : JSON.stringify(valid);
}

/** Accepts a JSON string or an already-parsed object; migrates old versions; validates. */
export function parseProject(input: string | unknown): Project {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new ProjectParseError(`Not valid JSON: ${(e as Error).message}`);
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProjectParseError('Project document must be an object');
  }
  let migrated: RawDoc;
  try {
    migrated = migrateDocument(raw as RawDoc);
  } catch (e) {
    throw new ProjectParseError((e as Error).message);
  }
  return validateProject(migrated);
}
