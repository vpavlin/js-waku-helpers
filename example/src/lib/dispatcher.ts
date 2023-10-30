import { LightNode, IDecodedMessage, Waku, StoreQueryOptions, IFilterSubscription, PageDirection } from "@waku/interfaces"
import {
    bytesToUtf8,
    createDecoder,
    createEncoder,
    utf8ToBytes,
    waitForRemotePeer,
} from "@waku/sdk"

import {
    IMessage,
    IEncoder,
    IDecoder,
    Protocols,
} from "@waku/interfaces"
import { encrypt, decrypt } from "../../node_modules/@waku/message-encryption/dist/crypto/ecies.js"
import { BaseWallet, ethers, keccak256 } from "ethers"


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
    acceptOnlyEncrypted: boolean
}

export type Signer = string | undefined

export type DispatchMetadata = {
    encrypted: boolean
    timestamp: string | undefined
    fromStore: boolean
    contentTopic: string
    ephemeral: boolean | undefined
}

type EmitCache = {
    msg: IMessage
    encoder: IEncoder
}

type MessageType = string
type DispatchCallback = (payload: any, signer: Signer, meta: DispatchMetadata) => void

export class Dispatcher {
    mapping: Map<MessageType, DispachInfo[]>
    node: LightNode
    decoder: IDecoder<IDecodedMessage>
    encoder: IEncoder
    encoderEphemeral: IEncoder
    ephemeralDefault: boolean
    subscription: IFilterSubscription | undefined
    running: boolean
    decryptionKeys: Uint8Array[]
    hearbeatInterval: NodeJS.Timer | undefined
    resubscribing: boolean = false
    resubscribeAttempts: number = 0
    msgHashes: string[] = []
    emitCache: EmitCache[] = []
    reemitting: boolean = false
    reemitInterval: NodeJS.Timer | undefined = undefined

    filterConnected:boolean = false
    constructor(node: LightNode, contentTopic: string, ephemeral: boolean) {
        this.mapping = new Map<MessageType, DispachInfo[]>()
        this.node = node

     
        this.encoderEphemeral = createEncoder({ contentTopic: contentTopic, ephemeral: true })
        this.encoder = createEncoder({ contentTopic: contentTopic, ephemeral: false })


        this.ephemeralDefault = ephemeral
        this.decoder = createDecoder(contentTopic)
        this.running = false
        this.decryptionKeys = []

        this.subscription = undefined
        this.hearbeatInterval = undefined
    }


    on = (typ: MessageType, callback: DispatchCallback, verifySender?: boolean, acceptOnlyEcrypted?: boolean) => {
        if (!this.mapping.has(typ)) {
            this.mapping.set(typ, [])
        }
        const dispatchInfos = this.mapping.get(typ)
        const newDispatchInfo = { callback: callback, verifySender: !!verifySender, acceptOnlyEncrypted: !!acceptOnlyEcrypted }
        if (dispatchInfos?.find((di) => di.callback == newDispatchInfo.callback)) {
            console.log("Skipping the callback setup - already exists")
            return
        }
        dispatchInfos?.push(newDispatchInfo)
        this.mapping.set(typ, dispatchInfos!)
    }

    start = async () => {
        if (this.running) return
        this.running = true
        //await this.node.start()
        await waitForRemotePeer(this.node, [Protocols.LightPush, Protocols.Filter])
        this.subscription = await this.node.filter.createSubscription()
        await this.subscription.subscribe(this.decoder, this.dispatch)
        this.filterConnected = true
        console.log("Subscribed...")
        this.node.libp2p.addEventListener("peer:disconnect", async (e) => {
            console.log("Peer disconnected, check subscription!")
            console.log(e.detail.toString())
            await this.checkSubscription()
        })
        this.hearbeatInterval = setInterval(() => this.checkSubscription(), 10000)
        //this.reemitInterval = setInterval(() => this.emitFromCache(), 10000)
    }

    stop = () => {
        this.running = false
        clearInterval(this.hearbeatInterval)
        //clearInterval(this.reemitInterval)
        this.subscription?.unsubscribeAll()
        this.subscription = undefined
        this.mapping.clear()

    }

    isRunning = (): boolean => {
        return this.running
    }

    registerKey = (key: Uint8Array) => {
        if (!this.decryptionKeys.find((k) => k == key)) this.decryptionKeys.push(key)
    }

