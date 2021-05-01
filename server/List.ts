export default class List<T>{
    first: Node<T> | null = null;
    add(v: T){
        if(this.first == null){
            this.first = new Node(v);
            return
        }
        let prev = this.first;
        while (prev.next != null){
            prev = prev.next;
        }
        prev.next = new Node(v);
    }

    remove(v: T){
        if(this.first == null) return;
        let node = this.first;
        let prev = null;
        while(node.value != v){
            if(node.next == null) return;
            node = node.next;
            prev = node;
        }
        if(prev != null){
            prev.next = node.next;
        }
    }
}

class Node<T>{
    value: T;
    next: Node<T> | null = null;
    constructor(v: T) {
        this.value = v;
    }
}
