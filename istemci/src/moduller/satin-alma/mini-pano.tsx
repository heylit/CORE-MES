import { useQuery } from '@tanstack/react-query';
import { MiniPanoIzgarasi, MiniPanoKutucugu } from '../../ortak/arayuz/MiniPano.tsx';
import type { MiniPano } from '../../ortak/rota/mini-pano.ts';
import { SURE, anahtarlar, cagri } from './talep/ortak.ts';

// Mini pano istisna gösterir (2425-2 a): her kutucuk sıfıra inmesi gereken bir iştir, tıklanınca o listeyi açar.
// Satın alma ekibi ve yöneticisi aynı panoyu görür; yetkisiz sayı uçta null gelir.
const YENILEME_MS = 60_000;

// Özet ucuna eklenecek alanlar (2425 sunucu isteği) gelene kadar null: kutucuk "henüz hesaplanmıyor" der, sıfır uydurmaz.
function alan(veri: object | undefined, ad: string): number | null | undefined {
  if (veri === undefined) return undefined;
  const deger = (veri as Record<string, unknown>)[ad];
  return typeof deger === 'number' ? deger : null;
}

function enEski(veri: object | undefined, ad: string, metin: string): string {
  const gun = alan(veri, ad);
  return typeof gun === 'number' ? `${metin} · en eskisi ${gun.toLocaleString('tr-TR')} gün` : metin;
}

function SatinAlmaMiniPanosu() {
  const o = useQuery({
    queryKey: anahtarlar.ozet,
    queryFn: () => cagri.get('/satin-alma/ozet', SURE),
    refetchInterval: YENILEME_MS,
    refetchIntervalInBackground: true,
  });
  const d = o.isError ? {} : o.data;
  return (
    <MiniPanoIzgarasi guncelleme={o.dataUpdatedAt}>
      <MiniPanoKutucugu baslik="Geciken teslim" simge="clock" sayi={alan(d, 'gecikenTeslim')} altMetin={enEski(d, 'gecikenEnEskiGun', 'termini geçmiş')} ton="dikkat" yol="/satin-alma/talepler?durum=late" />
      <MiniPanoKutucugu baslik="İhtiyacı geçen talep" simge="calendar" sayi={alan(d, 'ihtiyaciGecen')} altMetin={enEski(d, 'ihtiyaciGecenEnEskiGun', 'sipariş yok')} ton="dikkat" yol="/satin-alma/talepler?durum=open" />
      <MiniPanoKutucugu baslik="Onay bekleyen" simge="check" sayi={alan(d, 'onayBekleyen')} altMetin="karar onay bekliyor" ton="uyari" yol="/satin-alma/onaylar" />
      <MiniPanoKutucugu baslik="Sipariş verilecek" simge="cart" sayi={alan(d, 'siparisVerilecek')} altMetin="onaylı, sipariş geçilmemiş" ton="uyari" yol="/satin-alma" />
      <MiniPanoKutucugu baslik="Karar verilecek" simge="clipboard-check" sayi={alan(d, 'kararVerilecek')} altMetin="teklif toplandı ya da geri döndü" yol="/satin-alma" />
      <MiniPanoKutucugu baslik="Bu hafta gelecek" simge="truck" sayi={alan(d, 'yaklasanTeslim')} altMetin="termini bu hafta dolan sipariş" yol="/satin-alma/talepler?durum=ordered" />
    </MiniPanoIzgarasi>
  );
}

export const miniPanolar: readonly MiniPano[] = [{
  anahtar: 'satin-alma', sira: 100, baslik: 'Satın alma', simge: 'cart',
  islem: 'satin-alma.oku', veya: ['satin-alma.yaz', 'satin-alma.onayla'],
  ekran: SatinAlmaMiniPanosu,
}];
