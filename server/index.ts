import WebSocket from "ws";
import Document from "./Document";

const express = require('express');
const app = express();
app.use(express.static('dist'));
const server = app.listen(8080);
const ws = new WebSocket.Server({server});

const doc = new Document();
ws.on('connection', (client) => {
    doc.connect(client);
})
