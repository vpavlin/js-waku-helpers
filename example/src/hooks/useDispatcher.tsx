import React, { useEffect, useMemo, useState } from "react"
import getDispatcher, { DispatchMetadata, Dispatcher, IDispatchMessage, Signer, destroyDispatcher } from "waku-dispatcher"
import { CONTENT_TOPIC_PAIRING } from "../constants"

type DispatcherContextData = {
    dispatcher: Dispatcher | undefined
    connected: boolean
    peerCount: number
    peers: string[] | undefined
    subscriptionFailedAttempts: number
    lastDelivered: number | undefined

    //setDispatcher: (d: Dispatcher) => void
}

const defaultData:DispatcherContextData = {
    dispatcher: undefined,
    connected: false,
    peerCount: 0,
    peers: [],
    subscriptionFailedAttempts: 0,
    lastDelivered: undefined
}

const DispatcherContext = React.createContext(defaultData)

export const useDispatcher = () => React.useContext(DispatcherContext)

interface Props {
    children: React.ReactNode
}


export const DispatcherProvider = (props: Props) => {
    const [dispatcher, setDispatcher] = useState<Dispatcher>()
    const [connected, setConnected] = useState(false)
    const [subscriptionFailedAttempts, setSubFailedAttempts] = useState(0)
    const [peerCount, setPeerCount] = useState(0)
    const [peers, setPeers] = useState<string[]>()
    const [lastDelivered, setLastDelivered] = useState<number>()
    const [subscription, setSubscription] = useState<boolean>()


    useEffect(() => {
        (async () => {
            const d = await getDispatcher(undefined, CONTENT_TOPIC_PAIRING, "wakulink", false)
            if (d && d.isRunning()) {
                setDispatcher(d)
            }
        })()
    }, [])

    useEffect(() => {
        if (!dispatcher) return
        const interval = setInterval(async () => {
            const connInfo = await dispatcher.getConnectionInfo()
            setPeers(connInfo.connections.map((p:any) => p.remoteAddr.toString()))
            setConnected(connInfo.subscription)
            setLastDelivered(connInfo.lastDelivered)
            
            //console.log(JSON.stringify(node.libp2p.getConnections()))
        }, 1000)

        return () => {
            clearInterval(interval)
        }
    }, [dispatcher])

    useEffect(() => {
        if (!peers) return
        setPeerCount(peers.length)
    }, [peers])

    const result = useMemo(() => ({
        dispatcher,
        connected,
        peerCount,
        peers,
        subscriptionFailedAttempts,
        lastDelivered,
    }), [dispatcher, connected, peerCount, peers, subscriptionFailedAttempts, lastDelivered])
    return <DispatcherContext.Provider value={result}>
        {props.children}
    </DispatcherContext.Provider>

}