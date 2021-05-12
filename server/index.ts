import WebSocket from "ws";
import Document from "./Document";

const express = require('express');
const app = express();
app.use(express.static('dist'));
const server = app.listen(8080);
const ws = new WebSocket.Server({server});

const docs = new Map();
ws.on('connection', (client, req) => {
    if(req.url == null) return;
    const code = req.url.substring(req.url.indexOf('/'));
    if(!docs.has(code)){
        const doc = new Document();
        docs.set(code, doc);
        doc.connect(client);
        return;
    }
    docs.get(code).connect(client);
})
