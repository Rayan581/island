import type { IslandFeature } from '../types';
import { startRobo } from './controller.svelte';
import Settings from './Settings.svelte';

const feature: IslandFeature = {
  id: 'robo', label: 'Robo personality', description: 'The eyes show moods: focused, happy, surprised, sleepy.', defaultEnabled: true,
  settings: Settings,
  init: startRobo
};
export default feature;
