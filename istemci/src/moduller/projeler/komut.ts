import { useRef } from 'react';
import type { Islem } from '#paylasilan/islemler.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Tekrar korumalı komutun kimliği pencere açıkken korunur: sonucu bilinmeyen gönderimden (ağ, zaman aşımı, 5xx) sonra aynı
// kimlikle yeniden gider, kayıt iki kez yazılmaz. Sunucunun reddettiği (4xx) gönderimden sonra yenilenir: düzeltilmiş gövde
// eski kimliğin saklanan ret cevabına takılmaz.
export function useIstekKimligi() {
  const kimlik = useRef<string | null>(null);
  return {
    al: () => (kimlik.current ??= yeniIstekKimligi()),
    hataSonrasi: (hata: unknown) => { if (!yenidenDenenebilirMi(hata)) kimlik.current = null; },
  };
}

// Yönetim yazmaları projenin yönetim görünümünü döner; liste ve başlık da statü ve ilerleme gösterdiği için tazelenir.
export function useYonetimKomutu<D>(
  projeId: number,
  gonder: (veri: D, istekKimligi: string) => Promise<ProjeYonetimiCevabi>,
  bitti: () => void,
) {
  const istemci = useQueryClient();
  const kimlik = useIstekKimligi();
  return useMutation({
    mutationFn: (veri: D) => gonder(veri, kimlik.al()),
    onSuccess: async (cevap) => {
      istemci.setQueryData(anahtarlar.yonetim(projeId), cevap);
      await istemci.invalidateQueries({ queryKey: ['projeler', 'liste'] });
      await istemci.invalidateQueries({ queryKey: anahtarlar.ayrinti(projeId) });
      bitti();
    },
    onError: kimlik.hataSonrasi,
  });
}

export function useIslemVar(islem: Islem): boolean {
  return useOturum().data?.islemler.includes(islem) === true;
}

export const bosIseNull = (m: string): string | null => (m.trim() === '' ? null : m.trim());
// Boş alan null'dır; sayıya çevrilemeyen metin NaN gider ve sunucu şeması reddeder.
export const sayiYaDaNull = (m: string): number | null => (m === '' ? null : Number(m));
