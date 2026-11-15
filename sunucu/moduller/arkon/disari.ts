import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { ArkonKayitTuru } from '#paylasilan/sozlesme/arkon.ts';
import { yayindakiBelgeDosyasi } from '../belge-merkezi/disari.ts';
import { HAZIRLIK_MADDESI_ILETILERI, ekMaddeHazirligi, emirCizimDurumu, isEmriYayinda, paketMerkezDosyalari, periyodikBakimPlanlari } from './kurallar.ts';
import type { EmirCizimDurumu, PeriyodikBakimPlani } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import { hazirlikMaddesiIsaretle } from './servis.ts';

export type { EmirCizimDurumu, PeriyodikBakimPlani } from './kurallar.ts';

// Arkon terminal olayı: `istasyonKodu` Arkon'un `machine` alanıdır ve TMI istasyon kodudur (makine kodu değil); kod çözülemediyse
// `istasyonId` boştur. Yetki ve veri kapsamı çağıran ucun işidir: bu okuma kişiye göre süzmez.
export interface ArkonSonOlay {
  id: number;
  tur: Exclude<ArkonKayitTuru, 'audit'>;
  zaman: Date;
  istasyonKodu: string | null;
  istasyonId: number | null;
  emirNo: string | null;
  kisiId: number;
}

const EN_COK = 200;

// En yeni önce. Yoklayan, son gördüğü `id`'yi `sonraId` olarak verir; `sonra` olayın kendi zamanına göre süzer.
export async function sonOlaylar(
  db: Db, g: { sonra?: Date | null; sonraId?: number | null; sinir?: number } = {},
): Promise<ArkonSonOlay[]> {
  const sinir = Math.min(EN_COK, Math.max(1, Math.trunc(g.sinir ?? 50)));
  const satirlar = await sorgular.sonOlaylar(db, g.sonra ?? null, g.sonraId ?? null, sinir);
  return satirlar.map((s) => ({
    id: s.id, tur: s.tur as ArkonSonOlay['tur'], zaman: s.zaman, istasyonKodu: s.istasyon_kodu, istasyonId: s.istasyon_id, emirNo: s.emir_no, kisiId: s.kisi_id,
  }));
}

// Üretim Hazırlık'ın istasyon sırası (kart 527), sıra numarasıyla: terminal bu sıradaki işi önce, sırasız işi canlı plan sırasıyla gösterir
// (`istasyonPaketleri`). Saat "sıradaki iş"i bununla terminalin sırasını izler (3a). Satır işin bugünkü istasyonunda geçerlidir; işin
// istasyonunu çağıran denetler (paket okumasındaki kural). Tablo açık işler kadardır, süzme burada. Yetki çağıran ucun işidir.
export interface HazirlikSirasi { isEmriId: number; parcaNo: number; sira: number }
export async function istasyonHazirlikSirasi(db: Db, istasyonId: number): Promise<HazirlikSirasi[]> {
  return (await sorgular.kuyrukSiralari(db))
    .filter((k) => k.istasyonId === istasyonId)
    .sort((a, b) => a.sira - b.sira)
    .map(({ isEmriId, parcaNo, sira }) => ({ isEmriId, parcaNo, sira }));
}

// 2227: iş emri paketinin yayını, hazırlık maddesi olarak (toplu); kural kayıt kapısıyla aynı (2189-1 a, kurallar.ts `isEmriYayinda`).
// İstenen her iş emri haritada olur. Yetki çağıran ucun işidir.
export async function isEmriYayinDurumlari(db: Db, isEmriIdler: readonly number[]): Promise<Map<number, { durum: 'yok' | 'tamam'; secildi: true }>> {
  const tekil = [...new Set(isEmriIdler)];
  const satirlar = tekil.length === 0 ? [] : await sorgular.isEmriPaketDurumlari(db, tekil);
  return new Map(tekil.map((id) => {
    return [id, { durum: isEmriYayinda(satirlar.filter((r) => r.is_emri_id === id)) ? 'tamam' : 'yok', secildi: true }];
  }));
}

