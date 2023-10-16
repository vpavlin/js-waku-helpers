import React from 'react';
import logo from './logo.svg';
import './App.css';
import Dispatch from './components/dispatcher/dispatch';
import { ContentPairProvider, LightNodeProvider } from '@waku/react';
import { Protocols} from "@waku/sdk"
import { Client, Game } from './components/dispatcher/game';

function App() {
  return (
    <div className="App">
      <LightNodeProvider protocols={[Protocols.LightPush, Protocols.Filter, Protocols.Store]}>
        <ContentPairProvider contentTopic='/dispatcher/1/test/json'>
          <Game />
          <div>
            <Client />
          </div>
        </ContentPairProvider>
      </LightNodeProvider>
    </div>
  );
}

export default App;
