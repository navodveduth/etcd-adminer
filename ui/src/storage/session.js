// Credentials live only in this tab's JavaScript memory, never web storage.
const credentials = new Map();

const metadata = (session) => ({
  Name: session.Name,
  BackEnd: session.BackEnd,
  Endpoints: session.Endpoints,
  UserName: session.UserName,
  isActive: Boolean(session.isActive),
});
const secretFor = (profile) => {
  const secret = credentials.get(profile.Name);
  return secret?.BackEnd === profile.BackEnd && secret?.UserName === profile.UserName
    ? secret
    : undefined;
};

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
      const profiles = Object.fromEntries(
        Object.entries(data)
          .filter(
            ([name, session]) =>
              session &&
              typeof session === 'object' &&
              session.Name === name &&
              typeof session.BackEnd === 'string' &&
              typeof session.UserName === 'string',
          )
          .map(([name, session]) => [name, metadata(session)]),
      );
      if (Object.values(data).some((session) => session && Object.hasOwn(session, 'Password'))) {
        Object.values(profiles).forEach((profile) => {
          profile.isActive = false;
        });
        localStorage.setItem(this.key, JSON.stringify(profiles));
        credentials.clear();
      }
      return profiles;
    } catch {
      return {};
    }
  }

  _setLocalSessions(sessions) {
    localStorage.setItem(
      this.key,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(sessions).map(([name, session]) => [name, metadata(session)]),
        ),
      ),
    );
  }

  Get(name) {
    const sessions = this._getLocalSessions();
    if (!Object.hasOwn(sessions, name)) return undefined;
    const profile = sessions[name];
    const secret = secretFor(profile);
    return {
      ...profile,
      isActive: profile.isActive && Boolean(secret),
      ...(secret ? { Password: secret.Password } : {}),
    };
  }

  GetAll() {
    return Object.fromEntries(
      Object.entries(this._getLocalSessions()).map(([name, profile]) => [
        name,
        { ...profile, isActive: profile.isActive && Boolean(secretFor(profile)) },
      ]),
    );
  }

  Add(session) {
    if (!session.Name?.trim() || !session.BackEnd || typeof session.UserName !== 'string') {
      throw new Error('A connection name, backend, and username are required.');
    }
    this._setLocalSessions({ ...this._getLocalSessions(), [session.Name]: metadata(session) });
    if (typeof session.Password === 'string') {
      credentials.set(session.Name, {
        BackEnd: session.BackEnd,
        UserName: session.UserName,
        Password: session.Password,
      });
    } else {
      credentials.delete(session.Name);
    }
  }

  Delete(session) {
    const sessions = this._getLocalSessions();
    delete sessions[session.Name];
    credentials.delete(session.Name);
    this._setLocalSessions(sessions);
  }

  SetActiveSession(session) {
    const sessions = this._getLocalSessions();
    if (!Object.hasOwn(sessions, session.Name) || !secretFor(sessions[session.Name])) return false;
    Object.values(sessions).forEach((item) => {
      item.isActive = item.Name === session.Name;
    });
    this._setLocalSessions(sessions);
    return true;
  }

  GetActiveSession() {
    const profile = Object.values(this._getLocalSessions()).find(
      (session) => session.isActive && secretFor(session),
    );
    return profile ? this.Get(profile.Name) : undefined;
  }

  DisconnectAll() {
    credentials.clear();
    const profiles = this._getLocalSessions();
    Object.values(profiles).forEach((profile) => {
      profile.isActive = false;
    });
    this._setLocalSessions(profiles);
  }

  IsLocalSessionAvailable() {
    return Object.keys(this._getLocalSessions()).length > 0;
  }
}

export { Session, SessionStore };
