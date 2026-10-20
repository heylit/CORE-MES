import { crc32 } from 'node:zlib';
import type { Db } from '#cekirdek/db.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import { bulunamadi, dogrulama } from '#cekirdek/hata.ts';
import { AYAR_ANAHTARLARI, AYAR_TANIMLARI, ayarAnahtariMi, ayarTanimi } from '#paylasilan/ayarlar.ts';
import { donemAnahtari, numaraDonemi, numaraKur } from '#paylasilan/numara.ts';
import type { AyarAnahtari, AyarDegeri, NumaraAnahtari } from '#paylasilan/ayarlar.ts';
import { KAPATILABILIR_YOLLAR } from '#paylasilan/sayfalar.ts';
import { gorunumCevabi, kurumLogosuSemasi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { Ayar, AyarlarCevabi, GorunumCevabi, KapaliSayfalarCevabi, KarsilamaCevabi, KurumCevabi, KurumLogosuCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { degeriDogrula, gecerliDeger, listeDegeri, oncekiDeger } from './kurallar.ts';
import { ayarDegeriniOku, ayarDegeriniSil, ayarDegeriniYaz, ayarDegerleriniOku, ayarKilitle, sayacArtir, simdikiYilAy } from './sorgular.ts';

const DEGISTIR_YOLU = '/ayarlar/:anahtar/degistir';

// Değer kurallardan doğrulanmış gelir; türü tanımın türüyle aynıdır. Geçersiz ayarın değeri yoktur (null).
function ayarGorunumu(anahtar: AyarAnahtari, deger: boolean | number | string | null, gecersiz = false): Ayar {
  const tanim = ayarTanimi(anahtar);
  const ortak = { anahtar, baslik: tanim.baslik, aciklama: tanim.aciklama, ...(gecersiz ? { gecersiz: true as const } : {}) };
  if (tanim.tur === 'boolean') return { ...ortak, tur: 'boolean', deger: gecersiz ? null : deger === true };
  if (tanim.tur === 'metin') {
    return {
      ...ortak, tur: 'metin', deger: typeof deger === 'string' && !gecersiz ? deger : null, enUzun: tanim.enUzun,
      ...(tanim.bosOlabilir === true ? { bosOlabilir: true as const } : {}), ...(tanim.bicim === undefined ? {} : { bicim: tanim.bicim }),
    };
  }
  if (tanim.tur === 'secim') {
    return { ...ortak, tur: 'secim', deger: typeof deger === 'string' && !gecersiz ? deger : null, secenekler: tanim.secenekler.map((s) => ({ ...s })) };
  }
  if (tanim.tur === 'numara') return { ...ortak, tur: 'numara', deger: typeof deger === 'string' ? deger : null, alanlar: [...tanim.alanlar] };
  return {
    ...ortak, tur: 'sayi', deger: typeof deger === 'number' ? deger : null,
    enAz: tanim.enAz, enCok: tanim.enCok, ondalik: tanim.ondalik,
  };
}

export async function sistemAyariOku<A extends AyarAnahtari>(db: Db, anahtar: A): Promise<AyarDegeri<A>> {
  return gecerliDeger(anahtar, await ayarDegeriniOku(db, anahtar));
}

// Bir numaraya varılmadan bu kadar dolu numara atlanırsa kalıp ya da sayaç bozuktur; sonsuz döngü yerine hata.
const ATLAMA_EN_COK = 10_000;

export interface NumaraIstegi {
  // Kalıptaki belge alanlarının değeri (tanımın `alanlar` listesindekiler); boş alan numaradan düşer.
  alanlar?: Readonly<Record<string, string | null | undefined>>;
  // Numara o belgede kullanılıyor mu: kalıp değişince yeni numara eski bir numarayla çakışabilir, çakışan atlanır.
  varMi: (no: string) => Promise<boolean>;
}

// Numarayı isteyen modülün işleminde çalışır: sayaç satırı işlem bitene kadar kilitli kalır, aynı anda iki kayıt aynı
// sırayı alamaz; kayıt geri alınırsa sıra da geri alınır.
export async function numaraAl(db: Db, anahtar: NumaraAnahtari, istek: NumaraIstegi): Promise<string> {
  const kalip = await sistemAyariOku(db, anahtar);
  const { yil, ay } = await simdikiYilAy(db);
  const donem = donemAnahtari(numaraDonemi(kalip), yil, ay);
  for (let i = 0; i < ATLAMA_EN_COK; i += 1) {
    const sira = await sayacArtir(db, anahtar, donem);
    const no = numaraKur(kalip, { yil, ay, sira, alanlar: istek.alanlar });
    if (!(await istek.varMi(no))) return no;
  }
  throw new Error(`Numara üretilemedi: ${anahtar} kalıbında ${ATLAMA_EN_COK} dolu numara atlandı.`);
}

export async function ayarlariListele(db: Db): Promise<AyarlarCevabi> {
  const saklananlar = await ayarDegerleriniOku(db);
  return {
    ayarlar: AYAR_ANAHTARLARI.map((anahtar) => {
      const { deger, gecersiz } = listeDegeri(anahtar, saklananlar.find((s) => s.anahtar === anahtar) ?? null);
      return ayarGorunumu(anahtar, deger, gecersiz);
    }),
  };
}

// Kabuğun her oturumda okuduğu karşılama ayarları; liste ucunun yazma yetkisini istemeden yalnız bunlar verilir.
// Saat boşsa tanımdaki varsayılan geçer: karşılama hiçbir zaman saatsiz kalmaz. Gündüz mü gece mi, kişinin saatiyle istemci seçer.
export async function karsilamaOku(db: Db): Promise<KarsilamaCevabi> {
  const gunduz = await sistemAyariOku(db, 'kabuk.gunduz-baslangic');
  const gece = await sistemAyariOku(db, 'kabuk.gece-baslangic');
  return {
    acik: await sistemAyariOku(db, 'kabuk.karsilama'),
    metin: await sistemAyariOku(db, 'kabuk.karsilama-metni'),
    geceMetni: await sistemAyariOku(db, 'kabuk.karsilama-gece-metni'),
    gunduzBaslangic: gunduz ?? AYAR_TANIMLARI['kabuk.gunduz-baslangic'].varsayilan,
    geceBaslangic: gece ?? AYAR_TANIMLARI['kabuk.gece-baslangic'].varsayilan,
  };
}

// Değer tanımın seçeneklerinden gelir; seçenek listesi sözleşmedeki listeyle aynıdır (paylasilan testi denetler).
export async function gorunumOku(db: Db): Promise<GorunumCevabi> {
  return gorunumCevabi.parse({
    hareket: await sistemAyariOku(db, 'kabuk.hareket'),
    acilis: await sistemAyariOku(db, 'kabuk.acilis'),
    acilisSuresi: await sistemAyariOku(db, 'kabuk.acilis-suresi'),
    gecisHizi: await sistemAyariOku(db, 'kabuk.gecis-hizi'),
  });
}

export async function kurumOku(db: Db): Promise<KurumCevabi> {
  return { ad: await sistemAyariOku(db, 'kabuk.kurum-adi') };
}

const KAPALI_SAYFALAR_ANAHTARI = 'kabuk.kapali-sayfalar';

// Koddan kalkmış sayfanın yolu saklı kalsa da verilmez: bilinmeyen yol hiçbir şeyi kapatmaz.
export async function kapaliSayfalariOku(db: Db): Promise<KapaliSayfalarCevabi> {
  const saklanan = await ayarDegeriniOku(db, KAPALI_SAYFALAR_ANAHTARI);
  const liste: unknown[] = Array.isArray(saklanan?.deger) ? saklanan.deger : [];
  return { kapali: KAPATILABILIR_YOLLAR.filter((yol) => liste.includes(yol)) };
}

// Kapatma ayar tanımı değildir: listede görünmez, genel değiştirme ucu yazamaz. Boş liste satırı siler.
// Yeni liste kilitten sonra saklanandan kurulur: aynı anda iki değiştirme birbirinin sayfasını geri almaz.
export async function kapaliSayfalariDegistir(db: Db, kisiId: number, yol: string, kapat: boolean): Promise<KapaliSayfalarCevabi> {
  if (!KAPATILABILIR_YOLLAR.includes(yol)) throw dogrulama(`Bu sayfa kapatılamaz: ${yol}`, 'yol');
  await ayarKilitle(db, KAPALI_SAYFALAR_ANAHTARI);
  const eski = (await kapaliSayfalariOku(db)).kapali;
  const yeni = KAPATILABILIR_YOLLAR.filter((y) => (y === yol ? kapat : eski.includes(y)));
  if (eski.length === yeni.length && eski.every((y, i) => y === yeni[i])) return { kapali: yeni };
  if (yeni.length === 0) await ayarDegeriniSil(db, KAPALI_SAYFALAR_ANAHTARI);
  else await ayarDegeriniYaz(db, KAPALI_SAYFALAR_ANAHTARI, yeni, kisiId);
  // Uç katmanının kaydı yalnız yeni listeyi taşır; hangi sayfanın açılıp kapandığı eskisiyle okunur.
  await denetimYaz(db, {
    kisiId, yontem: 'POST', yol: '/kapali-sayfalar/degistir', parametre: {}, govde: { eski, yeni }, modul: 'ayarlar', yetki: 'ayarlar.yaz',
  });
  return { kapali: yeni };
}

export async function ayarDegistir(db: Db, kisiId: number, anahtar: string, ham: unknown): Promise<Ayar> {
  if (!ayarAnahtariMi(anahtar)) throw bulunamadi('Ayar bulunamadı.');
  const sonuc = degeriDogrula(anahtar, ham);
  if ('hata' in sonuc) throw dogrulama(sonuc.hata, 'deger');
  const yeni = sonuc.deger;
  // Eski değer kilitten sonra okunur: aynı anda iki değiştirmede ikincinin kaydı birincinin yazdığını eski değer olarak taşır.
  await ayarKilitle(db, anahtar);
  const eski = oncekiDeger(anahtar, await ayarDegeriniOku(db, anahtar));
  // Değişmeyen değer değişiklik değildir: satır da değişiklik kaydı da yazılmaz.
  if (eski !== yeni) {
    await ayarDegeriniYaz(db, anahtar, yeni, kisiId);
    // Uç katmanının kendi kaydı yalnız komutu ve yeni değeri taşır; eski değer burada bilinir.
    await denetimYaz(db, {
      kisiId, yontem: 'POST', yol: DEGISTIR_YOLU, parametre: { anahtar }, govde: { eski, yeni }, modul: 'ayarlar', yetki: 'ayarlar.yaz',
    });
  }
  return ayarGorunumu(anahtar, yeni);
}

// Logo ayar tanımı değildir (açık-kapalı ya da sayı değil): ayar listesinde görünmez, genel değiştirme ucu ona yazamaz.
const LOGO_ANAHTARI = 'kabuk.logo';

export async function kurumLogosuOku(db: Db): Promise<KurumLogosuCevabi> {
  const saklanan = await ayarDegeriniOku(db, LOGO_ANAHTARI);
  if (saklanan === null) return { logo: null };
  const sonuc = kurumLogosuSemasi.safeParse(saklanan.deger);
  // Biçime uymayan saklanan değer kabuğa resim olarak verilmez; yeniden yüklemek onarır.
  return { logo: sonuc.success ? sonuc.data : null };
}

// Giriş ekranının logosu (kullanıcı kararı 2026-10-14): logo ucu oturumlu kalır; yükleme, değiştirme ve silme görselin bir kopyasını
// ayrı kayda yazar. Oturumsuz okunan tek şey bu kopyadır; başka ayar ya da veri ondan çıkmaz.
const GIRIS_LOGOSU_ANAHTARI = 'kabuk.giris-logosu';
const LOGO_VERISI = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/;

// Logo giriş ekranından oturumsuz dağıtılır: yalnız tarayıcıda yeniden çizilmiş temiz PNG alınır. Parçalar tek tek
// denetlenir; metin ve üst veri parçası, bozuk sağlama, IEND'den sonra eklenmiş bayt ve sınırı aşan en ya da boy reddedilir.
const PNG_IMZASI = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_PARCALARI = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'iCCP', 'bKGD']);
export const LOGO_EN_COK_KENAR = 2048;

