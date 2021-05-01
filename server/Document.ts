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
                start: 0,
                end: 0,
                value: this.content
            })
        );
    }

    private onMessage(sender: WebSocket, msg: WebSocket.Data){
        if(typeof msg !== 'string') return;
        // Execute command
        const cmd = JSON.parse(msg);
        this.content = this.content.substring(0, cmd.start) + cmd.value + this.content.substring(cmd.end);

        let s = this.connections.first;
        while(s != null){
            if(s.value != sender)
                s.value.send(msg);
            s = s.next;
        }
    }
}
