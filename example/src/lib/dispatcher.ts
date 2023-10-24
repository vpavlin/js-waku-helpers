import { LightNode, IDecodedMessage, Waku, StoreQueryOptions, IFilterSubscription, PageDirection } from "@waku/interfaces"
import {
    bytesToUtf8,
    createEncoder,
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
    constructor(node: LightNode, encoder: IEncoder, decoder: IDecoder<IDecodedMessage>) {
        this.mapping = new Map<MessageType, DispachInfo[]>()
        this.node = node

        if (encoder.ephemeral) {
            this.encoderEphemeral = encoder
            this.encoder = createEncoder({ contentTopic: encoder.contentTopic, ephemeral: false })
        } else {
            this.encoder = encoder
            this.encoderEphemeral = createEncoder({ contentTopic: encoder.contentTopic, ephemeral: true })
        }

        this.ephemeralDefault = encoder.ephemeral
        this.decoder = decoder
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
        console.log("Subscribed...")
        this.node.libp2p.addEventListener("peer:disconnect", async () => {
            console.log("Peer disconnected, check subscription!")
            await this.checkSubscription()
        })
        this.hearbeatInterval = setInterval(() => this.checkSubscription(), 2000)
    }

    stop = () => {
        this.running = false
        clearInterval(this.hearbeatInterval)
        this.subscription?.unsubscribeAll()
        this.mapping.clear()

    }

    isRunning = (): boolean => {
        return this.running
    }

    registerKey = (key: Uint8Array) => {
        if (!this.decryptionKeys.find((k) => k == key)) this.decryptionKeys.push(key)
    }

    dispatch = async (msg: IDecodedMessage, fromStorage: boolean = false) => {
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

        return res
    }

    dispatchQuery = async (options: StoreQueryOptions = {pageDirection: PageDirection.FORWARD, pageSize: 20}) => {
        for await (const messagesPromises of this.node.store.queryGenerator(
            [this.decoder],
            options
        )) {
            await Promise.all(
                messagesPromises
                    .map(async (p) => {
                        const msg = await p;
                        if (msg)
                            await this.dispatch(msg, true)
                    })
            );
        }
    }

    checkSubscription = async () => {
        if (this.subscription) {
            try {
                await this.subscription.ping();
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes("peer has no subscriptions")
                ) {
                    console.log("Resubscribing!")
                    await this.subscription.subscribe([this.decoder], this.dispatch)
                } else {
                    throw error;
                }
            }
        }
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