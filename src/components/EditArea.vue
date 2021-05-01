<template>
  <div>
    <textarea ref="input" @beforeinput="beforeInput" @input="input"></textarea>
  </div>
</template>

<script>
export default {
  name: 'EditArea',
  data(){
    return{
      ws: null,
      cursorPosition: 0,
      lengthBeforeEvent: 0
    }
  },
  created() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.addEventListener('message', (msg) => {
      this.execute(msg.data);
    })
  },
  methods: {
    beforeInput(){
      this.cursorPosition = this.$refs.input.selectionEnd;
      this.lengthBeforeEvent = this.$refs.input.value.length;
    },
    input(e){
      const action = e.inputType;
      switch (action){
        case 'insertText':
        case 'insertFromPaste':
          console.log(`insert ${e.data} at ${this.cursorPosition}`);
          this.ws.send(
              JSON.stringify(
                  {
                    action: 'insert',
                    data: e.data,
                    pos: this.cursorPosition
                  }
              )
          );
          break;
        case 'deleteContentForward': {
          const count = this.lengthBeforeEvent - this.$refs.input.value.length;
          console.log(`deleted ${count} forward at ${this.cursorPosition}`);
          this.ws.send(
              JSON.stringify(
                  {
                    action: 'delete',
                    count: count,
                    pos: this.cursorPosition
                  }
              )
          );
          break;
        }
        case 'deleteContentBackward': {
          const count = this.lengthBeforeEvent - this.$refs.input.value.length;
          console.log(`deleted ${count} backward at ${this.cursorPosition}`);
          this.ws.send(
              JSON.stringify(
                  {
                    action: 'delete',
                    count: count,
                    pos: this.cursorPosition - count
                  }
              )
          );
          break;
        }
        case 'insertLineBreak':
          console.log(`insert new line at ${this.cursorPosition}`);
          this.ws.send(
              JSON.stringify(
                  {
                    action: 'insert',
                    data: '\n',
                    pos: this.cursorPosition
                  }
              )
          );
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
      switch (cmd.action){
        case 'insert':
          input.value = text.substring(0, cmd.pos) + cmd.data + text.substring(cmd.pos);
          if(cmd.pos < selectionStart) selectionStart += cmd.data.length;
          if(cmd.pos < selectionEnd) selectionEnd += cmd.data.length;
          break;
        case 'delete':
          input.value = text.substring(0, cmd.pos) + text.substring(cmd.pos + cmd.count);
          if(cmd.pos < selectionStart) selectionStart -= cmd.count;
          if(cmd.pos < selectionEnd) selectionEnd -= cmd.count;
          break;
      }
      input.selectionStart = selectionStart;
      input.selectionEnd = selectionEnd;
      console.log(text);
    }
  }
}
</script>

<style scoped>
textarea {
  min-height: 50vh;
  width: 100%;
  height: 50vh;
}
</style>
