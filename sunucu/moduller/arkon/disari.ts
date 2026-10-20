import type { Db } from '#cekirdek/db.ts';
import type { ArkonKayitTuru } from '#paylasilan/sozlesme/arkon.ts';
import { yayindakiBelgeDosyasi } from '../cizimler/disari.ts';
import { emirCizimDurumu, paketMerkezDosyalari } from './kurallar.ts';
import type { EmirCizimDurumu } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

export type { EmirCizimDurumu } from './kurallar.ts';

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
