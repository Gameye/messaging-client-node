import { second } from "msecs";
import { RetryConfig } from "src/utils";

export interface RequestConfig {
    heartbeatInterval?: number;
    timeout?: number;
    accessToken?: string;
}

export const defaultRequestConfig: RequestConfig = {
    heartbeatInterval: 10 * second,
    timeout: 10 * second,
};

export interface RequestRetryConfig {
    requestOptions?: RequestConfig;
    retryOptions?: RetryConfig;
}

