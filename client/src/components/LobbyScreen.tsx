import { motion } from 'framer-motion';
import { Check, Copy, LogOut, Play } from 'lucide-react';
import { MAX_PLAYERS, PLAYER_COLORS } from '../engine/gameEngine';
import { canStartRoom, useGameStore } from '../store/useGameStore';

export const LobbyScreen = () => {
  const { room, localPlayerId, setReady, startRoomGame, leaveRoom, connection } = useGameStore();
  if (!room) return null;

  const localPlayer = room.players.find((player) => player.id === localPlayerId);
  const canStart = localPlayer?.isHost && canStartRoom(room.players);

  return (
    <motion.section className="lobby-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="room-header">
        <div>
          <p className="eyebrow">Кімната</p>
          <h1>{room.code}</h1>
          {room.testMode && <span className="room-mode-pill">Тест режим</span>}
        </div>
        <div className="room-actions">
          <button className="secondary" onClick={() => void navigator.clipboard?.writeText(room.code)}>
            <Copy size={18} />
            Код
          </button>
          <button className="ghost" onClick={() => void leaveRoom()}>
            <LogOut size={18} />
            Вийти
          </button>
        </div>
      </header>

      <section className="lobby-grid">
        {room.players.map((player, index) => (
          <article className="player-seat" key={player.id}>
            <div className="seat-token" style={{ background: PLAYER_COLORS[index] }}>
              {index + 1}
            </div>
            <div>
              <h2>{player.name}</h2>
              <p>{player.isHost ? 'Хост кімнати' : player.ready ? 'Готовий' : 'Очікує'}</p>
            </div>
            {(player.ready || player.isHost) && <Check className="seat-check" size={20} />}
          </article>
        ))}
        {Array.from({ length: Math.max(0, MAX_PLAYERS - room.players.length) }).map((_, index) => (
          <article className="player-seat empty" key={index}>
            <div className="seat-token">+</div>
            <div>
              <h2>Вільне місце</h2>
              <p>До {MAX_PLAYERS} гравців</p>
            </div>
          </article>
        ))}
      </section>

      <footer className="lobby-footer">
        <div className="p2p-status">
          {Object.entries(connection.p2p).length === 0
            ? 'Очікуємо peer-to-peer зʼєднання'
            : Object.entries(connection.p2p)
                .map(([peer, connected]) => `${peer.slice(0, 5)}: ${connected ? 'online' : 'sync'}`)
                .join(' · ')}
        </div>
        {localPlayer?.isHost ? (
          <button className="primary" disabled={!canStart} onClick={startRoomGame}>
            <Play size={18} />
            Почати гру
          </button>
        ) : (
          <button className="primary" onClick={() => void setReady(!localPlayer?.ready)}>
            <Check size={18} />
            {localPlayer?.ready ? 'Не готовий' : 'Готовий'}
          </button>
        )}
      </footer>
    </motion.section>
  );
};
