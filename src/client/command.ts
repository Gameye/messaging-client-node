import { FluxStandardAction } from "flux-standard-action";
import { OutgoingHttpHeaders } from "http";
import { second } from "msecs";
import { createRequestStream, getResponse, readResponse, writeAll } from "../utils";

export interface CommandRequestConfig {
    timeout?: number;
    accessToken?: string;
}

const defaultRequestConfig: CommandRequestConfig = {
    timeout: 60 * second,
};

export async function invokeHttpCommand<T extends FluxStandardAction<string, any>>(
    url: string,
    payload: T["payload"] = {},
    options?: CommandRequestConfig,
) {
    const requestOptions = {
        ...defaultRequestConfig,
        ...options,
    };
    const headers: OutgoingHttpHeaders = {
        "Content-type": "application/json",
    };
    if (requestOptions.accessToken) {
        headers.Authorization = `Bearer: ${requestOptions.accessToken}`;
    }

    const urlObj = new URL(url);

    const requestStream = createRequestStream(
        "POST",
        urlObj,
        headers,
        requestOptions.timeout!,
    );

    await writeAll(requestStream, JSON.stringify(payload));

    try {
        const responseStream = await getResponse(requestStream);
        try {
            const result = await readResponse(responseStream);
            return result;
        }
        finally {
            responseStream.destroy();
        }
    }
    finally {
        requestStream.abort();
        requestStream.destroy();
    }
}
