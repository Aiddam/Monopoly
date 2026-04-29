import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { GameScreen } from './components/GameScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { PostMatchScreen } from './components/PostMatchScreen';
import { RoomScreen } from './components/RoomScreen';
import { useGameStore } from './store/useGameStore';

export const App = () => {
  const { screen, game, connection, leaveRoom, resumeSavedSession, clearConnectionError } = useGameStore();
  const resumeStarted = useRef(false);

  useEffect(() => {
    if (resumeStarted.current) return;
    resumeStarted.current = true;
    void resumeSavedSession();
  }, [resumeSavedSession]);

  useEffect(() => {
    if (!connection.error) return;
    const timer = window.setTimeout(clearConnectionError, 4500);
    return () => window.clearTimeout(timer);
  }, [clearConnectionError, connection.error]);

  return (
    <main className="app-shell">
      <AnimatePresence mode="wait">
        {screen === 'home' && <RoomScreen key="home" />}
        {screen === 'lobby' && <LobbyScreen key="lobby" />}
        {screen === 'game' && game && <GameScreen key="game" />}
        {screen === 'finished' && game && <PostMatchScreen key="finished" game={game} onLeave={() => void leaveRoom()} />}
      </AnimatePresence>
      {connection.error && (
        <div className="toast">
          <span>{connection.error}</span>
          <button type="button" onClick={clearConnectionError} aria-label="Закрити повідомлення">
            ×
          </button>
        </div>
      )}
    </main>
  );
};
