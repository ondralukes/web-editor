import WebSocket from "ws";
import Document from "./Document";
import {Request, Response} from "express";

const express = require('express');
const app = express();
app.use(express.static('dist'));
const server = app.listen(8080);
const ws = new WebSocket.Server({server});

const docs: Map<string, Document> = new Map();
ws.on('connection', (client, req) => {
    if(req.url == null) return;
    const code = req.url.substring(req.url.indexOf('/')+1);
    let doc = docs.get(code);
    if(typeof doc === 'undefined'){
        const doc = new Document(code);
        docs.set(code, doc);
        doc.connect(client);
        return;
    }
    doc.connect(client);
})

app.get('/download/:code', (req: Request, res: Response) => {
    const doc = docs.get(req.params.code);
    if(typeof doc === 'undefined'){
        res.status(404);
        res.end();
        return;
    }
    doc.writeToStream(res);
    res.end();
});
