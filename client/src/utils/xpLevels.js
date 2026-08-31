import { Egg, Sprout, BookOpen, Flame, Crown } from 'lucide-react';

// Shared rank ladder for the Learn Skills XP system — used by both the
// Dashboard's Career Profile widget and Learn Skills' level-up celebration,
// so the two can't drift out of sync on titles/thresholds/icons.
export function getLevelData(xp) {
  if (xp < 100)  return { title: 'Novice',      min: 0,    max: 100,  pct: xp,                 icon: Egg,      color: '#94a3b8' };
  if (xp < 300)  return { title: 'Apprentice',  min: 100,  max: 300,  pct: ((xp-100)/200)*100, icon: Sprout,   color: '#2de886' };
  if (xp < 600)  return { title: 'Scholar',     min: 300,  max: 600,  pct: ((xp-300)/300)*100, icon: BookOpen, color: '#5bc4f5' };
  if (xp < 1000) return { title: 'Expert',      min: 600,  max: 1000, pct: ((xp-600)/400)*100, icon: Flame,    color: '#f07830' };
  return           { title: 'Grandmaster', min: 1000, max: 1000, pct: 100,                icon: Crown,    color: '#e8a825' };
}
