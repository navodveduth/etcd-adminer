import * as React from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import FolderIcon from '@mui/icons-material/Folder';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import ConfirmationDialog from '../dialogs/confirmationDialog';
import NewDirectoryDialog from '../dialogs/newDirectoryDialog';
import NewFileDialog from '../dialogs/newFileDialog';
import ArticleIcon from '@mui/icons-material/Article';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DuplicateFolderDialog from './duplicateFolderDialog';
import { useReadOnly } from '../../readOnly';

export default function FSNavigator(props) {
  const readOnly = useReadOnly();

  const [contextMenu, setContextMenu] = React.useState(null);
  const [deleteConfirmationDialogOpen, setdeleteConfirmationDialogOpen] = React.useState(false);
  const [contextMenuSelectedNode, setContextMenuSelectedNode] = React.useState(null);
  const [newDirectoryDialogOpen, setnewDirectoryDialogOpen] = React.useState(false);
  const [newFileDialogOpen, setnewFileDialogOpen] = React.useState(false);
  const [duplicateSource, setDuplicateSource] = React.useState(null);

  const handleContextMenu = (event, node) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX - 2,
            mouseY: event.clientY - 4,
          }
        : // repeated contextmenu when it is already open closes it with Chrome 84 on Ubuntu
          // Other native context menus might behave different.
          // With this behavior we prevent contextmenu from the backdrop to re-locale existing context menus.
          null,
    );

    setContextMenuSelectedNode(node);
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleAction = (action) => {
    handleClose();
    switch (action) {
      case 'refresh':
        props.fetchKeys();
        break;
      case 'newfile':
        setnewFileDialogOpen(true);
        break;
      case 'delete':
        setdeleteConfirmationDialogOpen(true);
        break;
      case 'newdir':
        setnewDirectoryDialogOpen(true);
        break;
      case 'duplicate':
        setDuplicateSource(`${contextMenuSelectedNode.abspath}/`);
        break;
      default:
        break;
    }
  };

  const renderTree = (nodes) => (
    <TreeItem
      key={nodes.id}
      itemId={nodes.id.toString()}
      label={nodes.name}
      type={nodes.type}
      data-index={nodes.abspath}
      data-is-virtual={nodes.isVirtual}
      onClick={(event) => {
        event.stopPropagation();
        if (nodes.type === 'file' && !nodes.isVirtual) props.onKeyClick(nodes.abspath);
      }}
      onContextMenu={(event) => handleContextMenu(event, nodes)}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          const position = event.currentTarget.getBoundingClientRect();
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ mouseX: position.left + 24, mouseY: position.top + 24 });
          setContextMenuSelectedNode(nodes);
        } else if (event.key === 'Enter' && nodes.type === 'file' && !nodes.isVirtual) {
          event.preventDefault();
          event.stopPropagation();
          props.onKeyClick(nodes.abspath);
        }
      }}
    >
      {Array.isArray(nodes.children) ? nodes.children.map((node) => renderTree(node)) : null}
    </TreeItem>
  );

  const onConfirmationDialogCancel = () => {
    setdeleteConfirmationDialogOpen(false);
  };

  const onConfirmationDialogConfirm = () => {
    setdeleteConfirmationDialogOpen(false);
    props.deleteKey(contextMenuSelectedNode);
  };

  const getDeleteDialogContent = () => {
    if (contextMenuSelectedNode === null) {
      return '';
    }
    if (contextMenuSelectedNode.type === 'directory') {
      const prefix = contextMenuSelectedNode.abspath.endsWith('/')
        ? contextMenuSelectedNode.abspath
        : `${contextMenuSelectedNode.abspath}/`;
      return `Delete ALL keys with raw prefix ${JSON.stringify(prefix)}? This includes keys not shown on this page.`;
    }
    return 'Do you really want to delete key ' + contextMenuSelectedNode.abspath + ' ?';
  };

  const newDirectoryDialogSubmit = (name) => {
    setnewDirectoryDialogOpen(false);
    props.createDirectory(contextMenuSelectedNode.abspath + '/' + name);
  };

  const newDirectoryDialogClose = () => {
    setnewDirectoryDialogOpen(false);
  };

  const newFileDialogSubmit = (name) => {
    setnewFileDialogOpen(false);
    props.createFile(contextMenuSelectedNode.abspath + '/' + name);
  };

  const newFileDialogClose = () => {
    setnewFileDialogOpen(false);
  };

  return (
    <div>
      {props.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {props.error}
          <Button size="small" onClick={props.fetchKeys} sx={{ ml: 2 }}>
            Retry
          </Button>
        </Alert>
      )}

      {props.loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 700 }}>
          <CircularProgress size={40} />
        </Box>
      ) : (
        <SimpleTreeView
          aria-label="Key folders on this page"
          defaultExpandedItems={['1']}
          slots={{ collapseIcon: FolderOpenIcon, expandIcon: FolderIcon, endIcon: ArticleIcon }}
          sx={{ height: 700, flexGrow: 1, maxWidth: 400, overflowY: 'auto' }}
        >
          {renderTree(props.keys)}
        </SimpleTreeView>
      )}
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
      >
        <MenuItem
          onClick={() => handleAction('newfile')}
          data-id="newfile"
          disabled={
            readOnly ||
            (contextMenuSelectedNode !== null && contextMenuSelectedNode.type === 'file')
          }
        >
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>New File</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => handleAction('newdir')}
          data-id="newdir"
          disabled={
            readOnly ||
            (contextMenuSelectedNode !== null && contextMenuSelectedNode.type === 'file')
          }
        >
          <ListItemIcon>
            <CreateNewFolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>New Directory</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => handleAction('duplicate')}
          disabled={
            readOnly ||
            contextMenuSelectedNode?.type !== 'directory' ||
            !contextMenuSelectedNode?.abspath ||
            contextMenuSelectedNode?.isVirtual
          }
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate folder…</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => handleAction('delete')}
          data-id="delete"
          disabled={readOnly || !contextMenuSelectedNode?.abspath}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAction('refresh')} data-id="refresh">
          <ListItemIcon>
            <RefreshIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Refresh</ListItemText>
        </MenuItem>
      </Menu>

      <ConfirmationDialog
        open={deleteConfirmationDialogOpen}
        onCancel={onConfirmationDialogCancel}
        onConfirm={onConfirmationDialogConfirm}
        title={'Delete Key?'}
        content={getDeleteDialogContent()}
      />

      <NewDirectoryDialog
        prefix={`${contextMenuSelectedNode?.abspath ?? ''}/`}
        open={newDirectoryDialogOpen}
        handleSubmit={newDirectoryDialogSubmit}
        handleClose={newDirectoryDialogClose}
      />

      <NewFileDialog
        prefix={`${contextMenuSelectedNode?.abspath ?? ''}/`}
        open={newFileDialogOpen}
        handleSubmit={newFileDialogSubmit}
        handleClose={newFileDialogClose}
      />
      {duplicateSource !== null && (
        <DuplicateFolderDialog
          key={duplicateSource}
          source={duplicateSource}
          onClose={() => setDuplicateSource(null)}
          onCopied={props.fetchKeys}
        />
      )}
    </div>
  );
}
