import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth";

// NOTE: do NOT set a default Content-Type. axios chooses the right one per
// request: "application/json" for object payloads and
// "multipart/form-data; boundary=..." for FormData. A pinned default leaks
// onto file uploads and the server 422s with "Field required: body.file".
export const api = axios.create({
  baseURL: "/ProposalAgent/api/v1",
  withCredentials: true,
});

// Attach access token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 by attempting silent refresh once
let refreshInFlight: Promise<string | null> | null = null;

api.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    if (error.response?.status === 401 && !original._retried) {
      original._retried = true;

      if (!refreshInFlight) {
        const rt = useAuthStore.getState().refreshToken;
        if (!rt) {
          useAuthStore.getState().clear();
          return Promise.reject(error);
        }
        refreshInFlight = axios
          .post("/ProposalAgent/api/v1/auth/refresh", { refresh_token: rt })
          .then(res => {
            const { access_token, refresh_token } = res.data;
            useAuthStore.getState().setTokens(access_token, refresh_token);
            return access_token as string;
          })
          .catch(() => {
            useAuthStore.getState().clear();
            return null;
          })
          .finally(() => { refreshInFlight = null; });
      }

      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

// Helpers
export function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data: any = err.response?.data;
    return data?.error?.message || err.message || "Request failed.";
  }
  return "Unexpected error.";
}
