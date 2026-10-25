import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { DurumCevabi, Kayit, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { api } from '../../../ortak/veri/api.ts';
import { IZINLI_KOMUTLAR, kopruHatasi, type KaynakEki, type KopruIsleyici, type StokOkumasi } from '../kopru.ts';

// Yeni Reçete ve Rota ekranının veri katmanı. Okuma ve yazma bugünkü köprünün TS tarafıdır (kopru.ts): aynı uçlar, aynı sürüm sırası,
// aynı yetki sınırı. Çerçeve ve kayıt belgesi (`recete_rota_kayit`) yeni ekranda yazılmaz; belgedeki eski kalemler yalnız okunur (204 a).
// Köprü örneği ekran başına tektir (sürümler onun içinde tutulur); ReceteRotaYeni.tsx kurar, parçalar bu kancalarla kullanır.

// Girdi başına motorun bitişi (468/2 a) köprüde eklenir; motor cevabında yoksa alan da yoktur.
export type EkranYerlesimi = Record<string, Array<MotorYerlesimiCevabi['ekranYerlesimi'][string][number] & { bitis?: string }>>;
// planYerlesim: plan motorunun yerleşimi (215 a: emir tarihleri buradan). Okunamazsa null ve `motorOkunamadi` true; tarih boş gösterilir.
export type RrDurumu = DurumCevabi & { planYerlesim: EkranYerlesimi | null };
export interface RrVerisi { durum: RrDurumu; ek: KaynakEki }

export const RR_ANAHTARI = ['recete-rota', 'yeni'] as const;
export const anahtarlar = {
  veri: [...RR_ANAHTARI, 'veri'] as const,
  eskiKayit: [...RR_ANAHTARI, 'eski-kayit'] as const,
  stok: (idler: readonly number[]) => [...RR_ANAHTARI, 'stok', idler.join(',')] as const,
  sureler: (revizyonId: number, makineId: number | null) => [...RR_ANAHTARI, 'sureler', revizyonId, makineId] as const,
};

// Köprü komutunun adı: tablo kopru.ts IZINLI_KOMUTLAR'dır (rota, emir, kaynak, statü, stok, maliyet). Tabloda olmayan ad gönderilmez.
export type KomutAdi = string;
export const komutVarMi = (ad: KomutAdi): boolean => Object.hasOwn(IZINLI_KOMUTLAR, ad);
export type KomutGovdesi = Record<string, unknown>;

// Komut ve okuma hatası: sunucu iletisi, durum kodu, eski sürüm (başkası değiştirdi) ve reddedilen alan (ör. adimlar.2.islemSuresiDk).
export class RrHatasi extends Error {
  readonly durum: number;
  readonly eskiSurum: boolean;
  readonly alan: string | null;
  constructor(hata: unknown) {
    const k = kopruHatasi(hata);
    super(k.hata);
    this.name = 'RrHatasi';
    this.durum = k.durum;
    this.eskiSurum = k.eskiSurum === true;
    this.alan = k.alan ?? null;
  }
}

// Ekranın köprüsü ve köprünün bildirdiği iki durum. ReceteRotaYeni.tsx sağlar.
export interface RrBaglami {
  kopru: KopruIsleyici;
  // İlk okumada Malzemeler'de yeni onaylanan kartların rota taslağı açılır (#688; bugünkü ekran gibi, yalnız rota.yaz ile).
  ilkOkuma: () => Promise<void>;
}
export const RrBaglamKaynagi = createContext<RrBaglami | null>(null);
export function useRrBaglami(): RrBaglami {
  const b = useContext(RrBaglamKaynagi);
  if (b === null) throw new Error('Reçete ve Rota veri bağlamı yok: bileşen ReceteRotaYeni içinde kullanılmalı.');
  return b;
}

const cagir = async <T,>(kopru: KopruIsleyici, tip: string, veri: unknown = {}): Promise<T> => {
  try { return await kopru(tip, veri) as T; } catch (h) { throw new RrHatasi(h); }
};

// Bütün bölümlerin okuması tek uçtan (GET /recete-rota/durum) ve sahiplerin kaynak okumalarından gelir; sürümler köprüde kalır.
export function useRrVerisi(etkin = true) {
  const { kopru, ilkOkuma } = useRrBaglami();
  return useQuery({
    queryKey: anahtarlar.veri,
    enabled: etkin,
    queryFn: async () => {
      await ilkOkuma();
      return cagir<RrVerisi>(kopru, 'kaynak-oku');
    },
  });
}

export interface KomutSonucu { sonuc: unknown; durum: RrDurumu | null }

// Komut köprünün sırasıyla gider; sonrasında köprünün okuduğu durum önbelleğe yazılır. Durum okunamadıysa veri yeniden istenir.
// Eski sürümde (başkası değiştirdi) veri yeniden okunur; hata çağırana döner, ileti ekranın işidir.
export function useRrKomutu() {
  const { kopru } = useRrBaglami();
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: async ({ ad, govde }: { ad: KomutAdi; govde: KomutGovdesi }): Promise<KomutSonucu> => {
      if (!komutVarMi(ad)) throw new RrHatasi(new Error(`Bilinmeyen komut: ${ad}`));
      const c = await cagir<{ sonuc: unknown; durum: RrDurumu | null; ek: KaynakEki | null }>(kopru, 'komut', { ad, govde });
      if (c.durum === null) {
        await istemci.invalidateQueries({ queryKey: anahtarlar.veri });
      } else {
        // Hafif komutlarda (rota, statü) kaynaklar yeniden okunmaz: ek eskisi kalır.
        istemci.setQueryData<RrVerisi>(anahtarlar.veri, (eski) => (eski ? { durum: c.durum as RrDurumu, ek: c.ek ?? eski.ek } : eski));
      }
      return { sonuc: c.sonuc, durum: c.durum };
    },
    onError: (h) => {
      if (h instanceof RrHatasi && h.eskiSurum) void istemci.invalidateQueries({ queryKey: anahtarlar.veri });
    },
  });
}

