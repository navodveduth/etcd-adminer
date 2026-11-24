import React, { useState, useEffect, useCallback } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Node from './etcdNode';
import { useDataService } from '../../data/context';
import Alert from '@mui/material/Alert';

export default function ClusterInfo(props) {
  const service = useDataService();

  const [clusterInfo, setClusterInfo] = useState({ clusterInfo: {} });
  const [errorMessage, setErrorMessage] = useState('');

  const fetchData = useCallback(async () => {
    try {
      let clusterInfo = await service.GetClusterInfo();
      setClusterInfo(clusterInfo);
      setErrorMessage('');
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message ??
          'Cluster inventory unavailable. Check this connection and administrator permissions.',
      );
    }
  }, [service]);

  useEffect(() => {
    fetchData();
  }, [props, fetchData]);

  const getAlert = () => {
    if (errorMessage !== '') {
      return <Alert severity="error">{errorMessage}</Alert>;
    }

    return null;
  };

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 6, lg: 6 }}>
        <Paper
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            height: 200,
          }}
        >
          {getAlert()}

          <Typography variant="h6" gutterBottom>
            Cluster Information
          </Typography>
          <Grid container spacing={3}>
            <Grid container size={12}>
              <Grid size={4}>
                <Typography>Cluster ID:</Typography>
              </Grid>
              <Grid size={8}>
                <Typography>{clusterInfo.clusterID}</Typography>
              </Grid>
              <Grid size={4}>
                <Typography>Member ID:</Typography>
              </Grid>
              <Grid size={8}>
                <Typography>{clusterInfo.memberID}</Typography>
              </Grid>
              <Grid size={4}>
                <Typography>Raft Term:</Typography>
              </Grid>
              <Grid size={8}>
                <Typography>{clusterInfo.raftTerm}</Typography>
              </Grid>
              <Grid size={4}>
                <Typography>Revision:</Typography>
              </Grid>
              <Grid size={8}>
                <Typography>{clusterInfo.revision}</Typography>
              </Grid>
            </Grid>
          </Grid>
        </Paper>

        <Paper
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            height: 800,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Nodes
          </Typography>
          <Grid container spacing={3}>
            <Grid container size={12}>
              {clusterInfo.nodes &&
                clusterInfo.nodes.map((node) => {
                  return (
                    <Node
                      key={node.ID}
                      name={node.name}
                      ID={node.ID}
                      isLearner={node.isLearner}
                      peerUrls={node.peerUrls}
                      clientUrls={node.clientUrls}
                      isLeader={node.isLeader}
                      dbSize={node.dbSize}
                      dbSizeInUse={node.dbSizeInUse}
                      available={node.available}
                      error={node.error}
                    />
                  );
                })}
            </Grid>
          </Grid>
        </Paper>
      </Grid>
    </Grid>
  );
}
