import { ISTASYON_YAZMA_ISLEMLERI, type Islem } from '#paylasilan/islemler.ts';
import { useYetki, type Yetki } from '../../../ortak/veri/yetki.ts';

// Ekran yalnız gizler; asıl denetim sahibinin ucundadır. Bugünkü çerçevenin "yalnız bu sekmede" kipi yoktur (210.8): işlemi olmayan
// düğmeyi görmez, ekran salt okunur kalır. Her bayrak komutu alan modülün işlemidir; `yaz` Reçete ve Rota'nın kendi tablolarıdır
// (statü tanımı ve statülü kart).
export interface RrYetkisi {
  oku: boolean;
  yaz: boolean;
  // Rota yazımı beş eylemdir (3165 a): revizyon düzenleme, onaya gönderme, taslak açma, gerçekleşen süre (şablonun ekranı burada değil).
  rotaYaz: boolean;
  rotaGonder: boolean;
  rotaTaslakAc: boolean;
  rotaSureKabul: boolean;
  rotaOnayla: boolean;
  rotaEmreKopyala: boolean;
  // Üretim emri yazımı sekiz eylemdir (3165 a, 3207 a); her düğme kendi eylemine bakar.
  emirAc: boolean;
  emirRotasizAc: boolean;
  emirDuzenle: boolean;
  emirAdimYaz: boolean;
  emirBol: boolean;
  emirPlanaAl: boolean;
  emirBeklet: boolean;
  emirIptal: boolean;
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
  'sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.konum-yaz', 'stok.raf-yaz', 'stok.harita-yaz', 'stok.malzeme-ayari', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir',
];

export function yetkiHesapla(y: Pick<Yetki, 'var' | 'herhangi'>): RrYetkisi {
  const yazmalar = {
    yaz: y.var('recete-rota.yaz'),
    rotaYaz: y.var('rota.revizyon-yaz'),
    rotaGonder: y.var('rota.onaya-gonder'),
    rotaTaslakAc: y.var('rota.taslak-ac'),
    rotaSureKabul: y.var('rota.sure-kabul'),
    rotaOnayla: y.var('rota.onayla'),
    rotaEmreKopyala: y.var('rota.emre-kopyala'),
    emirAc: y.var('uretim-emirleri.emir-ac'),
    emirRotasizAc: y.var('uretim-emirleri.rotasiz-ac'),
    emirDuzenle: y.var('uretim-emirleri.duzenle'),
    emirAdimYaz: y.var('uretim-emirleri.adim-yaz'),
    emirBol: y.var('uretim-emirleri.bol-birlestir'),
    emirPlanaAl: y.var('uretim-emirleri.plana-al'),
    emirBeklet: y.var('uretim-emirleri.beklet'),
    emirIptal: y.var('uretim-emirleri.iptal'),
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

// Yeni rota taslak açar ve adımları kaydeder (3165 a): iki eylem birlikte gerekir.
export const yeniRotaAcar = (y: Pick<RrYetkisi, 'rotaYaz' | 'rotaTaslakAc'>): boolean => y.rotaYaz && y.rotaTaslakAc;

// Açık taslağı olmayan rotada ilk düzenleme taslak açar (3165 a): Düzenle ve Excel ya taslak açma eylemini ya da açık taslağı ister.
export const duzenlemeAcar = (y: Pick<RrYetkisi, 'rotaYaz' | 'rotaTaslakAc'>, acikTaslakVar: boolean): boolean =>
  y.rotaYaz && (y.rotaTaslakAc || acikTaslakVar);

export function useRrYetkisi(): RrYetkisi {
  return yetkiHesapla(useYetki());
}

// Emir açabilen (3003 a, Üretim Emirleri'nin "Yeni üretim emri" düğmesi): Reçete ve Rota verisini okur ve iki açma işleminden birine
// sahiptir. Rotalı üründe rota.emre-kopyala, rotasızda uretim-emirleri.rotasiz-ac; asıl denetim sahiplerin ucundadır.
export const emirAcabilir = (y: RrYetkisi): boolean => y.oku && (y.rotaEmreKopyala || y.emirRotasizAc);

export function useEmirAcabilir(): boolean {
  return emirAcabilir(useRrYetkisi());
}
