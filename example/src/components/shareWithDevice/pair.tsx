import QRCode from "react-qr-code";
import useIdentity from "../../hooks/useIdentity";
import { useDispatcher } from "../../hooks/useDispatcher";
import { utils } from "@noble/secp256k1"
import { useEffect, useRef, useState } from "react";
import { Confirm, Paired, PairedAccount, PairedAccounts, Send, Verify } from "./types";
import { QrScanner } from "@yudiel/react-qr-scanner";
import { DispatchMetadata, Signer } from "../../lib/dispatcher";
import logo  from "../../../public/logo192.png"
import { PageDirection } from "@waku/interfaces";

type RecievedData = {
    value: string
    timestamp: string
}

const Pair = () => {
    const {dispatcher} = useDispatcher()
    const {wallet, publicKey, privateKey} =useIdentity("shareWithDevice", "xyz")

    const [scanner, setScanner] = useState(false)
    const [pairMe, setPairMe] = useState(false)
    const [pairWith, setPairWith] = useState(false)
    const [verifySent, setVerifySent] = useState(false)

    const [pairedAccounts, setPairedAccounts] = useState<PairedAccounts>(new Map<string, PairedAccount>)

    const [deviceName, setDeviceName] = useState<string>()
    const [syncCode, _setSyncCode] = useState<string>()
    const syncCodeRef = useRef(syncCode)
    const setSyncCode = (code: string | undefined) => {
        syncCodeRef.current = code
        _setSyncCode(code)
    }

    const [pairingAccount, _setPairingAccount] = useState<PairedAccount>()
    const pairingAccountRef = useRef(pairingAccount)

    const setPairingAccount = (address:string, key: string, name: string) => {
        let acc:PairedAccount | undefined = undefined
        if (address != "" || key != "") acc = {address: address, publicKey: key, name: name}
        pairingAccountRef.current = acc
        _setPairingAccount(acc)
    }

    const [received, setReceived] = useState<Map<string, RecievedData[]>>(new Map<string, RecievedData[]>())
    const [toSend, setToSend] = useState<string>()
    const [receivers, setReceivers] = useState<string[]>([])

    useEffect(() => {
        if (!dispatcher || !privateKey) return
        console.log("Setting up dispatcher")


        dispatcher.registerKey(privateKey)
        dispatcher.on("verify", (payload: Verify, signer: Signer, meta: DispatchMetadata) => {
            console.log(payload)
            if (signer == payload.address) {
                setSyncCode(payload.code)
                setPairingAccount(payload.address, payload.publicKey, "")
                console.log(payload.publicKey)
            }
        }, true)
        dispatcher.on("paired", (payload: Paired, signer: Signer, meta: DispatchMetadata) => {
            if (signer == payload.address) {
                setPairedAccounts((x) => {
                    if(x.has(payload.address)) return x

                    x.set(payload.address, {address: payload.address, name: payload.name, publicKey: pairingAccountRef.current?.publicKey!})
                    setPairingAccount("", "", "")
                    return new Map<string, PairedAccount>(x)
                })
                setPairMe(false)
                setPairWith(false)
                setVerifySent(false)
                setSyncCode(undefined)
            }
        }, true)
        dispatcher.on("send", (payload: Send, signer: Signer, meta: DispatchMetadata) => {
            if (signer && pairedAccounts.has(signer)) {
                setReceived((x) => {
                    if (!x.has(signer))
                        x?.set(signer, [])

                    const values = x.get(signer)
                    if (values) {
                        values.push({value: payload.value, timestamp: meta.timestamp || new Date().toString()})
                        x.set(signer, values)

                        if (Notification && !meta.fromStore) {
                            const options: NotificationOptions = {
                                timestamp: parseInt(meta.timestamp || new Date().toString()),
                                body: payload.value,
                                dir: 'ltr',
                            };
                            const notification = new Notification('Notification', options);
                            notification.onclick = function(x) { window.focus();};
                        }
                        return new Map<string, RecievedData[]>(x)
                    }

                    return x
                })  
            }
        }, true, true)
        dispatcher.on("confirm", (payload: Confirm, signer: Signer, meta: DispatchMetadata) => {
            console.log(syncCodeRef.current)
            if (signer == payload.address && payload.code == syncCodeRef.current && pairingAccountRef.current) {
                console.log("here")
                setPairedAccounts((x) => {
                    console.log(x)
                    if(x.has(payload.address)) return x

                    x.set(payload.address, {name: payload.name, address: payload.address, publicKey: pairingAccountRef.current?.publicKey!})
                    setPairingAccount("", "", "")
                    console.log(x)
                    return new Map<string, PairedAccount>(x)
                })
                
                dispatcher.emit("paired", {address: wallet?.address, name: deviceName} as Paired, wallet, utils.hexToBytes(pairingAccountRef.current?.publicKey))
                setScanner(false)
                setSyncCode(undefined)
                setPairMe(false)
                setPairWith(false)
                setVerifySent(false)
            }
        }, true)
        dispatcher.dispatchQuery({pageDirection: PageDirection.BACKWARD})

        return () => {
            setReceived(new Map<string, RecievedData[]>())
        }

    }, [dispatcher, privateKey])

    useEffect(() => {
        if (pairedAccounts.size == 0) {
            const pairedItem = localStorage.getItem("pairedAccounts")
            if (!pairedItem) return

            const paired:PairedAccount[] = JSON.parse(pairedItem)

            setPairedAccounts((x) => {

                for (const p of paired) {
                    x.set(p.address, p)
                }
                return new Map<string, PairedAccount>(x)
            })
        } else {
            localStorage.setItem("pairedAccounts", JSON.stringify([...pairedAccounts.values()]))
        }
    }, [pairedAccounts])

    useEffect(() => {
        if (!deviceName) {
            const deviceNameItem = localStorage.getItem("deviceName")
            if (deviceNameItem) setDeviceName(deviceNameItem)
        } else {
            localStorage.setItem("deviceName", deviceName || "")
        }

    }, [deviceName])


    useEffect(() => {
        if (!pairingAccount || !publicKey || verifySent) return
        setSyncCode("abcd")
        dispatcher?.emit("verify", {address: wallet?.address!, publicKey: utils.bytesToHex(publicKey), code: "abcd"} as Verify, wallet, utils.hexToBytes(pairingAccount.publicKey))
        setVerifySent(true)
    }, [pairingAccount, publicKey, verifySent])

    useEffect(() => {
        if (!Notification) {
            console.log('Desktop notifications are not available in your browser.');
            return;
          }
      
          if (Notification.permission !== 'granted') {
            Notification.requestPermission();
          }
    }, [])

    useEffect(() => {console.log([...pairedAccounts.values()])}, [pairedAccounts])

    const send = () => {
        if (!dispatcher || !toSend || receivers.length == 0) return

        for (const r of receivers) {
            const p = pairedAccounts.get(r)
            if (p)
                dispatcher.emit("send", {value: toSend} as Send, wallet, utils.hexToBytes(p.publicKey), false)
        }
    }

    return (<>
    {dispatcher && publicKey ?
        <div className="text-center m-auto w-full max-w-2xl">
            <div className="my-2"><input className="input input-bordered" type="text" onChange={(e) => setDeviceName(e.target.value)} value={deviceName} placeholder="Device Name" /></div>
            <button className="btn btn-lg m-1" onClick={() => setPairWith(!pairWith)}>{ pairWith ? "Cancel" : "Pair With"}</button>
            { pairWith &&
            <div className="m-2 p-2 border border-base-content rounded-lg">
                <button className="btn btn-lg" onClick={() => setScanner(true)}>Scan</button>
                {scanner && <QrScanner
                            onDecode={(result:string) => {setPairingAccount("", result, "")}}
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
            <button className="btn btn-lg m-1" onClick={() => setPairMe(!pairMe)}>{pairMe ? "Cancel" : "Pair Me"}</button>
            { pairMe &&
                <div className="m-2 p-2 border border-base-content rounded-lg items-center justify-center  align-middle text-center">
                    <div>Sync Key</div>
                    <div><QRCode className="m-auto" value={utils.bytesToHex(publicKey!)} /></div>
                    {
                        syncCode && pairingAccount?.publicKey &&
                        <div>
                            <div>Sync Code: {syncCode}</div>
                            <button className="btn btn-lg" disabled={!deviceName} onClick={() => dispatcher.emit("confirm", {address: wallet?.address, code: syncCode, name: deviceName} as Confirm, wallet, utils.hexToBytes(pairingAccount.publicKey))}>Confirm</button>
                        </div>
                    }
                </div>
            }
            {
                pairedAccounts.size > 0 &&
                <div>
                    <div><textarea className="textarea textarea-bordered min-h-[100px] min-w-[300px]" onChange={(e) => setToSend(e.target.value)} /></div>
                    <div><button className="btn btn-lg" disabled={!dispatcher || !toSend} onClick={() => send()}>Send</button></div>
                    {
                        [...pairedAccounts.values()].map((p) => 
                        <div>
                            <div className="items-center flex"><label className="label cursor-pointer"><input className="checkbox m-2" type="checkbox" onChange={(e) => setReceivers((x) => e.target.checked ? [...x, p.address] : [...x.filter((r) => r != p.address)])}/><strong>{p.name || p.address}</strong></label></div>
                            <div>
                                <table className="table table-zebra">
                                    <tbody>
                                    {
                                        received.get(p.address)?.map((v) => <tr><td>{v.value.startsWith("http") ? <a  className="link link-accent" href={v.value} target="_blank">{v.value}</a> : v.value}</td><td className="text-right">{new Date(parseInt(v.timestamp)).toLocaleString()})</td></tr>)
                                    }
                                    </tbody>
                                </table>
                                </div>
                        </div>
                        )
                    }
                </div>
                
            }
        </div>
        :
        <div className="text-center">Loading...</div>
    }
    <div className="m-auto w-fit mt-10"><img src="/logo192.png" /></div>
    </>)
}

export default Pair;