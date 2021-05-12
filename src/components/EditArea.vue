<template>
  <div>
    <h3>
      {{code}} / {{clients}} connection(s) /
      <span class="disconnect" @click="disconnect">Disconnect.</span>
    </h3>
    <textarea ref="input" @beforeinput="beforeInput" @input="input"></textarea>
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
      clients: 0
    }
  },
  created() {
    this.ws = new WebSocket(`ws://localhost:8080/${this.code}`);
    this.ws.addEventListener('message', (msg) => {
      this.execute(msg.data);
    })
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
      const lengthDiff = cmd.value - cmd.end + cmd.start;
      if(cmd.end < selectionStart) selectionStart += lengthDiff;
      if(cmd.end < selectionEnd) selectionEnd += lengthDiff;
      input.selectionStart = selectionStart;
      input.selectionEnd = selectionEnd;
    },
    disconnect(){
      this.ws.close();
      this.$emit('disconnected');
    }
  }
}
</script>

<style scoped>
div{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
}
textarea {
  min-height: 50vh;
  width: 100%;
  height: 50vh;
  border: none;
  outline: none;
  flex-grow: 1;
  resize: none;
}

.disconnect{
  color: red;
}

.disconnect:hover{
  text-decoration: underline;
  cursor: pointer;
}
</style>
