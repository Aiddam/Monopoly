import { AnimatePresence, motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { GameScreen } from './components/GameScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { RoomScreen } from './components/RoomScreen';
import { useGameStore } from './store/useGameStore';

export const App = () => {
  const { screen, game, connection, leaveRoom, resumeSavedSession } = useGameStore();
  const resumeStarted = useRef(false);
  const winner = game?.players.find((player) => player.id === game.winnerId);

  useEffect(() => {
    if (resumeStarted.current) return;
    resumeStarted.current = true;
    void resumeSavedSession();
  }, [resumeSavedSession]);

  return (
    <main className="app-shell">
      <AnimatePresence mode="wait">
        {screen === 'home' && <RoomScreen key="home" />}
        {screen === 'lobby' && <LobbyScreen key="lobby" />}
        {screen === 'game' && game && <GameScreen key="game" />}
        {screen === 'finished' && (
          <motion.section
            className="finish-screen"
            key="finished"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <div className="finish-card">
              <Crown size={54} />
              <p className="eyebrow">Партія завершена</p>
              <h1>{winner?.name ?? 'Переможець'} контролює Українську дошку</h1>
              <button className="primary" onClick={() => void leaveRoom()}>
                На головний екран
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      {connection.error && <div className="toast">{connection.error}</div>}
    </main>
  );
};
