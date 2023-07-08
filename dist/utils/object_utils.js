export function recursiveObjectUpdate(src, upd) {
    for (let key of Object.keys(upd)) {
        if (typeof src[key] === "object" && typeof upd[key] === "object" &&
            !Array.isArray(src[key]) && !Array.isArray(upd[key])) {
            recursiveObjectUpdate(src[key], upd[key]);
        }
        else if (upd[key] === undefined) {
            delete src[key];
        }
        else {
            src[key] = upd[key];
        }
    }
    return src;
}
