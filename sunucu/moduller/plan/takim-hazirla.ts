import type { Db } from '#cekirdek/db.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { calismaPlani, type CalismaPlani } from './plan-girdisi.ts';
import { PLANLAMA_ANAHTARI, planCozumKaynagi } from './planlama-servis.ts';
import { planlanacakIsler } from './servis.ts';
import * as sorgular from './sorgular.ts';

// 3199 (D): hazırlığın "Takım hazırla" maddesi. Motor özel takımın ömrü işe yetmezse işin içine değişim süresi koyar ve bunu kayıtlı
// çalışma planının işlemine yazar (takim, n > 0). Canlı plan tablosu bu bilgiyi taşımaz; bu yüzden kaynak kayıtlı çalışma planıdır ve
// yalnız canlı planda yeri olan iş emrinde uyarılır (çalışmada kalıp canlıya alınmamış plan atölyeyi uyarmaz). Değişimi olmayan,
// canlıda olmayan ya da çalışmada karşılığı bulunmayan iş emrinde madde gerekmez.

// Değişim düşen işlerin "emir no|OP no" anahtarları. Bölünmüş işin payı (kimlik~2) işin kendisine sayılır.
export function takimDegisimliIsler(plan: Pick<CalismaPlani, 'kimlik' | 'ops'> | null): Set<string> {
  const sonuc = new Set<string>();
  for (const r of plan?.ops ?? []) {
    if (r.bitti || !r.takim?.some((t) => t.n > 0)) continue;
    const anahtar = plan!.kimlik[r.id.replace(/~\d+$/, '')];
    if (anahtar !== undefined) sonuc.add(anahtar);
  }
  return sonuc;
}

// Çalışmayı okumak motor girdisini kurar (pahalı); kayıt sürümü ve tesis günü değişmedikçe sonuç aynıdır.
let bellek: { surum: number; gun: string; isler: Set<string> } | null = null;
async function degisimliIsler(db: Db, simdi: number): Promise<Set<string>> {
  const satir = await sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI);
  if (satir === null) return new Set();
  const gun = tesisGunu(simdi);
  if (bellek?.surum !== satir.surum || bellek.gun !== gun) {
    const kaynak = await planCozumKaynagi(db, simdi);
    bellek = { surum: satir.surum, gun, isler: takimDegisimliIsler(calismaPlani({ ...kaynak, bugun: gun }, simdi)) };
  }
  return bellek.isler;
}

// Bağı kablolama.ts kurar; yetki denetlemez (hazırlık okuması çağıranındır).
export async function isEmriTakimHazirlaDurumlari(db: Db, isEmriIdleri: readonly number[], simdi: number = Date.now()): Promise<Map<number, { durum: 'yok'; secildi: boolean }>> {
  const sonuc = new Map<number, { durum: 'yok'; secildi: boolean }>(isEmriIdleri.map((id) => [id, { durum: 'yok', secildi: false }]));
  const canli = isEmriIdleri.length === 0 ? [] : await sorgular.canliYerlesimleri(db, isEmriIdleri);
  if (canli.length === 0) return sonuc;
  const isler = await degisimliIsler(db, simdi);
  if (isler.size === 0) return sonuc;
  const canlida = new Set(canli.map((y) => y.isEmriId));
  for (const i of await planlanacakIsler(db, { taslakDahil: true })) {
    if (canlida.has(i.id) && isler.has(`${i.emirNo}|${String(i.opNo)}`)) sonuc.set(i.id, { durum: 'yok', secildi: true });
  }
  return sonuc;
}
