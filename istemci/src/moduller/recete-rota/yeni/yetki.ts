import { ISTASYON_YAZMA_ISLEMLERI, type Islem } from '#paylasilan/islemler.ts';
import { useYetki, type Yetki } from '../../../ortak/veri/yetki.ts';

// Ekran yalnız gizler; asıl denetim sahibinin ucundadır. Bugünkü çerçevenin "yalnız bu sekmede" kipi yoktur (210.8): işlemi olmayan
// düğmeyi görmez, ekran salt okunur kalır. Her bayrak komutu alan modülün işlemidir; `yaz` Reçete ve Rota'nın kendi tablolarıdır
// (statü tanımı ve statülü kart).
export interface RrYetkisi {
  oku: boolean;
  yaz: boolean;
  rotaYaz: boolean;
  rotaOnayla: boolean;
  rotaEmreKopyala: boolean;
  emirYaz: boolean;
  stokOku: boolean;
  stokStatuDegistir: boolean;
  stokSayim: boolean;
  stokGiris: boolean;
  istasyonYaz: boolean;
  kisiYaz: boolean;
  planYaz: boolean;
  maliyetOku: boolean;
  maliyetYaz: boolean;
  // Şartname ve talimatlar: şartname yazma ve yayın (976 a: yönetici), talimat şablonu yazma.
  sartnameYaz: boolean;
  sartnameYayinla: boolean;
  talimatYaz: boolean;
  // Bayraklardan biri açık mı (ekran salt okunur değil).
  herhangiYazma: boolean;
}

export const OKUMA_ISLEMLERI: readonly Islem[] = ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'];
const STOK_OKUMA: readonly Islem[] = [
  'sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir',
];

export function yetkiHesapla(y: Pick<Yetki, 'var' | 'herhangi'>): RrYetkisi {
  const yazmalar = {
    yaz: y.var('recete-rota.yaz'),
    rotaYaz: y.var('rota.yaz'),
    rotaOnayla: y.var('rota.onayla'),
    rotaEmreKopyala: y.var('rota.emre-kopyala'),
    emirYaz: y.var('uretim-emirleri.yaz'),
    stokStatuDegistir: y.var('stok.statu-degistir'),
    stokSayim: y.var('stok.sayim'),
    stokGiris: y.var('stok.giris'),
    istasyonYaz: y.herhangi(...ISTASYON_YAZMA_ISLEMLERI),
    kisiYaz: y.var('kisiler.yaz'),
    planYaz: y.var('plan.yaz'),
    maliyetYaz: y.var('finans.yonet'),
  };
  return {
    oku: y.herhangi(...OKUMA_ISLEMLERI),
    stokOku: y.herhangi(...STOK_OKUMA),
    maliyetOku: y.var('finans.maliyet-oku'),
    // Yalnız Şartname ve talimatlar sayfasının düğmeleridir; öteki bölümlerin salt okunurluğunu (herhangiYazma) değiştirmez.
    sartnameYaz: y.var('rota.sartname-yaz'),
    sartnameYayinla: y.var('rota.sartname-yayinla'),
    talimatYaz: y.var('rota.talimat-yaz'),
    ...yazmalar,
    herhangiYazma: Object.values(yazmalar).some(Boolean),
  };
}

export function useRrYetkisi(): RrYetkisi {
  return yetkiHesapla(useYetki());
}

// Emir açabilen (3003 a, Üretim Emirleri'nin "Yeni üretim emri" düğmesi): Reçete ve Rota verisini okur ve iki açma işleminden birine
// sahiptir. Rotalı üründe rota.emre-kopyala, rotasızda uretim-emirleri.yaz; asıl denetim sahiplerin ucundadır.
export const emirAcabilir = (y: RrYetkisi): boolean => y.oku && (y.rotaEmreKopyala || y.emirYaz);

export function useEmirAcabilir(): boolean {
  return emirAcabilir(useRrYetkisi());
}
