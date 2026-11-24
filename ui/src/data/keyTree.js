// A bounded display tree over one server page. Paths remain exact etcd key bytes
// represented as UTF-8 strings; binary keys are deliberately handled separately.
export function buildKeyTree(items) {
    const root = { id: '1', name: '/', type: 'directory', abspath: '', children: [] };
    const index = new Map();
    for (const item of items) {
        const prefix = item.key.startsWith('/') ? '/' : '';
        const parts = item.key.split('/');
        if (prefix) parts.shift();
        let parent = root;
        let path = prefix;
        parts.forEach((part, position) => {
            path += (position ? '/' : '') + part;
            const type = position < parts.length - 1 || item.isDirectory ? 'directory' : 'file';
            const id = `${type}:${path}`;
            let node = index.get(id);
            if (!node) {
                node = { id, name: part || '(empty segment)', type, abspath: path, children: [], isVirtual: Boolean(item.isVirtual) };
                index.set(id, node);
                parent.children.push(node);
            }
            parent = node;
        });
    }
    return root;
}
