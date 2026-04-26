import { motion } from 'framer-motion';
import { Dice5, DoorOpen, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { MAX_PLAYERS } from '../engine/gameEngine';
import { SIGNALR_SERVER_URL } from '../network/roomClient';
import { useGameStore } from '../store/useGameStore';

export const RoomScreen = () => {
  const [name, setName] = useState('Гравець');
  const [code, setCode] = useState('');
  const [testMode, setTestMode] = useState(false);
  const { createRoom, joinRoom, startLocalDemo, connection } = useGameStore();

  return (
    <motion.section
      className="home-screen"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      <div className="home-copy">
        <div className="brand-mark">UM</div>
        <p className="eyebrow">Веб-Монополія України</p>
        <h1>Купуйте міста, будуйте квартали й ведіть переговори напряму між гравцями.</h1>
        <p className="lead">
          Павлоград на дошці, банки замість станцій, українські міста з власними ілюстраціями, SignalR для кімнат і
          WebRTC для peer-to-peer синхронізації гри до {MAX_PLAYERS} гравців.
        </p>
      </div>

      <div className="home-panel">
        <label>
          Ваше ім'я
          <input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="test-mode-toggle">
          <input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} />
          <span>
            <strong>Тест режим</strong>
            <small>У грі зʼявиться кнопка Адмін для перенесення поточного гравця.</small>
          </span>
        </label>
        <div className="home-actions">
          <button className="primary" onClick={() => void createRoom(name || 'Гравець', testMode)}>
            <UsersRound size={18} />
            Створити кімнату
          </button>
          <div className="join-row">
            <input
              value={code}
              maxLength={6}
              placeholder="Код"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <button className="secondary" disabled={!code} onClick={() => void joinRoom(code, name || 'Гравець')}>
              <DoorOpen size={18} />
              Приєднатись
            </button>
          </div>
          <button className="ghost" onClick={startLocalDemo}>
            <Dice5 size={18} />
            Демо за одним браузером
          </button>
        </div>
        <p className="connection-note">
          {connection.signalr === 'connecting' ? 'Підключення до SignalR...' : `Сервер: ${SIGNALR_SERVER_URL}`}
        </p>
      </div>
    </motion.section>
  );
};
