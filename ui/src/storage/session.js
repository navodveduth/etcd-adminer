class Session {
    constructor(name, backend, endpoints, username, password) {
        this.Name = name;
        this.BackEnd = backend;
        this.Endpoints = endpoints;
        this.UserName = username;
        this.Password = password;
        this.isActive = false;
    }
}

class SessionStore {
    key = 'sessions';

    _getLocalSessions() {
        try {
            const data = JSON.parse(localStorage.getItem(this.key) || '{}');
            if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
            return Object.fromEntries(Object.entries(data).filter(([name, session]) => (
                session && typeof session === 'object' && session.Name === name &&
                typeof session.BackEnd === 'string' && typeof session.UserName === 'string'
            )));
        } catch {
            return {};
        }
    }

    _setLocalSessions(sessions) {
        localStorage.setItem(this.key, JSON.stringify(sessions));
    }

    Get(name) {
        const sessions = this._getLocalSessions();
        return Object.hasOwn(sessions, name) ? sessions[name] : undefined;
    }

    GetAll() {
        return this._getLocalSessions();
    }

    Add(session) {
        if (!session.Name?.trim() || !session.BackEnd || typeof session.UserName !== 'string') {
            throw new Error('A connection name, backend, and username are required.');
        }
        this._setLocalSessions({ ...this._getLocalSessions(), [session.Name]: session });
    }

    Delete(session) {
        const sessions = this._getLocalSessions();
        delete sessions[session.Name];
        this._setLocalSessions(sessions);
    }

    SetActiveSession(session) {
        const sessions = this._getLocalSessions();
        if (!Object.hasOwn(sessions, session.Name)) return false;
        Object.values(sessions).forEach((item) => { item.isActive = item.Name === session.Name; });
        this._setLocalSessions(sessions);
        return true;
    }

    GetActiveSession() {
        return Object.values(this._getLocalSessions()).find((session) => session.isActive);
    }

    IsLocalSessionAvailable() {
        return Object.keys(this._getLocalSessions()).length > 0;
    }
}

export { Session, SessionStore };
