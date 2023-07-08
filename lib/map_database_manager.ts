import { readFile, writeFile, unlink, access, mkdir } from 'fs/promises';
import path from 'path';
import { recursiveObjectUpdate } from './utils/object_utils.js';
import { NullableObj } from "./utils/typedefs.js";

export class DatabaseManager {
    #databasePath: string;

    private filePath(model: string, id:string): string {
        return path.join(this.#databasePath, model, id);
    }

    public async get<T extends Object>(model: string, id: string): Promise<T | undefined> {
        try {
            await access(this.filePath(model, id));
        } catch(e) {
            return undefined;
        }
        let file = JSON.parse(await readFile(this.filePath(model, id), {
            encoding: "utf-8",
        }));
        return file;
    }

    public async set<T extends Object>(model: string, id: string, val: NullableObj<T>): Promise<void> {
        let old: T | undefined = await this.get(model, id) as T | undefined;
        if(old === undefined) {
            old = val as T;
            await mkdir(this.filePath(model, ""), {
                recursive: true,
            });
        } else {
            recursiveObjectUpdate(old, val);
        }

        await writeFile(this.filePath(model, id), JSON.stringify(old), {
            encoding: "utf-8"
        });
    }

    public async delete(model: string, id: string): Promise<void> {
        await unlink(this.filePath(model, id));
    }

    constructor(databasePath: string = "./database/") {
        // TODO read from database
        this.#databasePath = databasePath;
    }
}