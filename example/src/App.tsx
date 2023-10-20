import './App.css';
import { ContentPairProvider, LightNodeProvider } from '@waku/react';
import { Protocols} from "@waku/interfaces"
import { Client, Game } from './components/dispatcher/game';
import { DispatcherProvider } from './hooks/useDispatcher';
import { CONTENT_TOPIC } from './constants';
import Pair from './components/shareWithDevice/pair';


function App() {
  return (
    <div className="App">
      <LightNodeProvider options={{defaultBootstrap: true}} protocols={[Protocols.LightPush, Protocols.Filter, Protocols.Store]}>
        <ContentPairProvider contentTopic={CONTENT_TOPIC} ephemeral={true}>
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
            */
