import { normalizePath } from 'vite';

/** Bidirectional ownership for resources shared by multiple source modules. */
export class ResourceDependencies {
  private readonly resourcesBySource = new Map<string, Set<string>>();
  private readonly sourcesByResource = new Map<string, Set<string>>();

  replace(source: string, resources: Iterable<string>): void {
    source = normalizePath(source);
    this.remove(source);
    const unique = new Set([...resources].map(normalizePath));
    if (unique.size) this.resourcesBySource.set(source, unique);
    for (const resource of unique) {
      const sources = this.sourcesByResource.get(resource) ?? new Set<string>();
      sources.add(source);
      this.sourcesByResource.set(resource, sources);
    }
  }

  remove(source: string): void {
    source = normalizePath(source);
    for (const resource of this.resourcesBySource.get(source) ?? []) {
      const sources = this.sourcesByResource.get(resource);
      sources?.delete(source);
      if (sources?.size === 0) this.sourcesByResource.delete(resource);
    }
    this.resourcesBySource.delete(source);
  }

  dependencies(source: string): readonly string[] {
    return [...(this.resourcesBySource.get(normalizePath(source)) ?? [])];
  }

  owners(resource: string): readonly string[] {
    return [...(this.sourcesByResource.get(normalizePath(resource)) ?? [])];
  }

  clear(): void {
    this.resourcesBySource.clear();
    this.sourcesByResource.clear();
  }
}
