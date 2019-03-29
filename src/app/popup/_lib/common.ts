export class StringBox {
    public static isEmpty(str: string) {
        return str === '' || str === null || str === undefined;
    }

    public static regex(str: string, pattern: string) {
        const ex = new RegExp(pattern);
        return ex.test(str);
    }
}
