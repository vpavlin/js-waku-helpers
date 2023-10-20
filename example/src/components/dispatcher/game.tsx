import { useCreateLightNode, useContentPair, useWaku } from "@waku/react"
import { useState, useEffect, useRef } from "react"
import { Dispatcher } from "../../lib/dispatcher"
import useIdentity from "../../hooks/useIdentity"
import { generatePrivateKey } from "@waku/message-encryption/ecies"
import { Wallet } from "ethers"
import { utils } from "@noble/secp256k1"
import { DecodedMessage, bytesToUtf8 } from "@waku/sdk"
import { useDispatcher } from "../../hooks/useDispatcher"
import { sha256 } from "js-sha256"


enum GameCommand {
    NewGame = "new_game",
    JoinGame = "join_game",
    JoinAck = "join_game_ack",
    NewGameAck = "new_game_ack",
    NewGameProp = "new_game_prop",
    Hearbeat = "game_heartbeat",
    Turn = "game_turn",
    Close = "game_close",
    PlayerDone = "game_player_done",
    Done = "game_done",
}

enum GameActions {
    Attack = "attack",
    Heal = "heal"
}

type Game = {
    id: string
    key: Uint8Array
    users: string[]
    server: string
    accepted: boolean
    timer?: NodeJS.Timer | undefined
    state: GameState
    round: number | undefined
    heartbeat: boolean
}

type GameState = {
    players: Map<string, PlayerState>
}

type PlayerState = {
    health: number
    shield: number
    attack: number
}

type GameClient = {
    id: string
    users: string[]
    server: string
    state: GameState | undefined
    publicKey: string
    round: number | undefined
}

type NewGame = {
    id: string
    name: string
    user: string
    publicKey: string
}

type NewGameProp = {
    name: string
    id: string
    user: string
    server: string
    publicKey: string
}

type GameJoinAck = NewGameProp & {
    state: GameState
}

type NewGameAck = {
    server: string
    id: string
    user: string
}

type GameHeartbeat = {
    id: string
    server: string
    round: number | undefined
    users: string[]
    state: GameState
}

type GameTurn = {
    id: string
    user: string
    action: GameActions
}

type GameClose = {
    id: string
    user: string
}

type PlayerDone = GameClose

type GameDone = {
    id: string
}

const InitState:PlayerState = {
    health: 100,
    shield: 50,
    attack: 50
}

const MAX_HEALTH = 100
const MAX_SHIELD = 100

