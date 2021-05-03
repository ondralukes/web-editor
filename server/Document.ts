import WebSocket from "ws";
import List from "./List";

export default class Document{
    content: string = '';
    connections: List<WebSocket> = new List<WebSocket>();
    clients: number = 0;
    constructor() {

    }

    connect(ws: WebSocket){
        this.connections.add(ws);
        ws.on('close', () => {
            this.connections.remove(ws);
            this.clients--;
            this.broadcast(
                null,
                JSON.stringify({
                    control: 'clients',
                    value: this.clients
                }));
        });
        ws.on('message', (msg) => this.onMessage(ws, msg));
        ws.send(
            JSON.stringify({
                start: 0,
                end: 0,
                value: this.content
            })
        );
        this.clients++;
        this.broadcast(
            null,
            JSON.stringify({
                control: 'clients',
                value: this.clients
            }));
    }

    private onMessage(sender: WebSocket, msg: WebSocket.Data){
        if(typeof msg !== 'string') return;
        // Execute command
        const cmd = JSON.parse(msg);
        this.content = this.content.substring(0, cmd.start) + cmd.value + this.content.substring(cmd.end);

        this.broadcast(sender, msg);
    }

    private broadcast(sender: WebSocket | null, msg: WebSocket.Data){
        let s = this.connections.first;
        while(s != null){
            if(s.value != sender)
                s.value.send(msg);
            s = s.next;
        }
    }
}
