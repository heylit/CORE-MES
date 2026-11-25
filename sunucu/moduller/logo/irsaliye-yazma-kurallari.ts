import { FIS_NO_EN_COK, logoBirimKodu, logoTarihi, STOK_KODU_EN_COK } from './kurallar.ts';
import type { LogoBelgeBulgusuHam } from './kurallar.ts';
import { SATIN_ALMA_ETIKETLERI, SATIN_ALMA_IRSALIYESI_TRCODE } from './irsaliye-etiket-esleme.ts';

// Mal kabulden Logo'ya satın alma irsaliyesi (kart 3665; kurgu devir-heylit/mal-kabul-irsaliye/KURGU.md). Bu dosya saf kurallardır:
// ön kontrol, kısmi gönderim, gövde ve çift kayıt kalkanı. Köprüye gitmez, hiçbir şey yazmaz; gönderim turu ve ekran sonraki dilimdedir.

// Logo tür kodu: rehberde satın alma irsaliyesi STFICHE TRCODE 1 (DOĞRULANDI, EkoTigerAPI rehberi).
export { SATIN_ALMA_IRSALIYESI_TRCODE };

// DOĞRULANMADI: etiket adları kullanıcının 25.11'de verdiği belgeden (kök PURCHASE_DISPATCHES/DISPATCH; ORDER_REFERENCE = ORFLINE.LOGICALREF) alındı;
// gerçek Logo dökümü değil (KURGU bölüm 10, devir-heylit/3665/LOGO-ISTEK.md). Doğrulanınca yalnız bu harita ve gövde kuralı değişir.
// Bilerek yazılmayanlar: TIME (isteğe bağlı, paketli tamsayı; sistem saati), satır SOURCEINDEX (rehberde siparişte etiket değil, ölçüldü), döviz alanları,
// SL_DETAILS (lot; ilk dilimde lotlu satır gitmez), DBOP UPD (rehber: bu sürümde INSERT'e zorlar). Sipariş bağı yalnız satırda yazılır.
export const IRSALIYE_ALANLARI = SATIN_ALMA_ETIKETLERI;
const SATIR_ACIKLAMA_EN_COK = 50;
const BELGE_NO_EN_COK = 16; // VARSAYIM: STFICHE.DOCODE uzunluğu bilinmiyor; kırpmak yerine reddedilir.
const ONDALIK = /^\d+(\.\d+)?$/;
const SIFIR = /^0+(\.0+)?$/;

export type KabulTuru = 'satin_alma' | 'iade' | 'diger';
export interface KabulSatiri {
  sira: number;
  // Malzemenin Logo stok kodu; kart Logo'ya gitmediyse null.
  stokKodu: string | null;
  miktar: string;
  birim: string | null;
  // Sipariş satırının Logo satır kayıt numarası (ORFLINE.LOGICALREF); yoksa null.
  siparisSatiriLogoRef: number | null;
  // Konumun deposunun Logo ambar no'su.
  ambarNo: number | null;
  // Sipariş satırının TL birim fiyatı ve KDV oranı (ondalık metin); Logo'da PRICE ve VAT_RATE zorunlu. Dövizli ya da fiyatsız satırda null.
  fiyat: string | null;
  kdvOrani: string | null;
  // Satırın partisi var (kullanıcı kararı 25.11: ilk dilimde lotlu kalem Logo'ya gitmez).
  lotlu: boolean;
  aciklama?: string | null;
}
export interface KabulBelgesi {
  // Mal kabul belge no'su (MK-…); Logo fiş numarasıdır, sabit anahtar.
  no: string;
  tur: KabulTuru;
  irsaliyeNo: string | null;
  // YYYY-MM-DD, tedarikçinin irsaliye tarihi.
  irsaliyeTarihi: string | null;
  // Mal kabul tarihi YYYY-MM-DD.
  tarih: string;
  cariKodu: string | null;
  projeKodu: string | null;
  satirlar: readonly KabulSatiri[];
}

