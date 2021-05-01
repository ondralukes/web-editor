import WebSocket from "ws";
import List from "./List";

export default class Document{
    content: string = '';
    connections: List<WebSocket> = new List<WebSocket>();
    constructor() {

    }

    connect(ws: WebSocket){
        this.connections.add(ws);
        ws.on('close', () => this.connections.remove(ws));
        ws.on('message', (msg) => this.onMessage(ws, msg));
        ws.send(
            JSON.stringify({
                action: 'insert',
                pos: 0,
                data: this.content
            })
        );
    }

    private onMessage(sender: WebSocket, msg: WebSocket.Data){
        if(typeof msg !== 'string') return;
        // Execute command
        const cmd = JSON.parse(msg);
        switch (cmd.action){
            case 'insert':
                this.content = this.content.substring(0, cmd.pos) + cmd.data + this.content.substring(cmd.pos);
                break;
            case 'delete':
                this.content = this.content.substring(0, cmd.pos) + this.content.substring(cmd.pos + cmd.count);
                break;
        }

        let s = this.connections.first;
        while(s != null){
            if(s.value != sender)
                s.value.send(msg);
            s = s.next;
        }
    }
}
