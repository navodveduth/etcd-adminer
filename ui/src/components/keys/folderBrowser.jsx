import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import FSNavigator from './tree';
import { buildKeyTree } from '../../data/keyTree';
import { useDataService } from '../../data/context';
import { isProjectPrefix, loadProjectKeys } from '../../data/projectKeys';

// Cache only branches the user has opened. Each branch has its own signed,
// snapshot-bound pagination; values are still fetched only by the editor.
export default function FolderBrowser({ prefix, refresh = 0, drafts, ...actions }) {
  const service = useDataService();
  const [records, setRecords] = useState({});
  const recordsRef = useRef({});
  const controllers = useRef(new Map());
  const update = useCallback((query, change) => {
    const next = { ...recordsRef.current, [query]: change(recordsRef.current[query] ?? {}) };
    recordsRef.current = next;
    setRecords(next);
  }, []);
  const load = useCallback(
    async (query, more = false) => {
      const previous = recordsRef.current[query];
      if (controllers.current.has(query) || (!more && previous?.loaded && !previous.error)) return;
      const controller = new AbortController();
      controllers.current.set(query, controller);
      const subtree = isProjectPrefix(query);
      update(query, (record) => ({ ...record, subtree, loading: true, error: null }));
      try {
        if (subtree) {
          const page = await loadProjectKeys(
            service,
            query,
            more ? previous : null,
            controller.signal,
            (progress) =>
              update(query, () => ({ ...progress, subtree: true, loaded: true, loading: true })),
          );
          controller.signal.throwIfAborted();
          update(query, () => ({ ...page, subtree: true, loaded: true, loading: false }));
          return;
        }
        const page = await service.GetFolderPage(
          { prefix: query, cursor: more ? previous.nextCursor : null, limit: 100 },
          controller.signal,
        );
        controller.signal.throwIfAborted();
        if (more && page.revision !== previous.revision)
          throw new Error('Folder snapshot changed. Refresh to retry.');
        if (
          page.items.length > 100 ||
          (page.hasMore && (!page.nextCursor || page.nextCursor === previous?.nextCursor))
        )
          throw new Error('Invalid folder continuation. Refresh to retry.');
        update(query, () => ({
          ...page,
          loaded: true,
          loading: false,
          items: more ? [...previous.items, ...page.items] : page.items,
        }));
      } catch (error) {
        if (!controller.signal.aborted)
          update(query, (record) => ({
            ...record,
            loading: false,
            error: error.response?.data?.message ?? error.message ?? 'Could not load this folder.',
          }));
      } finally {
        if (controllers.current.get(query) === controller) controllers.current.delete(query);
      }
    },
    [service, update],
  );
  useEffect(() => {
    const active = controllers.current;
    recordsRef.current = {};
    setRecords({});
    load(prefix);
    return () => {
      for (const controller of active.values()) controller.abort();
      active.clear();
    };
  }, [load, prefix, refresh]);
  const tree = useMemo(() => {
    const items = Object.values(records).flatMap((record) => record.items ?? []);
    const root = buildKeyTree([...items.filter((item) => item.keyEncoding === 'utf8'), ...drafts]);
    const projects = Object.entries(records).filter(([, record]) => record.subtree);
    const annotate = (node) => {
      if (node.type === 'directory') {
        node.folderPrefix = node.id === '1' ? prefix : `${node.abspath}/`;
        const scaffold = node.id !== '1' && prefix.startsWith(node.folderPrefix);
        node.folderState = scaffold
          ? { loaded: true, scaffold: true }
          : (records[node.folderPrefix] ?? {});
        const project = projects.find(([query]) => node.folderPrefix.startsWith(query));
        if (project && project[0] !== node.folderPrefix && !scaffold) {
          node.folderState = {
            loaded: true,
            subtree: true,
            projectOwner: project[0],
            partial: !project[1].loaded || project[1].hasMore || Boolean(project[1].error),
          };
        }
      }
      node.children.forEach(annotate);
    };
    annotate(root);
    return root;
  }, [records, drafts, prefix]);
  const root = records[prefix];
  const binaryCount = Object.values(records).reduce(
    (count, record) =>
      count + (record.items ?? []).filter((item) => item.keyEncoding !== 'utf8').length,
    0,
  );
  return (
    <>
      <Typography
        role="status"
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', my: 1 }}
      >
        {root?.error
          ? 'Folder listing incomplete'
          : !root?.loaded
            ? 'Loading folders…'
            : root.subtree
              ? `${root.items.length} project keys loaded · ${root.loading ? 'Loading…' : root.hasMore ? 'Partial project subtree' : 'Complete project subtree'}`
              : `${root.items.length} entries at this level · Subfolders load on expansion`}
      </Typography>
      {root?.loaded && !root.items.length && (
        <Typography variant="body2" color="text.secondary">
          No readable entries at this prefix.
        </Typography>
      )}
      {binaryCount > 0 && (
        <Alert severity="info">
          {binaryCount} binary folder entries cannot be displayed in the text tree.
        </Alert>
      )}
      <FSNavigator
        {...actions}
        resetVersion={refresh}
        keys={tree}
        loading={!root?.loaded && !root?.error}
        loadDirectory={(node, more = false) => {
          if (!node.isVirtual && !node.folderState?.scaffold && !node.folderState?.projectOwner)
            load(node.folderPrefix, more);
        }}
        cancelDirectory={(node) => {
          const controller = controllers.current.get(node.folderPrefix);
          if (controller) {
            controller.abort();
            controllers.current.delete(node.folderPrefix);
            update(node.folderPrefix, (record) => ({ ...record, loading: false }));
          }
        }}
      />
    </>
  );
}
