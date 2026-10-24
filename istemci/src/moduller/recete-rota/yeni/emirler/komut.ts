import { useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { RrHatasi, useRrKomutu, type KomutGovdesi, type RrDurumu } from '../veri.ts';

// R3 komutları: köprünün komutu sırayla gider; başarıda iletisi bildirilir. Hata sahibinin iletisidir ve uyarı satırında kalır (bugünkü
// ekran gibi); eski sürümde veri kendiliğinden yeniden okunur, kullanıcı işlemi yeniden yapar.
export interface KomutCevabi { tamam: boolean; sonuc: unknown; durum: RrDurumu | null }
export interface EmirUyarisi { metin: string; eskiSurum: boolean }

export function useEmirKomutu() {
  const komut = useRrKomutu();
  const { bildir } = useBildirim();
  const [uyari, setUyari] = useState<EmirUyarisi | null>(null);
  const calistir = async (ad: string, govde: KomutGovdesi, basari?: string): Promise<KomutCevabi> => {
    try {
      const c = await komut.mutateAsync({ ad, govde });
      setUyari(null);
      if (basari) bildir('tamam', basari);
      return { tamam: true, sonuc: c.sonuc, durum: c.durum };
    } catch (h) {
      const r = h instanceof RrHatasi ? h : new RrHatasi(h);
      setUyari({ metin: r.message, eskiSurum: r.eskiSurum });
      bildir('hata', r.message);
      return { tamam: false, sonuc: null, durum: null };
    }
  };
  return { calistir, bildir, mesgul: komut.isPending, uyari, uyariKapat: () => { setUyari(null); } };
}

// Komuttan sonra emrin güncel sürümü: köprünün okuduğu durumdan; okunamadıysa null (bir sonraki komut sunucuda reddedilir).
export const guncelSurum = (durum: RrDurumu | null, id: string): number | null =>
  durum?.emirler?.orders.find((o) => o.id === id)?.surum ?? null;

// Açılan emrin kimliği (emre kopyala ve rotasız emir aynı alanı döner).
export const acilanEmir = (sonuc: unknown): string | null => {
  const id = (sonuc as { uretimEmriId?: unknown } | null)?.uretimEmriId;
  return typeof id === 'number' ? String(id) : null;
};
