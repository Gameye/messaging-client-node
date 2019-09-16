import { PassThrough, pipeline, Readable, TransformOptions } from "stream";

export class EndStream extends PassThrough {

    public static wrap(stream: Readable) {
        const endStream = new EndStream({ objectMode: true });

        pipeline(
            stream,
            endStream,
            error => stream.destroy(error || undefined),
        );

        return endStream;
    }

    private ended = false;

    constructor(opts?: TransformOptions) {
        super(opts);

        this.addListener("end", () => this.ended = true);
    }

    public _destroy(
        destroyError: Error | null,
        callback: (error: Error | null) => void,
    ) {
        if (this.ended) callback(destroyError);
        else this.
            addListener("end", () => callback(destroyError)).
            resume().
            end();

    }

}
