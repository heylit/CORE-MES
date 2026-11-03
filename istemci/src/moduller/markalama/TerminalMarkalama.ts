import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type {
  BirimlerCevabi, EmirOzetiCevabi, MarkalaGovdesi, MarkalamaBirimi, MarkalamaTanimi, OnizlemeCevabi, TanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import { api } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Terminalin markalama işi: rotalı emrin bir operasyonu ve terminalin istasyonu. Terminal ekranı kendi görünümünü çizer;
// seri, sayaç ve doğrulama bu modülün sunucusundadır (UYUM-BORCU 4). Seri yalnız markalama istasyonunda verilir (2036).
export interface TerminalMarkalamaIsi { uretimEmriId: number; opNo: number; malzemeId: number; istasyonKodu: string }

export const TERMINAL_SON_SERI_SAYISI = 12;

export interface TerminalMarkalamaVerisi {
  // Bu malzeme ve operasyon için aktif tanım yoksa boş: terminal seri vermez.
  tanim: MarkalamaTanimi | null;
  istasyonId: number | null;
  // Sayacı tüketmeyen öngörü; markalama anında sunucu yeniden hesaplar.
  siradakiler: readonly string[];
  sonSeriler: readonly MarkalamaBirimi[];
  // Tanım yoksa sayılmaz: boş (sıfır uydurulmaz).
  sayilar: { saglam: number; hurda: number; dogrulanan: number } | null;
}

// Terminalin bütün okuması burada ve tek sözdür: okuma yolu (yetki kararı 2048) değişirse yalnız bu işlev değişir.
export async function terminalMarkalamaOku(is: TerminalMarkalamaIsi): Promise<TerminalMarkalamaVerisi> {
  const [tanimlar, istasyonlar] = await Promise.all([
    api.get<TanimlarCevabi>(`/markalama/tanimlar?malzemeId=${is.malzemeId}`),
    api.get<IstasyonSecimiCevabi>('/istasyonlar/secim'),
  ]);
  const tanim = tanimlar.tanimlar.find((t) => t.aktif && t.opNo === is.opNo) ?? null;
  const istasyonId = istasyonlar.gruplar.flatMap((g) => g.istasyonlar).find((i) => i.kod === is.istasyonKodu)?.id ?? null;
  if (tanim === null) return { tanim, istasyonId, siradakiler: [], sonSeriler: [], sayilar: null };
  const [onizleme, ozet, birimler] = await Promise.all([
    api.get<OnizlemeCevabi>(`/markalama/tanimlar/${tanim.id}/onizleme?emirId=${is.uretimEmriId}`),
    api.get<EmirOzetiCevabi>(`/markalama/emirler/${is.uretimEmriId}/ozet?tanimId=${tanim.id}`),
    api.get<BirimlerCevabi>(`/markalama/birimler?emirId=${is.uretimEmriId}&tanimId=${tanim.id}`),
  ]);
  return {
    tanim, istasyonId, siradakiler: onizleme.numaralar, sonSeriler: birimler.birimler.slice(0, TERMINAL_SON_SERI_SAYISI),
    sayilar: { saglam: ozet.sayilar.saglam, hurda: ozet.sayilar.hurda, dogrulanan: ozet.dogrulanan },
  };
}

export const terminalAnahtari = (is: TerminalMarkalamaIsi) =>
  [...anahtarlar.kok, 'terminal', is.uretimEmriId, is.opNo, is.malzemeId, is.istasyonKodu] as const;

export interface TerminalMarkalama {
  veri: TerminalMarkalamaVerisi | undefined;
  okunuyor: boolean;
  okumaHatasi: unknown;
  yazabilir: boolean;
  // Seri sunucuda sayaçtan doğar; ağ koparsa aynı istek kimliğiyle yeniden gider, çift dokunuş ikinci numarayı yakmaz.
  // Gönderim sürerken gelen çağrı null döner: sayım ve bildirim yalnız ilk dokunuşta yapılır.
  markala: (sonuc: MarkalaGovdesi['sonuc']) => Promise<MarkalamaBirimi | null>;
  markalaniyor: MarkalaGovdesi['sonuc'] | null;
  dogrula: (seriNo: string) => Promise<MarkalamaBirimi>;
  dogrulaniyor: boolean;
}

export function useTerminalMarkalama(is: TerminalMarkalamaIsi | null): TerminalMarkalama {
  const istemci = useQueryClient();
  const yazabilir = useOturum().data?.islemler.includes('markalama.seri-ver') === true;
  const okuma = useQuery({
    queryKey: is === null ? [...anahtarlar.kok, 'terminal', null] : terminalAnahtari(is),
    queryFn: () => terminalMarkalamaOku(is!),
    enabled: is !== null,
    retry: false,
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.kok });
  const markalaKomutu = useKorumaliKomut<MarkalaGovdesi['sonuc'], MarkalamaBirimi>({
    gonder: (sonuc, deneme) => {
      const v = okuma.data;
      if (is === null || v?.tanim == null) return Promise.reject(new Error('Bu iş için markalama tanımı yok.'));
      const govde: MarkalaGovdesi = { tanimId: v.tanim.id, uretimEmriId: is.uretimEmriId, istasyonId: v.istasyonId, sonuc };
      return api.post<MarkalamaBirimi>('/markalama/birimler/markala', govde, deneme);
    },
    onSettled: () => { void yenile(); },
  });
  const suruyor = useRef(false);
  const markala = async (sonuc: MarkalaGovdesi['sonuc']): Promise<MarkalamaBirimi | null> => {
    if (suruyor.current) return null;
    suruyor.current = true;
    try { return await markalaKomutu.mutateAsync(sonuc); } finally { suruyor.current = false; }
  };
  const dogrulaKomutu = useMutation({
    mutationFn: (seriNo: string) => {
      const tanim = okuma.data?.tanim;
      if (tanim == null) return Promise.reject(new Error('Bu iş için markalama tanımı yok.'));
      return api.post<MarkalamaBirimi>('/markalama/birimler/dogrula', { tanimId: tanim.id, seriNo });
    },
    onSettled: () => { void yenile(); },
  });
  return {
    veri: okuma.data,
    okunuyor: okuma.isPending && is !== null,
    okumaHatasi: okuma.error,
    yazabilir,
    markala,
    markalaniyor: markalaKomutu.isPending ? markalaKomutu.variables ?? null : null,
    dogrula: (seriNo) => dogrulaKomutu.mutateAsync(seriNo),
    dogrulaniyor: dogrulaKomutu.isPending,
  };
}
