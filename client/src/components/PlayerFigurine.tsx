import type { CSSProperties } from 'react';
import type { Player } from '../engine/types';

export const PlayerFigurine = ({ player, size = 'normal' }: { player: Player; size?: 'small' | 'normal' | 'large' }) => (
  <span className={`pawn pawn-${size}`} style={{ '--pawn-color': player.color } as CSSProperties} aria-label={player.name}>
    <span className="pawn-head" />
    <span className="pawn-body" />
    <span className="pawn-base" />
  </span>
);
