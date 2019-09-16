import * as test from "blue-tape";
import { PassThrough } from "stream";
import { readAll, timeoutToken, withTimeout } from "./stream-utils";

test("with-timeout", async t => {
    {
        const resolvedPromise = Promise.resolve("a");
        t.equal(await withTimeout(resolvedPromise), "a");
    }

    {
        const pendingPromise = new Promise(resolve => 0);
        t.equal(await withTimeout(pendingPromise), timeoutToken);
    }

    {
        const rejectedPromise = Promise.reject("a");
        try {
            await withTimeout(rejectedPromise);
            t.fail();
        }
        catch (error) {
            t.equal(error, "a");
        }
    }
});

test("read-all", async t => {
    const pass = new PassThrough();

    const promise = readAll(pass);

    t.equal(await withTimeout(promise), timeoutToken);
    pass.write("a");
    t.equal(await withTimeout(promise), timeoutToken);

    pass.end("b");
    t.equal(await withTimeout(promise), "ab");
});
