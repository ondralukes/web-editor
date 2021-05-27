enum Type{
    Cursor = 'cursor',
    Data = 'data',
    Stats = 'stats',
    Fetch = 'fetch',
    ToggleDebug = 'toggle debug',
    Debug = 'debug'
}

export class Command{
    private type: Type;
    sender: number;
    constructor(type: Type) {
        this.type = type;
        this.sender = -1;
    }
    static deserialize(json: string){
        const obj = JSON.parse(json);
        switch (obj.type) {
            case Type.Cursor:
                return new CursorCommand(obj.pos);
            case Type.Data:
                return new DataCommand(obj.start, obj.end, obj.data);
            case Type.Stats:
                return new StatsCommand(obj.clients);
            case Type.Fetch:
                return new FetchCommand(obj.offset, obj.len);
            case Type.ToggleDebug:
                return new ToggleDebugCommand(obj.value);
        }
        return null;
    }
    serialize(): string{
        return JSON.stringify(this, (key, value) => key==='sender'?undefined:value);
    }
}

export class CursorCommand extends Command{
    pos: number;
    constructor(pos: number) {
        super(Type.Cursor);
        this.pos = pos;
    }
    serialize(): string {
        return JSON.stringify(this);
    }
}

export class StatsCommand extends Command{
    clients: number;
    constructor(clients: number) {
        super(Type.Stats);
        this.clients = clients;
    }
}

export enum DataCommandFlags{
    Load = 'load',
    LoadLast = 'load last'
}

export class DataCommand extends Command{
    start: number;
    end: number;
    data: string;
    flags?: DataCommandFlags
    constructor(start: number, end: number, data: string) {
        super(Type.Data);
        this.start = start;
        this.end = end;
        this.data = data;
    }
}

export class FetchCommand extends Command{
    offset: number;
    len: number;
    constructor(offset: number, len: number) {
        super(Type.Fetch);
        this.offset = offset;
        this.len = len;
    }
}

export class ToggleDebugCommand extends Command{
    value: boolean;
    constructor(value: boolean) {
        super(Type.ToggleDebug);
        this.value = value;
    }
}

export class DebugCommand extends Command{
    length: number;
    totalChunks: number;
    loadedChunks: number;
    chunkSize: number;
    constructor(length: number, totalChunks: number, loadedChunks: number, chunkSize: number) {
        super(Type.Debug);
        this.length = length;
        this.totalChunks = totalChunks;
        this.loadedChunks = loadedChunks;
        this.chunkSize = chunkSize;
    }
}