export type AtlamaNedeni = 'siparis-bagi-yok' | 'fiyat-yok' | 'kalan-yetersiz' | 'stok-kodu-yok' | 'ambar-yok' | 'birim-yok' | 'miktar-gecersiz' | 'lotlu';
export const ATLAMA_ILETILERI: Readonly<Record<AtlamaNedeni, string>> = Object.freeze({
  'siparis-bagi-yok': 'Siparişe bağlı değil (Logo siparişinde satır bağı yok).',
  'fiyat-yok': "Logo sipariş satırından TL fiyat ya da KDV oranı okunamadı.",
  'kalan-yetersiz': 'Logo siparişinde kalan miktar bu kabulü karşılamıyor (fazla teslimat); Logo\'ya gitmez.',
  'stok-kodu-yok': 'Malzeme kartı Logo\'ya gitmemiş.',
  'ambar-yok': 'Deponun Logo ambar no\'su yok.',
  'birim-yok': 'Birim yok.',
  'miktar-gecersiz': 'Miktar sıfırdan büyük bir sayı olmalı.',
  lotlu: 'Partili (lotlu) satır; ilk dilimde Logo\'ya gitmez.',
});
export type EngelNedeni = 'ambar-farkli' | 'tur' | 'irsaliye-no' | 'irsaliye-tarihi' | 'cari-kodu' | 'fis-no' | 'tarih' | 'gidecek-satir-yok';
export const ENGEL_ILETILERI: Readonly<Record<EngelNedeni, string>> = Object.freeze({
  'ambar-farkli': 'Satırlar farklı Logo ambarlarına giriyor; satırda ambar etiketi doğrulanana kadar tek ambarlı belge gider.',
  tur: 'Yalnız satın alma mal kabulü Logo\'ya irsaliye olarak gider.',
  'irsaliye-no': 'Tedarikçi irsaliye no\'su girilmemiş.',
  'irsaliye-tarihi': 'İrsaliye tarihi girilmemiş.',
  'cari-kodu': 'Tedarikçinin Logo cari kodu yok.',
  'fis-no': `Mal kabul no'su Logo fiş numarasına (en çok ${FIS_NO_EN_COK} karakter) sığmıyor.`,
  tarih: 'Mal kabul tarihi okunamadı.',
  'gidecek-satir-yok': 'Logo\'ya gidecek satır yok.',
});
export interface AtlananSatir { sira: number; neden: AtlamaNedeni }
export interface OnKontrolSonucu {
  engeller: EngelNedeni[];
  gidecek: KabulSatiri[];
  atlanan: AtlananSatir[];
  // Bağlı satırlar gider, bağsızlar gitmez (kullanıcı kararı 24.11: kısmi gönderim).
  kismi: boolean;
  gonderilebilir: boolean;
}

