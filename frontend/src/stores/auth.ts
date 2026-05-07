import { create } from "zustand";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: number; email: string; full_name: string; is_superadmin?: boolean } | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthState["user"]) => void;
  clear: () => void;
}

const ACCESS_KEY  = "pa.access";
const REFRESH_KEY = "pa.refresh";

export const useAuthStore = create<AuthState>((set) => ({
  accessToken:  sessionStorage.getItem(ACCESS_KEY),
  refreshToken: sessionStorage.getItem(REFRESH_KEY),
  user: null,
  setTokens: (access, refresh) => {
    sessionStorage.setItem(ACCESS_KEY, access);
    sessionStorage.setItem(REFRESH_KEY, refresh);
    set({ accessToken: access, refreshToken: refresh });
  },
  setUser: (user) => set({ user }),
  clear: () => {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
