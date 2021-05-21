import fs from 'fs';

export default class Content {
    readonly name: string;
    public length: number = 0;
    private readonly chunkSize = 64;
    private chunks: Map<number, Chunk> = new Map<number, Chunk>();
    private chunkLengths: Array<number> = [];

    constructor(name: string) {
        this.name = name;
        if (!fs.existsSync(name)) fs.mkdirSync(name);
    }

    read(offset: number, length: number) {
        if (offset >= this.length) return '';
        if (offset + length > this.length) length = this.length - offset;
        let [n, firstChunkOffset] = this.getChunkOffset(offset);
        const result = Buffer.allocUnsafe(length);
        let copied = 0;
        copied += this.getChunk(n).copyTo(result, 0, firstChunkOffset, firstChunkOffset + length);
        while (copied != length) {
            n++;
            copied += this.getChunk(n).copyTo(result, copied, 0, length - copied);
        }
        return result.toString('utf-8');
    }

    toString(){
        return this.read(0, this.length);
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
            let chunkOffset = c.write(data, firstChunkOffset, 0, !this.chunkExists(n + 1));
            written += chunkOffset;
            chunkOffset += firstChunkOffset;
            this.chunkLengths[n] = c.length;
            while (written != data.length) {
                n++;
                const c = this.getChunk(n);
                chunkOffset = c.write(data, 0, written, !this.chunkExists(n + 1));
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
            let [n, chunkOffset] = this.getChunkOffset(offset + replaceLength);
            const currentChunk = this.getChunk(n);
            const overflow = this.chunkLengths[n] + diff - this.chunkSize;
            if (overflow > 0) {
                this.insertChunk(n + 1);
                const overflowBuffer = Buffer.allocUnsafe(overflow);
                currentChunk.copyTo(
                    overflowBuffer,
                    0,
                    this.chunkLengths[n] - overflow,
                    this.chunkLengths[n]);
                const overflowChunk = this.getChunk(n + 1);
                overflowChunk.write(overflowBuffer.toString('utf-8'), 0, 0, true);
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
        written += c.write(data, firstChunkOffset, 0, !this.chunkExists(n + 1));
        this.chunkLengths[n] = c.length;
        while (written != data.length) {
            n++;
            const c = this.getChunk(n);
            written += c.write(data, 0, written, !this.chunkExists(n + 1));
            this.chunkLengths[n] = c.length;
        }
        if (offset + data.length > this.length)
            this.length = offset + data.length;
    }

    dump() {
        console.log(`Content ${this.name}, length ${this.length}`);
        for (let i = 0; i < this.chunkLengths.length; i++) {
            const len = this.chunkLengths[i];
            console.log(`chunk ${i}, len=${len}: ${this.getChunk(i).toString()}`);
        }
        console.log(this.read(0, this.length));
    }

    insertChunk(n: number) {
        for (let i = this.chunkLengths.length; i >= n; i--) {
            const c = this.chunks.get(i);
            if (typeof c === 'undefined') {
                this.chunks.delete(i + 1);
            } else {
                this.chunks.set(i + 1, c);
            }
        }
        this.chunks.set(n, new Chunk(Buffer.allocUnsafe(this.chunkSize), 0));
        this.chunkLengths.splice(n, 0, 0);
    }

    private getChunkOffset(offset: number) {
        let n = 0;
        while (offset > this.chunkLengths[n]) {
            offset -= this.chunkLengths[n];
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
        const chunkFile = `${this.name}/${n}`;
        if (fs.existsSync(chunkFile)) {
            const file = fs.openSync(chunkFile, 'r');
            const read = fs.readSync(file, buf);
            chunk = new Chunk(buf, read);
        } else {
            chunk = new Chunk(buf, 0);
        }
        this.chunks.set(n, chunk);
        return chunk;
    }
}

class Chunk {
    length: number;
    private readonly buf: Buffer;

    constructor(buf: Buffer, length: number) {
        this.buf = buf;
        this.length = length;
    }

    copyTo(buf: Buffer, targetOffset: number, sourceOffset: number, sourceEnd: number) {
        return this.buf.copy(buf, targetOffset, sourceOffset, Math.min(this.length, sourceEnd));
    }

    write(data: string, targetOffset: number, sourceOffset: number, canExtend: boolean) {
        let length = canExtend ? data.length : this.length - targetOffset;
        if (length > this.buf.length - targetOffset)
            length = this.buf.length - targetOffset;
        const written = this.buf.write(data.substring(sourceOffset), targetOffset, length, 'utf-8');
        if (targetOffset + written > this.length)
            this.length = targetOffset + written;
        return written;
    }

    remove(start: number, length: number) {
        if (start + length > this.length) {
            length = this.length - start;
        }
        const count = this.length - start - length;
        this.buf.copy(this.buf, start, start + length, start + length + count);
        this.length -= length;
        return length;
    }

    shift(offset: number, shift: number) {
        this.buf.copy(this.buf, offset + shift, offset, this.length);
        this.length += shift;
        if (this.length > this.buf.length)
            this.length = this.buf.length;
    }

    toString() {
        return this.buf.toString('utf-8', 0, this.length);
    }
}