export const Game = () => {
    const {dispatcher} = useDispatcher()    
    const [ready, setReady] = useState(false)
    const [games, setGames] = useState<Map<string, Game>>(new Map<string, Game>())

    const {wallet, publicKey, privateKey} = useIdentity("server")

    useEffect(() => {
        if (!dispatcher || !privateKey) return;
        
        (async () => {
            
            const d = dispatcher
            d.registerKey(privateKey)
            d.on(GameCommand.NewGame, async (payload:NewGame, msg:any) => {
                console.log(`Received ${GameCommand.NewGame} : ${JSON.stringify(payload)}`)
                const key = generatePrivateKey()
                const w = new Wallet(utils.bytesToHex(key))
                setGames((x) => {
                    if (!x.has(payload.id)) {
                        const p = new Map<string, PlayerState>()
                        p.set(payload.user, {...InitState})
                        console.log(p)
                        x.set(payload.id, {id: payload.id, key: key, users: [payload.user], accepted: false, server: wallet?.address!, state: {players: p}, round: undefined, heartbeat: true})
                    }

                    return new Map<string, Game>(x)
                })
                const p:NewGameProp = {name: payload.name, id: payload.id, user: payload.user, server: wallet?.address!, publicKey: utils.bytesToHex(publicKey!)}
                const r = await d.emit(GameCommand.NewGameProp, p, wallet)
                console.log(r.recipients)
            })
            d.on(GameCommand.NewGameAck, async (payload: NewGameAck, msg: any) => {
                console.log(`Received ${GameCommand.NewGameAck} : ${JSON.stringify(payload)}`)
                setGames((x) => {
                    if (payload.server != wallet?.address!) {
                        const game = x.get(payload.id)
                        if (game)
                            clearInterval(game!.timer)
                        x.delete(payload.id)
                        return new Map<string, Game>(x)
                    }
                    if (!x.has(payload.id))
                        console.error(`unknown game ${payload.id}`)

                    const game = x.get(payload.id)
                    if (game) {
                        game!.accepted = true
                        
                        if (game.heartbeat && !game.timer) {
                            game!.timer = setInterval(() => {
                                setGames((x) => {
                                    const game = x.get(payload.id)
                                    if (game) {
                                        game.round = (game.round || 0 + 1) % game.users.length
                                        x.set(payload.id, game)
                                        d.emit(GameCommand.Hearbeat, {id:payload.id, users: game!.users, round: game!.round, state: game!.state, server: wallet?.address} as GameHeartbeat, wallet)
                                    }

                                    return new Map<string, Game>(x)
                                })
                            }, 2000)
                        }
                        x.set(payload.id, game!)
                    }
                    return new Map<string, Game>(x)
                })
            }, true)
            d.on(GameCommand.JoinGame, async (payload:any, msg:any, signer?: string) => {
                console.log(`Received ${GameCommand.JoinGame}: ${JSON.stringify(payload)}`)
                setGames((x) => {
                    if (!x.has(payload.id)) {
                        console.error("unknown game " + payload.id)
                        return x
                    }

                    const game = x.get(payload.id)
                    if (game && !game?.users.find((u) => u == payload.user)) {
                        game.users.push(payload.user)
                        game.state.players.set(payload.user, {...InitState})
                        d.emit(GameCommand.JoinAck, {name: "", id: payload.id, user: payload.user, server: wallet?.address!, publicKey: utils.bytesToHex(publicKey!), state: game.state} as GameJoinAck, wallet)
                        x.set(payload.id, game)
                    }

                    return new Map<string, Game>(x)
                })
            }, true)
            d.on(GameCommand.Turn, (payload: GameTurn, msg: any, signer?: string) => {
                console.log(payload)
                console.log(signer)
                if (signer !== payload.user) return
                setGames((x) => {
                    if (!x.has(payload.id)) {
                        console.error("unknown game " + payload.id)
                        return x
                    }

                    const game = x.get(payload.id)
                    console.log(game)
                    if (game) {
                        if (game.users.find((u) => u == payload.user) === undefined) return x
                        console.log("passed user check")
                        if (game.round == game.users.indexOf(payload.user)) {
                            console.log("here")
                            if (payload.action == GameActions.Attack) {
                                const opponentId =game.users[(game.round + 1) % game.users.length]
                                const opponent = game.state.players.get(opponentId)
                                if (opponent) {
                                    opponent.shield -= Math.random()*10
                                    if (opponent.shield <= 0) {
                                        opponent.health += opponent.shield
                                        opponent.shield = 0
                                        if (opponent.health <= 0) {
                                            d.emit(GameCommand.PlayerDone, {id: payload.id, user: opponentId}, wallet)
                                        }
                                    }
                                    game.state.players.set(opponentId, opponent)
                                }
                            }
                            if (payload.action == GameActions.Heal) {
                                const me = game.state.players.get(payload.user)
                                if (me) {
                                    if (me.health == MAX_HEALTH) {
                                        if (me.shield < MAX_SHIELD) {
                                            me.shield += Math.random()*5
                                            if (me.shield > MAX_SHIELD) me.shield = MAX_SHIELD
                                        }
                                    }
                                }
                            }

                        }
                        
                        x.set(payload.id, game)
                    }
                    return new Map<string, Game>(x)
                })
            }, true)
            d.on(GameCommand.Close, (payload: GameClose, msg:any, signer?: string) => {
                setGames((x) => {
                    console.log("Closing")
                    if (!x.has(payload.id)) {
                        console.error("unknown game " + payload.id)
                        return x
                    }

                    const game = x.get(payload.id)
                    if (payload.user != signer) return x
                    if (game?.users.find((u) => u == signer) === undefined) return x

                    x.delete(payload.id)
                    d.emit(GameCommand.Done, {id: payload.id}, wallet)

                    return new Map<string, Game>(x)
                })
            }, true)

            await d.start()

            console.log("Created server")

            setReady(true)
        })()

        return () => {
            
        }
    }, [dispatcher, privateKey])


    return (
        <>
            <h2>Game Server - {wallet?.address!}</h2>
            <h4>{ready ? "ready" : "setting up..."}</h4>
            {
                Array.from(games.keys()).map((key) => {
                    const game = games.get(key)
                    if (!game) return
                    return <div key={key}>
                        {game.accepted && "* "} {key} : {game.users.join(", ")} : {JSON.stringify(game.state.players.values)}
                    </div>
                })
            }
        </>
    )
}


