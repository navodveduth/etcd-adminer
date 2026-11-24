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
        const params = new URLSearchParams(Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])));
        const response = await fetch(`/api/v1/watch?${params}`, {
            headers: { ...config.headers, Authorization: `Basic ${encoded}`, Accept: 'text/event-stream' }, signal,
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({ message: 'Could not establish the watch.' }));
            const error = new Error(data.message);
            error.response = { status: response.status, data };
            throw error;
        }
        if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('The server did not return an event stream.');
        await readSSE(response.body, onFrame, signal);
    };

    GetConfig = async (signal) => (await api.get('/api/getconfig', { signal })).data;

    GetClusterInfo = async () => (await api.get('/api/clusterinfo', this.requestConfig())).data;

    TestConnection = async (username, password, backend) => {
        try {
            await api.post('/api/auth', null, {
                auth: { username, password },
                headers: { 'X-Backend': backend },
            });
            return true;
        } catch (error) {
            if ([401, 403].includes(error.response?.status)) return false;
            throw error;
        }
    };

    GetRoles = async () => (await api.get('/api/role', this.requestConfig())).data;

    CreateUser = async (userName, password, roles) => {
        await api.post('/api/users', { userName, password, roles }, this.requestConfig());
        return true;
    };

    FetchKey = async (key, signal) => (await api.get('/api/keys', {
        ...this.requestConfig(), params: { key }, signal,
    })).data;

    PutKey = async (key, value, expectedRevision, lease) => {
        await api.put('/api/keys', { key, value, expectedRevision, ...(lease === undefined ? {} : { lease }) }, this.requestConfig());
        return true;
    };

    CreateNode = async (path, isDirectory) => (await api.post('/api/directory', {
        path, isDirectory,
    }, this.requestConfig())).data;

    DeleteNode = async (key, isDirectory) => {
        await api.delete('/api/keys', { ...this.requestConfig(), data: { key, isDirectory } });
        return true;
    };

    GetKeys = async (signal) => (await api.get('/api/keys', {
        ...this.requestConfig(), signal,
    })).data;

    GetKeyPage = async ({ prefix = '', cursor, limit = 100 }, signal) => (await api.get('/api/v1/keys', {
        ...this.requestConfig(), params: { prefix, cursor, limit }, signal,
    })).data;

    FetchUser = async (username) => (await api.get(`/api/users/${segment(username)}`, this.requestConfig())).data;

    AssignRole = async (user, role) => {
        await api.post(`/api/users/${segment(user)}/role/${segment(role)}`, null, this.requestConfig());
        return true;
    };

    RemoveRole = async (user, role) => {
        await api.delete(`/api/users/${segment(user)}/role/${segment(role)}`, this.requestConfig());
        return true;
    };

    GetUsers = async () => (await api.get('/api/users', this.requestConfig())).data;

    GetLeases = async (signal) => (await api.get('/api/v1/leases', { ...this.requestConfig(), signal })).data;
    GetLease = async (id, signal) => (await api.get(`/api/v1/leases/${segment(id)}`, { ...this.requestConfig(), signal })).data;
    GrantLease = async (ttl) => (await api.post('/api/v1/leases', { ttl }, this.requestConfig())).data;
    RenewLease = async (id) => (await api.post(`/api/v1/leases/${segment(id)}/renew`, null, this.requestConfig())).data;
    RevokeLease = async (id) => api.delete(`/api/v1/leases/${segment(id)}`, { ...this.requestConfig(), data: { confirmation: id } });

    DeleteUser = async (user) => {
        await api.delete(`/api/users/${segment(user)}`, this.requestConfig());
        return true;
    };
}
