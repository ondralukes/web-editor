<template>
  <div class="editarea-container">
    <h3>
      {{code}} / {{clients}} connection(s) /
      <span class="disconnect" @click="disconnect">Disconnect.</span>
    </h3>
    <div class="canvas-container" ref="ccontainer">
      <canvas
          tabindex="1"
          ref="canvas"
          @click="onclick"
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
      fontWidth: null,
      lineHeight: 16,
      cursors: new Map([[0, 0]])
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
    window.addEventListener('resize', this.onresize);
  },
  methods: {
    draw() {
      this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.g.font = '16px monospace';
      this.g.textBaseline = 'top';
      const lines = this.content.split('\n');
      const lineHeight = this.lineHeight;
      let lineStart = 0;
      for (let i = 0; i < lines.length; i++) {
        this.g.fillStyle = '#fafafa';
        this.g.fillText(lines[i], 0, i * lineHeight);
        for (const [k, c] of this.cursors.entries()) {
          if (c - lineStart <= lines[i].length) {
            this.g.fillStyle = k===0?'green':'orange';
            this.g.fillRect((c - lineStart) * this.fontWidth, i * lineHeight, 5, lineHeight);
          }
        }
        lineStart += lines[i].length + 1;
      }
    },
    onkeydown(e) {
      if (e.isComposing) return;
      let cursor = this.cursors.get(0);
      if (e.key === 'Backspace') {
        if(cursor === 0) return;
        this.content = this.content.slice(0,  cursor) + this.content.substring(cursor+1);
        this.moveCursors(cursor, -1);
        this.draw();
        this.ws.send(JSON.stringify(
            {
              type: 'data',
              start: cursor,
              end: cursor+1,
              data: ''
            }
        ));
        return;
      } else if(e.key === 'Delete'){
        if(cursor === this.content.length) return;
        this.content = this.content.slice(0,  cursor) + this.content.substring(cursor+1);
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
      }
      let value;
      if (e.key === 'Enter') {
        value = '\n';
      } else {
        value = e.key;
      }

      const ct = this.content;
      this.content = ct.substring(0, cursor) + value + ct.substring(cursor);
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
      const row = Math.floor(e.offsetY/this.lineHeight);
      const col = Math.floor(e.offsetX/this.fontWidth);
      let rowStart = 0;
      for(let i = 0; i < row;i++){
        rowStart = this.content.indexOf('\n', rowStart+1);
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
      }
      if(rowStart+col < this.content.length){
        this.cursors.set(0, rowStart+col);
      } else {
        this.cursors.set(0, rowStart);
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
    execute(msg) {
      if (typeof msg !== "string") return;
      const cmd = JSON.parse(msg);
      if (cmd.type === 'stats') {
        this.clients = cmd.clients;
        return;
      }
      if (cmd.type === 'cursor'){
        this.cursors.set(cmd.sender, cmd.pos);
        this.draw();
        return;
      }
      if(cmd.type === 'data') {
        const text = this.content;
        const lengthDiff = cmd.data.length - cmd.end + cmd.start;
        this.moveCursors(cmd.end, lengthDiff);
        this.content = text.substring(0, cmd.start) + cmd.data + text.substring(cmd.end)
        this.draw();
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

.disconnect:hover{
  text-decoration: underline;
  cursor: pointer;
}
</style>
