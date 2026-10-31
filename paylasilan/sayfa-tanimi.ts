// Menü grupları bu sırayla görünür. Modüller arası tek bilgi budur ve burada durur;
// sayfa kendi grubunu ve grup içindeki yerini `sayfalar/<modül>.ts` dosyasında söyler.
export const SAYFA_GRUPLARI = ['Üretim', 'Planlama', 'Stok', 'Satın Alma', 'Kalite', 'Tanımlar', 'Yönetim'] as const;

export type SayfaGrubu = (typeof SAYFA_GRUPLARI)[number];

export interface SayfaTanimi {
  yol: `/${string}`;
  islem: `sayfa.${string}`;
  baslik: string;
  simge: string;
  grup: SayfaGrubu;
  // Grup içindeki yer: küçük olan üstte. Aralıklı verilir (10, 20, ...) ki araya giren komşusuna dokunmasın.
  sira: number;
  // Sayfa bekletiliyor: rotası, başlığı ve işlemi durur, ana menüde ve alt gezinmede bağlantısı olmaz.
  menudeGizli?: true;
  // Üst çubuktaki aramanın bu modülün kayıtlarını (emir, malzeme, istasyon gibi) bulduğu tek okuma ucu (api yolu). Kabuk
  // `?q=` ile çağırır; cevap `KayitAramaCevabi`. Yetkiyi uç denetler; kabuk yalnız sayfayı görenin adına sorar.
  aramaUcu?: `/${string}`;
  // Sayfayı görmeyen ama bu veri işlemini taşıyan kişi de arama ucunu kullanır (operatör emirleri kendi istasyonunda arar).
  // Neyi bulacağını uç daraltır; kabuk yalnız kaynağı açar.
  aramaIslemi?: `${string}.${string}`;
}

export const menudeGorunur = (sayfa: Pick<SayfaTanimi, 'yol' | 'menudeGizli'>): boolean => sayfa.menudeGizli !== true;

// Sıra yalnız dizilişi belirler; listeyi kullanan onu görmez.
export type Sirasiz<T> = T extends unknown ? Omit<T, 'sira'> : never;

// Eşit sırada yol belirler: sonuç toplayıcıdaki ithal sırasına kalırsa iki dalın birleşme sırası menüyü değiştirirdi.
export function sayfalariSirala<T extends SayfaTanimi>(tanimlar: readonly T[]): readonly Sirasiz<T>[] {
  const grupSirasi = (t: T): number => SAYFA_GRUPLARI.indexOf(t.grup);
  return [...tanimlar]
    .sort((a, b) => grupSirasi(a) - grupSirasi(b) || a.sira - b.sira || (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0))
    .map(({ sira: _sira, ...kalan }) => kalan as Sirasiz<T>);
}

// İkinci menü: modülün kendi sayfaları. Modül veriyi bildirir, kabuk çizer ve kullanıcının işlemlerine göre süzer.
// S ve I, simge ile işlemi bilen tarafın (istemci) tanımı derlerken daraltması içindir; modül dosyası yalın tipi kullanır.
export interface IkinciMenuMaddesi<S extends string = string, I extends string = string> {
  // Menü içinde tekil: sayaç cevabının anahtarı ve çerçeveli modülde görünümün adı.
  anahtar: string;
  baslik: string;
  // Menünün kök yolu ya da onun altı. Etkin madde adresten bulunur (en uzun önek).
  yol: `/${string}`;
  simge: S;
  // Maddeyi görmek için gereken kayıtlı işlem; yalnız görünürlüktür, veri yetkisi vermez.
  islem: I;
  // Bunlardan biri de yeter (uçtaki `yetki: { biri }` gibi): tek işlem birden çok rolün gördüğü maddeyi anlatamıyordu.
  // `islem` ayrı alan kalır ki onu okuyan kod listeyi bilmeden de maddeyi fazla göstermesin.
  veya?: readonly I[];
  // Görünümün açılışta zorunlu çağırdığı okuma uçları (api yolu, uçtaki yazımıyla). Maddeyi gören her rol bunları geçebilmelidir:
  // menüde görünüp verisi 403 veren sayfa olmasın (195 a). Yetkisizde boş kalan isteğe bağlı okuma buraya yazılmaz. Test
  // sunucudadır (`sunucu/menu-okuma.test.ts`): rolleri göçlerden, uç yetkisini uç tanımından okur.
  okur?: readonly `/${string}`[];
}

export const maddeGorunurMu = (madde: Pick<IkinciMenuMaddesi, 'islem' | 'veya'>, islemler: readonly string[]): boolean =>
  [madde.islem, ...(madde.veya ?? [])].some((i) => islemler.includes(i));

