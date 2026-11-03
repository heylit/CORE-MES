import type { Tezgah as SunucuTezgahi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { glbYaz } from '../../glb.ts';
import { kullanilabilir, tezgahKimligi, tezgahSatiri } from '../tezgah-satiri.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';
import { build, dispose } from './cnc3d.ts';

// Çizim Merkezi'nin CNC makineleri sayfası (1135 a) modeli bu ekranın sahnesinden üretir. Makineler İstasyonlar'ın aktif CNC makine
// kayıtlarıdır (1986, 1988 b), CNC Kurulum'daki ayar ve seçilen katalog modeliyle; ayarı eksik olan listede kalır, modeli üretilmez.
// Gömülü liste ve kayıttaki elle eklenen makineler kullanılmaz.
// Düzeltmeler (`mo`) sayfanın okuduğu kayıt metninden ayrıştırılır; ekranın genel durumu (depo.ts) kurulmaz, çünkü sayfa CNC Kurulum'un
// dışındadır ve kayıt yazmaz.

// eksik: tip, kontrol, bağlantı, cep ya da devir bilinmiyor; CNC Kurulum > Tanımlar'da tamamlanır.
export interface MakineOzeti { makineId: string; no: string | null; ad: string; istasyonId: number | null; eksik: boolean }

// Ad ve numara ekranın gösterdiğiyle aynıdır.
export interface ModelIletisi extends MakineOzeti { glb: Uint8Array }

type Makine = Partial<Tezgah> & { id: string; eksik: boolean };

function duzeltmeler(metin: string | undefined): Record<string, Partial<Tezgah> | undefined> {
  if (metin === undefined) return {};
  try {
    const d = JSON.parse(metin) as { mo?: unknown } | null;
    return d !== null && typeof d === 'object' && d.mo !== null && typeof d.mo === 'object' ? d.mo as Record<string, Partial<Tezgah>> : {};
  } catch { return {}; }
}

// Aktif makineler, sıra sunucununkidir. Ayarı eksik olan, ekranın listesinde olmasa da (secici.ts allMachines) burada görünür.
function makineler(tezgahlar: readonly SunucuTezgahi[], metin: string | undefined): Makine[] {
  const mo = duzeltmeler(metin);
  return tezgahlar.filter((t) => t.aktif).map((t) => tezgahSatiri(t, mo[tezgahKimligi(t)]))
    .map((x) => ({ ...x.tezgah, eksik: !kullanilabilir(x) }));
}

// Ad numarasızdır: belge adı numarayı ayrıca önüne koyar (belgeAdi).
const ozet = (m: Makine): MakineOzeti => ({
  makineId: m.id,
  no: typeof m.no === 'string' && m.no !== '' ? m.no : null,
  ad: typeof m.name === 'string' && m.name !== '' ? m.name : m.id,
  istasyonId: typeof m.istasyonId === 'number' ? m.istasyonId : null,
  eksik: m.eksik,
});

export function makineListesi(tezgahlar: readonly SunucuTezgahi[], metin: string | undefined): MakineOzeti[] {
  return makineler(tezgahlar, metin).map(ozet);
}

export function modelUret(makineId: string, tezgahlar: readonly SunucuTezgahi[], metin: string | undefined): ModelIletisi {
  const m = makineler(tezgahlar, metin).find((x) => x.id === makineId);
  if (m?.eksik) throw new Error('Makinenin ayarı eksik; CNC Kurulum > Tanımlar\'da tamamlayın.');
  if (!m || typeof m.kind !== 'string') throw new Error('Makine modeli bulunamadı.');
  const o = ozet(m);
  const kok = build({ id: o.makineId, name: o.ad, kind: m.kind } as Kalem);
  try {
    return { ...o, glb: glbYaz(kok, o.ad) };
  } finally {
    dispose(kok);
  }
}
