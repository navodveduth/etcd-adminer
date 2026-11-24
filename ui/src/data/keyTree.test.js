import { expect, it } from 'vitest';
import { buildKeyTree } from './keyTree';

it('preserves paths and stable IDs for unusual keys and key/folder collisions', () => {
    const keys = ['foo', '/foo', '/foo/child', 'a//b/', '/', '日本語'];
    const tree = buildKeyTree(keys.map((key) => ({ key })));
    const files = [];
    const walk = (node) => { if (node.type === 'file') files.push(node); node.children.forEach(walk); };
    walk(tree);
    expect(files.map((node) => node.abspath).sort()).toEqual([...keys].sort());
    expect(new Set(files.map((node) => node.id)).size).toBe(keys.length);
    const again = buildKeyTree([{ key: '/foo' }]);
    expect(again.children[0].id).toBe(files.find((node) => node.abspath === '/foo').id);
});
