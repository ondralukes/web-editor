<template>
  <div class="editarea-container">
    <h3>
      {{code}} / {{clients}} connection(s) /
      <span class="disconnect" @click="disconnect">Disconnect.</span>
    </h3>
    <div class="input">
      <textarea ref="input"
                @beforeinput="beforeInput"
                @scroll="onscroll"
                @input="input"></textarea>
      <canvas ref="canvas"></canvas>
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
      selStart: 0,
      selEnd: 0,
      foreignCursorPos: 0,
      clients: 0,
      scroll: 0,
      ignoreScroll: false,
      g: null,
      fontWidth: null,
    }
  },
  mounted() {
    const canvas = this.$refs.canvas;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    this.g = canvas.getContext('2d');
    this.g.font = "16px monospace";
    this.fontWidth = this.g.measureText('a').width;
    this.ws = new WebSocket(`ws://localhost:8080/${this.code}`);
    this.ws.addEventListener('message', (msg) => {
      this.execute(msg.data);
    });
  },
  methods: {
    beforeInput(){
      this.selStart = this.$refs.input.selectionStart;
      this.selEnd = this.$refs.input.selectionEnd;
    },
    input(e){
      const action = e.inputType;
      switch (action){
        case 'insertText':
        case 'insertFromPaste':
          console.log(`edit at ${this.selStart} - ${this.selEnd} => ${e.data}`);
          this.ws.send(JSON.stringify(
              {
                start: this.selStart,
                end: this.selEnd,
                value: e.data
              }
          ));
          break;
        case 'deleteContentBackward':
        case 'deleteContentForward': {
          if(this.selStart === this.selEnd){
            if(e.inputType === 'deleteContentBackward'){
              this.selStart--;
            } else {
              this.selEnd++;
            }
          }
          console.log(`edit at ${this.selStart} - ${this.selEnd} => (empty)`);
          this.ws.send(JSON.stringify(
              {
                start: this.selStart,
                end: this.selEnd,
                value: ''
              }
          ));
          break;
        }
        case 'insertLineBreak':
          console.log(`edit at ${this.selStart} - ${this.selEnd} => \\n`);
          this.ws.send(JSON.stringify(
              {
                start: this.selStart,
                end: this.selEnd,
                value: '\n'
              }
          ));
          break;
        default:
          console.log(`Unknown action ${action}`);
          console.log(e);
          break;
      }
    },
    execute(msg){
      if (typeof msg !== "string") return;
      const input = this.$refs.input;
      let selectionStart = input.selectionStart;
      let selectionEnd = input.selectionEnd;
      const text = input.value;
      const cmd = JSON.parse(msg);
      if(cmd.control === 'clients'){
        this.clients = cmd.value;
        return;
      }
      input.value = text.substring(0, cmd.start) + cmd.value + text.substring(cmd.end)
      const lengthDiff = cmd.value.length - cmd.end + cmd.start;
      if(cmd.end < selectionStart) selectionStart += lengthDiff;
      if(cmd.end < selectionEnd) selectionEnd += lengthDiff;
      input.selectionStart = selectionStart;
      input.selectionEnd = selectionEnd;
      this.foreignCursorPos = cmd.end + lengthDiff;
      this.ignoreScroll = true;
      this.$refs.input.scrollTo(0, this.scroll);
      this.drawCursor(input.value);
    },
    disconnect(){
      this.ws.close();
      this.$emit('disconnected');
    },
    drawCursor(text){
      let line = 0;
      let col = 0;
      for(let i = 0;i<this.foreignCursorPos;i++){
        col++;
        if(text[i] === '\n'){
          line++;
          col = 0;
        }
      }
      this.g.clearRect(0,0, this.$refs.canvas.width, this.$refs.canvas.height);
      this.g.fillStyle = 'green';
      this.g.fillRect(
          col*this.fontWidth,
          line*16*1.2 - this.scroll,
          5,
          16*1.2
      );
    },
    onscroll(){
      if(this.ignoreScroll){
        this.$refs.input.scrollTo(0, this.scroll);
        this.ignoreScroll = false;
        return;
      }
      this.scroll = this.$refs.input.scrollTop;
      this.drawCursor(this.$refs.input.value);
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

.input{
  position: relative;
  display: block;
  min-height: 50vh;
  width: 100%;
  height: 50vh;
  flex-grow: 1;
}

textarea {
  border: none;
  outline: none;
  resize: none;
  line-height: 1.2em;
  font-size: 16px;
}

textarea, canvas{
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

canvas{
  pointer-events: none;
  background-color: transparent;
}

.disconnect{
  color: red;
}

.disconnect:hover{
  text-decoration: underline;
  cursor: pointer;
}
</style>
