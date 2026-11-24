import axios from 'axios';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DataService from './service';

vi.mock('axios', () => ({ default: { create: vi.fn(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() })) } }));
const api = axios.create.mock.results[0].value;
const session = { UserName: 'alice', Password: 'secret', BackEnd: 'test' };
const service = new DataService({ GetActiveSession: () => session });

beforeEach(() => vi.resetAllMocks());

describe('DataService', () => {
    it('binds long-running workflows to their starting connection', async () => {
        let active = session;
        const bound = new DataService({ GetActiveSession: () => active }).BindActiveSession();
        active = { UserName: 'other', Password: 'different', BackEnd: 'production' };
        api.get.mockResolvedValue({ data: {} });
        await bound.FetchKey('/key');
        expect(api.get).toHaveBeenCalledWith('/api/keys', expect.objectContaining({
            auth: { username: 'alice', password: 'secret' }, headers: { 'X-Backend': 'test' },
        }));
    });
    it('waits for user creation and propagates failure', async () => {
        api.post.mockRejectedValue(new Error('permission denied'));
        await expect(service.CreateUser('new', 'password', [])).rejects.toThrow('permission denied');
        api.post.mockResolvedValue({ status: 201 });
        await expect(service.CreateUser('new', 'password', [])).resolves.toBe(true);
    });

    it('does not hide transport errors when response is absent', async () => {
        api.post.mockRejectedValue(new Error('network unavailable'));
        await expect(service.TestConnection('alice', 'secret', 'test')).rejects.toThrow('network unavailable');
        api.post.mockRejectedValue({ response: { status: 403 } });
        await expect(service.TestConnection('alice', 'bad', 'test')).resolves.toBe(false);
    });

    it('passes raw keys through params and role names through JSON', async () => {
        api.get.mockResolvedValue({ data: {} });
        await service.FetchKey('a?&#% /日本語');
        expect(api.get).toHaveBeenCalledWith('/api/keys', expect.objectContaining({ params: { key: 'a?&#% /日本語' } }));
        api.post.mockResolvedValue({});
        await service.AssignRole('a/b', 'read/write');
        expect(api.post).toHaveBeenCalledWith('/api/v1/users/roles', { userName: 'a/b', role: 'read/write', operation: 'grant' }, expect.any(Object));
    });

    it('updates an own-password profile only after the server confirms success', async () => {
        const profile = { ...session, Name: 'test-profile' };
        const save = vi.fn();
        const service = new DataService({ GetActiveSession: () => profile, Get: () => profile, Add: save });
        api.post.mockRejectedValueOnce(new Error('unavailable'));
        await expect(service.ChangePassword('alice', 'new-secret')).rejects.toThrow('unavailable');
        expect(save).not.toHaveBeenCalled();
        api.post.mockResolvedValue({});
        await expect(service.ChangePassword('alice', 'new-secret')).resolves.toEqual({ reauthenticate: false });
        expect(save).toHaveBeenCalledWith({ ...profile, Password: 'new-secret' });
    });

    it('rejects requests with no active connection before network access', async () => {
        await expect(new DataService({ GetActiveSession: () => null }).GetKeys()).rejects.toThrow('active connection');
        expect(api.get).not.toHaveBeenCalled();
    });
});
