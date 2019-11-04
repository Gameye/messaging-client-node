import { Readable, ReadableOptions } from "stream";

export class ReReadable extends Readable {

    private innerPromise?: Promise<Readable | void>;
    private destroying = false;

    constructor(
        private factory: () => Promise<Readable> | Readable,
        opts?: ReadableOptions,
    ) {
        super(opts);
    }

    // #region readable

    public _read(size: number): void {
        if (this.innerPromise) return;
        this.initializeInner();
    }

    public async _destroy(
        destroyError: Error | null,
        callback: (error: Error | null) => void,
    ) {
        // prevent premature close errors
        this.push(null);

        this.destroying = true;
        this.destroyInner().
            then(
                () => callback(destroyError),
                error => callback(error),
            );
    }

    // #endregion

    private initializeInner() {
        this.innerPromise = this.createInner().catch(error => {
            this.destroy(error);
        });
    }

    private async createInner() {
        const inner = await this.factory();

        inner.
            on("data", chunk => this.push(chunk)).
            on("end", () => inner.destroy()).
            on("error", error => inner.destroy(error)).
            on("close", () => {
                this.innerPromise = undefined;
                if (this.destroying) return;
                this.initializeInner();
            });

        return inner;
    }

    private async destroyInner() {
        const { innerPromise } = this;
        if (!innerPromise) return;

        const inner = await innerPromise;
        if (!inner) return;

        inner.destroy();
        await new Promise(resolve => inner.on("close", resolve));
    }
}