export const Client = () => {
    const [gameName, _setGameName] = useState<string>("")
    const gameNameRef = useRef(gameName)

    const [game, _setGame] = useState<GameClient>()
    const gameRef = useRef(game)

    const [ready, setReady] = useState(false)
    const [games, setGames] = useState<GameClient[]>([])


    const {dispatcher} = useDispatcher()
    const {wallet, percent, privateKey, publicKey} = useIdentity("client")

    const setGameName = (data:string) => {
        gameNameRef.current = data
        _setGameName(data)
    }

    const setGame = (data:GameClient | undefined) => {
        gameRef.current = data
        _setGame(data)
    }


    const ackGame = async (payload:NewGameProp, msg:any, signer?:string) => {
        console.log(`Received ${GameCommand.NewGameProp}: ${JSON.stringify(payload)}`) 
        console.log(`${game} && ${gameNameRef.current} == ${payload.name} && ${payload.user} == ${wallet?.address}`)
        if (!gameRef.current && payload.name == gameNameRef.current && wallet?.address == payload.user) {
            setGame({id: payload.id, publicKey:payload.publicKey, server: payload.server, state: undefined, users: [payload.user], round: undefined})

            const a:NewGameAck = {server: payload.server, id: payload.id, user: payload.user}
            const r = await dispatcher!.emit(GameCommand.NewGameAck, a, wallet)
        }
    }

    useEffect(() => {
        if (!dispatcher || !dispatcher.isRunning() || !publicKey || !privateKey) return

        (async () => {

            const d = dispatcher
            d.registerKey(privateKey)
            d.on(GameCommand.NewGameProp, ackGame, true)
            d.on(GameCommand.NewGameAck, (payload: NewGameAck, msg: any, signer?: string) => {
                if (signer == payload.user) {
                    setGames((x) => [...x.filter((v) => v.id != payload.id), {id: payload.id, publicKey: "", users: [payload.user], server: payload.server, state: undefined, round: undefined}])
                }
            }, true)
            d.on(GameCommand.Hearbeat, (payload:GameHeartbeat, msg:any, signer?: string) => {
                if (gameRef.current && payload.id == gameRef.current?.id && payload.server == signer && payload.server == gameRef.current.server) {
                    const g = {...gameRef.current}
                    g.round = payload.round
                    g.users = payload.users
                    g.state = payload.state
                    setGame(g)
                }

            }, true)
            d.on(GameCommand.JoinAck, (payload: GameJoinAck, msg: any, signer?: string) => {
                if (!gameRef.current && payload.name == gameNameRef.current && wallet?.address == payload.user && payload.server == signer) {
                    setGame({id: payload.id, publicKey: payload.publicKey, server: payload.server, state: payload.state, users: [payload.user], round: undefined})
                }
            }, true)
            d.on(GameCommand.Done, (payload: GameDone, msg:any, signer?: string) => {
                setGames((x) => [...x.filter((v) => {
                    if (v.id == payload.id && v.server == signer) return false

                    return true
                })])

                if (!gameRef.current) return
                if (gameRef.current?.id != payload.id) return
                if (gameRef.current.server != signer) return

                setGame(undefined)
            }, true)
            d.on(GameCommand.PlayerDone, (payload: PlayerDone, msg: any, signer?: string) => {
                if (gameRef.current && gameRef.current.id == payload.id && wallet?.address == payload.user) {
                    console.log("It's over!")
                }
            }, true)


            console.log("Created client")
   
            setReady(true)
        })()
    }, [dispatcher, publicKey, privateKey])


    const newGame = async () => {
        console.log(publicKey)
        const g:NewGame = {name: gameName, user: wallet?.address!, publicKey: utils.bytesToHex(publicKey!), id: sha256(wallet?.address! + new Date().getTime())}

        const r = await dispatcher?.emit(GameCommand.NewGame, g)
        console.log(r)
    }

    return (
        <>
            <h2>Game Client</h2>
            {
                game ?
                    <div>
                        <h4>Game Id: {game.id}</h4>
                        <div>
                            {
                                game.state &&
                                <div>
                                <div>
                                    <div>Health: {game.state.players.get(wallet?.address!)?.health}</div>
                                    <div>Shield: {game.state.players.get(wallet?.address!)?.shield}</div>
                                    <div>Attack: {game.state.players.get(wallet?.address!)?.attack}</div>
                                </div>
                                <div>
                                    <button disabled={game.round === game.users.indexOf(wallet?.address!)} onClick={() => dispatcher?.emit(GameCommand.Turn, {id: game.id, action: GameActions.Attack, user: wallet?.address} as GameTurn, wallet, utils.hexToBytes(game.publicKey))}>Attack</button>
                                    <button disabled={game.round === game.users.indexOf(wallet?.address!)} onClick={() => dispatcher?.emit(GameCommand.Turn, {id: game.id, action: GameActions.Heal, user: wallet?.address} as GameTurn, wallet, utils.hexToBytes(game.publicKey))}>Heal</button>
                                </div>
                                </div>
                            }
                        </div>
                        <div>
                            <button onClick={() => dispatcher?.emit(GameCommand.Close, {id: game.id, user: wallet?.address}, wallet, utils.hexToBytes(game.publicKey))}>Close Game</button>
                        </div>
                    </div>
                :
                <div>
                    <div>Game Name: <input onChange={(e) => setGameName(e.target.value)} value={gameName} /></div>
                    <div>User Key: {percent < 100 ? `${percent}%` : wallet?.address}</div>
                    <button disabled={!ready} onClick={() => newGame()}>New Game</button>
                </div>
            }
            {
                games.filter((v) => v.id != game?.id).map((v) => <div key={v.id}>({v.id}) <button disabled={wallet?.address == "" } onClick={() => dispatcher?.emit("join_game", {id: v.id, user: wallet?.address, publicKey: publicKey,  server: v.server}, wallet)}>Join</button></div>)
            }
        </>

    )
}
