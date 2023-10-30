import { Helia } from "@helia/interface"
import { ReactChildrenProps } from "@waku/react/dist/src/types"
import { createHelia } from "helia"
import React, { useEffect, useMemo, useState } from "react"
import {LevelBlockstore} from "blockstore-level"
import {LevelDatastore} from "datastore-level"
import { UnixFS, unixfs } from "@helia/unixfs"

type HeliaContextData = {
    helia: Helia | undefined
    fs: UnixFS | undefined
}

const defaultData:HeliaContextData = {
    helia: undefined,
    fs: undefined,

    //setDispatcher: () => {}
}

const HeliaContext = React.createContext(defaultData)

export const useHelia = () => React.useContext(HeliaContext)

type ProviderProps = ReactChildrenProps

export const HeliaProvider: React.FunctionComponent<ProviderProps> = (props: ProviderProps) => {
    const [helia, setHelia] = useState<Helia>()
    const [fs, setFS] = useState<UnixFS>()
    const [setup, setSetup] = useState(false)


    useEffect(() => {
        if (helia || setup) return

        console.log("Setting up helia");

        (async () => {
            const datastore = new LevelDatastore(`wakulink-datastore`);
            const blockstore = new LevelBlockstore(`wakulink-blockstore`);
            let h = await createHelia({datastore, blockstore})
            //await h.start()
            let f = unixfs(h)
            setHelia(h)
            setFS(f)
            setSetup(true)
        })()
        return () => {
        }
    }, [setup])

    const result = useMemo(() => ({
        helia,
        fs,
        //setDispatcher
    }), [helia, fs])
    return <HeliaContext.Provider value={result}>
        {props.children}
    </HeliaContext.Provider>

}
