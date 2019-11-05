export interface ErrorAction {
    type: "error";
    error: true;
    payload: {
        name: string;
        message: string;
        code: string;
    };
}
