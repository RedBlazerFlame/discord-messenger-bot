var _DatabaseManager_databasePath;
import { __awaiter, __classPrivateFieldGet, __classPrivateFieldSet } from "tslib";
import { readFile, writeFile, unlink, access, mkdir } from 'fs/promises';
import path from 'path';
import { recursiveObjectUpdate } from './utils/object_utils.js';
export class DatabaseManager {
    constructor(databasePath = "./database/") {
        _DatabaseManager_databasePath.set(this, void 0);
        __classPrivateFieldSet(this, _DatabaseManager_databasePath, databasePath, "f");
    }
    filePath(model, id) {
        return path.join(__classPrivateFieldGet(this, _DatabaseManager_databasePath, "f"), model, id);
    }
    get(model, id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield access(this.filePath(model, id));
            }
            catch (e) {
                return undefined;
            }
            let file = JSON.parse(yield readFile(this.filePath(model, id), {
                encoding: "utf-8",
            }));
            return file;
        });
    }
    set(model, id, val) {
        return __awaiter(this, void 0, void 0, function* () {
            let old = yield this.get(model, id);
            if (old === undefined) {
                old = val;
                yield mkdir(this.filePath(model, ""), {
                    recursive: true,
                });
            }
            else {
                recursiveObjectUpdate(old, val);
            }
            yield writeFile(this.filePath(model, id), JSON.stringify(old), {
                encoding: "utf-8"
            });
        });
    }
    delete(model, id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield unlink(this.filePath(model, id));
        });
    }
}
_DatabaseManager_databasePath = new WeakMap();
