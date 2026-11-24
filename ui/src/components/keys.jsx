import { useCallback, useEffect, useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import FSNavigator from './tree';
import KeysList from './keysList';
import EditorComponent from './editor';
import DataService from '../data/service';
import { buildKeyTree } from '../data/keyTree';

export default function Keys() {
    const service = useMemo(() => new DataService(), []);
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

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        service.GetKeyPage({ prefix, cursor, limit: 100 }, controller.signal).then((data) => {
            if (!controller.signal.aborted) setPage(data);
        }).catch((error) => {
            if (controller.signal.aborted) return;
            setError(error.response?.data?.message ?? 'Could not load this page. Retry or restart the listing.');
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [service, prefix, cursor, refresh]);

    const restart = useCallback(() => {
        setCursor(null);
        setRefresh((version) => version + 1);
    }, []);

    const textItems = page.items.filter((item) => item.keyEncoding === 'utf8');
    const tree = useMemo(() => buildKeyTree([
        ...page.items.filter((item) => item.keyEncoding === 'utf8'), ...drafts,
    ]), [page.items, drafts]);

    const selectKey = (key) => {
        if (key === activeKey) return;
        if (dirty && !window.confirm('Discard unsaved changes?')) return;
        setIsNewKey(drafts.some((item) => item.key === key && !item.isDirectory));
        setActiveKey(key);
    };

    const createDraft = (key, isDirectory) => {
        if (!key) return;
        if (!isDirectory && dirty && !window.confirm('Discard unsaved changes?')) return;
        setDrafts((items) => [...items.filter((item) => item.key !== key), { key, isDirectory, isVirtual: true }]);
        if (!isDirectory) { setActiveKey(key); setIsNewKey(true); }
    };

    const deleteKey = async (node) => {
        try {
            const deletingSelection = activeKey === node.abspath || (node.type === 'directory' && activeKey?.startsWith(`${node.abspath}/`));
            if (deletingSelection && dirty && !window.confirm('Discard unsaved changes and delete?')) return;
            if (!node.isVirtual) await service.DeleteNode(node.abspath, node.type === 'directory');
            setDrafts((items) => items.filter((item) => item.key !== node.abspath));
            if (deletingSelection) { setActiveKey(null); setIsNewKey(false); }
            restart();
        } catch (error) {
            setError(error.response?.data?.message ?? 'Deletion failed. No successful deletion was confirmed.');
        }
    };

    const onSaved = (key) => {
        setDrafts((items) => items.filter((item) => item.key !== key));
        setIsNewKey(false);
        restart();
    };

    return (
        <Grid container spacing={1}>
            <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 500 }}>
                    <Box component="form" onSubmit={(event) => { event.preventDefault(); setPrefix(prefixInput); restart(); }}>
                        <TextField fullWidth size="small" label="Key prefix" value={prefixInput} onChange={(event) => setPrefixInput(event.target.value)} />
                        <Button type="submit" disabled={loading}>Apply prefix</Button>
                    </Box>
                    <Tabs value={view} onChange={(_event, value) => setView(value)} aria-label="Key view">
                        <Tab label="Folder" /><Tab label="List" />
                    </Tabs>
                    <p>Showing one page (up to 100 keys). Revision: {page.revision}</p>
                    {error && <Alert severity="error">{error}</Alert>}
                    {textItems.length !== page.items.length && <Alert severity="info">{page.items.length - textItems.length} binary keys on this page cannot be edited in the text view.</Alert>}
                    {view === 0 ? (
                        <FSNavigator keys={tree} loading={loading} onKeyClick={selectKey} fetchKeys={restart}
                            createFile={(key) => createDraft(key, false)} createDirectory={(key) => createDraft(key, true)} deleteKey={deleteKey} />
                    ) : (
                        <KeysList items={[...textItems, ...drafts.filter((item) => !item.isDirectory)]} loading={loading} onKeyClick={selectKey} deleteKey={deleteKey} />
                    )}
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Button onClick={restart} disabled={loading}>Restart / refresh</Button>
                        <Button onClick={() => setCursor(page.nextCursor)} disabled={loading || Boolean(error) || !page.hasMore}>Next page</Button>
                    </Stack>
                </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 8, lg: 9 }}>
                <EditorComponent etcdKey={activeKey} isNewKey={isNewKey} onSaved={onSaved} onDirtyChange={setDirty} />
            </Grid>
        </Grid>
    );
}
