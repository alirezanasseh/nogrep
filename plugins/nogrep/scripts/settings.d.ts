import { NogrepSettings } from './types.js';

declare function readSettings(projectRoot: string): Promise<NogrepSettings>;
declare function writeSettings(projectRoot: string, settings: Partial<NogrepSettings>, local?: boolean): Promise<void>;

export { readSettings, writeSettings };
