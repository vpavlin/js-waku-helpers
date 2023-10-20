import QRCode from "react-qr-code";
import useIdentity from "../../hooks/useIdentity";
import { useDispatcher } from "../../hooks/useDispatcher";
import { utils } from "@noble/secp256k1"
import { useEffect, useRef, useState } from "react";
import { Confirm, Paired, PairedAccount, PairedAccounts, Send, Verify } from "./types";
import { QrScanner } from "@yudiel/react-qr-scanner";


const Pair = () => {
    const {dispatcher} = useDispatcher()
    const {wallet, publicKey, privateKey} =useIdentity("shareWithDevice", "xyz")

    const [scanner, setScanner] = useState(false)
    const [pairMe, setPairMe] = useState(false)
    const [pairWith, setPairWith] = useState(false)
    const [verifySent, setVerifySent] = useState(false)

    const [pairedAccounts, setPairedAccounts] = useState<PairedAccounts>(new Map<string, PairedAccount>)


    const [syncCode, _setSyncCode] = useState<string>()
    const syncCodeRef = useRef(syncCode)
    const setSyncCode = (code: string | undefined) => {
        syncCodeRef.current = code
        _setSyncCode(code)
    }

    const [pairingAccount, _setPairingAccount] = useState<PairedAccount>()
    const pairingAccountRef = useRef(pairingAccount)

    const setPairingAccount = (address:string, key: string) => {
        let acc:PairedAccount | undefined = undefined
        if (address != "" || key != "") acc = {address: address, publicKey: key}
        pairingAccountRef.current = acc
        _setPairingAccount(acc)
    }

    const [sentValue, setSentValue] = useState<string>()
    const [toSend, setToSend] = useState<string>()

    useEffect(() => {
        if (!dispatcher || !privateKey) return
        console.log("Setting up dispatcher")


        dispatcher.registerKey(privateKey)
        dispatcher.on("verify", (payload: Verify, msg: any, signer?:string) => {
            console.log(payload)
            if (signer == payload.address) {
                setSyncCode(payload.code)
                setPairingAccount(payload.address, payload.publicKey)
                console.log(payload.publicKey)
            }
        }, true)
        dispatcher.on("paired", (payload: Paired, msg: any, signer?:string) => {
            if (signer == payload.address) {
                setPairedAccounts((x) => {
                    if(x.has(payload.address)) return x

                    x.set(payload.address, {...pairingAccountRef.current!})
                    setPairingAccount("", "")
                    return new Map<string, PairedAccount>(x)
                })
                setPairMe(false)
                setPairWith(false)
                setVerifySent(false)
            }
        }, true)
        dispatcher.on("send", (payload: Send, msg: any, signer?: string) => {
            if (pairedAccounts.has(signer!)) {
                setSentValue(payload.value)
            }
        }, true)
        dispatcher.on("confirm", (payload: Confirm, msg: any, signer?:string) => {
            console.log(syncCodeRef.current)
            if (signer == payload.address && payload.code == syncCodeRef.current && pairingAccountRef.current) {
                console.log("here")
                setPairedAccounts((x) => {
                    console.log(x)
                    if(x.has(payload.address)) return x

                    x.set(payload.address, {...pairingAccountRef.current!})
                    setPairingAccount("", "")
                    console.log(x)
                    return new Map<string, PairedAccount>(x)
                })
                
                dispatcher.emit("paired", {address: wallet?.address} as Paired, wallet, utils.hexToBytes(pairingAccountRef.current?.publicKey))
                setScanner(false)
                setSyncCode(undefined)
                setPairMe(false)
                setPairWith(false)
                setVerifySent(false)
            }
        }, true)

    }, [dispatcher, privateKey])

   /* useEffect(() => {
        const pairedItem = localStorage.getItem("pairedAccounts")
        if (!pairedItem) return

        const paired:PairedAccount[] = JSON.parse(pairedItem)

        setPairedAccounts((x) => {

            for (const p of paired) {
                x.set(p.address, p)
            }
            return new Map<string, PairedAccount>(x)
        })
    }, [])

    useEffect(() => {
        localStorage.setItem("pairedAccounts", JSON.stringify([...pairedAccounts.values()]))
    }, [pairedAccounts])*/


    useEffect(() => {
        if (!pairingAccount || !publicKey || verifySent) return
        setSyncCode("abcd")
        dispatcher?.emit("verify", {address: wallet?.address!, publicKey: utils.bytesToHex(publicKey), code: "abcd"} as Verify, wallet, utils.hexToBytes(pairingAccount.publicKey))
        setVerifySent(true)
    }, [pairingAccount, publicKey, verifySent])

    useEffect(() => {console.log([...pairedAccounts.values()])}, [pairedAccounts])

    return (<>
    {dispatcher && publicKey &&
        <div>
            <button onClick={() => setPairWith(true)}>Pair With</button>
            { pairWith &&
            <div style={{width: "300px", margin: "10px auto"}}>
                <button onClick={() => setScanner(true)}>Scan</button>
                {scanner && <QrScanner
                            onDecode={(result:string) => {setPairingAccount("", result)}}
                            onError={(error:any) => console.error(error?.message)}
                    />}
                {
                    syncCode && pairingAccount &&
                    <div>
                        <div>Sync Code: {syncCode}</div>
                    </div>
                }

            </div>
            }
            <button onClick={() => setPairMe(true)}>Pair Me</button>
            { pairMe &&
                <div>
                    <div>Sync Key</div>
                    <QRCode value={utils.bytesToHex(publicKey!)} />
                    {
                        syncCode && pairingAccount?.publicKey &&
                        <div>
                            <div>Sync Code: {syncCode}</div>
                            <button onClick={() => dispatcher.emit("confirm", {address: wallet?.address, code: syncCode}, wallet, utils.hexToBytes(pairingAccount.publicKey))}>Confirm</button>
                        </div>
                    }
                </div>
            }
            {
                    pairedAccounts.size > 0 &&
                    [...pairedAccounts.values()].map((p) => 
                    <div>
                        <div>Paired with: {p.address}</div>
                        <input onChange={(e) => setToSend(e.target.value)} />
                        <button disabled={!toSend} onClick={() => dispatcher.emit("send", {value: toSend} as Send, wallet, utils.hexToBytes(p.publicKey))}>Send</button>
                    </div>
                    )
                }
            {
                pairedAccounts.size > 0  &&
                <div>
                { sentValue && <div>{sentValue}</div>}
                </div>
            }

        </div>
    }
    </>)
}

export default Pair;