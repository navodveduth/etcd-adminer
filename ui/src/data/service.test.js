import axios from 'axios';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DataService from './service';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() })),
  },
}));
const api = axios.create.mock.results[0].value;
const session = { UserName: 'alice', Password: 'secret', BackEnd: 'test' };
const service = new DataService({ GetActiveSession: () => session });

beforeEach(() => vi.resetAllMocks());

describe('DataService', () => {
  it('uses the cookie-bound reference instead of sending a remembered password', async () => {
    const remembered = new DataService({
      GetActiveSession: () => ({
        Name: 'saved',
        BackEnd: 'prod',
        UserName: 'alice',
        SessionID: 'reference',
        Authenticated: true,
      }),
    });
    api.get.mockResolvedValue({ data: {} });
    await remembered.GetFolderPage({ prefix: '' });
    expect(api.get).toHaveBeenLastCalledWith(
      '/api/v1/folders',
      expect.objectContaining({ headers: { 'X-Backend': 'prod', 'X-Connection-ID': 'reference' } }),
    );
    expect(api.get.mock.calls[0][1]).not.toHaveProperty('auth');
  });

  it('restores and revokes browser sessions without exposing credentials', async () => {
    api.get.mockResolvedValue({ data: { connections: [] } });
    api.delete.mockResolvedValue({ status: 204 });
    const signal = new AbortController().signal;
    await service.GetSessions(signal);
    expect(api.get).toHaveBeenCalledWith('/api/v1/sessions', { signal });
    await service.Logout('reference');
    expect(api.delete).toHaveBeenCalledWith('/api/v1/sessions', { params: { id: 'reference' } });
    await service.Logout();
    expect(api.delete).toHaveBeenLastCalledWith('/api/v1/sessions', {});
  });
  it('passes folder prefix, cursor and cancellation using caller-scoped credentials', async () => {
    const page = { items: [], revision: '7', hasMore: false };
    api.get.mockResolvedValue({ data: page });
    const signal = new AbortController().signal;
    const params = { prefix: '/system/', cursor: 'signed', limit: 100 };
    await expect(service.GetFolderPage(params, signal)).resolves.toBe(page);
    expect(api.get).toHaveBeenCalledWith('/api/v1/folders', {
      params,
      signal,
      auth: { username: 'alice', password: 'secret' },
      headers: { 'X-Backend': 'test' },
    });
  });
  it('passes create-only key revisions and cancellation to the workspace-scoped request', async () => {
    api.put.mockResolvedValue({ data: { revision: '42' } });
    const signal = new AbortController().signal;
    await expect(service.PutKey('/exact/new', 'value', '0', undefined, signal)).resolves.toBe(true);
    expect(api.put).toHaveBeenCalledWith(
      '/api/keys',
      { key: '/exact/new', value: 'value', expectedRevision: '0' },
      expect.objectContaining({
        signal,
        headers: { 'X-Backend': 'test' },
        auth: { username: 'alice', password: 'secret' },
      }),
    );
  });
  it('binds long-running workflows to their starting connection', async () => {
    let active = session;
    const bound = new DataService({ GetActiveSession: () => active }).BindActiveSession();
    active = { UserName: 'other', Password: 'different', BackEnd: 'production' };
    api.get.mockResolvedValue({ data: {} });
    await bound.FetchKey('/key');
    expect(api.get).toHaveBeenCalledWith(
      '/api/keys',
      expect.objectContaining({
        auth: { username: 'alice', password: 'secret' },
        headers: { 'X-Backend': 'test' },
      }),
    );
  });
  it('waits for user creation and propagates failure', async () => {
    api.post.mockRejectedValue(new Error('permission denied'));
    await expect(service.CreateUser('new', 'password', [])).rejects.toThrow('permission denied');
    api.post.mockResolvedValue({ status: 201 });
    await expect(service.CreateUser('new', 'password', [])).resolves.toBe(true);
  });

  it('does not hide transport errors when response is absent', async () => {
    api.post.mockRejectedValue(new Error('network unavailable'));
    await expect(service.TestConnection('alice', 'secret', 'test')).rejects.toThrow(
      'network unavailable',
    );
    api.post.mockRejectedValue({ response: { status: 403 } });
    await expect(service.TestConnection('alice', 'bad', 'test')).resolves.toBe(false);
  });

  it('preserves origin and policy failures instead of reporting incorrect credentials', async () => {
    const rejectedOrigin = {
      response: {
        status: 403,
        data: { code: 'invalid_origin', message: 'cross-origin mutations are not allowed' },
      },
    };
    api.post.mockRejectedValue(rejectedOrigin);
    await expect(service.TestConnection('alice', 'secret', 'test')).rejects.toBe(rejectedOrigin);
    const policyFailure = {
      response: { status: 403, data: { code: 'forbidden', message: 'permission denied' } },
    };
    api.post.mockRejectedValue(policyFailure);
    await expect(service.TestConnection('alice', 'secret', 'test')).rejects.toBe(policyFailure);
    api.post.mockRejectedValue({ response: { status: 401, data: { code: 'unauthenticated' } } });
    await expect(service.TestConnection('alice', 'bad', 'test')).resolves.toBe(false);
  });

  it('passes raw keys through params and role names through JSON', async () => {
    api.get.mockResolvedValue({ data: {} });
    await service.FetchKey('a?&#% /日本語');
    expect(api.get).toHaveBeenCalledWith(
      '/api/keys',
      expect.objectContaining({ params: { key: 'a?&#% /日本語' } }),
    );
    api.post.mockResolvedValue({});
    await service.AssignRole('a/b', 'read/write');
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/users/roles',
      { userName: 'a/b', role: 'read/write', operation: 'grant' },
      expect.any(Object),
    );
  });

  it('updates an own-password profile only after the server confirms success', async () => {
    const profile = { ...session, Name: 'test-profile' };
    const save = vi.fn();
    const service = new DataService({
      GetActiveSession: () => profile,
      Get: () => profile,
      Add: save,
    });
    api.post.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.ChangePassword('alice', 'new-secret')).rejects.toThrow('unavailable');
    expect(save).not.toHaveBeenCalled();
    api.post.mockResolvedValue({});
    await expect(service.ChangePassword('alice', 'new-secret')).resolves.toEqual({
      reauthenticate: false,
    });
    expect(save).toHaveBeenCalledWith({ ...profile, Password: 'new-secret' });
  });

  it('rejects requests with no active connection before network access', async () => {
    await expect(new DataService({ GetActiveSession: () => null }).GetKeys()).rejects.toThrow(
      'active connection',
    );
    expect(api.get).not.toHaveBeenCalled();
  });
});