export interface IkinciMenuGrubu<S extends string = string, I extends string = string> {
  // Başlıksız grup menünün başında, ayraçsız durur.
  baslik?: string;
  maddeler: readonly IkinciMenuMaddesi<S, I>[];
}

export interface IkinciMenuTanimi<S extends string = string, I extends string = string> {
  // Modülün ana menüdeki sayfasının yolu; menü bu sayfada ve alt yollarında açılır.
  kok: `/${string}`;
  baslik: string;
  simge: S;
  gruplar: readonly IkinciMenuGrubu<S, I>[];
  // Maddelerin yanındaki sayıları veren tek okuma ucu (api yolu); cevap `IkinciMenuSayaclari`.
  sayacUcu?: `/${string}`;
  // Bu maddenin sayısı ana menüdeki sayfa bağlantısında da görünür (ör. açık güvenlik alarmı): kişi sayfaya girmeden görür.
  anaMenuSayaci?: string;
  // İçeriği çerçeve olan modül: içerik alanı boşluksuz olur, kaydırmayı çerçeve yapar.
  cerceveli?: boolean;
  // Cihaz tercihi açıkken menü yalnız bu maddeleri gösterir (ör. depo tabletinde depocu modu). Tercih kişiye değil
  // cihaza aittir; modül açar ya da kapatır, kabuk okur. Yetki süzgecinin yerine geçmez, ondan sonra uygulanır.
  sade?: { tercih: string; maddeler: readonly string[] };
}

// Sayaç ucunun cevabı: madde anahtarı -> sayı. Bilinmeyen sayı null ya da eksik anahtardır; sıfır uydurulmaz.
export type IkinciMenuSayaclari = Record<string, number | null>;

// Arama ucunun cevabı. Yol uygulama içi adrestir; kabuk tıklanınca oraya gider. Açıklama ikinci satırdır (durum, ürün adı).
export interface KayitAramaSonucu {
  anahtar: string;
  baslik: string;
  aciklama: string | null;
  yol: `/${string}`;
}
export interface KayitAramaCevabi {
  sonuclar: KayitAramaSonucu[];
}
// Kısa sorgu her kaydı bulur, uzun sorgu sunucuyu boşuna yorar; uç bu sınırları şemayla, kabuk aynı sayılarla uygular.
export const KAYIT_ARAMA_EN_KISA = 2;
export const KAYIT_ARAMA_EN_UZUN = 60;
export const KAYIT_ARAMA_EN_COK_SONUC = 5;
// Uygulama içi adres: başka siteye ya da protokole (`//x`, `javascript:`) gitmez. Uç ve kabuk aynı denetimi yapar.
const KAYIT_YOLU = /^\/[a-z0-9-]+(?:\/(?!\.{1,2}(?:[/?]|$))[A-Za-z0-9._~-]+)*(?:\?[A-Za-z0-9._~=&%-]*)?$/;
export const aramaUcuGecerliMi = (uc: string): boolean => /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(uc);
export const kayitYoluMu = (yol: unknown): yol is `/${string}` => typeof yol === 'string' && KAYIT_YOLU.test(yol);

export interface IkinciMenuBaglami {
  sayfaYollari: readonly string[];
  islemMi: (deger: string) => boolean;
  // Simge setini yalnız istemci bilir; verilmezse simgenin dolu olması yeter.
  simgeMi?: (deger: string) => boolean;
}

const MENU_YOLU = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const MADDE_ANAHTARI = /^[a-z][a-z0-9-]*$/;

