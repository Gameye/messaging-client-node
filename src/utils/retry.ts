import { delay, randomBetween } from ".";

export interface RetryConfig {
    retryLimit?: number;
    intervalCap?: number;
    intervalBase?: number;
}

const defaultRetryConfig = {
    retryLimit: 10,
    intervalCap: 5000,
    intervalBase: 100,
};

export async function retry<T>(
    job: (attempt: number) => PromiseLike<T> | T,
    config: RetryConfig = {},
    shouldTryAgain = (error: any) => true,
): Promise<T> {
    const {
        retryLimit,
        intervalBase,
        intervalCap,
    } = { ...defaultRetryConfig, ...config };
    let retryAttempt = 0;
    let intervalCurrent = intervalBase;
    while (true) {
        try {
            const result = await job(retryAttempt);
            return result;
        }
        catch (error) {
            if (
                retryAttempt < retryLimit &&
                shouldTryAgain(error)
            ) {
                error = null;
            }
            if (error) throw error;
        }
        // https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
        intervalCurrent = Math.min(intervalCap, randomBetween(intervalBase, intervalCurrent * 3));
        await delay(intervalCurrent);

        retryAttempt++;
    }
}
