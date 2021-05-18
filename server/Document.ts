import WebSocket from "ws";
import List from "./List";
import {Command, DataCommand, StatsCommand} from "./Command";

export default class Document{
    content: string = '';
    connections: List<Client> = new List<Client>();
    clients: number = 0;
    constructor() {
        this.content = `// You\'ve just created a fresh new document.
// Write something awesome!
`;
    }
    connect(ws: WebSocket){
        const c = new Client(ws, this);
        c.send(new DataCommand(0, 0, this.content));
        this.connections.add(c);
        this.clients++;
        this.broadcast(new StatsCommand(this.clients));
    }
    disconnect(client: Client){
        this.connections.remove(client);
        this.clients--;
        this.broadcast(new StatsCommand(this.clients));
    }
    execute(cmd: Command){
        if(cmd instanceof DataCommand){
            this.content = this.content.substring(0, cmd.start) + cmd.data + this.content.substring(cmd.end);
        }
        this.broadcast(cmd);
    }

    private broadcast(cmd: Command){
        let s = this.connections.first;
        while(s != null){
            if(s.value.id != cmd.sender)
                s.value.send(cmd);
            s = s.next;
        }
    }
}

class Client{
    private readonly ws: WebSocket;
    private readonly doc: Document;
    readonly id: number;
    constructor(ws: WebSocket, doc: Document) {
        this.ws = ws;
        this.doc = doc;
        this.id = Math.floor(Math.random() * 1000000);
        ws.on('message', (msg) => this.onMessage(msg));
        ws.on('close', () => doc.disconnect(this));
    }

    private onMessage(msg: WebSocket.Data){
        if (typeof msg !== "string")
            return;
        const cmd = Command.deserialize(msg);
        if(cmd === null) return;
        cmd.sender = this.id;
        this.doc.execute(cmd);
    }

    send(cmd: Command){
        this.ws.send(cmd.serialize());
    }
}
