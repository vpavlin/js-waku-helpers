import { ReactChildrenProps } from "@waku/react/dist/src/types"
import React, { useEffect, useMemo, useState } from "react"
import { Dispatcher } from "../lib/dispatcher"
import { useContentPair, useWaku } from "@waku/react"
import { LightNode } from "@waku/interfaces"

type DispatcherContextData = {
    dispatcher: Dispatcher | undefined
    //setDispatcher: (d: Dispatcher) => void
}

const defaultData:DispatcherContextData = {
    dispatcher: undefined,
    //setDispatcher: () => {}
}

const DispatcherContext = React.createContext(defaultData)

export const useDispatcher = () => React.useContext(DispatcherContext)

type ProviderProps = ReactChildrenProps

export const DispatcherProvider: React.FunctionComponent<ProviderProps> = (props: ProviderProps) => {
    const [dispatcher, setDispatcher] = useState<Dispatcher>()
    const { node } = useWaku<LightNode>()
    const { encoder, decoder} = useContentPair()

    useEffect(() => {
        if (!node || !encoder || !decoder) return
        (async () => {
        const d = new Dispatcher(node, encoder, decoder)
        await d.start()
        setDispatcher(d)
        })()

    }, [node, encoder, decoder])

    const result = useMemo(() => ({
        dispatcher,
        //setDispatcher
    }), [dispatcher])
    return <DispatcherContext.Provider value={result}>
        {props.children}
    </DispatcherContext.Provider>

}