export function temizPngHatasi(logo: string): string | null {
  const parca = /^data:image\/png;base64,(.+)$/.exec(logo);
  if (parca === null) return 'Logo PNG olarak gönderilmeli.';
  const b = Buffer.from(parca[1] ?? '', 'base64');
  if (!b.subarray(0, 8).equals(PNG_IMZASI)) return 'Dosyanın içeriği PNG resmi değil.';
  let i = 8, ilk = true;
  while (i + 12 <= b.length) {
    const uzunluk = b.readUInt32BE(i), tur = b.subarray(i + 4, i + 8).toString('latin1'), son = i + 12 + uzunluk;
    if (son > b.length) return 'PNG dosyası eksik.';
    if (ilk !== (tur === 'IHDR')) return 'PNG dosyası IHDR ile başlamalı.';
    if (!PNG_PARCALARI.has(tur)) return `PNG dosyasında izin verilmeyen parça var: ${tur}.`;
    if (crc32(b.subarray(i + 4, i + 8 + uzunluk)) !== b.readUInt32BE(i + 8 + uzunluk)) return 'PNG dosyası bozuk.';
    if (tur === 'IHDR') {
      const en = b.readUInt32BE(i + 8), boy = b.readUInt32BE(i + 12);
      if (en < 1 || boy < 1 || en > LOGO_EN_COK_KENAR || boy > LOGO_EN_COK_KENAR) return `Logo en çok ${String(LOGO_EN_COK_KENAR)} piksel olabilir.`;
    }
    if (tur === 'IEND') return son === b.length ? null : 'PNG dosyasının sonuna veri eklenmiş.';
    ilk = false;
    i = son;
  }
  return 'PNG dosyası eksik.';
}

