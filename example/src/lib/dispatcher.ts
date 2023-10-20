import { LightNode, IDecodedMessage, Waku } from "@waku/interfaces"
import {
    bytesToUtf8,
    utf8ToBytes,
    waitForRemotePeer,
} from "@waku/sdk"
import {
    hexToBytes
} from "@waku/utils/bytes"

import {
    IMessage,
    IEncoder,
    IDecoder,
    Protocols,
    Callback,
} from "@waku/interfaces"
import { encrypt, decrypt } from "../../node_modules/@waku/message-encryption/dist/crypto/ecies.js"
import { BaseWallet, ethers } from "ethers"


type IDispatchMessage = {
    type: MessageType
    payload: any
    timestamp: string | undefined
    signature: string | undefined
    signer: string | undefined
}

type DispachInfo = {
    callback: DispatchCallback
    verifySender: boolean
}

type MessageType = string
type DispatchCallback = (payload: any, msg:IMessage, signer?: string) => void

export class Dispatcher {
    mapping: Map<MessageType, DispachInfo[]>
    node: LightNode
    decoder: IDecoder<IDecodedMessage> 
    encoder: IEncoder
    unsubscribe: () => void 
    running: boolean
    decryptionKeys: Uint8Array[]
    constructor(node: LightNode, encoder: IEncoder, decoder: IDecoder<IDecodedMessage> ) {
        this.mapping = new Map<MessageType, DispachInfo[]>()
        this.node = node
        this.encoder = encoder
        this.decoder = decoder
        this.unsubscribe = () => {}
        this.running = false
        this.decryptionKeys = []
    }


    on = (typ: MessageType, callback: DispatchCallback, verifySender?: boolean ) => {
        if (!this.mapping.has(typ)){
            this.mapping.set(typ, [])
        }
        const dispatchInfos = this.mapping.get(typ)
        dispatchInfos?.push({callback: callback, verifySender: !!verifySender})
        this.mapping.set(typ, dispatchInfos!)
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

    registerKey = (key: Uint8Array) => {
        if (!this.decryptionKeys.find((k) => k == key)) this.decryptionKeys.push(key)
    }

    dispatch:Callback<IDecodedMessage> = async (msg: IDecodedMessage) => {
        let msgPayload = msg.payload
        if (this.decryptionKeys.length > 0) {
            for (const key of this.decryptionKeys) {
                try {
                    const buffer = await decrypt(key, msgPayload)
                    msgPayload = new Uint8Array(buffer.buffer)
                    break
                } catch (e) {
                    //console.log(e)
                }
                //console.log(msgPayload)
            }
        }
        const dmsg:IDispatchMessage = JSON.parse(bytesToUtf8(msgPayload), reviver) 
        if (!dmsg.timestamp)
            dmsg.timestamp = msg.timestamp?.toString()

        if (!this.mapping.has(dmsg.type)) {
            console.error("Unknown type " + dmsg.type)
            return
        }

        const dispatchInfos = this.mapping.get(dmsg.type)

        if (!dispatchInfos) {
            console.error("Undefined callback for " + dmsg.type)
            return
        }

        for (const dispatchInfo of dispatchInfos) {
            let payload = dmsg.payload

            if (dispatchInfo.verifySender) {
                if (!dmsg.signature) {
                    console.error(`${dmsg.type}: Message requires verification, but signature is empty!`)
                    continue
                }
                const dmsgToVerify: IDispatchMessage = {type: dmsg.type, payload: dmsg.payload, timestamp: dmsg.timestamp, signature: undefined, signer: dmsg.signer, }
                const signer = ethers.verifyMessage(JSON.stringify(dmsgToVerify), dmsg.signature)
                if (signer != dmsg.signer) {
                    console.error(`${dmsg.type}: Invalid signer ${dmsg.signer} != ${signer}`)
                    continue
                }
            }

            dispatchInfo.callback(payload, msg, dmsg.signer)
        }
    }

    emit = async (typ: MessageType, payload: any, wallet?: BaseWallet, encryptionPublicKey?: Uint8Array) => {
        const dmsg: IDispatchMessage = {
            type: typ,
            payload: payload,
            timestamp: (new Date()).getTime().toString(),
            signature: undefined,
            signer: undefined
        }

        if (wallet) {
            dmsg.signer = wallet.address
            dmsg.signature = wallet.signMessageSync(JSON.stringify(dmsg))
        }

        console.log(dmsg)
        let payloadArray = utf8ToBytes(JSON.stringify(dmsg, replacer))
        if (encryptionPublicKey) {
            const buffer = await encrypt(encryptionPublicKey, payloadArray)
            payloadArray = new Uint8Array(buffer.buffer)
        }

        const msg: IMessage = {
            payload: payloadArray
        }
        const res = await this.node.lightPush.send(this.encoder, msg)
        if (res && res.errors && res.errors.length > 0) {
            console.log(res.errors)
            await waitForRemotePeer(this.node, [Protocols.LightPush, Protocols.Filter])
            const res2 = await this.node.lightPush.send(this.encoder, msg)
            return res2
        }

        return res
    }
}

function replacer(key: any, value: any) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

function reviver(key: any, value: any) {
    if(typeof value === 'object' && value !== null) {
      if (value.dataType === 'Map') {
        return new Map(value.value);
      }
    }
    return value;
  }