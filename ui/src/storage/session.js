// Credentials live only in this tab's JavaScript memory, never web storage.
const credentials = new Map();
const remembered = new Map();
const testedSessions = new Map();
export function invalidateRemembered(id) {
  remembered.delete(id);
  for (const [name, info] of testedSessions) if (info.id === id) testedSessions.delete(name);
}
function notifyRevocation(profile) {
  try {
    localStorage.setItem(
      'auth-revocation',
      JSON.stringify({ profile, at: Date.now(), nonce: Math.random() }),
    );
  } catch {
    /* In-memory logout still applies. */
  }
}
export function recordAuthentication(profile, info) {
  testedSessions.delete(profile);
  if (
    info?.profile === profile &&
    typeof info.id === 'string' &&
    Date.parse(info.expiresAt) > Date.now()
  ) {
    remembered.set(info.id, info);
    testedSessions.set(profile, info);
  }
}

const metadata = (session) => ({
  Name: session.Name,
  BackEnd: session.BackEnd,
  Endpoints: session.Endpoints,
  UserName: session.UserName,
  isActive: Boolean(session.isActive),
  ...(typeof session.SessionID === 'string'
    ? { SessionID: session.SessionID, ExpiresAt: session.ExpiresAt }
    : {}),
});
const secretFor = (profile) => {
  const cookie = remembered.get(profile.SessionID);
  if (
    cookie?.profile === profile.Name &&
    cookie.backend === profile.BackEnd &&
    cookie.user === profile.UserName &&
    Date.parse(cookie.expiresAt) > Date.now()
  )
    return { SessionID: cookie.id };
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
      Authenticated: Boolean(secret),
      ...(secret && Object.hasOwn(secret, 'Password') ? { Password: secret.Password } : {}),
    };
  }

  GetAll() {
    return Object.fromEntries(
      Object.entries(this._getLocalSessions()).map(([name, profile]) => [
        name,
        {
          ...profile,
          Authenticated: Boolean(secretFor(profile)),
          isActive: profile.isActive && Boolean(secretFor(profile)),
        },
      ]),
    );
  }

  Add(session) {
    if (!session.Name?.trim() || !session.BackEnd || typeof session.UserName !== 'string') {
      throw new Error('A connection name, backend, and username are required.');
    }
    const cookie = testedSessions.get(session.Name);
    if (
      cookie?.backend === session.BackEnd &&
      cookie.user === session.UserName &&
      Date.parse(cookie.expiresAt) > Date.now()
    ) {
      credentials.delete(session.Name);
      this._setLocalSessions({
        ...this._getLocalSessions(),
        [session.Name]: metadata({ ...session, SessionID: cookie.id, ExpiresAt: cookie.expiresAt }),
      });
      return;
    }
    this._setLocalSessions({
      ...this._getLocalSessions(),
      [session.Name]: metadata({ ...session, SessionID: undefined }),
    });
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
    const sessionID = session.SessionID ?? sessions[session.Name]?.SessionID;
    delete sessions[session.Name];
    credentials.delete(session.Name);
    remembered.delete(sessionID);
    testedSessions.delete(session.Name);
    this._setLocalSessions(sessions);
    notifyRevocation(session.Name);
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
    remembered.clear();
    testedSessions.clear();
    const profiles = this._getLocalSessions();
    Object.values(profiles).forEach((profile) => {
      profile.isActive = false;
      delete profile.SessionID;
      delete profile.ExpiresAt;
    });
    this._setLocalSessions(profiles);
    notifyRevocation();
  }

  IsLocalSessionAvailable() {
    return Object.keys(this._getLocalSessions()).length > 0;
  }

  RestoreRemembered(connections) {
    remembered.clear();
    testedSessions.clear();
    for (const info of connections ?? []) {
      if (
        typeof info.id === 'string' &&
        typeof info.profile === 'string' &&
        typeof info.backend === 'string' &&
        typeof info.user === 'string' &&
        Date.parse(info.expiresAt) > Date.now()
      )
        remembered.set(info.id, info);
    }
  }

  ForgetRuntime(profile) {
    if (profile === undefined) {
      credentials.clear();
      remembered.clear();
      testedSessions.clear();
      return;
    }
    credentials.delete(profile);
    testedSessions.delete(profile);
    for (const [id, info] of remembered) if (info.profile === profile) remembered.delete(id);
  }
}

export { Session, SessionStore };
