<template>
  <div class="container">
    <form v-if="code===null" @submit="submit">
      <input
          placeholder="Document code"
          type="input"
          ref="codeInput">
    </form>
    <EditArea
        v-else
        :code="code"
        @disconnected="code = null;"/>
  </div>
</template>

<script>
import EditArea from "./components/EditArea";

export default {
  name: 'App',
  data(){
    return{
      code: null
    }
  },
  methods: {
    submit(){
      this.code = this.$refs.codeInput.value;
    }
  },
  components: {
    EditArea
  }
}
</script>

<style>
html, body{
  margin: 0;
  height: 100%;
  font-family: monospace;
}
*{
  color: inherit;
  background-color: inherit;
  box-sizing: border-box;
}
body {
  background-color: #212121;
  color: #fafafa;
}

.container{
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

form {
  display: block;
  width: 50%;
  margin-left: auto;
  margin-right: auto;
}

input {
  font-size: 3em;
  width: 100%;
  border: none;
  border-bottom: 3px solid #616161;
  border-radius: 4px;
  outline: none;
}
</style>
