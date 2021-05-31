import fs from 'fs';
import {Writable} from 'stream';

export default class Content {
    readonly name: string;
    public length: number = 0;
    public readonly chunkSize = 256;
    private chunks: Map<number, Chunk> = new Map<number, Chunk>();
    private chunkLengths: Array<number> = [];
    private readonly cleanUpInterval: NodeJS.Timeout;
    private readonly consolidateInterval: NodeJS.Timeout;

    constructor(name: string) {
        this.name = name;
        if (!fs.existsSync('files')) fs.mkdirSync('files');
        if (!fs.existsSync(`files/${name}`)) fs.mkdirSync(`files/${name}`);
        if(fs.existsSync(`files/${name}/len`)){
            this.length = parseInt(fs.readFileSync(`files/${name}/len`).toString('utf-8'));
            console.log(`Loaded ${this.name}, length ${this.length}`);
        } else {
            console.log(`Created new ${this.name}`);
        }
        this.cleanUpInterval = setInterval(() => this.cleanUp(), 1000);
        this.consolidateInterval = setInterval(() => this.consolidate(), 30000);
    }

    destroy(){
        clearInterval(this.cleanUpInterval);
        clearInterval(this.consolidateInterval);
        if(fs.existsSync(`files/${this.name}`))
            fs.rmSync(`files/${this.name}`, {recursive: true});
    }

    read(buffer: Buffer, offset: number, length: number) {
        let [n, firstChunkOffset] = this.getChunkOffset(offset);
        let copied = 0;
        copied += this.getChunk(n).copyTo(buffer, 0, firstChunkOffset, firstChunkOffset + length);
        while (copied != length) {
            n++;
            copied += this.getChunk(n).copyTo(buffer, copied, 0, length - copied);
        }
    }

    readString(offset: number, length: number){
        if (offset >= this.length) return '';
        if (offset + length > this.length) length = this.length - offset;
        const buf = Buffer.allocUnsafe(length);
        this.read(buf, offset, length)
        return buf.toString('utf-8');
    }

    toString(){
        return this.readString(0, this.length);
    }

    // Replace does not support data longer than chunk size
    replace(data: string, offset: number, replaceLength: number) {
        if(offset === this.length){
            this.write(data, offset);
            return;
        }
        const diff = data.length - replaceLength;
        this.length += diff;
        if (diff == 0) {
            this.write(data, offset);
            return;
        } else if (diff < 0) {
            let [n, firstChunkOffset] = this.getChunkOffset(offset);
            let written = 0;
            let c = this.getChunk(n);
            let chunkOffset = c.writeString(data, firstChunkOffset, 0, !this.chunkExists(n + 1));
            written += chunkOffset;
            chunkOffset += firstChunkOffset;
            this.chunkLengths[n] = c.length;
            while (written != data.length) {
                n++;
                const c = this.getChunk(n);
                chunkOffset = c.writeString(data, 0, written, !this.chunkExists(n + 1));
                written += chunkOffset;
                this.chunkLengths[n] = c.length;
            }
            let toRemove = -diff;
            while (toRemove != 0) {
                const c = this.getChunk(n);
                toRemove -= c.remove(chunkOffset, toRemove);
                this.chunkLengths[n] = c.length;
                chunkOffset = 0;
                n++;
            }
        } else {
            let [n, chunkOffset] = this.getChunkOffset(offset);
            const currentChunk = this.getChunk(n);
            const overflow = this.chunkLengths[n] + diff - this.chunkSize;
            if (overflow > 0) {
                const overflowBuffer = Buffer.allocUnsafe(overflow);
                currentChunk.copyTo(
                    overflowBuffer,
                    0,
                    this.chunkLengths[n] - overflow,
                    this.chunkLengths[n]);
                let overflowChunk;
                // Try to put overflow to next chunk
                if(this.chunkSize - this.chunkLengths[n+1] >= overflow){
                    overflowChunk = this.getChunk(n+1);
                    overflowChunk.shift(0, overflow);
                } else {
                    this.insertChunk(n + 1);
                    overflowChunk = this.getChunk(n + 1);
                }
                overflowChunk.writeString(overflowBuffer.toString('utf-8'), 0, 0, true);
                this.chunkLengths[n + 1] = overflowChunk.length;
            }
            currentChunk.shift(chunkOffset, diff);
            this.chunkLengths[n] = currentChunk.length;
            this.write(data, offset);
        }
    }

    write(data: string, offset: number) {
        let [n, firstChunkOffset] = this.getChunkOffset(offset);
        let written = 0;
        let c = this.getChunk(n);
        written += c.writeString(data, firstChunkOffset, 0, !this.chunkExists(n + 1));
        this.chunkLengths[n] = c.length;
        while (written != data.length) {
            n++;
            const c = this.getChunk(n);
            written += c.writeString(data, 0, written, !this.chunkExists(n + 1));
            this.chunkLengths[n] = c.length;
        }
        if (offset + data.length > this.length)
            this.length = offset + data.length;
    }

    writeToStream(stream: Writable){
        for(let i = 0;i<this.chunkLengths.length;i++){
            const chunk = this.getChunk(i);
            stream.write(chunk.buf.subarray(0, this.chunkLengths[i]));
        }
    }

    dump() {
        console.log(`Content ${this.name}, length ${this.length}`);
        for (let i = 0; i < this.chunkLengths.length; i++) {
            const len = this.chunkLengths[i];
            const val = this.getChunk(i).toString();
            console.log(`chunk ${i}, len=${len}: ${val.substring(0, 10)}...${val.slice(-10)}`);
        }
    }

