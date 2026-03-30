// app/src/lib/loan-engine/sections/registry.ts
import type { SectionId, SectionBuilder } from '../types.js';

const registry = new Map<SectionId, SectionBuilder>();

export function registerSection(id: SectionId, builder: SectionBuilder): void {
  registry.set(id, builder);
}

export function getSection(id: SectionId): SectionBuilder | undefined {
  return registry.get(id);
}

export function getAllRegistered(): SectionId[] {
  return [...registry.keys()];
}
