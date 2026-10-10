import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type CurrentUser } from "./api";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  justLoggedIn: boolean;
  acknowledgeWelcome: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  useEffect(() => {
    api
      .get<CurrentUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleExpiredSession() {
      setUser(null);
      setJustLoggedIn(false);
    }
    window.addEventListener("auth:expired", handleExpiredSession);
    return () => window.removeEventListener("auth:expired", handleExpiredSession);
  }, []);

  async function login(username: string, password: string) {
    const loggedInUser = await api.post<CurrentUser>("/auth/login", { username, password });
    setUser(loggedInUser);
    setJustLoggedIn(true);
  }

  function acknowledgeWelcome() {
    setJustLoggedIn(false);
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
  }

  async function refreshUser() {
    try {
      const fresh = await api.get<CurrentUser>("/auth/me");
      setUser(fresh);
    } catch {
      setUser(null);
    }
  }

  function hasRole(role: string) {
    const roles = user?.activeRole ? [user.activeRole] : user?.roles ?? [];
    return roles.includes(role);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, justLoggedIn, acknowledgeWelcome, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
