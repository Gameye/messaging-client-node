import { second } from "msecs";

export interface RequestOptions {
    heartbeatInterval: number;
    timeout: number;
    accessToken?: string;
}

export const defaultRequestOptions: RequestOptions = {
    heartbeatInterval: 10 * second,
    timeout: 10 * second,
};
