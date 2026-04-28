import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import EmberBackground from './components/EmberBackground';
import BackendInit from './components/BackendInit';

import TrainView from './views/TrainView';
import HubView from './views/HubView';
import ModelsView from './views/ModelsView';
import PlaygroundView from './views/PlaygroundView';

export default function App() {
  return (
    <>
      <BackendInit />
      <EmberBackground />
      <Header />
      
      <main className="pt-14 relative z-10">
        <Routes>
          <Route path="/" element={<Navigate to="/train" replace />} />
          <Route path="/train" element={<TrainView />} />
          <Route path="/hub" element={<HubView />} />
          <Route path="/models" element={<ModelsView />} />
          <Route path="/playground" element={<PlaygroundView />} />
          <Route path="*" element={<Navigate to="/train" replace />} />
        </Routes>
      </main>
    </>
  );
}