const bos = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === '';
// logoTarihi yalnız biçime bakar (ortak kural, değişmez); takvimde olmayan gün (2026-13-40, 2026-02-30) burada reddedilir.
const takvimdeVar = (iso: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

// İlk sebep yazılır (satır tek sebeple atlanır); sıra kullanıcıya en anlamlı olandan başlar.
export function satirAtlamaNedeni(s: KabulSatiri): AtlamaNedeni | null {
  if (s.lotlu) return 'lotlu';
  if (s.siparisSatiriLogoRef === null) return 'siparis-bagi-yok';
  if (bos(s.stokKodu) || (s.stokKodu?.trim().length ?? 0) > STOK_KODU_EN_COK) return 'stok-kodu-yok';
  if (s.ambarNo === null) return 'ambar-yok';
  if (bos(s.birim)) return 'birim-yok';
  if (!ONDALIK.test(s.miktar) || SIFIR.test(s.miktar)) return 'miktar-gecersiz';
  if (s.fiyat === null || !ONDALIK.test(s.fiyat) || s.kdvOrani === null || !ONDALIK.test(s.kdvOrani)) return 'fiyat-yok';
  return null;
}

export function irsaliyeOnKontrol(b: KabulBelgesi): OnKontrolSonucu {
  const engeller: EngelNedeni[] = [];
  if (b.tur !== 'satin_alma') engeller.push('tur');
  if (bos(b.irsaliyeNo) || (b.irsaliyeNo?.trim().length ?? 0) > BELGE_NO_EN_COK) engeller.push('irsaliye-no');
  if (bos(b.irsaliyeTarihi) || !takvimdeVar(b.irsaliyeTarihi ?? '')) engeller.push('irsaliye-tarihi');
  if (bos(b.cariKodu)) engeller.push('cari-kodu');
  if (b.no.trim() === '' || b.no.trim().length > FIS_NO_EN_COK) engeller.push('fis-no');
  if (!takvimdeVar(b.tarih)) engeller.push('tarih');
  const gidecek: KabulSatiri[] = [];
  const atlanan: AtlananSatir[] = [];
  for (const s of b.satirlar) {
    const neden = satirAtlamaNedeni(s);
    if (neden === null) gidecek.push(s);
    else atlanan.push({ sira: s.sira, neden });
  }
  if (gidecek.length === 0 && b.tur === 'satin_alma') engeller.push('gidecek-satir-yok');
  if (new Set(gidecek.map((s) => s.ambarNo)).size > 1) engeller.push('ambar-farkli');
  return { engeller, gidecek, atlanan, kismi: gidecek.length > 0 && atlanan.length > 0, gonderilebilir: engeller.length === 0 };
}

export interface IrsaliyeGovdesi { govde: Record<string, unknown> }
// Gönderilebilir belgenin köprü gövdesi. Önce irsaliyeOnKontrol: engel varsa hata, yoksa yalnız gidecek satırlar gövdeye girer.
export function irsaliyeGovdesi(b: KabulBelgesi): IrsaliyeGovdesi | { hata: string } {
  const k = irsaliyeOnKontrol(b);
  const engel = k.engeller[0];
  if (engel !== undefined) return { hata: ENGEL_ILETILERI[engel] };
  const a = IRSALIYE_ALANLARI;
  const ambar = k.gidecek[0]?.ambarNo ?? null;
  const satirlar = k.gidecek.map((s) => ({
    [a.satirTuru]: 0,
    [a.kod]: (s.stokKodu ?? '').trim(),
    [a.miktar]: Number(s.miktar),
    [a.fiyat]: Number(s.fiyat),
    [a.birim]: logoBirimKodu(s.birim ?? ''),
    [a.carpan1]: 1, [a.carpan2]: 1,
    [a.kdv]: Number(s.kdvOrani),
    [a.siparisSatiri]: s.siparisSatiriLogoRef,
    ...(bos(s.aciklama) ? {} : { [a.aciklama]: (s.aciklama ?? '').trim().slice(0, SATIR_ACIKLAMA_EN_COK) }),
  }));
  // Fiş numarası mal kabul no'sudur (sabit anahtar; VARSAYIM: Logo "~" yerine verilen numarayı da kabul eder). TIME gönderilmez.
  const govde: Record<string, unknown> = {
    [a.tur]: SATIN_ALMA_IRSALIYESI_TRCODE, [a.no]: b.no.trim(), [a.tarih]: logoTarihi(b.tarih),
    [a.belgeNo]: (b.irsaliyeNo ?? '').trim(), [a.cari]: (b.cariKodu ?? '').trim(),
    [a.ambar]: ambar, [a.maliyetGrubu]: ambar,
    // Mal kabul no'su ayrıca fiş açıklamasında taşınır: Logo'da aranabilir benzersiz anahtar (NUMBER Logo'da değişirse bile).
    [a.notlar1]: b.no.trim(),
    [a.satirlar]: satirlar,
  };
  if (!bos(b.projeKodu)) govde[a.proje] = (b.projeKodu ?? '').trim();
  return { govde };
}

// Çift kayıt kalkanı (kullanıcı kararı 24.11: hepsi yazılır; asıl kalkan göndermeden önce Logo'da aynı cari ve irsaliye no'sunu aramak).
// Girdi: Logo'da tedarikçi irsaliye no'suyla (ya da mal kabul no'suyla) yapılan genel belge araması. Yalnız Logo'dan gelen irsaliyeler (alış).
export type KalkanKarari =
  | { karar: 'gonder' }
  | { karar: 'esle'; logoKayitNo: number; neden: 'ayni-fis-no' | 'ayni-anahtar' }
  | { karar: 'yapilamadi'; ileti: string };
// İ, ı ve i aynı harf sayılır: tr büyük harfi 'i'yi 'İ' yapar ve "orn-irs" ile "ORN-IRS" ayrı görünür; çift kayıt kaçmasın diye gevşek karşılaştırılır.
const norm = (s: string): string => s.trim().replace(/[İıi]/g, 'I').toUpperCase();
const esit = (a: string | null, b: string | null): boolean => a !== null && b !== null && a.trim() !== '' && norm(a) === norm(b);

// Mal kabul no'su başka bir numaranın öneki olabilir (MK-ORN-0001, MK-ORN-00011): yalnız tam sözcük sayılır; sınır harf, rakam ve tire dışı karakter ya da uçtur.
function tamSozcukVar(metin: string, no: string): boolean {
  const aranan = norm(no).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9-])${aranan}($|[^A-Z0-9-])`).test(norm(metin));
}

// aramaSinirinaDayandi: sonuç sayısı arama sınırına eşitse "yok" söylenemez (kontrolKarari ile aynı ilke).
export function irsaliyeKalkani(
  b: { no: string; irsaliyeNo: string; cariKodu: string }, bulgular: readonly LogoBelgeBulgusuHam[], aramaSinirinaDayandi: boolean,
): KalkanKarari {
  const canli = bulgular.filter((x) => !x.iptal);
  const fisNoEsit = canli.filter((x) => esit(x.no, b.no));
  const belgeEsit = canli.filter((x) => esit(x.belgeNo, b.irsaliyeNo) && esit(x.cariKodu, b.cariKodu));
  if (fisNoEsit.length > 0 && belgeEsit.some((x) => !fisNoEsit.includes(x))) {
    return { karar: 'yapilamadi', ileti: "Logo'da aynı numaralı fiş ile aynı cari ve irsaliye no'lu başka bir kayıt var; Logo'da elle bakın." };
  }
  // Fiş açıklamasında mal kabul no'su (NOTES1): NUMBER Logo'da başka verilmiş olsa da kendi gönderdiğimiz kayıt tanınır.
  const anahtarEsit = canli.filter((x) => x.aciklama !== null && tamSozcukVar(x.aciklama, b.no));
  const bulunan = [...new Set([...fisNoEsit, ...belgeEsit, ...anahtarEsit])];
  if (bulunan.length > 1) return { karar: 'yapilamadi', ileti: "Logo'da eşleşebilecek birden çok irsaliye var; Logo'da elle bakın." };
  const tek = bulunan[0];
  // Aynı cari ve aynı tedarikçi irsaliye no'su tek başına eşleşme sayılmaz (Risk 3694-3 S1): düzeltme ya da parçalı kabul aynı irsaliye no'sunu başka mal kabulle
  // kullanır; otomatik eşlenirse bu kabul hiç yazılmazdı. Fiş no ya da NOTES1 anahtarı olmayan kayıt elle bakıma düşer.
  if (tek !== undefined && !fisNoEsit.includes(tek) && !anahtarEsit.includes(tek)) {
    return { karar: 'yapilamadi', ileti: "Logo'da aynı cari ve irsaliye no'lu başka bir kayıt var ama bu mal kabulün fiş no'suyla ya da anahtarıyla eşleşmiyor (düzeltme ya da parçalı kabul olabilir); Logo'da elle bakın." };
  }
  if (tek !== undefined) return { karar: 'esle', logoKayitNo: tek.logoKayitNo, neden: fisNoEsit.includes(tek) ? 'ayni-fis-no' : 'ayni-anahtar' };
  if (aramaSinirinaDayandi) return { karar: 'yapilamadi', ileti: "Arama sınıra dayandı; Logo'da bu irsaliye var mı söylenemez. Logo'da elle bakın." };
  return { karar: 'gonder' };
}

// Gönderimden hemen önce sipariş satırının kalanı Logo'dan yeniden okunur (kalan = AMOUNT - SHIPPEDAMOUNT; başka biri aynı siparişten irsaliye kesmiş
// olabilir). Kalanı aşan satır gitmez (VARSAYIM: fazla teslimatı Logo mu reddeder, biz mi engelleriz test edilecek; burada biz engelleriz).
// kalanlar: Logo sipariş satırı kayıt no'su -> kalan miktar (ondalık metin). Haritada olmayan satır okunamamıştır ve gitmez.
export function kalanKontrolu(gidecek: readonly KabulSatiri[], kalanlar: ReadonlyMap<number, string>): AtlananSatir[] {
  const atlanan: AtlananSatir[] = [];
  // Aynı sipariş satırına bağlı satırların miktarları toplanır; sırayla kalana sığanlar gider, sığmayan satır atlanır.
  const kullanilan = new Map<number, number>();
  const binde = (x: string): number => Math.round(Number(x) * 1000);
  for (const s of gidecek) {
    const ref = s.siparisSatiriLogoRef;
    const kalan = ref === null ? undefined : kalanlar.get(ref);
    if (ref === null || kalan === undefined || !ONDALIK.test(kalan)) { atlanan.push({ sira: s.sira, neden: 'kalan-yetersiz' }); continue; }
    const toplam = (kullanilan.get(ref) ?? 0) + binde(s.miktar);
    if (toplam > binde(kalan)) { atlanan.push({ sira: s.sira, neden: 'kalan-yetersiz' }); continue; }
    kullanilan.set(ref, toplam);
  }
  return atlanan;
}
