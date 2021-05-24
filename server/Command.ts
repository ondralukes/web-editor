enum Type{
    Cursor = 'cursor',
    Data = 'data',
    Stats = 'stats',
    Fetch = 'fetch'
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

export class DataCommand extends Command{
    start: number;
    end: number;
    data: string;
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
