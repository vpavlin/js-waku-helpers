import { useEffect, useState } from "react"
import { useHelia } from "../../hooks/useHelia"
import { json } from "@helia/json"
import { CID } from 'multiformats/cid'
import { multiaddr } from '@multiformats/multiaddr'


const IPFS = () => {
    const { helia, fs } = useHelia()
    const [cidStr, setCID] = useState<any>()
    const [upload, setUpload] = useState<boolean>(false)
    const [ma, setMultiaddress] = useState<string>()

    useEffect(() => {
        if (!helia || !fs || !upload) return

        (async () => {
            const j = json(helia)
            const cid = await j.add({something: "amazing", oh: "wow"})
            console.log(cid.toString())
            console.log(helia.libp2p.peerId)
        })()
    }, [helia, fs, upload])

    useEffect(() => {
        if (!helia || !cidStr || !ma) return;

        const j = json(helia);

        (async () => {
        await helia.libp2p.dial(multiaddr(ma))
        console.log("getting stuff!" + cidStr)
        const cid = CID.parse(cidStr)
        j.get(cid).then((d:any) => console.log(d))
        })()
    }, [helia, cidStr, ma])
    return (<>
        <input type="checkbox" onChange={(e) => setUpload(e.target.checked)} />
        <input type="text" onChange={((e) => setCID(e.target.value))} />
        <input type="text" onChange={((e) => setMultiaddress(e.target.value))} />

    </>)
}

export default IPFS