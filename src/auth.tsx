import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearToken, detectAuthMode, getToken, setToken } from "./api";

type Mode = "unknown" | "token" | "proxy";

interface AuthState {
  token: string | null;
  mode: Mode;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, set] = useState<string | null>(() => getToken());
  const [mode, setMode] = useState<Mode>("unknown");

  // Behind SSO the proxy has already authenticated the browser, so the console asks the
  // gateway and skips the token form entirely.
  useEffect(() => {
    let cancelled = false;
    detectAuthMode().then((detected) => {
      if (!cancelled) setMode(detected);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        mode,
        signIn: (value: string) => {
          setToken(value.trim());
          set(value.trim());
        },
        signOut: () => {
          clearToken();
          set(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
