import {NullableObj} from './typedefs.js';

export function recursiveObjectUpdate<T extends Object>(src: T, upd: NullableObj<T>): T {
    for(let key of Object.keys(upd)) {
        if(typeof (src as any)[key] === "object" && typeof (upd as any)[key] === "object" && 
        !Array.isArray((src as any)[key]) && !Array.isArray((upd as any)[key])) {
            recursiveObjectUpdate((src as any)[key] as any, (upd as any)[key])
        } else if((upd as any)[key] === undefined) {
            delete (src as any)[key];
        } else {
            (src as any)[key] = (upd as any)[key];
        }
    }
    return src;
}