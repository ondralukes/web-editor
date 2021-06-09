enum Type{
    Cursor = 3,
    Data = 0,
    Stats = 2,
    Fetch = 1,
    FetchResponse = 6,
    ToggleDebug = 4,
    Debug = 5
}

export class Command{
    private readonly type: Type;
    sender: number;
    constructor(type: Type) {
        this.type = type;
        this.sender = -1;
    }
    static deserialize(buf: Buffer){
        const type = buf.readUInt8(0);
        const cmd = buf.subarray(1);
        switch (type) {
            case Type.Cursor:
                return new CursorCommand(cmd);
            case Type.Data:
                return new DataCommand(cmd);
            case Type.Fetch:
                return new FetchCommand(cmd);
            case Type.ToggleDebug:
                return new ToggleDebugCommand(cmd);
        }
        return null;
    }
    serialize(): Buffer{
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(this.type, 0);
        return buf;
    }
}

export class CursorCommand extends Command{
    pos: number;
    constructor(buf: Buffer) {
        super(Type.Cursor);
        this.pos = buf.readUInt32BE(0);
    }

    serialize(): Buffer {
        const buf = Buffer.allocUnsafe(9);
        buf.writeUInt8(Type.Cursor);
        buf.writeUInt32BE(this.pos, 1);
        buf.writeUInt32BE(this.sender, 5);
        return buf;
    }
}

export class StatsCommand extends Command{
    clients: number;
    constructor(clients: number) {
        super(Type.Stats);
        this.clients = clients;
    }

    serialize(): Buffer {
        const buf = Buffer.allocUnsafe(5);
        buf.writeUInt8(Type.Stats);
        buf.writeUInt32BE(this.clients, 1);
        return buf;
    }
}


export class DataCommand extends Command{
    start: number;
    end: number;
    data: Buffer;
    constructor(buf: Buffer) {
        super(Type.Data);
        this.start = buf.readUInt32BE(0);
        this.end = buf.readUInt32BE(4);
        this.data = buf.subarray(8);
    }
    serialize(): Buffer {
        const buf = Buffer.allocUnsafe(this.data.length + 9);
        buf.writeUInt8(Type.Data, 0);
        buf.writeUInt32BE(this.start, 1);
        buf.writeUInt32BE(this.end, 5);
        this.data.copy(buf, 9);
        return buf;
    }
}

export class FetchResponseCommand extends Command{
    start: number;
    end: number;
    data: Buffer;
    constructor(start: number, end: number, buf: Buffer) {
        super(Type.FetchResponse);
        this.start = start;
        this.end = end;
        this.data = buf;
    }

    serialize(): Buffer {
        const buf = Buffer.allocUnsafe(this.data.length + 9);
        buf.writeUInt8(Type.FetchResponse, 0);
        buf.writeUInt32BE(this.start, 1);
        buf.writeUInt32BE(this.end, 5);
        this.data.copy(buf, 9);
        return buf;
    }
}

export class FetchCommand extends Command{
    offset: number;
    len: number;
    constructor(buf: Buffer) {
        super(Type.Fetch);
        this.offset = buf.readUInt32BE(0);
        this.len = buf.readUInt32BE(4);
    }
}

export class ToggleDebugCommand extends Command{
    value: boolean;
    constructor(buf: Buffer) {
        super(Type.ToggleDebug);
        this.value = buf.readUInt32BE(0) !== 0;
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

    serialize(): Buffer {
        const buf = Buffer.allocUnsafe(17);
        buf.writeUInt8(Type.Debug);
        buf.writeUInt32BE(this.length, 1);
        buf.writeUInt32BE(this.totalChunks, 5);
        buf.writeUInt32BE(this.loadedChunks, 9);
        buf.writeUInt32BE(this.chunkSize, 13);
        return buf;
    }
}
