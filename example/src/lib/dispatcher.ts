import {
    Callback,
    DecodedMessage,
    Decoder,
    Encoder,
    IMessage,
    LightNode,
    bytesToUtf8,
    utf8ToBytes,
    Protocols,
    waitForRemotePeer
} from "@waku/sdk"

type IDispatchMessage = {
    type: MessageType
    payload: Uint8Array
}

type MessageType = string
type DispatchCallback = (payload: any, msg:IMessage) => void

export class Dispatcher {
    mapping: Map<MessageType, DispatchCallback>
    node: LightNode
    decoder: Decoder
    encoder: Encoder
    unsubscribe: () => void 
    running: boolean
    constructor(node: LightNode, encoder: Encoder, decoder: Decoder) {
        this.mapping = new Map<MessageType, DispatchCallback>()
        this.node = node
        this.encoder = encoder
        this.decoder = decoder
        this.unsubscribe = () => {}
        this.running = false
    }

    on = (typ: MessageType, callback: DispatchCallback ) => {
        this.mapping.set(typ, callback)
    }

    start = async () => {
        if (this.running) return
        this.running = true

        //await this.node.start()
        await waitForRemotePeer(this.node, [Protocols.LightPush, Protocols.Filter])

        this.unsubscribe = await this.node.filter.subscribe(this.decoder, this.dispatch)
    }

    stop = () => {
        this.running = false
        this.unsubscribe()
        this.mapping.clear()
    }

    isRunning = ():boolean => {
        return this.running
    }

    dispatch:Callback<DecodedMessage> = (msg: DecodedMessage) => {
        const dmsg:IDispatchMessage = JSON.parse(bytesToUtf8(msg.payload)) 
        if (!this.mapping.has(dmsg.type)) {
            console.error("Unknown type " + dmsg.type)
            return
        }

        const callback = this.mapping.get(dmsg.type)

        if (!callback) {
            console.error("Undefined callback for " + dmsg.type)
            return
        }

        callback!(dmsg.payload, msg)
    }

    emit = (typ: MessageType, payload: any) => {
        const dmsg: IDispatchMessage = {
            type: typ,
            payload: payload
        }

        console.log(dmsg.payload)

        const msg: IMessage = {
            payload: utf8ToBytes(JSON.stringify(dmsg))
        }
        return this.node.lightPush.send(this.encoder, msg)
    }
}
