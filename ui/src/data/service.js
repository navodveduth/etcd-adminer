import axios from 'axios';
import { SessionStore } from '../storage/session';

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

    GetConfig = async () => (await api.get('/api/getconfig')).data;

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

    PutKey = async (key, value, expectedRevision) => {
        await api.put('/api/keys', { key, value, expectedRevision }, this.requestConfig());
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

    DeleteUser = async (user) => {
        await api.delete(`/api/users/${segment(user)}`, this.requestConfig());
        return true;
    };
}
