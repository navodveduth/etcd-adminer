import axios from 'axios';
import { SessionStore, recordAuthentication, invalidateRemembered } from '../storage/session';
import { readSSE } from './sse';

const api = axios.create({ timeout: 30000 });
function expired(id) {
  if (!id) return;
  invalidateRemembered(id);
  window.dispatchEvent(new CustomEvent('adminer-session-expired', { detail: { id } }));
}
api.interceptors?.response.use(
  (result) => result,
  (error) => {
    if (error.response?.status === 401)
      expired(
        error.config?.headers?.get?.('X-Connection-ID') ??
          error.config?.headers?.['X-Connection-ID'],
      );
    return Promise.reject(error);
  },
);
const segment = (value) => encodeURIComponent(value);

export default class DataService {
  constructor(sessionStore = new SessionStore()) {
    this.sessionStore = sessionStore;
  }

  requestConfig = () => {
    const session = this.sessionStore.GetActiveSession();
    if (!session) throw new Error('Select an active connection first.');
    if (session.SessionID && session.Authenticated)
      return { headers: { 'X-Backend': session.BackEnd, 'X-Connection-ID': session.SessionID } };
    if (typeof session.Password !== 'string')
      throw new Error('This login expired. Reauthenticate the saved connection.');
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
    const authorization = config.auth
      ? {
          Authorization: `Basic ${btoa(Array.from(new TextEncoder().encode(`${config.auth.username}:${config.auth.password}`), (byte) => String.fromCharCode(byte)).join(''))}`,
        }
      : {};
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])),
    );
    const response = await fetch(`/api/v1/watch?${params}`, {
      headers: {
        ...config.headers,
        ...authorization,
        Accept: 'text/event-stream',
      },
      signal,
    });
    if (!response.ok) {
      if (response.status === 401) expired(config.headers['X-Connection-ID']);
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
  GetSessions = async (signal) => (await api.get('/api/v1/sessions', { signal })).data;
  Logout = async (id) => api.delete('/api/v1/sessions', { ...(id ? { params: { id } } : {}) });
  GetFolderPage = async (params, signal) =>
    (await api.get('/api/v1/folders', { ...this.requestConfig(), params, signal })).data;

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

  TestConnection = async (username, password, backend, signal, options) => {
    try {
      const result = await api.post('/api/auth', options ?? null, {
        auth: { username, password },
        headers: { 'X-Backend': backend },
        signal,
      });
      this.lastAuthentication = result?.data;
      if (options?.profile) recordAuthentication(options.profile, result?.data?.session);
      return true;
    } catch (error) {
      const { status, data } = error.response ?? {};
      // Only credential rejections are a failed login. Policy/proxy errors such as
      // invalid_origin must reach the UI instead of being labelled as a bad password.
      if (
        status === 401 ||
        (status === 403 &&
          (!data || ['unauthenticated', 'authentication_failed'].includes(data.code)))
      )
        return false;
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
