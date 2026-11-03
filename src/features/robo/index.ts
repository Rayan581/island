import type { IslandFeature } from '../types';
import { startRobo } from './controller.svelte';
import Settings from './Settings.svelte';

const feature: IslandFeature = {
  id: 'robo', label: 'Robo personality', description: 'Lively eyes: moods for Claude, focus, music and battery, plus reactions to your cursor and to idling', defaultEnabled: true,
  settings: Settings,
  init: startRobo
};
export default feature;
