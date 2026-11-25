import axios from 'axios';
import { SessionStore } from '../storage/session';
import { readSSE } from './sse';

const api = axios.create({ timeout: 30000 });
const segment = (value) => encodeURIComponent(value);

export default class DataService {
  constructor(sessionStore = new SessionStore()) {
    this.sessionStore = sessionStore;
  }

  requestConfig = () => {
    const session = this.sessionStore.GetActiveSession();
    if (!session) throw new Error('Select an active connection first.');
    return {
      auth: { username: session.UserName, password: session.Password },
      headers: { 'X-Backend': session.BackEnd },
    };
  };

  BindActiveSession = () => {
    const active = this.sessionStore.GetActiveSession();
    if (!active) throw new Error('Select an active connection first.');
    const snapshot = { ...active };
    return new DataService({ GetActiveSession: () => snapshot });
  };

  WatchChanges = async (query, onFrame, signal) => {
    const config = this.requestConfig();
    const bytes = new TextEncoder().encode(`${config.auth.username}:${config.auth.password}`);
    const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])),
    );
    const response = await fetch(`/api/v1/watch?${params}`, {
      headers: {
        ...config.headers,
        Authorization: `Basic ${encoded}`,
        Accept: 'text/event-stream',
      },
      signal,
    });
    if (!response.ok) {
      const data = await response
        .json()
        .catch(() => ({ message: 'Could not establish the watch.' }));
      const error = new Error(data.message);
      error.response = { status: response.status, data };
      throw error;
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
      throw new Error('The server did not return an event stream.');
    await readSSE(response.body, onFrame, signal);
  };

  GetConfig = async (signal) => (await api.get('/api/getconfig', { signal })).data;

  GetClusterInfo = async (signal) =>
    (await api.get('/api/clusterinfo', { ...this.requestConfig(), signal })).data;
  GetMetrics = async (signal) =>
    (await api.get('/api/v1/cluster/metrics', { ...this.requestConfig(), signal })).data;
  GetCapabilities = async (signal, key) =>
    (
      await api.get('/api/v1/capabilities', {
        ...this.requestConfig(),
        ...(key ? { params: { key } } : {}),
        signal,
      })
    ).data;
  ExportPage = async (params, signal) =>
    (await api.get('/api/v1/transfer/export', { ...this.requestConfig(), params, signal })).data;
  TransferBatch = async (batch, signal) =>
    (await api.post('/api/v1/transfer/batch', batch, { ...this.requestConfig(), signal })).data;

  TestConnection = async (username, password, backend, signal) => {
    try {
      await api.post('/api/auth', null, {
        auth: { username, password },
        headers: { 'X-Backend': backend },
        signal,
      });
      return true;
    } catch (error) {
      if ([401, 403].includes(error.response?.status)) return false;
      throw error;
    }
  };

  GetRoles = async (signal) =>
    (await api.get('/api/role', { ...this.requestConfig(), signal })).data;
  ListRoles = async (signal) =>
    (await api.get('/api/v1/roles', { ...this.requestConfig(), signal })).data;
  GetRole = async (name, signal) =>
    (await api.get('/api/v1/roles/detail', { ...this.requestConfig(), params: { name }, signal }))
      .data;
  CreateRole = async (name) => api.post('/api/v1/roles', { name }, this.requestConfig());
  DeleteRole = async (name) =>
    api.delete('/api/v1/roles/detail', {
      ...this.requestConfig(),
      params: { name },
      data: { confirmation: name },
    });
  GrantPermission = async (permission) =>
    api.post('/api/v1/roles/permissions', permission, this.requestConfig());
  RevokePermission = async (name, permission) =>
    api.delete('/api/v1/roles/permissions', {
      ...this.requestConfig(),
      data: { name, keyBase64: permission.keyBase64, rangeEndBase64: permission.rangeEndBase64 },
    });

  CreateUser = async (userName, password, roles) => {
    await api.post('/api/users', { userName, password, roles }, this.requestConfig());
    return true;
  };

  FetchKey = async (key, signal) =>
    (
      await api.get('/api/keys', {
        ...this.requestConfig(),
        params: { key },
        signal,
      })
    ).data;

  PutKey = async (key, value, expectedRevision, lease, signal) => {
    await api.put(
      '/api/keys',
      { key, value, expectedRevision, ...(lease === undefined ? {} : { lease }) },
      { ...this.requestConfig(), signal },
    );
    return true;
  };

  CreateNode = async (path, isDirectory) =>
    (
      await api.post(
        '/api/directory',
        {
          path,
          isDirectory,
        },
        this.requestConfig(),
      )
    ).data;

  DeleteNode = async (key, isDirectory) => {
    await api.delete('/api/keys', { ...this.requestConfig(), data: { key, isDirectory } });
    return true;
  };

  GetKeys = async (signal) =>
    (
      await api.get('/api/keys', {
        ...this.requestConfig(),
        signal,
      })
    ).data;

  GetKeyPage = async ({ prefix = '', cursor, limit = 100 }, signal) =>
    (
      await api.get('/api/v1/keys', {
        ...this.requestConfig(),
        params: { prefix, cursor, limit },
        signal,
      })
    ).data;

  FetchUser = async (name, signal) =>
    (await api.get('/api/v1/users/detail', { ...this.requestConfig(), params: { name }, signal }))
      .data;

  AssignRole = async (user, role, confirmation) => {
    await api.post(
      '/api/v1/users/roles',
      { userName: user, role, operation: 'grant', ...(confirmation ? { confirmation } : {}) },
      this.requestConfig(),
    );
    return true;
  };

  RemoveRole = async (user, role) => {
    await api.post(
      '/api/v1/users/roles',
      { userName: user, role, operation: 'revoke' },
      this.requestConfig(),
    );
    return true;
  };

  GetUsers = async (signal) =>
    (await api.get('/api/users', { ...this.requestConfig(), signal })).data;

  ChangePassword = async (userName, password) => {
    const profile = this.sessionStore.GetActiveSession();
    const config = this.requestConfig();
    await api.post('/api/v1/users/password', { userName, password }, config);
    let reauthenticate = config.auth.username === userName;
    if (reauthenticate && this.sessionStore.Get && this.sessionStore.Add) {
      const saved = this.sessionStore.Get(profile.Name);
      if (saved?.BackEnd === config.headers['X-Backend'] && saved.UserName === userName) {
        try {
          this.sessionStore.Add({ ...saved, Password: password });
          reauthenticate = false;
        } catch {
          /* The server change succeeded; require explicit reauthentication instead. */
        }
      }
    }
    return { reauthenticate };
  };

  GetLeases = async (signal) =>
    (await api.get('/api/v1/leases', { ...this.requestConfig(), signal })).data;
  GetLease = async (id, signal) =>
    (await api.get(`/api/v1/leases/${segment(id)}`, { ...this.requestConfig(), signal })).data;
  GrantLease = async (ttl) =>
    (await api.post('/api/v1/leases', { ttl }, this.requestConfig())).data;
  RenewLease = async (id, signal) =>
    (
      await api.post(`/api/v1/leases/${segment(id)}/renew`, null, {
        ...this.requestConfig(),
        signal,
      })
    ).data;
  RevokeLease = async (id) =>
    api.delete(`/api/v1/leases/${segment(id)}`, {
      ...this.requestConfig(),
      data: { confirmation: id },
    });

  DeleteUser = async (user) => {
    await api.delete('/api/v1/users/detail', {
      ...this.requestConfig(),
      params: { name: user },
      data: { confirmation: user },
    });
    return true;
  };
}
