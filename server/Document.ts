import WebSocket from "ws";
import List from "./List";
import {
    Command,
    DataCommand,
    DataCommandFlags,
    DebugCommand,
    FetchCommand,
    StatsCommand,
    ToggleDebugCommand
} from "./Command";
import Content from "./Content";

export default class Document{
    content: Content;
    connections: List<Client> = new List<Client>();
    clients: number = 0;
    constructor(code: string) {
        this.content = new Content(code);
        setInterval(() => this.sendDebug(), 500);
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
        // Server-only commands
        if (cmd instanceof FetchCommand){
            const resp = new DataCommand(cmd.offset, cmd.offset, this.content.read(cmd.offset, cmd.len));
            if(cmd.offset+cmd.len >= this.content.length){
                resp.flags = DataCommandFlags.LoadLast;
            } else {
                resp.flags = DataCommandFlags.Load;
            }
            sender.send(resp);
            return;
        }

        if(cmd instanceof ToggleDebugCommand){
            console.log('togg');
            sender.debug = cmd.value as boolean;
            return;
        }

        // Broadcasted commands
        if(cmd instanceof DataCommand){
            this.content.replace(cmd.data, cmd.start, cmd.end - cmd.start);
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

    private sendDebug(){
        const cmd = new DebugCommand(
            this.content.length,
            this.content.totalChunks,
            this.content.loadedChunks,
            this.content.chunkSize
        );
        let s = this.connections.first;
        while(s != null){
            if(s.value.debug)
                s.value.send(cmd);
            s = s.next;
        }
    }
}

class Client{
    private readonly ws: WebSocket;
    private readonly doc: Document;
    debug: boolean = false;
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
