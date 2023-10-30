import { Protocols, createLightNode, waitForRemotePeer } from "@waku/sdk";
import { Dispatcher } from "./dispatcher";
import { bootstrap } from "@libp2p/bootstrap";
import { CONTENT_TOPIC_PAIRING } from "../constants";

let dispatcher: Dispatcher | null = null
let initialized = false

const getDispatcher = async () => {

    if (dispatcher && initialized) {
        return dispatcher
    }
    initialized = true

    const node = await createLightNode({
        defaultBootstrap: true,
        pingKeepAlive: 60,
        libp2p: {
            peerDiscovery: [
                bootstrap({ list: ["/dns4/waku.myrandomdemos.online/tcp/8000/wss/p2p/16Uiu2HAmHKj9KTUEUPpw9F3EaDkT6QVXZNTRVerFJJtnkcC5CHgx"] }),
            ]
        }
    })
    await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter, Protocols.Store])
    console.log("Creating dispatcher")
    dispatcher = new Dispatcher(node, CONTENT_TOPIC_PAIRING, true)
    await dispatcher.start()
       
    return dispatcher
}

export default getDispatcher;