import { describe, expect, it } from 'vitest';
import { ResourceDependencies } from './resource-dependencies.js';

describe('resource ownership', () => {
  it('retains every owner of a shared template or stylesheet', () => {
    const graph = new ResourceDependencies();
    graph.replace('first.ts', ['shared.html', 'shared.css', 'shared.css']);
    graph.replace('second.ts', ['shared.css']);
    expect(graph.owners('shared.css')).toEqual(['first.ts', 'second.ts']);
    graph.replace('first.ts', ['other.css']);
    expect(graph.owners('shared.css')).toEqual(['second.ts']);
    expect(graph.owners('shared.html')).toEqual([]);
    graph.remove('second.ts');
    expect(graph.owners('shared.css')).toEqual([]);
    graph.clear();
    expect(graph.owners('other.css')).toEqual([]);
  });
});
