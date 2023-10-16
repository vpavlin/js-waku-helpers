import { useEffect, useState } from "react"
import { Dispatcher } from "../../lib/dispatcher"
import { useContentPair, useCreateLightNode } from "@waku/react"
import { bytesToUtf8, utf8ToBytes, waitForRemotePeer, Protocols } from "@waku/sdk"

const Dispatch = () => {
    const { node, isLoading, error} = useCreateLightNode({options: {defaultBootstrap: true}})
    const { encoder, decoder } = useContentPair()
    const [dispatcher, setDispatcher] = useState<Dispatcher>()

    useEffect(() => {
        if (!node || !encoder || !decoder) return

        (async () => {

            const d = new Dispatcher(node, encoder, decoder)
            d.on("hello", (payload:any, msg:any) => {
                console.log("Received hello: " +  payload)
                d.emit("ehlo", "ha!")
            })
            d.on("ehlo", (payload:any, msg:any) => {
                console.log("Received ehlo: " + payload)
            })
    
            await d.start()

            console.log("Xreated dispatcher")

            setDispatcher(d)
        })()

        return () => {
            dispatcher?.stop()
        }
    }, [node, encoder, decoder])

    return (
        <>
            <button disabled={!dispatcher} onClick={async () => {
                const res = await dispatcher?.emit("hello", "does it work?")
                }}>Hey</button>
        </>
    )
}

export default Dispatch