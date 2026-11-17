import { createContext, useContext, useState, type ReactNode } from "react";
import { clearToken, getToken, setToken } from "./api";

interface AuthState {
  token: string | null;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, set] = useState<string | null>(() => getToken());
  return (
    <AuthContext.Provider
      value={{
        token,
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