    dispatch = async (msg: IDecodedMessage, fromStorage: boolean = false) => {
        if (!fromStorage) console.log("delivered")

        let msgPayload = msg.payload
        let encrypted = false
        if (this.decryptionKeys.length > 0) {
            for (const key of this.decryptionKeys) {
                try {
                    const buffer = await decrypt(key, msgPayload)
                    msgPayload = new Uint8Array(buffer.buffer)
                    encrypted = true
                    break
                } catch (e) {
                    //console.log(e)
                }
                //console.log(msgPayload)
            }
        }

        const input = new Uint8Array([...ethers.toUtf8Bytes(msg.contentTopic), ...msg.payload, ...ethers.toUtf8Bytes(msg.timestamp!.toString()), ...ethers.toUtf8Bytes(msg.pubsubTopic)])
        const hash = keccak256(input).slice(0, 10)
        if (this.msgHashes.indexOf(hash) >= 0) {
            console.log("Message already delivered")
            return   
        }
        if (this.msgHashes.length > 100) {
            console.log("Dropping old messages from hash cache")
            this.msgHashes.slice(hash.length - 100, hash.length)
        }
        this.msgHashes.push(hash)

        try {
            const dmsg: IDispatchMessage = JSON.parse(bytesToUtf8(msgPayload), reviver)
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
                if (dispatchInfo.acceptOnlyEncrypted && !encrypted) {
                    console.log(`Message not encrypted, skipping (type: ${dmsg.type})`)
                }

                let payload = dmsg.payload

                if (dispatchInfo.verifySender) {
                    if (!dmsg.signature) {
                        console.error(`${dmsg.type}: Message requires verification, but signature is empty!`)
                        continue
                    }
                    const dmsgToVerify: IDispatchMessage = { type: dmsg.type, payload: dmsg.payload, timestamp: dmsg.timestamp, signature: undefined, signer: dmsg.signer, }
                    const signer = ethers.verifyMessage(JSON.stringify(dmsgToVerify), dmsg.signature)
                    if (signer != dmsg.signer) {
                        console.error(`${dmsg.type}: Invalid signer ${dmsg.signer} != ${signer}`)
                        continue
                    }
                }
                
                dispatchInfo.callback(payload, dmsg.signer, { encrypted: encrypted, fromStore: fromStorage, timestamp: dmsg.timestamp, ephemeral: msg.ephemeral, contentTopic: msg.contentTopic })
            }
        } catch (e) {
            //console.error(e)
        }
    }

    emit = async (typ: MessageType, payload: any, wallet?: BaseWallet, encryptionPublicKey?: Uint8Array, ephemeral: boolean = this.ephemeralDefault) => {
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

        const encoder = ephemeral ? this.encoderEphemeral : this.encoder
        const res = await this.node.lightPush.send(encoder, msg)
        /*if (res && res.errors && res.errors.length > 0) {
            msg.timestamp = new Date()
            this.emitCache.push({msg: msg, encoder: encoder})
        }*/

        return res
    }

    dispatchQuery = async (options: StoreQueryOptions = {pageDirection: PageDirection.FORWARD, pageSize: 20}, live: boolean = false) => {
        for await (const messagesPromises of this.node.store.queryGenerator(
            [this.decoder],
            options
        )) {
            await Promise.all(
                messagesPromises
                    .map(async (p) => {
                        const msg = await p;
                        if (msg)
                            await this.dispatch(msg, !live)
                    })
            );
        }
    }

    emitFromCache = async () => {
        if (this.reemitting) return
        this.reemitting = true
        if (this.emitCache.length > 0) {
            const l = this.emitCache.length
            for (let i = 0; i < l; i++) {
                const toEmit = this.emitCache[0]
                console.log("Trying to emit failed message from "+toEmit.msg.timestamp)
                const res = await this.node.lightPush.send(toEmit.encoder, toEmit.msg)
                if (res && res.errors && res.errors.length > 0) {
                    break
                }

                this.emitCache.slice(1, l)
                await sleep(1000)
            }
        }

        this.reemitting = false

    }

    checkSubscription = async () => {
        if (this.subscription && !this.resubscribing) {
            this.resubscribing = true
            try {
                await this.subscription.ping();
            } catch (error) {
                this.filterConnected = false
                const start = new Date()
                while(true) {
                    console.log("Resubscribing!")
                    
                    //await this.subscription.unsubscribeAll()
                    try {
                        try {
                            if (this.subscription)
                                await this.subscription.unsubscribeAll()
                        } catch (unE) {
                            console.log(unE)
                        } finally {
                            this.subscription = undefined
                        }
                        this.subscription = await this.node.filter.createSubscription()
                        await this.subscription.subscribe([this.decoder], this.dispatch)
                        console.log("Resubscribed")
                        const end = new Date()
                        console.log(`Query: ${start.toString()} -> ${end.toString()}`)
                        await this.dispatchQuery({timeFilter: {startTime: new Date(start.setSeconds(start.getSeconds()-30)), endTime: end}}, true)
                        break;
                    } catch (e) {
                        console.log(e)
                    }
                    await sleep(5000)
                }
            } finally {
                this.resubscribing = false
                this.filterConnected = true
            }
        }
    }

    getConnections = () => {
        return {connections: this.node.libp2p.getConnections(), subscription: this.filterConnected}
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
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }
    return value;
}

async function sleep(msec: number) {
	return await new Promise((r) => setTimeout(r, msec))
}