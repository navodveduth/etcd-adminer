import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import FSNavigator from './tree';
import KeysList from './keysList';
import EditorComponent from './editor';
import { useDataService } from '../../data/context';
import { buildKeyTree } from '../../data/keyTree';
import { useReadOnly } from '../../readOnly';
import { Link } from 'react-router-dom';
import { patchKeyPage, reconnectDelay } from '../../data/liveKeys';
import { EmptyState, ErrorState, PageHeader, ReadOnlyNotice, StatusBadge } from '../shared/page';
import ConfirmationDialog from '../dialogs/confirmationDialog';
import { useWorkspaceActivity } from '../../data/activity';

export default function Keys() {
  const widthID = useId();
  const readOnly = useReadOnly();
  const service = useDataService();
  const [activeKey, setActiveKey] = useState(null);
  const [isNewKey, setIsNewKey] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState(0);
  const [prefixInput, setPrefixInput] = useState('');
  const [prefix, setPrefix] = useState('');
  const [cursor, setCursor] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState({ items: [], hasMore: false, revision: '0' });
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [live, setLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState('Off');
  const [membershipStale, setMembershipStale] = useState(false);
  const [serverRevisions, setServerRevisions] = useState({});
  const [browserWidth, setBrowserWidth] = useState(36);
  const [pendingAction, setPendingAction] = useState(null);
  useWorkspaceActivity('draft', dirty ? 'Unsaved draft' : '');
  useWorkspaceActivity('keys-watch', live && prefix ? `Keys: ${liveStatus}` : '');
  const prefixRef = useRef(null);
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelected([]);
    setMembershipStale(false);
    setServerRevisions({});
    service
      .GetKeyPage({ prefix, cursor, limit: 100 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPage(data);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setError(
          error.response?.data?.message ??
            'Could not load this page. Retry or restart the listing.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, prefix, cursor, refresh]);

  useEffect(() => {
    if (!live || !prefix || loading || error || page.revision === '0') {
      setLiveStatus('Off');
      return;
    }
    const controller = new AbortController();
    let revision = page.revision;
    let failures = 0;
    const listen = async () => {
      while (!controller.signal.aborted) {
        let plannedReconnect = false;
        try {
          setLiveStatus('Connecting');
          await service.WatchChanges(
            { key: prefix, mode: 'prefix', values: false, afterRevision: revision },
            (frame) => {
              if (controller.signal.aborted) return;
              if (frame.event === 'resync') {
                const error = new Error(frame.data.message);
                error.fatal = true;
                throw error;
              }
              if (frame.event === 'ready') setLiveStatus('Live');
              if (frame.event === 'reconnect') {
                plannedReconnect = true;
                failures = 0;
              }
              if (frame.event === 'changes') {
                const events = frame.data.events.filter(
                  (event) => BigInt(event.revision) > BigInt(revision),
                );
                const updated = patchKeyPage(
                  pageRef.current,
                  events,
                  Boolean(cursor || pageRef.current.hasMore),
                );
                pageRef.current = updated.page;
                setPage(updated.page);
                if (updated.stale) setMembershipStale(true);
                const selectedEvent = events.findLast(
                  (event) => event.keyEncoding === 'utf8' && event.key === activeKeyRef.current,
                );
                if (selectedEvent)
                  setServerRevisions({
                    [selectedEvent.key]:
                      selectedEvent.type === 'DELETE' ? 'deleted' : selectedEvent.revision,
                  });
                revision = frame.data.revision;
                failures = 0;
              }
            },
            controller.signal,
          );
          if (!plannedReconnect && !controller.signal.aborted)
            throw new Error('Watch disconnected before a planned reconnect.');
        } catch (error) {
          if (controller.signal.aborted) return;
          if (
            error.fatal ||
            [400, 401, 403, 409].includes(error.response?.status) ||
            ++failures >= 5
          ) {
            setLiveStatus('Needs refresh');
            setMembershipStale(true);
            return;
          }
        }
        setLiveStatus('Reconnecting');
        await reconnectDelay(Math.min(30000, 1000 * 2 ** failures), controller.signal);
      }
    };
    listen().catch(() => {});
    return () => controller.abort();
  }, [live, prefix, loading, error, page.revision, service, cursor, refresh]);

  const restart = useCallback(() => {
    setCursor(null);
    setRefresh((version) => version + 1);
  }, []);

  const textItems = page.items.filter((item) => item.keyEncoding === 'utf8');
  const tree = useMemo(
    () => buildKeyTree([...page.items.filter((item) => item.keyEncoding === 'utf8'), ...drafts]),
    [page.items, drafts],
  );

  const selectKey = (key) => {
    if (key === activeKey) return;
    if (dirty) {
      setPendingAction(() => () => {
        setIsNewKey(drafts.some((item) => item.key === key && !item.isDirectory));
        setActiveKey(key);
      });
      return;
    }
    setIsNewKey(drafts.some((item) => item.key === key && !item.isDirectory));
    setActiveKey(key);
  };

  const createDraft = (key, isDirectory, confirmed = false) => {
    if (readOnly) return;
    if (!key) return;
    if (!isDirectory && key === activeKey && isNewKey) return;
    if (!isDirectory && dirty && !confirmed) {
      setPendingAction(() => () => createDraft(key, isDirectory, true));
      return;
    }
    setDrafts((items) => [
      ...items.filter((item) => item.key !== key),
      { key, isDirectory, isVirtual: true },
    ]);
    if (!isDirectory) {
      setActiveKey(key);
      setIsNewKey(true);
    }
  };

  const deleteKey = async (node, confirmed = false) => {
    if (readOnly) return;
    try {
      const deletingSelection =
        activeKey === node.abspath ||
        (node.type === 'directory' && activeKey?.startsWith(`${node.abspath}/`));
      if (deletingSelection && dirty && !confirmed) {
        setPendingAction(() => () => deleteKey(node, true));
        return;
      }
      if (!node.isVirtual) await service.DeleteNode(node.abspath, node.type === 'directory');
      setDrafts((items) => items.filter((item) => item.key !== node.abspath));
      if (deletingSelection) {
        setActiveKey(null);
        setIsNewKey(false);
        setDirty(false);
      }
      restart();
    } catch (error) {
      setError(
        error.response?.data?.message ?? 'Deletion failed. No successful deletion was confirmed.',
      );
    }
  };

  const onSaved = (key) => {
    setDrafts((items) => items.filter((item) => item.key !== key));
    setIsNewKey(false);
    restart();
  };

  return (
    <Box
      onKeyDownCapture={(event) => {
        if (event.altKey && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          prefixRef.current?.focus();
        }
        if (event.altKey && event.key.toLowerCase() === 'r') {
          event.preventDefault();
          restart();
        }
      }}
    >
      <PageHeader
        title="Key browser"
        description="Browse a consistent snapshot by prefix. Select an exact key to inspect its value; changes are saved only after revision checks."
        actions={
          <StatusBadge
            label={dirty ? 'Unsaved draft' : 'No unsaved changes'}
            color={dirty ? 'warning' : 'default'}
          />
        }
      />
      {readOnly && <ReadOnlyNotice />}
      <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography component="label" htmlFor={widthID} variant="caption" color="text.secondary">
          Browser width
        </Typography>
        <input
          id={widthID}
          type="range"
          min="25"
          max="60"
          value={browserWidth}
          onChange={(event) => setBrowserWidth(Number(event.target.value))}
          aria-valuetext={`${browserWidth} percent`}
          style={{ width: 140 }}
        />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: `minmax(0, ${browserWidth}fr) minmax(0, ${100 - browserWidth}fr)`,
          },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Paper
            variant="outlined"
            sx={{ p: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}
          >
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                setPrefix(prefixInput);
                restart();
              }}
            >
              <TextField
                inputRef={prefixRef}
                fullWidth
                size="small"
                label="Key prefix"
                value={prefixInput}
                onChange={(event) => setPrefixInput(event.target.value)}
              />
              <Button type="submit" disabled={loading}>
                Apply prefix
              </Button>
            </Box>
            <Tabs value={view} onChange={(_event, value) => setView(value)} aria-label="Key view">
              <Tab label="Folder" />
              <Tab label="List" />
            </Tabs>
            <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
              {page.items.length} keys on this page · Snapshot revision <code>{page.revision}</code>
              {page.hasMore ? ' · More pages available' : ' · Last page'}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={live}
                  disabled={!prefix}
                  onChange={(event) => setLive(event.target.checked)}
                />
              }
              label={`Live prefix updates: ${liveStatus}`}
            />
            {!prefix && (
              <Typography variant="caption">
                Apply a nonempty prefix to enable live updates.
              </Typography>
            )}
            {membershipStale && (
              <Alert severity="warning">
                Live page membership may be incomplete or the watch needs resync. Restart / refresh
                to load a fresh snapshot. Drafts are preserved.
              </Alert>
            )}
            <ErrorState message={error} onRetry={restart} />
            {textItems.length !== page.items.length && (
              <Alert severity="info">
                {page.items.length - textItems.length} binary keys on this page cannot be edited in
                the text view.
              </Alert>
            )}
            {!loading && !error && !page.items.length && !drafts.length && (
              <EmptyState
                compact
                title="No keys on this page"
                description="Try a different prefix, or create a key from the folder view when you have write access."
              />
            )}
            <Box
              sx={{
                ...(view === 0 && { maxHeight: { xs: '45vh', lg: '60vh' }, overflow: 'auto' }),
                minWidth: 0,
              }}
            >
              {view === 0 ? (
                <FSNavigator
                  keys={tree}
                  loading={loading}
                  onKeyClick={selectKey}
                  fetchKeys={restart}
                  createFile={(key) => createDraft(key, false)}
                  createDirectory={(key) => createDraft(key, true)}
                  deleteKey={deleteKey}
                />
              ) : (
                <KeysList
                  activeKey={activeKey}
                  items={[...textItems, ...drafts.filter((item) => !item.isDirectory)]}
                  loading={loading}
                  onKeyClick={selectKey}
                  deleteKey={deleteKey}
                  selected={selected}
                  onSelect={(key) =>
                    setSelected((items) =>
                      items.includes(key) ? items.filter((item) => item !== key) : [...items, key],
                    )
                  }
                />
              )}
            </Box>
            {selected.length > 0 && (
              <Button
                color="error"
                disabled={readOnly || dirty}
                component={Link}
                to="/transfer"
                state={{ keys: selected }}
              >
                Preview deleting {selected.length} selected keys…
              </Button>
            )}
            <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: 'wrap' }}>
              <Button onClick={restart} disabled={loading}>
                Restart / refresh
              </Button>
              <Button
                onClick={() => setCursor(page.nextCursor)}
                disabled={loading || Boolean(error) || !page.hasMore}
              >
                Next page
              </Button>
            </Stack>
          </Paper>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          {activeKey && (
            <Button
              component={Link}
              to={`/watchers?mode=exact&key=${encodeURIComponent(activeKey)}`}
            >
              Watch this key
            </Button>
          )}
          <EditorComponent
            etcdKey={activeKey}
            isNewKey={isNewKey}
            onSaved={onSaved}
            onDirtyChange={setDirty}
            serverRevision={serverRevisions[activeKey]}
          />
        </Box>
      </Box>
      <ConfirmationDialog
        open={Boolean(pendingAction)}
        title="Discard unsaved changes?"
        content="The current editor draft will be discarded before continuing. Your saved value is not changed by discarding the draft."
        confirmLabel="Discard and continue"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          action?.();
        }}
      />
    </Box>
  );
}
