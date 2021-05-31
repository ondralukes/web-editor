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
        <a class="action download" :href="`/download/${code}`" download>Download</a>
        /
        <span class="action debug" @click="toggleDebug">Debug</span>
      </h3>
      <div v-if="debug" class="debug-info">
        Last received: {{ debugInfo.lastCommand }}
        <br>
        Loaded length: {{ loadedLength }}
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
      </div>
    </div>
    <div class="canvas-container" ref="ccontainer">
      <canvas
          tabindex="1"
          ref="canvas"
          @click="onclick"
          @wheel="onscroll"
          @keydown="onkeydown"></canvas>
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
      content: '',
      clients: 0,
      g: null,
      scroll: 0,
      maxScroll: 0,
      fontWidth: null,
      lineHeight: 16,
      cursors: new Map([[0, 0]]),
      loadedLength: 0,
      canLoad: true,
      debug: false,
      debugInfo: {
        lastCommand: '',
        totalChunks: 0,
        loadedChunks: 0,
        chunkSize: 0,
        length: 0,
      },
      disconnectPrompt: false
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
    this.ws = new WebSocket(`ws://localhost:8080/${this.code}`);
    this.ws.addEventListener('message', (msg) => {
      this.execute(msg.data);
    });
    this.ws.addEventListener('open', () => {
      this.ws.send(JSON.stringify(
          {
            type: 'fetch',
            offset: 0,
            len: 128
          }
      ));
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
        const lines = this.content.split('\n');
        const stick = this.scroll === this.maxScroll && !dontStickScroll;
        this.maxScroll = Math.max(
            lines.length*lineHeight - this.canvas.height,
            0);
        if(this.scroll > this.maxScroll || stick) this.scroll = this.maxScroll;
        let lineStart = 0;
        for (let i = 0; i < lines.length; i++) {
          this.g.fillStyle = '#fafafa';
          this.g.fillText(lines[i], 0, i * lineHeight - this.scroll);
          for (const [k, c] of this.cursors.entries()) {
            if (c - lineStart <= lines[i].length) {
              this.g.fillStyle = k===0?'green':'orange';
              this.g.fillRect((c - lineStart) * this.fontWidth, i * lineHeight - this.scroll, 5, lineHeight);
            }
          }
          lineStart += lines[i].length + 1;
        }
        if(this.canLoad && (lines.length-1)*lineHeight-this.scroll < this.canvas.height && this.ws.readyState === 1){
          this.ws.send(JSON.stringify(
              {
                type: 'fetch',
                offset: this.loadedLength,
                len: 128
              }
          ));
          this.canLoad = false;
        }
      });
    },
    onkeydown(e) {
      if (e.isComposing) return;
      let cursor = this.cursors.get(0);
      if (e.key === 'Backspace') {
        if(cursor === 0) return;
        this.content = this.content.slice(0,  cursor-1) + this.content.substring(cursor);
        this.loadedLength -= 1;
        this.lastRequested -= 1;
        this.draw();
        this.ws.send(JSON.stringify(
            {
              type: 'data',
              start: cursor-1,
              end: cursor,
              data: ''
            }
        ));
        this.moveCursors(cursor, -1);
        return;
      } else if(e.key === 'Delete'){
        if(cursor === this.content.length) return;
        this.content = this.content.slice(0,  cursor) + this.content.substring(cursor+1);
        this.loadedLength -= 1;
        this.draw();
        this.ws.send(JSON.stringify(
            {
              type: 'data',
              start:cursor,
              end: cursor+1,
              data: ''
            }
        ));
        return;
      } else if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
        let c = this.cursors.get(0);
        if(e.key === 'ArrowLeft'){
          if(c === 0) return;
          c--;
        } else if(e.key === 'ArrowRight'){
          if(c === this.content.length) return;
          c++;
        }
        this.cursors.set(0, c);
        this.draw();
        this.ws.send(JSON.stringify(
            {
              type: 'cursor',
              pos: this.cursors.get(0)
            }
        ));
        return;
      }
      let value;
      if (e.key === 'Enter') {
        value = '\n';
      } else {
        value = e.key;
      }

      const ct = this.content;
      this.content = ct.substring(0, cursor) + value + ct.substring(cursor);
      this.loadedLength += value.length;
      this.moveCursors(cursor, value.length);
      this.ws.send(JSON.stringify(
          {
            type: 'data',
            start: cursor,
            end: cursor,
            data: value
          }
      ));
      this.draw();
    },
    onclick(e){
      const row = Math.floor((e.offsetY+this.scroll)/this.lineHeight);
      const col = Math.floor(e.offsetX/this.fontWidth);
      let rowStart = 0;
      let rowEnd = this.content.indexOf('\n', rowStart+1);
      if(rowEnd === -1) rowEnd = this.content.length;
      for(let i = 0; i < row;i++){
        if(rowStart === -1){
          this.cursors.set(0, this.content.length);
          this.draw();
          this.ws.send(JSON.stringify(
              {
                type: 'cursor',
                pos: this.cursors.get(0)
              }
          ));
          return;
        }
        rowStart = rowEnd;
        rowEnd = this.content.indexOf('\n', rowStart+1);
        if(rowEnd === -1) rowEnd = this.content.length;
      }
      if(rowStart+col < rowEnd){
        this.cursors.set(0, rowStart+col);
      } else {
        this.cursors.set(0, rowEnd);
      }
      this.ws.send(JSON.stringify(
          {
            type: 'cursor',
            pos: this.cursors.get(0)
          }
      ));
      this.draw();
    },
    onresize(){
      this.canvas.width = this.$refs.ccontainer.offsetWidth;
      this.canvas.height = this.$refs.ccontainer.offsetHeight;
      this.draw();
    },
    onscroll(e){
      this.scroll += e.deltaY;
      if(this.scroll < 0) this.scroll = 0;
      if(this.scroll > this.maxScroll) this.scroll = this.maxScroll;
      this.draw();
    },
    execute(msg) {
      if (typeof msg !== "string") return;
      const cmd = JSON.parse(msg);
      if (this.debug && cmd.type !== 'debug'){
        this.debugInfo.lastCommand = msg;
      }

      if (cmd.type === 'stats') {
        this.clients = cmd.clients;
        return;
      }

      if(cmd.type === 'debug'){
        this.debugInfo.totalChunks = cmd.totalChunks;
        this.debugInfo.loadedChunks = cmd.loadedChunks;
        this.debugInfo.length = cmd.length;
        this.debugInfo.chunkSize = cmd.chunkSize;
      }
      if (cmd.type === 'cursor'){
        this.cursors.set(cmd.sender, cmd.pos);
        this.draw();
        return;
      }
      if(cmd.type === 'data') {
        if(cmd.start > this.loadedLength) return;
        const text = this.content;
        const lengthDiff = cmd.data.length - cmd.end + cmd.start;
        if(cmd.flags === 'load'){
          this.canLoad = true;
        }
        this.loadedLength += lengthDiff;
        this.moveCursors(cmd.end, lengthDiff);
        this.content = text.substring(0, cmd.start) + cmd.data + text.substring(cmd.end)
        this.draw(cmd.flags === 'load' || cmd.flags === 'load last');
      }
    },
    moveCursors(pos, diff){
      for(let [key, value] of this.cursors.entries()){
        if (value >= pos)
          this.cursors.set(key, value + diff);
      }
    },
    disconnect() {
      this.ws.close();
      window.removeEventListener('resize', this.onresize);
      this.$emit('disconnected');
    },
    toggleDebug(){
      this.debug = !this.debug;
      this.ws.send(JSON.stringify(
          {
            type: 'toggle debug',
            value: this.debug
          }
      ));
      this.$nextTick(() => this.onresize());
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
}
</style>
