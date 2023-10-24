import './App.css';
import { ContentPairProvider, LightNodeProvider } from '@waku/react';
import { Protocols} from "@waku/interfaces"
import { Client, Game } from './components/dispatcher/game';
import { DispatcherProvider } from './hooks/useDispatcher';
import { CONTENT_TOPIC, CONTENT_TOPIC_PAIRING } from './constants';
import Pair from './components/shareWithDevice/pair';
//import { HeliaProvider } from './hooks/useHelia';
//import IPFS from './components/shareWithDevice/ipfs';
import { bootstrap } from '@libp2p/bootstrap';
import { enrTree, wakuDnsDiscovery } from "@waku/dns-discovery";


const NODE_REQUIREMENTS = {
  store: 2,
  lightPush: 2,
  filter: 2,
};

function App() {
  return (
    <div className="App text-center">
      <LightNodeProvider options={{
        defaultBootstrap: true,
        pingKeepAlive:60, 
        /*libp2p: {
          peerDiscovery: [
            bootstrap({ list: ["/dns4/waku.myrandomdemos.online/tcp/8000/wss/p2p/16Uiu2HAmHKj9KTUEUPpw9F3EaDkT6QVXZNTRVerFJJtnkcC5CHgx"] }),
            wakuDnsDiscovery(
              [enrTree["PROD"]],
              NODE_REQUIREMENTS
            ),
          ],
        }*/
        }} protocols={[Protocols.LightPush, Protocols.Filter, Protocols.Store]}>
        <ContentPairProvider contentTopic={CONTENT_TOPIC_PAIRING} ephemeral={true}>
          <DispatcherProvider>
            <div>
              <Pair />
            </div>
          </DispatcherProvider>
        </ContentPairProvider>
      </LightNodeProvider>
    </div>
  );
}

export default App;

/*            <div style={{display: "none"}}>
              <Game />
              <div>
                <Client />
              </div>
            </div>
<HeliaProvider>
            <IPFS />
            </HeliaProvider>
            */
