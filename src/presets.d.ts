import type {PersonaMemoryConfig} from '../index.js';
export declare const PRESET_NAMES:readonly string[];
export declare function createPreset(name:'community'|'companion'|'support'|'npc',overrides?:PersonaMemoryConfig):PersonaMemoryConfig;
