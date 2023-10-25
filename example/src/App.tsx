import './App.css';
import { Client, Game } from './components/dispatcher/game';
import { DispatcherProvider } from './hooks/useDispatcher';
import Pair from './components/shareWithDevice/pair';
//import { HeliaProvider } from './hooks/useHelia';
//import IPFS from './components/shareWithDevice/ipfs';



const NODE_REQUIREMENTS = {
  store: 2,
  lightPush: 2,
  filter: 2,
};

function App() {
  return (
    <div className="App text-center">
      
          <DispatcherProvider>
            <div>
              <Pair />
            </div>
          </DispatcherProvider>
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
