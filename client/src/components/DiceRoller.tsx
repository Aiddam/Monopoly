import DiceBox from '@3d-dice/dice-box-threejs';
import { useEffect, useMemo, useRef, useState } from 'react';

interface DiceRollerProps {
  dice: [number, number];
  rollingKey: number;
  active?: boolean;
  variant?: 'panel' | 'hero';
}

export const DiceRoller = ({ dice, rollingKey, active = false, variant = 'panel' }: DiceRollerProps) => {
  const boxId = useMemo(() => `dice-box-${Math.random().toString(36).slice(2)}`, []);
  const diceValues = visibleDiceValues(dice);
  const boxRef = useRef<DiceBox | null>(null);
  const lastRollKeyRef = useRef<number | undefined>(undefined);
  const initialDiceRef = useRef(dice);
  const initialActiveRef = useRef(active);
  const [initialized, setInitialized] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const clearMount = () => document.getElementById(boxId)?.replaceChildren();

    setInitialized(false);
    setFailed(false);
    clearMount();

    const setup = async () => {
      try {
        const box = new DiceBox(`#${boxId}`, {
          assetPath: '/',
          sounds: false,
          shadows: true,
          theme_surface: 'green-felt',
          theme_colorset: 'white',
          theme_texture: '',
          theme_material: 'plastic',
          gravity_multiplier: variant === 'hero' ? 430 : 360,
          light_intensity: variant === 'hero' ? 0.95 : 0.78,
          baseScale: variant === 'hero' ? 82 : 70,
          strength: variant === 'hero' ? 2.25 : 1.35,
          onRollComplete: () => setRolling(false),
        });
        await box.initialize();
        if (cancelled) {
          disposeDiceBox(box);
          return;
        }
        boxRef.current = box;
        setInitialized(true);
        if (!initialActiveRef.current) {
          await box.roll(toRollNotation(initialDiceRef.current));
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setRolling(false);
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (boxRef.current) {
        disposeDiceBox(boxRef.current);
      }
      boxRef.current = null;
      clearMount();
    };
  }, [boxId, variant]);

  useEffect(() => {
    if (!active || !initialized || !boxRef.current || lastRollKeyRef.current === rollingKey) return;

    lastRollKeyRef.current = rollingKey;
    setRolling(true);
    void boxRef.current.roll(toRollNotation(dice)).catch(() => {
      setFailed(true);
      setRolling(false);
    });
  }, [active, dice, initialized, rollingKey]);

  return (
    <div
      className={`dice-stage dice-stage-${variant} dice-box-stage ${active || rolling ? 'is-rolling' : 'is-settled'}`}
      aria-label={formatDiceAria(diceValues)}
    >
      <div className="dice-box-mount" id={boxId} />
      {!initialized && !failed && <div className="dice-box-loading">Готуємо кубики...</div>}
      {failed && (
        <div className={`dice-box-fallback ${diceValues.length === 1 ? 'single-die' : ''}`} aria-hidden>
          {diceValues.map((value, index) => (
            <span key={`${value}-${index}`}>{value}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const visibleDiceValues = (dice: [number, number]) => {
  const values = dice.filter((value) => value > 0);
  return values.length > 0 ? values : [1];
};

const formatDiceAria = (values: number[]) =>
  values.length === 1 ? `Кубик: ${values[0]}` : `Кубики: ${values[0]} і ${values[1]}`;

const toRollNotation = (dice: [number, number]) => {
  const values = visibleDiceValues(dice);
  return `${values.length}d6@${values.join(',')}`;
};

const disposeDiceBox = (box: DiceBox) => {
  const internals = box as DiceBox & {
    renderer?: { domElement?: HTMLCanvasElement; dispose?: () => void };
    running?: boolean;
  };

  internals.running = false;
  box.clearDice();
  internals.renderer?.domElement?.remove();
  internals.renderer?.dispose?.();
};
