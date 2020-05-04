import * as test from "tape-promise/tape";
import { retry } from "./retry";

test("does not retry when told not to", async (t) => {
    let triesLeft = 3;
    const retryLogic = async () => await retry(() => {
        if (triesLeft > 0) {
            t.comment("Retry!");
            throw new Error("Error");
        }
    },
        {},
        _ => (triesLeft-- > 0),
    );

    t.doesNotThrow(retryLogic, "did not retry when no tries were left");
});

test("forwards error to caller", async (t) => {
    try {
        await retry(() => {
            throw new Error("InnerError");
        },
            {},
            _ => false,
        );
    } catch (err) {
        t.equal(err.message, "InnerError", "error messages match");
    }
});