// Statülü stok ve bakiye satırları (Stok bölümü): yalnız gösterilen kartlar, en çok 200. Okuma yetkisi olmayan dilim null.
export function useStokOkumasi(malzemeIdler: readonly number[], etkin = true) {
  const { kopru } = useRrBaglami();
  return useQuery({
    queryKey: anahtarlar.stok(malzemeIdler),
    enabled: etkin && malzemeIdler.length > 0,
    queryFn: () => cagir<StokOkumasi>(kopru, 'stok-oku', { malzemeIdler }),
  });
}

// Süreler bölümü: revizyonun teorik, etkin ve bekleyen ölçüm süreleri (sahibi rota); makine verilirse o makinenin görünümü.
export function useSureler(revizyonId: number | null, makineId: number | null = null) {
  const { kopru } = useRrBaglami();
  return useQuery({
    queryKey: anahtarlar.sureler(revizyonId ?? 0, makineId),
    enabled: revizyonId !== null,
    queryFn: () => cagir<SurelerCevabi>(kopru, 'sure-oku', { revizyonId, makineId }),
  });
}

// Kayıt belgesindeki eski kalemler (204 a, 208 a): yalnız okunur. Ana belge `recete-rota-motoru-v1` anahtarıdır; biçimi prototipin
// biçimidir ve TMI'de yorumlanmaz. Belge yoksa null (kayıt hiç yazılmamış).
export const ANA_BELGE = 'recete-rota-motoru-v1';
export const anaBelgeyiBul = (c: KayitlarCevabi): Kayit | null => c.kayitlar.find((k) => k.anahtar === ANA_BELGE) ?? null;
export function useEskiKayit(etkin = true) {
  return useQuery({
    queryKey: anahtarlar.eskiKayit,
    enabled: etkin,
    queryFn: async () => anaBelgeyiBul(await api.get<KayitlarCevabi>('/recete-rota/kayitlar')),
  });
}
