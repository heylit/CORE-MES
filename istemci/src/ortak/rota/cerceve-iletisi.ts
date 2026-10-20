// Kabuk ile çerçevedeki modül arasındaki görünüm sözleşmesi (postMessage). İkinci menü kabukta durur; tıklanan
// maddenin anahtarı çerçeveye "görünüm" olarak gider, çerçeve kendi içinde görünüm değiştirince kabuğa bildirir.
// Biçim sürümlüdür: sürümü ya da kanalı tutmayan ileti iki tarafta da yok sayılır.
//
// Kurallar (adres tek kaynaktır):
// 1. `hazir`, çerçeve `gorunum` iletisini hemen uygulayabilecek duruma gelince yollanır. Kabuk `hazir` gelmeden
//    hiçbir şey göndermez ve hiçbir bildirimi dinlemez; her `hazir`da adresteki görünümü yeni sırayla yeniden
//    gönderir. `hazir` yinelenebilir: çerçeve, `gorunum` iletisi alana kadar onu aralıklarla yineleyebilir
//    (kabuğun dinleyicisi kurulmadan yollanan ilk `hazir` kaybolur).
// 2. Bir `gorunum` iletisi alındıktan sonra, o ileti uygulanmadan önceki görünüm (açılış görünümü dahil)
//    bildirilmez; uygulanan isteğin yankısını bildirmek zararsızdır. Kullanıcının içeride yaptığı değişim
//    `gorunum-degisti` ile bildirilir.
// 3. Sıra: kabuğun her `gorunum` iletisi `sira` taşır; köprü ömrünce hep artar, `hazir`da sıfırlanmaz. Çerçeve
//    değere anlam yüklemez: bildiriminde aldığı son `sira`yı geri yazar (hiç almadıysa 0). Kabuk yalnız kendi son
//    gönderdiği sırayı taşıyan bildirimi kabul eder: isteği görmeden yola çıkmış gecikmiş bildirim adresi ezemez.
// 4. Görünüm adı ikinci menü maddesinin `anahtar`ıdır; menüde olmayan ad adresi değiştirmez.
// 5. `sayaclar`: çerçeve ikinci menünün sayılarını bildirir (madde anahtarı -> eksi olmayan tam sayı ya da null; sunucu
//    sayaç ucunun biçimi). Her ileti öncekinin tamamının yerine geçer; boş eşlem sayıları kaldırır. Kabuk o menü
//    açıkken sunucunun sayılarının yerine bunları gösterir; sayfa değişince ya da çerçeve kalkınca unutur. `hazir`
//    ve sıra beklemez. Sürümü değiştirmez: bu tipi tanımayan kabuk iletiyi yok sayar.
// 6. `sahibe-git`: prototipteki liste başka modülün kaydıysa (okuma bindirmesi, paylasilan/okuma-bindirmesi.ts) ekleme
//    ve düzenleme sahibin sayfasında yapılır; çerçeve o sayfanın yolunu (kayıt yolu, sorgu dahil) bildirir. Kabuk yalnız
//    kayıtlı bir sayfaya ya da onun altına gider, geçmişe yeni satır yazar (geri tuşu prototipe döner). `hazir` ve sıra
//    beklemez; sürümü değiştirmez.
import { kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';

export const CERCEVE_KANALI = 'tmi-gorunum';
export const CERCEVE_SURUMU = 1;

interface IletiBasi {
  kanal: typeof CERCEVE_KANALI;
  surum: typeof CERCEVE_SURUMU;
}

// Kabuktan çerçeveye: bu görünümü göster.
export type KabuktanIleti = IletiBasi & { tip: 'gorunum'; gorunum: string; sira: number };

// Çerçeveden kabuğa: dinlemeye başladım / kullanıcı içeride bu görünüme geçti (`sira`: kabuktan alınan son sıra).
// `sayaclar`: ikinci menünün sayıları (kural 5).
export type CercevedenIleti =
  | (IletiBasi & { tip: 'hazir' })
  | (IletiBasi & { tip: 'gorunum-degisti'; gorunum: string; sira: number })
  | (IletiBasi & { tip: 'sayaclar'; sayaclar: CerceveSayaclari })
  | (IletiBasi & { tip: 'sahibe-git'; yol: `/${string}` });

// Madde anahtarı -> sayı; null ya da yazılmamış anahtar o maddede sayı göstermez.
export type CerceveSayaclari = Readonly<Record<string, number | null>>;

// Güvenilmeyen çerçevenin kabuğa yazdırabileceği büyüklük sınırlıdır; bir menünün maddesi bunun çok altındadır.
export const SAYAC_ANAHTAR_SINIRI = 64;
export const SAYAC_ANAHTAR_UZUNLUGU = 64;
// Menü maddesinin anahtar kuralı (paylasilan/sayfa-tanimi.ts); `__proto__` gibi adlar bu yüzden geçemez.
const SAYAC_ANAHTARI = /^[a-z][a-z0-9-]*$/;

const BAS: IletiBasi = { kanal: CERCEVE_KANALI, surum: CERCEVE_SURUMU };

function iletiTipi(veri: unknown): { tip: unknown; gorunum: unknown; sira: unknown; sayaclar: unknown; yol: unknown } | null {
  if (veri === null || typeof veri !== 'object') return null;
  const v = veri as Record<string, unknown>;
  return v.kanal === CERCEVE_KANALI && v.surum === CERCEVE_SURUMU
    ? { tip: v.tip, gorunum: v.gorunum, sira: v.sira, sayaclar: v.sayaclar, yol: v.yol }
    : null;
}

// Yalnız düz nesne; değer null ya da güvenli aralıkta eksi olmayan tam sayı (NaN, sonsuz, kesirli, metin geçmez).
export function cerceveSayaclariMi(deger: unknown): deger is CerceveSayaclari {
  if (deger === null || typeof deger !== 'object') return false;
  const ilk = Object.getPrototypeOf(deger) as unknown;
  if (ilk !== Object.prototype && ilk !== null) return false;
  if (Object.getOwnPropertySymbols(deger).length > 0) return false;
  const girdiler = Object.entries(deger as Record<string, unknown>);
  if (girdiler.length > SAYAC_ANAHTAR_SINIRI) return false;
  return girdiler.every(([anahtar, sayi]) =>
    anahtar.length <= SAYAC_ANAHTAR_UZUNLUGU && SAYAC_ANAHTARI.test(anahtar)
    && (sayi === null || (typeof sayi === 'number' && Number.isSafeInteger(sayi) && sayi >= 0)));
}

const gorunumMu = (deger: unknown): deger is string => typeof deger === 'string' && deger !== '';
const siraMi = (deger: unknown, enAz: number): deger is number => typeof deger === 'number' && Number.isInteger(deger) && deger >= enAz;

export function kabuktanIletiMi(veri: unknown): veri is KabuktanIleti {
  const i = iletiTipi(veri);
  return i !== null && i.tip === 'gorunum' && gorunumMu(i.gorunum) && siraMi(i.sira, 1);
}

export function cercevedenIletiMi(veri: unknown): veri is CercevedenIleti {
  const i = iletiTipi(veri);
  return i !== null && (
    i.tip === 'hazir'
    || (i.tip === 'gorunum-degisti' && gorunumMu(i.gorunum) && siraMi(i.sira, 0))
    || (i.tip === 'sayaclar' && cerceveSayaclariMi(i.sayaclar))
    || (i.tip === 'sahibe-git' && kayitYoluMu(i.yol)));
}

export interface KabukKoprusuAyari {
  // Dinleyen pencere; verilmezse uygulamanın penceresi.
  pencere?: Window;
  // Çerçevenin penceresi: her iletide yeniden sorulur, çerçeve yeniden kurulmuş olabilir.
  cerceve: () => Window | null | undefined;
  // Çerçevenin kökeni. İleti yalnız bu kökene gönderilir, yalnız bu kökenden ve bu çerçeveden gelen dinlenir.
  koken: string;
  // Kullanıcı çerçevenin içinde görünüm değiştirdi. Kabul edildiyse (adres o görünüme geçecekse) true döner;
  // reddedilen ad köprünün belleğine yazılmaz.
  gorunumDegisti: (gorunum: string) => boolean;
  hazir?: () => void;
  // Çerçeve ikinci menünün sayılarını bildirdi (kural 5); doğrulanmış ve kopyalanmış eşlem gelir.
  sayaclar?: (sayaclar: CerceveSayaclari) => void;
  // Çerçeve kaydın sahibinin sayfasını istedi (kural 6); biçimi doğrulanmış uygulama içi yol gelir, sayfa kaydını
  // kabuk denetler.
  sahibeGit?: (yol: `/${string}`) => void;
}

export interface KabukKoprusu {
  // Çerçeve hazır değilse saklanır, "hazır" gelince gönderilir; çerçeve yeniden yüklenirse son görünüm yeniden gider.
  // Aynı görünüm yeniden gönderilmez; çerçeve reddedilen bir görünüme sapmışsa gönderilir.
  gorunumGonder: (gorunum: string) => void;
  kapat: () => void;
}

export function kabukKoprusuKur(ayar: KabukKoprusuAyari): KabukKoprusu {
  const pencere = ayar.pencere ?? window;
  let son: string | null = null;
  let hazir = false;
  let sira = 0;
  // Çerçeve, kabuğun kabul etmediği bir görünümü gösteriyor: adresteki görünüm yeniden istenebilir.
  let sapmis = false;

  const gonder = () => {
    const hedef = ayar.cerceve();
    if (!hazir || son === null || !hedef) return;
    sira += 1;
    sapmis = false;
    const ileti: KabuktanIleti = { ...BAS, tip: 'gorunum', gorunum: son, sira };
    hedef.postMessage(ileti, ayar.koken);
  };

  const dinle = (olay: MessageEvent) => {
    // Köken ve kaynak birlikte: aynı kökendeki başka pencere ya da başka kökene gitmiş çerçeve kabuğu yönlendiremez.
    if (olay.origin !== ayar.koken || olay.source !== ayar.cerceve() || !cercevedenIletiMi(olay.data)) return;
    if (olay.data.tip === 'sayaclar') {
      // Kopya: çerçeveden gelen nesne kabukta paylaşılmaz.
      ayar.sayaclar?.({ ...olay.data.sayaclar });
      return;
    }
    if (olay.data.tip === 'sahibe-git') {
      ayar.sahibeGit?.(olay.data.yol);
      return;
    }
    if (olay.data.tip === 'hazir') {
      // Sıra sıfırlanmaz: çerçeve yeniden yüklenmeden de yeniden hazır bildirebilir, eski bildirimleri yeni
      // isteğinkilerden ayıran tek şey sıranın hiç geri dönmemesidir.
      hazir = true;
      gonder();
      ayar.hazir?.();
      return;
    }
    // Hazır olmadan ya da kabuğun son isteğini görmeden yola çıkmış bildirim: çerçevenin açılış görünümü ya da
    // gecikmiş eski bildirimdir, adresi ezmez.
    if (!hazir || olay.data.sira !== sira) return;
    if (olay.data.gorunum === son) {
      sapmis = false;
      return;
    }
    if (ayar.gorunumDegisti(olay.data.gorunum)) {
      son = olay.data.gorunum;
      sapmis = false;
    } else {
      sapmis = true;
    }
  };

  pencere.addEventListener('message', dinle);
  return {
    gorunumGonder: (gorunum) => {
      if (gorunum === son && !sapmis) return;
      son = gorunum;
      gonder();
    },
    kapat: () => { pencere.removeEventListener('message', dinle); },
  };
}

export interface CerceveKoprusuAyari {
  // Çerçevenin kendi penceresi.
  pencere: Window;
  // Kabuğun penceresi; verilmezse çerçevenin üst penceresi.
  ust?: Window;
  // Kabuğun kökeni.
  koken: string;
  // Kabuk bu görünümü istedi. Uygulama eşzamansızsa söz döndürülür: çözülene kadar yapılan bildirimler
  // (uygulanmadan önceki görünüm) gönderilmez.
  gorunumIste: (gorunum: string) => void | Promise<void>;
  // Kabuktan `gorunum` gelene kadar `hazir`ın yinelenme aralığı (ms) ve en çok kaç kez yineleneceği.
  hazirAraligiMs?: number;
  hazirYinelemeSiniri?: number;
}

export interface CerceveKoprusu {
  // Çerçeve `gorunum` iletisini uygulayabilecek duruma gelince çağrılır; kabuk adresteki görünümü bunun üzerine
  // gönderir. İlk `gorunum` gelene kadar kendiliğinden yinelenir (kabuğun dinleyicisi sonradan kurulmuş olabilir).
  hazirBildir: () => void;
  // Kullanıcının içeride yaptığı değişim için. Kabuğun isteği uygulanırken yapılan bildirim gönderilmez;
  // uygulanan isteğin yankısı serbesttir, kabuk onu yok sayar.
  gorunumBildir: (gorunum: string) => void;
  // İkinci menünün sayılarını kabuğa bildirir (kural 5); her çağrı öncekinin tamamının yerine geçer. Biçime uymayan
  // eşlem gönderilmez, hata fırlatır (kabuk onu zaten yok sayardı).
  sayaclarBildir: (sayaclar: CerceveSayaclari) => void;
  // Ekleme ve düzenleme için kaydın sahibinin sayfasını ister (kural 6). Uygulama içi yol olmayan değer gönderilmez,
  // hata fırlatır.
  sahibeGit: (yol: string) => void;
  kapat: () => void;
}

const HAZIR_ARALIGI_MS = 250;
const HAZIR_YINELEME_SINIRI = 20;

// Çerçeve tarafı. Modülün köprüsü çerçevenin penceresiyle kurar; kendi betiğini taşıyan çerçeve aynı iletileri
// elle de yazabilir (biçim ve kurallar yukarıdadır).
export function cerceveKoprusuKur(ayar: CerceveKoprusuAyari): CerceveKoprusu {
  const ust = ayar.ust ?? ayar.pencere.parent;
  const aralik = ayar.hazirAraligiMs ?? HAZIR_ARALIGI_MS;
  const sinir = ayar.hazirYinelemeSiniri ?? HAZIR_YINELEME_SINIRI;
  let alinan = 0;
  // Uygulanmakta olan kabuk isteği sayısı: sıfır değilken çerçevenin gösterdiği, istekten önceki görünümdür.
  let uygulanan = 0;
  let yineleyici: ReturnType<typeof setInterval> | undefined;
  const yinelemeyiBirak = () => {
    clearInterval(yineleyici);
    yineleyici = undefined;
  };
  const gonder = (ileti: CercevedenIleti) => { ust.postMessage(ileti, ayar.koken); };
  const dinle = (olay: MessageEvent) => {
    if (olay.origin !== ayar.koken || olay.source !== ust || !kabuktanIletiMi(olay.data)) return;
    yinelemeyiBirak();
    alinan = olay.data.sira;
    uygulanan += 1;
    const bitti = () => { uygulanan -= 1; };
    let sonuc: void | Promise<void>;
    try {
      sonuc = ayar.gorunumIste(olay.data.gorunum);
    } catch (hata) {
      bitti();
      throw hata;
    }
    if (sonuc instanceof Promise) void sonuc.then(bitti, bitti);
    else bitti();
  };
  ayar.pencere.addEventListener('message', dinle);
  return {
    hazirBildir: () => {
      yinelemeyiBirak();
      gonder({ ...BAS, tip: 'hazir' });
      let kalan = sinir;
      yineleyici = setInterval(() => {
        if (kalan <= 0) { yinelemeyiBirak(); return; }
        kalan -= 1;
        gonder({ ...BAS, tip: 'hazir' });
      }, aralik);
    },
    gorunumBildir: (gorunum) => {
      if (uygulanan > 0) return;
      gonder({ ...BAS, tip: 'gorunum-degisti', gorunum, sira: alinan });
    },
    sayaclarBildir: (sayaclar) => {
      if (!cerceveSayaclariMi(sayaclar)) throw new TypeError('Sayaçlar biçime uymuyor: madde anahtarı -> eksi olmayan tam sayı ya da null');
      gonder({ ...BAS, tip: 'sayaclar', sayaclar: { ...sayaclar } });
    },
    sahibeGit: (yol) => {
      if (!kayitYoluMu(yol)) throw new TypeError(`Uygulama içi yol değil: ${yol}`);
      gonder({ ...BAS, tip: 'sahibe-git', yol });
    },
    kapat: () => {
      yinelemeyiBirak();
      ayar.pencere.removeEventListener('message', dinle);
    },
  };
}