// 2227-1 b: iş emrine özel hazırlık maddeleri, hazırlık maddesi olarak (toplu). İstenen her iş emri haritada olur; maddesi olmayan
// "gerekmez" (secildi false). Yetki çağıran ucun işidir.
export async function isEmriEkMaddeDurumlari(db: Db, isEmriIdler: readonly number[]): Promise<Map<number, { durum: 'yok' | 'suruyor' | 'tamam'; secildi: boolean }>> {
  const tekil = [...new Set(isEmriIdler)];
  const satirlar = tekil.length === 0 ? [] : await sorgular.hazirlikMaddeleri(db, tekil);
  return new Map(tekil.map((id) => [id, ekMaddeHazirligi(satirlar.filter((r) => r.isEmriId === id))]));
}

// Denetim #34: emrin hazırlık paketlerindeki merkez çizimlerinin durumu (toplu). İstenen her emir haritada olur; paketi ya da merkez çizimi
// olmayan 'yok'. Yetki çağıran ucun işidir.
export async function emirCizimDurumlari(db: Db, emirIdler: readonly number[]): Promise<Map<number, EmirCizimDurumu>> {
  const tekil = [...new Set(emirIdler)];
  const paketler = new Map<number, { dosyalar: ReturnType<typeof paketMerkezDosyalari>; degisti: string }[]>(tekil.map((id) => [id, []]));
  for (const p of tekil.length === 0 ? [] : await sorgular.emirPaketleri(db, tekil)) {
    paketler.get(p.emir_id)?.push({ dosyalar: paketMerkezDosyalari(p.govde), degisti: p.degisti });
  }
  const yayinda = new Map<number, string | null>();
  for (const { belgeId } of [...paketler.values()].flat().flatMap((p) => p.dosyalar)) {
    if (!yayinda.has(belgeId)) yayinda.set(belgeId, (await yayindakiBelgeDosyasi(db, belgeId))?.ozet ?? null);
  }
  return new Map(tekil.map((id) => [id, emirCizimDurumu(paketler.get(id) ?? [], yayinda)]));
}

// 2319 (S10): periyodik bakım planları plan girdisine (plan ADR 0006 gereği Arkon'u okumaz; bağ sunucu/kablolama.ts'te). Yetki çağıranın işidir.
export async function periyodikBakimlar(db: Db): Promise<PeriyodikBakimPlani[]> {
  return periyodikBakimPlanlari(await sorgular.periyodikBakimBelgeleri(db));
}

// 3249-2 a: Adım Durumu ek maddeleri tek tek gösterir ve işaretler (bağı kablolama.ts kurar; uretim-emirleri Arkon'u ithal edemez).
// Liste ekleniş sırasıyladır, kaldırılan madde yoktur. Yazım Üretim Hazırlık'ın kendi komutuyla (aynı kilit, kapalı iş emri ve aynı hâl
// reddi) yapılır; madde verilen iş emrinin değilse bulunamadı. Yetki çağıran ucun işidir (Risk K1: iki yetki birlikte).
export interface EkMadde { id: number; ad: string; tamam: boolean; ekleyenId: number; tamamlayanId: number | null; tamamlanma: string | null }
export async function isEmriEkMaddeleri(db: Db, isEmriIdler: readonly number[]): Promise<Map<number, EkMadde[]>> {
  const tekil = [...new Set(isEmriIdler)];
  const sonuc = new Map<number, EkMadde[]>(tekil.map((id) => [id, []]));
  for (const r of tekil.length === 0 ? [] : await sorgular.hazirlikMaddeleri(db, tekil)) {
    sonuc.get(r.isEmriId)?.push({ id: r.id, ad: r.ad, tamam: r.tamam, ekleyenId: r.kisiId, tamamlayanId: r.tamamlayanId, tamamlanma: r.tamamlanma });
  }
  return sonuc;
}
export async function isEmriEkMaddesiIsaretle(db: Db, kullanici: Kullanici, isEmriId: number, maddeId: number, tamam: boolean): Promise<void> {
  const madde = await sorgular.hazirlikMaddesiBul(db, maddeId);
  if (madde === null || madde.isEmriId !== isEmriId) throw bulunamadi(HAZIRLIK_MADDESI_ILETILERI.maddeYok);
  await hazirlikMaddesiIsaretle(db, kullanici, maddeId, tamam ? 'tamamla' : 'geri-al');
}
