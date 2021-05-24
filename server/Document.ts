import WebSocket from "ws";
import List from "./List";
import {Command, DataCommand, FetchCommand, StatsCommand} from "./Command";
import Content from "./Content";

export default class Document{
    content: Content;
    connections: List<Client> = new List<Client>();
    clients: number = 0;
    constructor() {
        this.content = new Content('ctnt');
        this.content.write(`// You\'ve just created a fresh new document.
// Write something awesome!
`, 0);
    }
    connect(ws: WebSocket){
        const c = new Client(ws, this);
        this.connections.add(c);
        this.clients++;
        this.broadcast(new StatsCommand(this.clients));
    }
    disconnect(client: Client){
        this.connections.remove(client);
        this.clients--;
        this.broadcast(new StatsCommand(this.clients));
    }
    execute(cmd: Command, sender: Client){
        if(cmd instanceof DataCommand){
            this.content.replace(cmd.data, cmd.start, cmd.end - cmd.start);
        }
        if (cmd instanceof FetchCommand){
            sender.send(new DataCommand(cmd.offset, cmd.offset, this.content.read(cmd.offset, cmd.len)));
        } else {
            this.broadcast(cmd);
        }
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
        this.doc.execute(cmd, this);
    }

    send(cmd: Command){
        this.ws.send(cmd.serialize());
    }
}