export async function kurumLogosuDegistir(db: Db, kisiId: number, logo: string | null): Promise<KurumLogosuCevabi> {
  const hata = logo === null ? null : temizPngHatasi(logo);
  if (hata !== null) throw dogrulama(hata, 'logo');
  await ayarKilitle(db, LOGO_ANAHTARI);
  if (logo === null) {
    await ayarDegeriniSil(db, LOGO_ANAHTARI);
    await ayarDegeriniSil(db, GIRIS_LOGOSU_ANAHTARI);
  } else {
    await ayarDegeriniYaz(db, LOGO_ANAHTARI, logo, kisiId);
    await ayarDegeriniYaz(db, GIRIS_LOGOSU_ANAHTARI, logo, kisiId);
  }
  return { logo };
}

// Kopya yoksa ya da biçime uymuyorsa logo yoktur (null, 204); giriş ekranı onsuz çizilir. Dosya adı sabittir; cevap yalnız
// görseli taşır, önbelleğe alınmaz (no-store): logo değişince giriş ekranı yenisini görür.
export async function girisLogosuOku(db: Db): Promise<IkiliCevap | null> {
  const saklanan = await ayarDegeriniOku(db, GIRIS_LOGOSU_ANAHTARI);
  const sonuc = kurumLogosuSemasi.safeParse(saklanan?.deger);
  const parca = sonuc.success ? LOGO_VERISI.exec(sonuc.data) : null;
  if (parca === null) return null;
  const [, tur = 'image/png', govde = ''] = parca;
  const veri = Buffer.from(govde, 'base64');
  return { tur, ad: `giris-logosu.${tur === 'image/jpeg' ? 'jpg' : tur.slice(6)}`, boyut: veri.length, akis: async function* () { yield veri; } };
}
