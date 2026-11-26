import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
import FolderBrowser from './folderBrowser';
import KeysList from './keysList';
import EditorComponent from './editor';
import CreateKeyDialog from './createKeyDialog';
import AddIcon from '@mui/icons-material/Add';
import { useDataService } from '../../data/context';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useReadOnly } from '../../readOnly';
import { Link, useSearchParams } from 'react-router-dom';
import { patchKeyPage, reconnectDelay } from '../../data/liveKeys';
import { EmptyState, ErrorState, PageHeader, StatusBadge } from '../shared/page';
import ConfirmationDialog from '../dialogs/confirmationDialog';
import { useWorkspaceActivity } from '../../data/activity';

export default function Keys() {
  const [params, setParams] = useSearchParams();
  const queryPrefix = (params.get('prefix') ?? '').slice(0, 8192);
  const queryKey = params.get('key')?.slice(0, 8192) || null;
  const queryView = params.get('view') === 'list' ? 1 : 0;
  const updateQuery = useCallback(
    (name, value) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value) next.set(name, value);
          else next.delete(name);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const widthID = useId();
  const readOnly = useReadOnly();
  const service = useDataService();
  const [activeKey, setActiveKey] = useState(queryKey);
  const [isNewKey, setIsNewKey] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState(queryView);
  const [prefixInput, setPrefixInput] = useState(queryPrefix);
  const [prefix, setPrefix] = useState(queryPrefix);
  const [prefixComposing, setPrefixComposing] = useState(false);
  const prefixPending = prefixComposing || prefixInput !== prefix;
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
  const [addingKey, setAddingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState('');
  useWorkspaceActivity('draft', dirty ? 'Unsaved draft' : '');
  useWorkspaceActivity('keys-watch', view === 1 && live && prefix ? `Keys: ${liveStatus}` : '');
  const prefixRef = useRef(null);
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const pageRef = useRef(page);
  pageRef.current = page;
  const locationState = useRef({ prefix: queryPrefix, key: queryKey, view: queryView });
  const editingState = useRef({ activeKey, dirty });
  editingState.current = { activeKey, dirty };
  const cancelLocationKey = useRef(undefined);
  useEffect(() => {
    const previous = locationState.current;
    locationState.current = { prefix: queryPrefix, key: queryKey, view: queryView };
    if (previous.prefix !== queryPrefix) {
      setPrefixInput(queryPrefix);
      setPrefix(queryPrefix);
      setCursor(null);
    }
    if (previous.view !== queryView) {
      setView(queryView);
      setCursor(null);
      setLoading(true);
    }
    if (previous.key !== queryKey && editingState.current.activeKey !== queryKey) {
      const apply = () => {
        setIsNewKey(false);
        setActiveKey(queryKey);
      };
      if (editingState.current.dirty) {
        cancelLocationKey.current = previous.key;
        setPendingAction(() => apply);
      } else apply();
    }
  }, [queryPrefix, queryKey, queryView]);

  useEffect(() => {
    if (prefixComposing || prefixInput === prefix) return;
    const timer = setTimeout(() => {
      setCursor(null);
      setPrefix(prefixInput);
      locationState.current.prefix = prefixInput;
      updateQuery('prefix', prefixInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [prefixInput, prefix, prefixComposing, updateQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelected([]);
    setMembershipStale(false);
    setServerRevisions({});
    if (view === 0) {
      setLoading(false);
      return () => controller.abort();
    }
    if (prefixPending) return () => controller.abort();
    setPage({ items: [], hasMore: false, revision: '0' });
    service
      .GetKeyPage({ prefix, cursor, limit: 100 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPage(data);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setError(
          error.response?.data?.message ??
            error.message ??
            'Could not load this page. Retry or restart the listing.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, prefix, cursor, refresh, prefixPending, view]);

  useEffect(() => {
    if (
      view !== 1 ||
      !live ||
      !prefix ||
      loading ||
      prefixPending ||
      error ||
      page.revision === '0'
    ) {
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
  }, [view, live, prefix, loading, prefixPending, error, page.revision, service, cursor, refresh]);

  const restart = useCallback(() => {
    setCursor(null);
    setRefresh((version) => version + 1);
  }, []);

  const textItems = page.items.filter((item) => item.keyEncoding === 'utf8');

  const selectKey = (key) => {
    if (key === activeKey) return;
    if (dirty) {
      setPendingAction(() => () => {
        setIsNewKey(drafts.some((item) => item.key === key && !item.isDirectory));
        setActiveKey(key);
        updateQuery('key', key);
      });
      return;
    }
    setIsNewKey(drafts.some((item) => item.key === key && !item.isDirectory));
    setActiveKey(key);
    updateQuery('key', key);
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
        updateQuery('key', null);
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
    updateQuery('key', key);
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
        compact
        title="Key browser"
        actions={
          <>
            <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 1, mr: 1 }}>
              <Typography
                component="label"
                htmlFor={widthID}
                variant="caption"
                color="text.secondary"
              >
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
                style={{ width: 100 }}
              />
            </Box>
            {dirty && <StatusBadge label="Unsaved draft" color="warning" />}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={readOnly}
              onClick={() => setAddingKey(true)}
            >
              New key
            </Button>
          </>
        }
      />
      {createdKey && (
        <Alert
          severity="success"
          onClose={() => setCreatedKey('')}
          sx={{ mb: 2, overflowWrap: 'anywhere' }}
        >
          Created <code>{createdKey}</code>. Your editor draft is unchanged. If the key is outside
          this prefix or page, apply its prefix to find it.
        </Alert>
      )}
      {addingKey && (
        <CreateKeyDialog
          initialKey={prefixInput}
          onClose={() => setAddingKey(false)}
          onCreated={(key) => {
            setAddingKey(false);
            setCreatedKey(key);
            restart();
          }}
        />
      )}
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
            component="section"
            aria-label="Key browser controls"
            variant="outlined"
            sx={{ p: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Tabs
                value={view}
                onChange={(_event, value) => {
                  // Do not render a 6,000-key folder index as List table rows for
                  // one commit before the query effect switches to a 100-key page.
                  setLoading(true);
                  setPage({ items: [], hasMore: false, revision: '0' });
                  setCursor(null);
                  setView(value);
                  locationState.current.view = value;
                  updateQuery('view', value === 1 ? 'list' : null);
                }}
                aria-label="Key view"
                sx={{ flex: 1, minWidth: 0 }}
              >
                <Tab label="Folder" />
                <Tab label="List" />
              </Tabs>
              <Tooltip title="Refresh keys">
                <span>
                  <IconButton
                    aria-label="Refresh keys"
                    onClick={restart}
                    disabled={prefixPending || (view === 1 && loading)}
                  >
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <Box sx={{ mb: 1 }}>
              <TextField
                inputRef={prefixRef}
                fullWidth
                size="small"
                label="Key prefix"
                value={prefixInput}
                onChange={(event) => setPrefixInput(event.target.value)}
                onCompositionStart={() => setPrefixComposing(true)}
                onCompositionEnd={(event) => {
                  setPrefixInput(event.target.value);
                  setPrefixComposing(false);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !prefixComposing &&
                    !event.nativeEvent.isComposing &&
                    prefixInput !== prefix
                  ) {
                    event.preventDefault();
                    setCursor(null);
                    setPrefix(prefixInput);
                    locationState.current.prefix = prefixInput;
                    updateQuery('prefix', prefixInput);
                  }
                }}
                helperText={
                  prefixPending
                    ? 'Filtering…'
                    : 'Filters automatically as you type. Matches the start of each key.'
                }
              />
            </Box>
            {view === 1 && (
              <Typography role="status" variant="caption" color="text.secondary" sx={{ my: 1 }}>
                {loading || prefixPending ? (
                  'Updating results…'
                ) : error ? (
                  'Listing incomplete — refresh to retry.'
                ) : (
                  <>
                    {page.items.length} keys on this page · Snapshot revision{' '}
                    <code>{page.revision}</code>
                    {page.hasMore ? ' · More pages available' : ' · Last page'}
                  </>
                )}
              </Typography>
            )}
            {readOnly && (
              <Typography variant="caption" color="info.main" sx={{ mb: 1 }}>
                View only. Changes are disabled by instance policy or your current permissions.
              </Typography>
            )}
            <Box component="details" sx={{ mb: 1, fontSize: 12, color: 'text.secondary' }}>
              <Box component="summary" sx={{ cursor: 'pointer', py: 0.5 }}>
                Live updates · {liveStatus}
              </Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={live}
                    disabled={view === 0 || !prefix || prefixPending || loading}
                    onChange={(event) => setLive(event.target.checked)}
                  />
                }
                label={`Live prefix updates: ${liveStatus}`}
              />
              {!prefix && (
                <Typography variant="caption">
                  Enter a nonempty prefix to enable live updates.
                </Typography>
              )}
              {view === 0 && (
                <Typography variant="caption">
                  Use List view for live prefix updates. Refresh folders to discover changes.
                </Typography>
              )}
            </Box>
            {membershipStale && (
              <Alert severity="warning">
                Live page membership may be incomplete or the watch needs resync. Refresh to load a
                fresh snapshot. Drafts are preserved.
              </Alert>
            )}
            {view === 1 && <ErrorState message={error} onRetry={restart} />}
            {view === 1 && textItems.length !== page.items.length && (
              <Alert severity="info">
                {page.items.length - textItems.length} binary keys on this page cannot be edited in
                the text view.
              </Alert>
            )}
            {view === 1 &&
              !loading &&
              !prefixPending &&
              !error &&
              !page.items.length &&
              !drafts.length && (
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
                prefixPending ? (
                  <Typography role="status">Filtering…</Typography>
                ) : (
                  <FolderBrowser
                    key={prefix}
                    prefix={prefix}
                    refresh={refresh}
                    drafts={drafts}
                    onKeyClick={selectKey}
                    fetchKeys={restart}
                    createFile={(key) => createDraft(key, false)}
                    createDirectory={(key) => createDraft(key, true)}
                    deleteKey={deleteKey}
                  />
                )
              ) : (
                <KeysList
                  activeKey={activeKey}
                  items={[...textItems, ...drafts.filter((item) => !item.isDirectory)]}
                  loading={loading || prefixPending}
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
            {view === 1 && (
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ mt: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}
              >
                <Button
                  onClick={() => setCursor(page.nextCursor)}
                  disabled={loading || prefixPending || Boolean(error) || !page.hasMore}
                >
                  Next page
                </Button>
              </Stack>
            )}
          </Paper>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <EditorComponent
            actions={
              activeKey && (
                <Button
                  size="small"
                  component={Link}
                  to={`/watchers?mode=exact&key=${encodeURIComponent(activeKey)}`}
                >
                  Watch this key
                </Button>
              )
            }
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
        onCancel={() => {
          setPendingAction(null);
          if (cancelLocationKey.current !== undefined) {
            updateQuery('key', cancelLocationKey.current);
            cancelLocationKey.current = undefined;
          }
        }}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          cancelLocationKey.current = undefined;
          action?.();
        }}
      />
    </Box>
  );
}
