import WebSocket from "ws";
import Document from "./Document";
import {Request, Response} from "express";
import fs from "fs";

if(fs.existsSync('files'))
    fs.rmSync('files', {recursive: true});
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
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.code}.txt"`);
    doc.writeToStream(res);
    res.end();
});

setInterval(() => {
    for(const [code, doc] of docs){
        if(doc.clients === 0 && Date.now() - doc.lastAccessed > 10000){
            console.log(`Expired ${code}`);
            doc.destroy();
            docs.delete(code);
        }
    }
}, 10000);
