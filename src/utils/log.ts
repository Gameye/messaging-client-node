import * as debug from "debug";

export function createLogger(instance: object) {
    const log = debug(instance.constructor.name);
    return log;
}
