<template>
  <div class="editarea-container">
    <h3>
      {{code}} / {{clients}} connection(s) /
      <span class="disconnect" @click="disconnect">Disconnect.</span>
    </h3>
    <canvas
        tabindex="1"
        ref="canvas"
        @click="onclick"
        @keydown="onkeydown"></canvas>
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
      cursors: [0]
    }
  },
  mounted() {
    const canvas = this.$refs.canvas;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.g.font = "16px monospace";
    this.fontWidth = this.g.measureText('a').width;
    this.ws = new WebSocket(`ws://localhost:8080/${this.code}`);
    this.ws.addEventListener('message', (msg) => {
      this.execute(msg.data);
    });
  },
  methods: {
    draw() {
      this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.g.font = '16px monospace';
      this.g.fillStyle = 'green';
      this.g.textBaseline = 'top';
      const lines = this.content.split('\n');
      const lineHeight = this.lineHeight;
      let lineStart = 0;
      for (let i = 0; i < lines.length; i++) {
        this.g.fillText(lines[i], 0, i * lineHeight);
        for (const c of this.cursors) {
          if (c - lineStart <= lines[i].length) {
            this.g.fillRect((c - lineStart) * this.fontWidth, i * lineHeight, 2, lineHeight);
          }
        }
        lineStart += lines[i].length + 1;
      }
    },
    onkeydown(e) {
      if (e.isComposing) return;
      if (e.key === 'Backspace') {
        if(this.cursors[0] === 0) return;
        this.cursors[0] -= 1;
        this.content = this.content.slice(0,  this.cursors[0]) + this.content.substring(this.cursors[0]+1);
        this.draw();
        this.ws.send(JSON.stringify(
            {
              start: this.cursors[0],
              end: this.cursors[0]+1,
              value: ''
            }
        ));
        return;
      } else if(e.key === 'Delete'){
        if(this.cursors[0] === this.content.length) return;
        this.content = this.content.slice(0,  this.cursors[0]) + this.content.substring(this.cursors[0]+1);
        this.draw();
        this.ws.send(JSON.stringify(
            {
              start: this.cursors[0],
              end: this.cursors[0]+1,
              value: ''
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
      this.cursors[0] += value.length;
      const ct = this.content;
      this.content = ct.substring(0, this.cursors[0]) + value + ct.substring(this.cursors[0]);
      this.draw();
      this.ws.send(JSON.stringify(
          {
            start: this.cursors[0],
            end: this.cursors[0],
            value: value
          }
      ));
    },
    onclick(e){
      const row = Math.floor(e.offsetY/this.lineHeight);
      const col = Math.floor(e.offsetX/this.fontWidth);
      let rowStart = 0;
      for(let i = 0; i < row;i++){
        rowStart = this.content.indexOf('\n', rowStart+1);
        if(rowStart === -1){
          this.cursors[0] = this.content.length;
          this.draw();
          return;
        }
      }
      if(rowStart+col < this.content.length){
        this.cursors[0] = rowStart+col;
      } else {
        this.cursors[0] = this.content.length;
      }
      this.draw();
    },
    execute(msg) {
      if (typeof msg !== "string") return;
      const cmd = JSON.parse(msg);
      if (cmd.control === 'clients') {
        this.clients = cmd.value;
        return;
      }
      const text = this.content;
      const lengthDiff = cmd.value.length - cmd.end + cmd.start;
      for(let i = 0;i < this.cursors.length;i++){
        if(this.cursors[i] >= cmd.end)
          this.cursors[i] += lengthDiff;
      }
      this.content = text.substring(0, cmd.start) + cmd.value + text.substring(cmd.end)
      this.draw();
    },
    disconnect() {
      this.ws.close();
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

canvas{
  background-color: transparent;
  flex-grow: 1;
}

.disconnect{
  color: red;
}

.disconnect:hover{
  text-decoration: underline;
  cursor: pointer;
}
</style>
