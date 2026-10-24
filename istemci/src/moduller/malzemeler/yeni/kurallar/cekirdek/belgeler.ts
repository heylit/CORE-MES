import { isNum } from './yardimcilar.ts';

export function fmtSize(b: unknown): string { return (!isNum(b) ? '' : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB'); }
