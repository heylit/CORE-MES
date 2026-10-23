import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Senaryo } from './senaryo.ts';

const KLASOR = fileURLToPath(new URL('./senaryolar/', import.meta.url));

// Senaryolar toplayıcı listesiz bulunur: her dosya `export default senaryo({...})` verir. Paralel yazarlar ortak dosyaya dokunmaz.
// TMIV2_ROBOT_SENARYO virgüllü ad listesiyle süzer.
export async function senaryolariKesfet(suzgec: string | undefined): Promise<Senaryo[]> {
  const istenen = suzgec?.split(',').map((s) => s.trim()).filter((s) => s !== '') ?? [];
  const dosyalar = readdirSync(KLASOR).filter((d) => d.endsWith('.ts') && !d.endsWith('.test.ts')).sort();
  const liste: Senaryo[] = [];
  for (const d of dosyalar) {
    const m = (await import(pathToFileURL(join(KLASOR, d)).href)) as { default?: Senaryo };
    if (m.default === undefined) throw new Error(`${d} varsayılan senaryo vermiyor`);
    liste.push(m.default);
  }
  const adlar = new Set(liste.map((s) => s.ad));
  if (adlar.size !== liste.length) throw new Error('Aynı adlı iki senaryo var');
  const bilinmeyen = istenen.filter((a) => !adlar.has(a));
  if (bilinmeyen.length > 0) throw new Error(`Bilinmeyen senaryo: ${bilinmeyen.join(', ')}`);
  return istenen.length === 0 ? liste : liste.filter((s) => istenen.includes(s.ad));
}
