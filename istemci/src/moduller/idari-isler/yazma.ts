import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AracGorevi, AracGoreviCevabi, Kontrol, KontrolCevabi, Talep, TalepCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

export const ESKI_SURUM_ILETISI = 'Kayıt başkası tarafından değişti; liste yenilendi.';

// Düğmeler yalnız işlemi olana görünür; asıl denetim ve durum kuralı sunucudadır, reddi ekranda yazılır.
export const useIslemVar = (islem: Islem): boolean => (useOturum().data?.islemler ?? []).includes(islem);
export const useOturumHazir = (): boolean => useOturum().data !== undefined;

export function yazmaIletisi(hata: unknown, varsayilan: string): string {
  return hata instanceof ApiHatasi && eskiSurumMu(hata.govde) ? ESKI_SURUM_ILETISI : hataIletisi(hata, varsayilan);
}

export type TalepKomutu = 'ustlen' | 'birak' | 'kapat' | 'reddet' | 'geri-cek';

// Durum komutu: gövde talebin sürümünü taşır; başarı ya da sürüm çakışmasından sonra modülün bütün sorguları yenilenir.
export function useTalepKomutu() {
  const istemci = useQueryClient();
  return async (talep: Pick<Talep, 'id' | 'surum'>, komut: TalepKomutu, ek: object = {}): Promise<Talep> => {
    try {
      return (await api.post<TalepCevabi>(`/idari-isler/talepler/${talep.id}/${komut}`, { surum: talep.surum, ...ek })).talep;
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    }
  };
}

// Talep açma tekrar korumalıdır: sonucu bilinmeyen hatadan sonra aynı gövde aynı kimlikle gider, talep bir kez açılır.
export function useKorumaliGonderim() {
  const son = useRef<{ anahtar: string; kimlik: string } | null>(null);
  return async <T>(yol: string, govde: object): Promise<T> => {
    const anahtar = `${yol} ${JSON.stringify(govde)}`;
    const istekKimligi = son.current?.anahtar === anahtar ? son.current.kimlik : yeniIstekKimligi();
    son.current = { anahtar, kimlik: istekKimligi };
    try {
      const cevap = await tekrarKorumaliGonder((deneme) => api.post<T>(yol, govde, deneme), { istekKimligi });
      son.current = null;
      return cevap;
    } catch (hata) {
      if (!yenidenDenenebilirMi(hata)) son.current = null;
      throw hata;
    }
  };
}

// Kontrol komutu: gövde kalemin sürümünü taşır; sonrasında modülün bütün sorguları (Bugün, liste, kayıtlar) yenilenir.
export function useKontrolKomutu() {
  const istemci = useQueryClient();
  return async (kontrol: Pick<Kontrol, 'id' | 'surum'>, komut: 'yapildi' | 'guncelle' | 'bitir', govde: object): Promise<Kontrol> => {
    try {
      return (await api.post<KontrolCevabi>(`/idari-isler/kontroller/${kontrol.id}/${komut}`, { surum: kontrol.surum, ...govde })).kontrol;
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    }
  };
}

export type GorevKomutu = 'onayla' | 'reddet' | 'geri-cek' | 'cikis' | 'donus';

// Araç görevi komutu: gövde görevin sürümünü taşır; sonrasında modülün bütün sorguları (görevler, araçlar, sayaçlar) yenilenir.
export function useGorevKomutu() {
  const istemci = useQueryClient();
  return async (gorev: Pick<AracGorevi, 'id' | 'surum'>, komut: GorevKomutu, ek: object = {}): Promise<AracGorevi> => {
    try {
      return (await api.post<AracGoreviCevabi>(`/idari-isler/arac-gorevleri/${gorev.id}/${komut}`, { surum: gorev.surum, ...ek })).gorev;
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    }
  };
}
