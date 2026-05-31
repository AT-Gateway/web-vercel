import { axiosInstance, API_BASE_URL } from "./axios-instance";
import { getErrorMessage } from "./errors";
import type { ApiResult, FetchOptions, HttpMethod } from "@/types/api";

function isBrowserOffline() {
    return typeof window !== "undefined" && !window.navigator.onLine;
}

function notifyError(message: string) {
    if (typeof window === "undefined") return;
    void import("sonner").then(({ toast }) => toast.error(message));
}

function toFormData(data: unknown) {
    const formData = new FormData();

    if (!data || typeof data !== "object") return formData;

    Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        if (Array.isArray(value)) {
            value.forEach((item) =>
                formData.append(`${key}[]`, item instanceof Blob ? item : String(item))
            );
            return;
        }

        formData.append(key, value instanceof Blob ? value : String(value));
    });

    return formData;
}

function buildHeaders(options: FetchOptions) {
    const headers: Record<string, string> = { ...options.headers };

    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (!options.multipart) headers["Content-Type"] = "application/json";

    return headers;
}

function normalizeMethod(method?: HttpMethod): HttpMethod {
    return method || "get";
}

export async function fetchData<T = unknown>(options: FetchOptions): Promise<ApiResult<T>> {
    const method = normalizeMethod(options.method);
    const showErrorToast = options.showErrorToast ?? true;

    if (isBrowserOffline()) {
        const message = "No internet connection";
        if (showErrorToast) notifyError(message);

        const reRequest = () => {
            options.reFetchCallback?.();
            window.removeEventListener("online", reRequest);
        };

        window.addEventListener("online", reRequest);
        return { ok: false, error: true, message };
    }

    try {
        const body = options.multipart ? toFormData(options.data) : options.data;
        const response = await axiosInstance.request<T>({
            baseURL: options.baseUrl || API_BASE_URL,
            url: options.url,
            method,
            params: method === "get" || method === "delete" ? options.params : undefined,
            data: method !== "get" && method !== "delete" ? body : undefined,
            headers: buildHeaders(options),
            withCredentials: options.withCredentials ?? true,
            onUploadProgress: options.uploadProgress,
            ...options.axiosConfig
        });

        return {
            ok: true,
            data: response.data,
            status: response.status,
            message:
                typeof response.data === "object" && response.data !== null
                    ? (response.data as { message?: string }).message
                    : undefined
        };
    } catch (error) {
        const message = getErrorMessage(error);

        if (showErrorToast && typeof window !== "undefined") {
            notifyError(message);
        }

        return {
            ok: false,
            error: true,
            message,
            status:
                typeof error === "object" && error !== null && "response" in error
                    ? (error as { response?: { status?: number } }).response?.status
                    : undefined,
            raw: error
        };
    }
}

export const api = {
    get: <T>(
        url: string,
        params?: Record<string, unknown>,
        options?: Omit<FetchOptions, "url" | "method" | "params">
    ) => fetchData<T>({ ...options, url, params, method: "get" }),
    post: <T>(
        url: string,
        data?: unknown,
        options?: Omit<FetchOptions, "url" | "method" | "data">
    ) => fetchData<T>({ ...options, url, data, method: "post" }),
    put: <T>(
        url: string,
        data?: unknown,
        options?: Omit<FetchOptions, "url" | "method" | "data">
    ) => fetchData<T>({ ...options, url, data, method: "put" }),
    patch: <T>(
        url: string,
        data?: unknown,
        options?: Omit<FetchOptions, "url" | "method" | "data">
    ) => fetchData<T>({ ...options, url, data, method: "patch" }),
    delete: <T>(
        url: string,
        params?: Record<string, unknown>,
        options?: Omit<FetchOptions, "url" | "method" | "params">
    ) => fetchData<T>({ ...options, url, params, method: "delete" })
};
