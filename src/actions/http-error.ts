export interface HttpErrorAction {
    type: "http-error";
    error: true;
    payload: {
        name: string;
        message: string;
        status: number;
    };
}
