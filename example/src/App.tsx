import './App.css';
import { Client, Game } from './components/dispatcher/game';
import { DispatcherProvider } from './hooks/useDispatcher';
import Pair from './components/shareWithDevice/pair';
import { Outlet, Route, Routes } from 'react-router-dom';




const NODE_REQUIREMENTS = {
  store: 2,
  lightPush: 2,
  filter: 2,
};

function App() {
  return (
    <div className="text-center">
      <Routes>
          <Route path='/' element={
              <DispatcherProvider>
                <div>
                  <Pair />
                </div>
              </DispatcherProvider>
            }>
          </Route>
        </Routes>
    </div>
  );
}

export default App;
