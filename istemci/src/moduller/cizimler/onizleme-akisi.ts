import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OnizlemeGovdesi, Revizyon } from '#paylasilan/sozlesme/cizimler.ts';
import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { dosyaYukle, ikiliOku } from './dosya-aktarimi.ts';
import { AZAMI_MODEL_BAYT, OnizlemeAtlandi, kareKaynagi, webglVarMi } from './onizleme-kurallari.ts';

type UretilecekRevizyon = Pick<Revizyon, 'id' | 'harf' | 'dosyaTuru' | 'boyut' | 'onizlemeKareSayisi'>;

// Revizyon dosyasından kareleri üretir: 3B modelde dönen kareler, PDF ve fotoda tek kare. Ağır kütüphaneler yalnız burada iner.
async function kareleriUret(veri: Uint8Array, tur: DosyaTuru): Promise<Uint8Array[]> {
  const kaynak = kareKaynagi(tur);
  if (kaynak === 'model') {
    const { onizlemeKareleri } = await import('./goruntu/onizleme.ts');
    return onizlemeKareleri(veri, tur as 'step' | 'iges' | 'stl' | 'glb' | 'gltf');
  }
  const { fotoKaresi, pdfKaresi } = await import('./goruntu/kucuk-resim.ts');
  if (kaynak === 'pdf') return [await pdfKaresi(veri)];
  if (kaynak === 'foto') return [await fotoKaresi(veri)];
  throw new OnizlemeAtlandi('Bu dosya türünden önizleme üretilmez.');
}

// Üretime başlamadan bilinen engel (dosya büyük, cihazda üç boyutlu çizim yok): üretilmemesi karar, hata değil.
export function onizlemeEngeli(r: UretilecekRevizyon): string | null {
  const kaynak = kareKaynagi(r.dosyaTuru);
  if (kaynak === null) return 'Bu dosya türünden önizleme üretilmez.';
  if (kaynak === 'model' && r.boyut > AZAMI_MODEL_BAYT) return `Revizyon ${r.harf} 25 MB sınırından büyük; önizleme üretilmedi.`;
  if (kaynak === 'model' && !webglVarMi()) return 'Bu cihazda üç boyutlu çizim yok; önizleme üretilmedi.';
  return null;
}

// Revizyonun karelerini üretir, yükler ve `yazmaYolu`na bildirir. Dosya `dosyaYolu`ndan okunur ya da elde varsa verilir.
export async function onizlemeGonder(
  r: UretilecekRevizyon, g: { dosyaYolu: string; yazmaYolu: string; veri?: Uint8Array },
): Promise<void> {
  const engel = onizlemeEngeli(r);
  if (engel !== null) throw new OnizlemeAtlandi(engel);
  const veri = g.veri ?? await ikiliOku(g.dosyaYolu);
  const kareler = await kareleriUret(veri, r.dosyaTuru);
  const govde: OnizlemeGovdesi = { kareler: [] };
  for (const [kare, icerik] of kareler.entries()) govde.kareler.push({ kare, ozet: await dosyaYukle(icerik, () => {}) });
  await api.post<unknown>(g.yazmaYolu, govde);
}

// Önizleme yayının parçası değil, yayından sonraki arka plan işidir: hata yayını geri almaz, yalnız bildirimle uyarır.
export function useOnizleme() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [uretilen, uretilenYaz] = useState<number | null>(null);
  const calisiyor = useRef(false);

  const uret = useCallback(async (belgeId: number, r: UretilecekRevizyon): Promise<void> => {
    if (kareKaynagi(r.dosyaTuru) === null || calisiyor.current) return;
    const engel = onizlemeEngeli(r);
    if (engel !== null) { bildir('bilgi', engel); return; }
    calisiyor.current = true;
    uretilenYaz(r.id);
    try {
      await onizlemeGonder(r, {
        dosyaYolu: `/cizimler/${belgeId}/revizyonlar/${r.id}/dosya`, yazmaYolu: `/cizimler/${belgeId}/revizyonlar/${r.id}/onizleme`,
      });
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', `Revizyon ${r.harf} önizlemesi hazır.`);
    } catch (e) {
      bildir('hata', e instanceof OnizlemeAtlandi ? e.message : hataIletisi(e, 'Önizleme üretilemedi; belge etkilenmedi.'));
    } finally {
      calisiyor.current = false;
      uretilenYaz(null);
    }
  }, [bildir, istemci]);

  return { uret, uretilen };
}
