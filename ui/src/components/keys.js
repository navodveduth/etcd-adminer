import React, { useState, useEffect, useCallback, useMemo } from 'react';

import FSNavigator from './tree';
import KeysList from './keysList';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import EditorComponent from './editor';
import DataService from '../data/service'
import BottomInfoBar from './bottomInfoBar';

function TabPanel(props) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`keys-tabpanel-${index}`}
            aria-labelledby={`keys-tab-${index}`}
            style={{
                height: '100%',
                display: value === index ? 'flex' : 'none',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
            {...other}
        >
            {value === index && children}
        </div>
    );
}

export default function Keys(props) {
    const dataService = useMemo(() => new DataService(), []);

    const [activeKey, setActiveKey] = useState("/");
    const [keys, setKeys] = useState({ id: 'root', name: 'Parent' });
    const [isNewKey, setIsNewKey] = useState(false);
    const [tabValue, setTabValue] = useState(0);

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const createVirtualFile = async (path) => {
        try {
            let fileTree = await dataService.CreateNode(path, false);
            setKeys(fileTree);
            setActiveKey(path);
            setIsNewKey(true);
        } catch (error) {
            //TODO: display an error message
            console.error(error);
        }
    }

    const createVirtualDirectory = async (path) => {
        try {
            let fileTree = await dataService.CreateNode(path, true);
            setKeys(fileTree);
        } catch (error) {
            //TODO: display an error message
            console.error(error);
        }
    }

    const deleteKey = async (node) => {
        try {
            let isSuccess = await dataService.DeleteNode(node.abspath, node.type === "directory");
            if (isSuccess) {
                fetchKeys();
            }
        } catch (error) {
            console.error(error);
        }
    }

    const fetchKeys = useCallback(async () => {
        try {
            let keys = await dataService.GetKeys();
            setKeys(keys);
        } catch (error) {
            // TODO: display an error
            console.error(error);
        }
    }, [dataService])

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys])

    return (
        <React.Fragment>
            <Grid container spacing={1}>

                <Grid item xs={12} md={4} lg={3}>
                    <Paper
                        sx={{
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            height: 800,
                            overflow: 'hidden',
                        }}
                    >
                        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1, flexShrink: 0 }}>
                            <Tabs
                                value={tabValue}
                                onChange={handleTabChange}
                                aria-label="keys view tabs"
                                variant="fullWidth"
                            >
                                <Tab label="Folder" id="keys-tab-0" aria-controls="keys-tabpanel-0" />
                                <Tab label="List" id="keys-tab-1" aria-controls="keys-tabpanel-1" />
                            </Tabs>
                        </Box>

                        <TabPanel value={tabValue} index={0}>
                            <FSNavigator
                                keys={keys}
                                onKeyClick={setActiveKey}
                                fetchKeys={fetchKeys}
                                createFile={createVirtualFile}
                                createDirectory={createVirtualDirectory}
                                deleteKey={deleteKey}
                            />
                        </TabPanel>

                        <TabPanel value={tabValue} index={1}>
                            <KeysList
                                keys={keys}
                                onKeyClick={setActiveKey}
                                fetchKeys={fetchKeys}
                                deleteKey={deleteKey}
                            />
                        </TabPanel>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={8} lg={9}>
                    <EditorComponent etcdKey={activeKey} isNewKey={isNewKey} />
                </Grid>

                <Grid item xs={12}>
                    <BottomInfoBar />
                </Grid>
            </Grid>
        </React.Fragment>
    )
}
