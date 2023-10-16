import { useCreateLightNode, useContentPair } from "@waku/react"
import { useState, useEffect, useRef } from "react"
import { Dispatcher } from "../../lib/dispatcher"
import { sha256 } from "js-sha256"

enum GameCommand {
    NewGame = "new_game",
    JoinGame = "join_game",
    NewGameAck = "new_game_ack",
    NewGameProp = "new_game_prop",
}

type Game = {
    id: string
    users: string[]
    server: string
    accepted: boolean
}

type NewGame = {
    name: string
    user: string
}

type NewGameProp = {
    name: string
    id: string
    user: string
    server: string
}

type NewGameAck = {
    server: string
    id: string
    user: string
}

export const Game = () => {
    const { node, isLoading, error} = useCreateLightNode({options: {defaultBootstrap: true}})
    const { encoder, decoder } = useContentPair()
    const [dispatcher, setDispatcher] = useState<Dispatcher>()
    const [serverId, setServerId] = useState<string>()
    
    const [ready, setReady] = useState(false)
    const [games, setGames] = useState<Map<string, Game>>(new Map<string, Game>())

    useEffect(() => {
        if (!node || !encoder || !decoder) return

        (async () => {
            
            const d = new Dispatcher(node, encoder, decoder)
            d.on(GameCommand.NewGame, async (payload:NewGame, msg:any) => {
                console.log(`Received ${GameCommand.NewGame} : ${JSON.stringify(payload)}`)
                const id = sha256(JSON.stringify(payload))
                setGames((x) => {
                    if (!x.has(id))
                        x.set(id, {id: id, users: [payload.user], accepted: false, server: node.libp2p.peerId.toString()})

                    return new Map<string, Game>(x)
                })
                const p:NewGameProp = {name: payload.name, id: id, user: payload.user, server: node.libp2p.peerId.toString()}
                const r = await d.emit(GameCommand.NewGameProp, p)
            })
            d.on(GameCommand.NewGameAck, async (payload: NewGameAck, msg: any) => {
                console.log(`Received ${GameCommand.NewGameAck} : ${JSON.stringify(payload)}`)
                setGames((x) => {
                    if (payload.server != node.libp2p.peerId.toString()) {
                        x.delete(payload.id)
                        return new Map<string, Game>(x)
                    }
                    if (!x.has(payload.id))
                        console.error(`unknown game ${payload.id}`)

                    const game = x.get(payload.id)
                    if (game) {
                        game!.accepted = true
                        x.set(payload.id, game!)
                    }
                    return new Map<string, Game>(x)
                })
            })
            d.on(GameCommand.JoinGame, async (payload:any, msg:any) => {
                console.log(`Received ${GameCommand.JoinGame}: ${JSON.stringify(payload)}`)
                setGames((x) => {
                    if (!x.has(payload.id))
                        console.error("unknown game " + payload.id)
                    
                    const game = x.get(payload.id)
                    game?.users.push(payload.user)
                    x.set(payload.id, game!)
                    return new Map<string, Game>(x)
                })
            })
    
            await d.start()

            console.log("Created server")

            setDispatcher(d)
            setReady(true)
        })()

        return () => {
            dispatcher?.stop()
        }
    }, [node, encoder, decoder])


    return (
        <>
            <h2>Game Server - {node?.libp2p.peerId.toString()}</h2>
            <h4>{ready ? "ready" : "setting up..."}</h4>
            {
                Array.from(games.keys()).map((key) => <div key={key}>
                    {games.get(key)!.accepted && "* "} {key} : {games.get(key)!.users.join(", ")}
                </div>)
            }
        </>
    )
}

export const Client = () => {
    const [gameName, _setGameName] = useState<string>("")
    const gameNameRef = useRef(gameName)
    const [user, _setUser] = useState<string>("")
    const userRef = useRef(user)

    const [game, _setGame] = useState<string>()
    const gameRef = useRef(game)

    const [ready, setReady] = useState(false)
    const [games, setgames] = useState<Game[]>([])


    const { node, isLoading, error} = useCreateLightNode({options: {defaultBootstrap: true}})
    const { encoder, decoder } = useContentPair()
    const [dispatcher, _setDispatcher] = useState<Dispatcher>()
    const dispatcherRef = useRef(dispatcher)

    const setGameName = (data:string) => {
        gameNameRef.current = data
        _setGameName(data)
    }

    const setGame = (data:string) => {
        gameRef.current = data
        _setGame(data)
    }

    const setUser = (data:string) => {
        userRef.current = data
        _setUser(data)
    }

    const setDispatcher = (data:Dispatcher) => {
        dispatcherRef.current = data
        _setDispatcher(data)
    }

    const ackGame = async (payload:NewGameProp, msg:any) => {
        console.log(`Received ${GameCommand.NewGameProp}: ${JSON.stringify(payload)}`) 
        console.log(`${game} && ${gameNameRef.current} == ${payload.name} && ${payload.user} == ${userRef.current}`)
        if (!gameRef.current && payload.name == gameNameRef.current && userRef.current == payload.user) {
            setGame(payload.id)
            console.log("posting ack!")
            const a:NewGameAck = {server: payload.server, id: payload.id, user: payload.user}
            const r = await dispatcherRef.current!.emit(GameCommand.NewGameAck, a)
            console.log(r)

        } else {
            setgames((x) => [...x.filter((v) => v.id != payload.id), {id: payload.id, accepted: true, server: payload.server, users: [payload.user]}])
        }
    }

    useEffect(() => {
        if (!node || !encoder || !decoder) return

        (async () => {

            const d = new Dispatcher(node, encoder, decoder)
            d.on(GameCommand.NewGameProp, ackGame)

            await d.start()

            console.log("Created client")

            setDispatcher(d)
            setReady(true)
        })()

        return () => {
            dispatcher?.stop()
        }
    }, [node, encoder, decoder])

    const newGame = async () => {
        const g:NewGame = {name: gameName, user: user}

        const r = await dispatcher?.emit("new_game", g)
        console.log(r)
    }

    return (
        <>
            <h2>Game Client</h2>
            {
                game ? <div>Game Id: {game}</div>
                :
                <div>
                    <div>Game Name: <input onChange={(e) => setGameName(e.target.value)} value={gameName} /></div>
                    <div>User Name: <input onChange={(e) => setUser(e.target.value)} value={user} /></div>
                    <button disabled={!ready} onClick={() => newGame()}>New Game</button>
                </div>
            }
            {
                games.map((v) => <div key={v.id}>({v.id}) <button disabled={user == "" } onClick={() => dispatcher?.emit("join_game", {id: v.id, user: user, server: v.server})}>Join</button></div>)
            }
        </>
    )
}
