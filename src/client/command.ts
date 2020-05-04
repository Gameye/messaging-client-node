import { FluxStandardAction } from "flux-standard-action";
import * as createHttpError from "http-errors";
import fetch from "node-fetch";

export interface CommandRequestConfig {
    timeout?: number;
    accessToken?: string;
}

export async function invokeHttpCommand<T extends FluxStandardAction<string, unknown>>(
    url: string,
    payload: T["payload"] = {},
    options?: CommandRequestConfig,
) {
    const headers: HeadersInit = {
        "Content-type": "application/json",
    };
    if (options?.accessToken) {
        headers.Authorization = `Bearer: ${options?.accessToken}`;
    }

    const response = await fetch(
        url,
        {
            method: "POST",
            headers: {
                "Content-type": "application/json",
            },
            body: JSON.stringify(payload),
            timeout: options?.timeout,
        },
    )

    if (!response.ok) {
        throw createHttpError(response.status);
    }

    const text = await response.text();
    if (!text) return;

    return JSON.parse(text);
}
