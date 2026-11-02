import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCerceveSayacYazici } from '../../ortak/rota/cerceve-sayaclari.ts';
import { api } from '../../ortak/veri/api.ts';
import { SAYAC_ARALIGI_MS, sayaclariOku } from '../../ortak/veri/ikinci-menu-sayaclari.ts';
import { anahtarlar } from './anahtarlar.ts';

// Kök ve uç `paylasilan/sayfalar/belge-merkezi.ts`'teki ikinci menüyle aynıdır (istemci oradan değer ithal etmez).
const KOK = '/cizimler';
const SAYAC_UCU = '/cizimler/menu-sayaclari';

// Kabuk ikinci menü sayılarını kendi aralığıyla okur; belge açıp arşivleyince sayı o okumaya kadar eski kalıyordu (modül
// testi C3). Sayılar modülün sorgusundan okunur: her yazma komutu `anahtarlar.kok`u tazelediği için hemen yenilenir ve
// kabuğa ekranın bildirdiği sayı olarak verilir. Ekran kalkınca kabuk kendi okumasına döner.
export function useMenuSayaclari(): void {
  const yaz = useCerceveSayacYazici(KOK);
  const sorgu = useQuery({
    queryKey: anahtarlar.menuSayaclari,
    queryFn: async () => sayaclariOku(await api.get<unknown>(SAYAC_UCU)),
    refetchInterval: SAYAC_ARALIGI_MS,
  });
  const sayaclar = sorgu.data;
  useEffect(() => { if (sayaclar) yaz(sayaclar); }, [yaz, sayaclar]);
}
