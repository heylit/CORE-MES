import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, eskiSurum } from '#cekirdek/hata.ts';
import { defterFarki } from '../kurallar.ts';
import type { DefterSatiri, MaliyetTuru } from '../kurallar.ts';
import { maliyetKaldirimi } from './kurallar.ts';
import { maliyetKilitle, maliyetSil } from './sorgular.ts';

// 2574 (2572): birim maliyeti kaldırılır, okuyanlar yeniden "bilinmiyor" (null) görür. Silinen değer denetim kaydına eklenir;
// satır geri gelmez, aynı değer yeniden yazılarak girilir.
export async function maliyetKaldir(db: Db, tur: MaliyetTuru, anahtar: number, surum: number, ek: (s: readonly DefterSatiri[]) => void): Promise<{ tur: MaliyetTuru; anahtar: number }> {
  const eski = await maliyetKilitle(db, tur, anahtar);
  const karar = maliyetKaldirimi(eski?.surum ?? null, surum);
  if (karar === 'bulunamadi' || eski === null) throw bulunamadi('Maliyet kaydı bulunamadı.');
  if (karar === 'cakisma') throw eskiSurum();
  if ((await maliyetSil(db, tur, anahtar, surum)) === null) throw eskiSurum();
  const kayit = `maliyet:${tur}:${anahtar}`;
  ek([...defterFarki(kayit, { ...eski }, {}), { kayit, alan: 'surum', onceki: eski.surum, yeni: null }]);
  return { tur, anahtar };
}
