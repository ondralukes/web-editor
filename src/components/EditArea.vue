<template>
  <div class="editarea-container">
    <div class="disconnect-warning" v-if="disconnectPrompt">
      <h1>Warning</h1>
      Abandoned documents will be deleted after some time. Make sure you've downloaded all you need.
      <br>
      <h3>
        <span class="action disconnect" @click="disconnect">Disconnect</span>
        /
        <span class="action" @click="disconnectPrompt = false;">Go back</span>
      </h3>

    </div>
    <div>
      <h3>
        {{code}} / {{clients}} connection(s) /
        <span class="action disconnect" @click="disconnectPrompt = true;">Disconnect</span>
        /
        <a class="action download" :href="`download/${code}`" download>Download</a>
        /
        <span class="action debug" @click="toggleDebug">Debug</span>
      </h3>
      <div v-if="debug" class="debug-info">
        Last received: {{ JSON.stringify(debugInfo.lastCommand) }}
        <br>
        Content range: {{ this.content.start }} ~ {{ this.content.end}} (length {{this.content.length}})
        <br>
        Server:
        <br>
        length {{debugInfo.length}}
        <br>
        chunk size {{debugInfo.chunkSize}}
        <br>
        {{debugInfo.totalChunks}} chunks, {{debugInfo.loadedChunks}} loaded
        <br>
        avg. chunk utilization: {{ ((debugInfo.length/debugInfo.totalChunks)/debugInfo.chunkSize*100).toFixed(2)}}%
        <br>
        <a class="action download" :href="`download/${code}?annotate=yes`">Download with annotations</a>
        <br>
      </div>
    </div>
    <div class="canvas-container" ref="ccontainer">
      <textarea
          @keyup="inputKey"
          @input="input"
          @compositionstart="inputComposing = true;"
          @compositionend="inputComposing = false;"
          ref="input" class="input"></textarea>
      <canvas
          ref="canvas"
          @click="onclick"
          @wheel="onscroll"></canvas>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EditArea',
  props: ['code'],
  emit: ['disconnected'],
  data(){
    return{
      ws: null,
      content:{
        data: new Uint8Array(65536),
        start: 0,
        end: 0,
        get length(){
          return this.end - this.start;
        }
      },
      clients: 0,
      g: null,
      scroll: 0,
      maxScroll: 0,
      fontWidth: null,
      lineHeight: 16,
      cursors: new Map([[0, 0]]),
      canLoad: true,
      inplaceFetch: false,
      debug: false,
      debugInfo: {
        lastCommand: null,
        totalChunks: 0,
        loadedChunks: 0,
        chunkSize: 0,
        length: 0,
      },
      disconnectPrompt: false,
      inputComposing: false,
    }
  },
  mounted() {
    const canvas = this.$refs.canvas;
    canvas.width = this.$refs.ccontainer.offsetWidth;
    canvas.height = this.$refs.ccontainer.offsetHeight;
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.g.font = "16px monospace";
    this.fontWidth = this.g.measureText('a').width;
    let path = window.location.pathname;
    if(path.endsWith('/')) path = path.slice(0, -1);
    this.ws = new WebSocket(`ws${window.location.protocol==='https:'?'s':''}://${window.location.host}${path}/${this.code}`);
    this.ws.addEventListener('message', (msg) => {
      this.decode(msg.data, this.execute);
    });
    this.ws.addEventListener('open', () => {
      this.send(1, [0, 128]);
    });
    window.addEventListener('resize', this.onresize);
  },
  methods: {
    draw(dontStickScroll) {
      window.requestAnimationFrame(() => {
        this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.g.font = '16px monospace';
        this.g.textBaseline = 'top';
        const lineHeight = this.lineHeight;
        const lines = this.content.data.subarray(0, this.content.length).reduce((acc, cur) => (cur === 10)?acc+1:acc, 0)+1;
        const stick = this.scroll === this.maxScroll && !dontStickScroll;
        this.maxScroll = Math.max(
            lines*lineHeight - this.canvas.height,
            0);
        if(this.scroll > this.maxScroll || stick) this.scroll = this.maxScroll;
        let lineStart = 0;
        const decoder = new TextDecoder();
        for (let i = 0; i < lines; i++) {
          this.g.fillStyle = '#fafafa';
          let lineEnd = this.content.data.subarray(0, this.content.length).indexOf(10, lineStart);
          if(lineEnd === -1) lineEnd = this.content.length;
          const text = decoder.decode(this.content.data.subarray(lineStart, lineEnd));
          this.g.fillText(text, 0, i * lineHeight - this.scroll);
          for (let [k, c] of this.cursors.entries()) {
            c -= this.content.start;
            if (c >= lineStart && c <= lineEnd) {
              const cherLen = this.getCharLength(this.content.data.subarray(lineStart, c));
              this.g.fillStyle = k===0?'green':'orange';
              this.g.fillRect(cherLen * this.fontWidth, i * lineHeight - this.scroll, 5, lineHeight);
            }
          }
          lineStart = lineEnd + 1;
        }
        if(this.canLoad && (lines-1)*lineHeight-this.scroll < this.canvas.height && this.ws.readyState === 1){
          this.send(1, [this.content.end, 128]);
          this.canLoad = false;
        }
      });
    },
    input(){
      if(this.inputComposing) return;
      const input = this.$refs.input;
      let cursor = this.cursors.get(0);
      let v = input.value;
      if(v.length === 2) return;
      input.value = "xy";
      input.selectionStart = 1;
      input.selectionEnd = 1;

      if(!v.startsWith('x')){
        if(cursor === 0) return;
        const removedLength = this.getByteLength(this.getCharFromBytePosition(cursor, -1))
        this.content.data.copyWithin(
            cursor-removedLength-this.content.start,
            cursor-this.content.start, this.content.length);
        this.content.end -= removedLength;
        this.handleContentBufferOverflow();
        this.draw();
        this.send(0, [cursor-1, cursor]);
        this.moveCursors(cursor, -removedLength);
        return;
      }
      if(!v.endsWith('y')){
        if(cursor === this.content.length) return;
        const removedLength = this.getByteLength(this.getCharFromBytePosition(cursor, 0));
        this.content =
            this.content.slice(0,  cursor-this.content.start)
            + this.content.substring(cursor+1-this.content.start);
        this.content.data.copyWithin(
            cursor-this.content.start,
            cursor+removedLength-this.content.start,
            this.content.length);
        this.content.end -= removedLength;
        this.handleContentBufferOverflow();
        this.draw();
        this.send(0, [cursor, cursor+1]);
        return;
      }
      v = v.slice(1, -1);
      const insertLength = this.getByteLength(v);
      this.content.data.copyWithin(
          cursor+insertLength-this.content.start,
          cursor-this.content.start,
          this.content.length);
      const target = this.content.data.subarray(
          cursor-this.content.start,
          cursor+insertLength-this.content.start);
      new TextEncoder().encodeInto(v, target);
      this.content.end += insertLength;
      this.handleContentBufferOverflow();
      this.moveCursors(cursor, insertLength);
      this.send(0, [cursor, cursor], target);
      this.draw();
    },
    inputKey(){
      const input = this.$refs.input;
      let cursor = this.cursors.get(0);
      let v = input.value;
      if(v.length === 2 && (input.selectionStart === 0 || input.selectionStart === 2)){
        if(input.selectionStart === 0){
          if(cursor === 0) return;
          cursor -= this.getByteLength(this.getCharFromBytePosition(cursor, -1));
        } else {
          if(cursor === this.content.length) return;
          cursor += this.getByteLength(this.getCharFromBytePosition(cursor, 0));
        }
        this.cursors.set(0, cursor);
        this.draw();
        this.send(3, [this.cursors.get(0)]);
        input.selectionStart = 1;
        input.selectionEnd = 1;
      }
    },
    onclick(e){
      const input = this.$refs.input;
      input.value = "xy";
      input.focus();
      input.selectionStart = 1;
      input.selectionEnd = 1;
      const row = Math.floor((e.offsetY+this.scroll)/this.lineHeight);
      const col = Math.floor(e.offsetX/this.fontWidth);
      let rowStart = 0;
      let rowEnd = this.content.data.indexOf(10, rowStart);
      if(rowEnd === -1) rowEnd = this.content.length;
      for(let i = 0; i < row;i++){
        if(rowStart === -1){
          this.cursors.set(0, this.content.end);
          this.draw();
          this.send(3, [this.content.end]);
          return;
        }
        rowStart = rowEnd+1;
        rowEnd = this.content.data.indexOf(10, rowStart);
        if(rowEnd === -1) rowEnd = this.content.length;
      }
      if(rowStart+col < rowEnd){
        const text = new TextDecoder().decode(this.content.data.subarray(rowStart, rowEnd));
        this.cursors.set(0, this.content.start + rowStart+this.getByteLength(text.substring(0, col)));
      } else {
        this.cursors.set(0, this.content.start + rowEnd);
      }
      this.send(3, [this.cursors.get(0)]);
      this.draw();
    },
    onresize(){
      this.canvas.width = this.$refs.ccontainer.offsetWidth;
      this.canvas.height = this.$refs.ccontainer.offsetHeight;
      this.draw();
    },
    onscroll(e){
      this.scroll += e.deltaY;
      if(this.scroll < 0){
        this.scroll = 0;
        if(!this.inplaceFetch) {
          const shift = this.content.start < 4096 ? this.content.start : 4096;
          this.content.start -= shift;
          this.content.end -= shift;
          this.content.data.copyWithin(shift, 0, this.content.length - shift);
          if (shift !== 0) {
            this.canLoad = false;
            this.inplaceFetch = true;
            this.send(1, [this.content.start, shift]);
          }
        }
      }
      if(this.scroll > this.maxScroll) this.scroll = this.maxScroll;
      this.draw();
    },
    send(type, params, data){
      let len = 1+params.length*4;
      if(typeof data !== 'undefined')
        len += data.length;
      const buf = new ArrayBuffer(len);
      const dataview = new DataView(buf);
      let off = 0;
      dataview.setUint8(0, type);
      off++;
      for(const p of params){
        dataview.setUint32(off, p);
        off += 4;
      }
      if(typeof data !== 'undefined') {
        new Uint8Array(buf, off).set(data);
      }
      this.ws.send(buf);
    },
    decode(msg, cb){
      const reader = new FileReader();
      reader.onload = () => {
        const view = new DataView(reader.result);
        const result = {
          type: 0,
          params: []
        };
        let offset = 0;
        result.type = view.getUint8(0);
        offset++;
        let paramCount = 0;
        if(result.type === 0 || result.type === 1 || result.type === 6) paramCount = 2; // data, fetch, fetch response
        if(result.type === 3) paramCount = 2; // cursor
        if(result.type === 2) paramCount = 1; // stats
        if(result.type === 5) paramCount = 4; // debug
        for(let i = 0;i<paramCount;i++){
          result.params.push(view.getUint32(offset));
          offset += 4;
        }
        result.data = new Uint8Array(reader.result).subarray(offset);
        cb(result);
      };
      reader.readAsArrayBuffer(msg);
    },
    execute(cmd) {
      if (this.debug && cmd.type !== 5){
        this.debugInfo.lastCommand = cmd;
      }

      if (cmd.type === 2) { // stats
        this.clients = cmd.params[0];
        return;
      }

      if(cmd.type === 5){ // debug
        this.debugInfo.length = cmd.params[0];
        this.debugInfo.totalChunks = cmd.params[1];
        this.debugInfo.loadedChunks = cmd.params[2];
        this.debugInfo.chunkSize = cmd.params[3];
        return;
      }

      if(cmd.type === 0 || cmd.type === 6) { // data, fetch response
        const start = cmd.params[0] - this.content.start;
        const end = cmd.params[1] - this.content.start;
        if(start > this.content.length) return;
        const lengthDiff = cmd.data.length - end + start;
        if(cmd.type === 6){
          this.canLoad = true;
          if(this.inplaceFetch){
            this.content.data.set(cmd.data, start);
            const fetchedLines = cmd.data.reduce((acc, cur) => acc + (cur===10?1:0), 0);
            this.scroll += fetchedLines*this.lineHeight;
            this.draw(cmd.type === 6);
            this.inplaceFetch = false;
            return;
          }
        }
        this.moveCursors(end, lengthDiff);
        if(start < 0){
          this.content.start += lengthDiff;
          this.content.end += lengthDiff;
          return;
        }
        this.content.data.copyWithin(start+lengthDiff, start, this.content.length);
        this.content.data.set(cmd.data, start);
        this.content.end += lengthDiff;
        this.handleContentBufferOverflow();
        this.draw(cmd.type === 6);
        return;
      }

      if(cmd.type === 3){
        this.cursors.set(cmd.params[1], cmd.params[0]);
        this.draw();
        return;
      }
    },
    moveCursors(pos, diff){
      for(let [key, value] of this.cursors.entries()){
        if (value >= pos)
          this.cursors.set(key, value + diff);
      }
    },
    handleContentBufferOverflow(){
      // overflow
      if(this.content.length >= 30720+4096){
        let shift = this.content.length-30720;
        this.content.data.copyWithin(0, shift, this.content.length);
        this.content.start += shift;
      }

      // underflow
      if(this.content.length < 30720-4096 && this.content.start !== 0){
        const shift = 30720-this.content.length;
        this.content.data.copyWithin(shift, 0, this.content.length);
        this.content.start -= shift;
        this.canLoad = false;
        this.inplaceFetch = true;
        this.send(1, [this.content.start, shift]);
      }
    },
    disconnect() {
      this.ws.close();
      window.removeEventListener('resize', this.onresize);
      this.$emit('disconnected');
    },
    toggleDebug(){
      this.debug = !this.debug;
      this.send(4, [this.debug?1:0]);
      this.$nextTick(() => this.onresize());
    },
    getByteLength(str){
      return new TextEncoder().encode(str).length;
    },
    getCharLength(buf){
      return new TextDecoder().decode(buf).length;
    },
    getCharFromBytePosition(byteOffset, charOffset){
      byteOffset -= this.content.start;
      const dec = new TextDecoder();
      if(charOffset >= 0){
        const sliced = this.content.data.slice(byteOffset, byteOffset+charOffset*4+4);
        const text = dec.decode(sliced);
        return text[charOffset];
      }
      const sliced = this.content.data.slice(Math.max(0,byteOffset+charOffset*4-4), byteOffset);
      const text = dec.decode(sliced);
      return text[text.length + charOffset];
    }
  }
}
</script>

<style scoped>
.editarea-container{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.canvas-container{
  flex-grow: 1;
  position: relative;
}

canvas{
  background-color: transparent;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.disconnect{
  color: red;
}

.disconnect-warning{
  text-align: center;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1;
  background-color: inherit;
}

.debug{
  color: #424242;
}

.action{
  text-decoration: none;
}

.action:hover{
  text-decoration: underline;
  cursor: pointer;
}

.debug-info{
  padding: 10px 0;
  overflow-x: hidden;
}

.input{
  opacity: 0;
}
</style>
