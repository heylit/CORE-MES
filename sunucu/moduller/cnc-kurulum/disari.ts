import type { Db } from '#cekirdek/db.ts';
import type { Kayit } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { isEmriPlanBilgileri } from '../uretim-emirleri/disari.ts';
import { SON_ONAY_ADIMI } from './kurallar.ts';
import { takimOmruDurumlari } from './servis.ts';
import { isEmriHazirlikOzetleri, kayitGetir, makineModelTurleri as modelTurleriniOku, secilmisIsEmirleri } from './sorgular.ts';

// Bağlamada (Aşama 2) başka modül bu modülün kaydını yalnız buradan okur; yazma dışarı açılmaz. Prototipin durumu
// `cnc-kurulum-motoru.v1` anahtarındadır (alanları ORTAKLIK-cnc-kurulum.md'de).
export const DURUM_ANAHTARI = 'cnc-kurulum-motoru.v1';

export async function cncKurulumDurumu(db: Db): Promise<Kayit | null> {
  return kayitGetir(db, DURUM_ANAHTARI);
}

// İş emrinin (operasyonun) CNC hazırlık durumu (karar 266 a). Üretim emirlerinin hazırlık durdurucusu (karar 120 a; 16.10'daki
// "kilit yok" kararının yerine geçti): iş emri CNC kurulumunda seçildiyse (secildi) ve durum 'tamam' değilse başlatma durur.
// Terminal uyarısı CNC istasyonundaki her iş emrinde sürer. yok: hiç hazırlık adımı onaylanmadı; suruyor: onay var, hazırlık
// tamamlanmadı ya da tamamlandıktan sonra geri alındı; tamam: son onay verildi (zaman dolu). secildi: iş emri şu an seçili,
// saklanan kurulumu ya da hazırlık kaydı var. 266 a öncesinin emir düzeyindeki onayları hiçbir iş emrini hazır saymaz.
export type EmirHazirlikDurumu = { durum: 'yok' | 'suruyor' | 'tamam'; zaman: string | null; secildi: boolean };

const durumlariKur = (idler: readonly number[], secilmis: ReadonlySet<number>, ozetler: readonly { id: number; sonOlay: string | null; zaman: string | null }[]) => {
  const harita = new Map<number, EmirHazirlikDurumu>(idler.map((id) => [id, { durum: 'yok', zaman: null, secildi: secilmis.has(id) }]));
  for (const o of ozetler) {
    const secildi = secilmis.has(o.id);
    harita.set(o.id, o.sonOlay === 'tamam' ? { durum: 'tamam', zaman: o.zaman, secildi } : { durum: 'suruyor', zaman: null, secildi });
  }
  return harita;
};

// Toplu okuma (Terminal iş emri listesini tek seferde okur): istenen her iş emri haritada olur, kurulumda hiç onayı olmayan 'yok'.
export async function isEmriHazirlikDurumlari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, EmirHazirlikDurumu>> {
  const idler = [...new Set(isEmriIdleri)];
  const ozetler = await isEmriHazirlikOzetleri(db, idler, SON_ONAY_ADIMI);
  return durumlariKur(idler, new Set(await secilmisIsEmirleri(db, idler)), ozetler.map((o) => ({ id: o.isEmriId, sonOlay: o.sonOlay, zaman: o.zaman })));
}

export async function isEmriHazirlikDurumu(db: Db, isEmriId: number): Promise<EmirHazirlikDurumu> {
  return (await isEmriHazirlikDurumlari(db, [isEmriId])).get(isEmriId) ?? { durum: 'yok', zaman: null, secildi: false };
}

// Makinenin Tanımlar'da seçilen 3B görünümü (`model_turu`, 2100-2 a): Atölye haritası gövdeyi buna göre çizer; bağ
// kablolama.ts'tedir. Seçimi olmayan makine haritada yoktur.
export async function makineModelTurleri(db: Db, makineIdleri: readonly number[]): Promise<Map<number, string>> {
  const idler = [...new Set(makineIdleri)];
  if (!idler.length) return new Map();
  return new Map((await modelTurleriniOku(db, idler)).map((r) => [r.makineId, r.modelTuru]));
}

// Takım ömrü (295 a). Sayım dinleyicisi kablolama.ts'te Üretim emirlerinin sağlam ve hurda sayımına bağlanır. Okuyucu istasyon
// başına yüklü cepleri verir; ömür hedefi yoksa kalan pay ve durum null'dur.
export { takimOmruDurumlari, takimSayimiYansit } from './servis.ts';
export type { TakimOmruDurumu, TakimSayimOlayi } from './servis.ts';
export { malzemeKartiIzleri } from './sorgular.ts';

// Hazırlık matrisinin takım ömrü maddesi (2146-1 a, yalnız uyarır): iş emrinin istasyonuna yüklü, ömür hedefi olan takımlardan biri
// kritik (kalan pay yüzde 20'nin altında) ya da ömrünü doldurmuşsa eksiktir. Hedefli takımı olmayan istasyonda madde gerekmez.
// Bağı kablolama.ts kurar; yetki denetlemez.
export async function isEmriTakimHazirliklari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, { durum: 'yok' | 'tamam'; secildi: boolean }>> {
  const planlar = await isEmriPlanBilgileri(db, isEmriIdleri);
  const istasyonlar = [...new Set([...planlar.values()].flatMap((p) => (p.istasyonId === null ? [] : [p.istasyonId])))];
  const takimlar = istasyonlar.length === 0 ? [] : (await takimOmruDurumlari(db, istasyonlar)).filter((t) => t.durum !== null);
  const sonuc = new Map<number, { durum: 'yok' | 'tamam'; secildi: boolean }>();
  for (const [id, p] of planlar) {
    const burada = takimlar.filter((t) => t.istasyonId === p.istasyonId);
    sonuc.set(id, burada.length === 0 ? { durum: 'yok', secildi: false }
      : { durum: burada.some((t) => t.durum === 'crit' || t.durum === 'over') ? 'yok' : 'tamam', secildi: true });
  }
  return sonuc;
}