// Boş dizi: tanım geçerli. Hata metni tanımı yazanın düzelteceği yeri söyler.
export function ikinciMenuHatalari(tanim: IkinciMenuTanimi, baglam: IkinciMenuBaglami): string[] {
  const hatalar: string[] = [];
  const simgeGecerli = (simge: string): boolean => simge.trim() !== '' && (baglam.simgeMi?.(simge) ?? true);
  if (!baglam.sayfaYollari.includes(tanim.kok)) hatalar.push(`kök yol kayıtlı bir sayfa değil: ${tanim.kok}`);
  if (tanim.baslik.trim() === '') hatalar.push('menü başlığı boş');
  if (!simgeGecerli(tanim.simge)) hatalar.push(`menü simgesi geçersiz: "${tanim.simge}"`);
  if (tanim.sayacUcu !== undefined && !MENU_YOLU.test(tanim.sayacUcu)) hatalar.push(`sayaç ucu yol biçiminde değil: ${tanim.sayacUcu}`);
  if (tanim.gruplar.length === 0) hatalar.push('menüde grup yok');
  if (tanim.anaMenuSayaci !== undefined) {
    if (tanim.sayacUcu === undefined) hatalar.push('ana menü sayacı sayaç ucu ister');
    if (!tanim.gruplar.some((g) => g.maddeler.some((m) => m.anahtar === tanim.anaMenuSayaci))) {
      hatalar.push(`ana menü sayacı menüde olmayan madde: ${tanim.anaMenuSayaci}`);
    }
  }
  if (tanim.sade !== undefined) {
    if (!MADDE_ANAHTARI.test(tanim.sade.tercih)) hatalar.push(`sade görünüm tercih adı biçime uymuyor: "${tanim.sade.tercih}"`);
    if (tanim.sade.maddeler.length === 0) hatalar.push('sade görünümde madde yok');
    const tumAnahtarlar = tanim.gruplar.flatMap((g) => g.maddeler.map((m) => m.anahtar));
    for (const anahtar of tanim.sade.maddeler) {
      if (!tumAnahtarlar.includes(anahtar)) hatalar.push(`sade görünümdeki madde menüde yok: ${anahtar}`);
    }
  }
  const yollar = new Set<string>();
  const anahtarlar = new Set<string>();
  const grupAdlari = new Set<string>();
  for (const grup of tanim.gruplar) {
    const grupAdi = grup.baslik ?? '';
    if (grup.baslik !== undefined && grup.baslik.trim() === '') hatalar.push('grup başlığı boş (başlıksız grup alanı hiç yazmaz)');
    if (grupAdlari.has(grupAdi)) hatalar.push(`grup yineleniyor: "${grupAdi}"`);
    grupAdlari.add(grupAdi);
    if (grup.maddeler.length === 0) hatalar.push(`grupta madde yok: "${grupAdi}"`);
    for (const madde of grup.maddeler) {
      if (!MADDE_ANAHTARI.test(madde.anahtar)) hatalar.push(`madde anahtarı biçime uymuyor: "${madde.anahtar}"`);
      if (anahtarlar.has(madde.anahtar)) hatalar.push(`madde anahtarı yineleniyor: ${madde.anahtar}`);
      anahtarlar.add(madde.anahtar);
      if (!MENU_YOLU.test(madde.yol)) hatalar.push(`madde yolu biçime uymuyor: ${madde.yol}`);
      if (madde.yol !== tanim.kok && !madde.yol.startsWith(`${tanim.kok}/`)) hatalar.push(`madde yolu kök yolun altında değil: ${madde.yol} (kök ${tanim.kok})`);
      if (yollar.has(madde.yol)) hatalar.push(`madde yolu yineleniyor: ${madde.yol}`);
      yollar.add(madde.yol);
      if (madde.baslik.trim() === '') hatalar.push(`madde başlığı boş: ${madde.yol}`);
      if (!simgeGecerli(madde.simge)) hatalar.push(`madde simgesi geçersiz: "${madde.simge}" (${madde.yol})`);
      if (madde.veya !== undefined && madde.veya.length === 0) hatalar.push(`madde veya listesi boş (gerekmiyorsa alan hiç yazılmaz): ${madde.yol}`);
      if (madde.okur !== undefined) {
        if (madde.okur.length === 0) hatalar.push(`madde okur listesi boş (gerekmiyorsa alan hiç yazılmaz): ${madde.yol}`);
        if (new Set(madde.okur).size !== madde.okur.length) hatalar.push(`madde okur listesinde yinelenen uç var: ${madde.yol}`);
        for (const uc of madde.okur) if (!MENU_YOLU.test(uc)) hatalar.push(`okunan uç yol biçiminde değil: ${uc} (${madde.yol})`);
      }
      for (const islem of [madde.islem, ...(madde.veya ?? [])]) {
        if (!baglam.islemMi(islem)) hatalar.push(`madde işlemi kayıtlı değil: ${islem} (${madde.yol})`);
      }
    }
  }
  return hatalar;
}

// Bir sayfanın tek ikinci menüsü olur: ikincisi hangisinin açılacağını toplayıcıdaki sıraya bırakırdı.
export function ikinciMenulerinHatalari(tanimlar: readonly IkinciMenuTanimi[], baglam: IkinciMenuBaglami): string[] {
  const kokler = new Set<string>();
  const hatalar: string[] = [];
  for (const tanim of tanimlar) {
    if (kokler.has(tanim.kok)) hatalar.push(`aynı sayfaya iki ikinci menü: ${tanim.kok}`);
    kokler.add(tanim.kok);
    hatalar.push(...ikinciMenuHatalari(tanim, baglam).map((h) => `${tanim.kok}: ${h}`));
  }
  return hatalar;
}