    get totalChunks(){
        return this.chunkLengths.length;
    }

    get loadedChunks(){
        return this.chunks.size;
    }

    insertChunk(n: number) {
        console.log(`Inserted ${this.name}/${n}`);
        for (let i = this.chunkLengths.length-1; i >= n; i--) {
            const c = this.chunks.get(i);
            if (typeof c === 'undefined') {
                this.chunks.delete(i + 1);
                fs.renameSync(`files/${this.name}/${i}`, `files/${this.name}/${i+1}`)
            } else {
                this.chunks.set(i + 1, c);
            }
        }
        this.chunks.set(n, new Chunk(Buffer.allocUnsafe(this.chunkSize), 0));
        this.chunkLengths.splice(n, 0, 0);
    }

    cleanUp(){
        for(const [n, chunk] of this.chunks){
            if(chunk.isExpired()){
                console.log(`Unloaded ${this.name}/${n}`);
                const chunkFile = `files/${this.name}/${n}`;
                const file = fs.openSync(chunkFile, 'w');
                fs.writeSync(file, chunk.buf, 0, chunk.length);
                fs.closeSync(file);
                this.chunks.delete(n);
            }
        }
        fs.writeFileSync(`files/${this.name}/len`, this.length.toString());
    }

    consolidate(){
        const prev = this.chunkLengths.length;
        const buffer = Buffer.allocUnsafe(this.chunkSize);
        let offset = 0;
        let chunk = 0;
        while(offset != this.length) {
            const len = Math.min(this.chunkSize, this.length-offset);
            this.read(buffer, offset, len);
            this.getChunk(chunk).write(buffer, 0, 0, len);
            this.chunkLengths[chunk] = len;
            offset += len;
            chunk++;
        }
        for (let i = chunk; i < this.chunkLengths.length; i++) {
            const filename = `files/${this.name}/${i}`;
            if(fs.existsSync(filename))
                fs.unlinkSync(filename);
            this.chunks.delete(i);
        }
        this.chunkLengths.splice(chunk);
        console.log(`Consolidated ${this.name} : ${prev} => ${chunk}`);
    }

    private getChunkOffset(offset: number) {
        let n = 0;
        while (offset > this.chunkLengths[n]) {
            offset -= this.chunkLengths[n];
            n++;
        }
        if(offset == this.chunkSize){
            offset = 0;
            n++;
        }
        return [n, offset];
    }

    private chunkExists(n: number) {
        return typeof this.chunkLengths[n] === 'number';
    }

    private getChunk(n: number): Chunk {
        let chunk = this.chunks.get(n);
        if (typeof chunk !== 'undefined') {
            return chunk;
        }
        const buf = Buffer.allocUnsafe(this.chunkSize);
        const chunkFile = `files/${this.name}/${n}`;
        if (fs.existsSync(chunkFile)) {
            console.log(`Loaded ${this.name}/${n}`);
            const file = fs.openSync(chunkFile, 'r');
            const read = fs.readSync(file, buf);
            fs.closeSync(file);
            chunk = new Chunk(buf, read);
        } else {
            console.log(`Created ${this.name}/${n}`);
            chunk = new Chunk(buf, 0);
        }
        this.chunks.set(n, chunk);
        this.chunkLengths[n] = chunk.length;
        return chunk;
    }
}

class Chunk {
    length: number;
    lastUsed: number;
    readonly buf: Buffer;

    constructor(buf: Buffer, length: number) {
        this.buf = buf;
        this.length = length;
        this.lastUsed = Date.now();
    }

    copyTo(buf: Buffer, targetOffset: number, sourceOffset: number, sourceEnd: number) {
        this.lastUsed = Date.now();
        return this.buf.copy(buf, targetOffset, sourceOffset, Math.min(this.length, sourceEnd));
    }

    writeString(data: string, targetOffset: number, sourceOffset: number, canExtend: boolean) {
        this.lastUsed = Date.now();
        let length = canExtend ? data.length : this.length - targetOffset;
        if (length > this.buf.length - targetOffset)
            length = this.buf.length - targetOffset;
        const written = this.buf.write(data.substring(sourceOffset), targetOffset, length, 'utf-8');
        if (targetOffset + written > this.length)
            this.length = targetOffset + written;
        return written;
    }

    write(buffer: Buffer, targetOffset: number, sourceOffset: number, length: number){
        const written = buffer.copy(this.buf, targetOffset, sourceOffset, sourceOffset+length);
        if (targetOffset + written > this.length)
            this.length = targetOffset + written;
    }

    remove(start: number, length: number) {
        this.lastUsed = Date.now();
        if (start + length > this.length) {
            length = this.length - start;
        }
        const count = this.length - start - length;
        this.buf.copy(this.buf, start, start + length, start + length + count);
        this.length -= length;
        return length;
    }

    shift(offset: number, shift: number) {
        this.lastUsed = Date.now();
        this.buf.copy(this.buf, offset + shift, offset, this.length);
        this.length += shift;
        if (this.length > this.buf.length)
            this.length = this.buf.length;
    }

    toString() {
        this.lastUsed = Date.now();
        return this.buf.toString('utf-8', 0, this.length);
    }

    isExpired(){
        return Date.now() - this.lastUsed > 10000;
    }
}
