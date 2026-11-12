import { createHash } from 'node:crypto';
import { GKK_OLMAYAN_TURLER, KATALOG_ONAY_DURUMLARI, KATALOG_TURLERI, LOGO_KART_TURLERI } from '#paylasilan/sozlesme/malzemeler.ts';
import { KATEGORI_AGACI_TURLERI, TABAN_HAMMADDE_AILELERI } from '#paylasilan/sozlesme/kategori-agaci-sabitleri.ts';
import type { KategoriAgaciDugumu, KategoriAgaciTuru } from '#paylasilan/sozlesme/kategori-agaci-sabitleri.ts';
import type { HizmetYonu, KatalogKartDurumu, KatalogOnayDurumu, KatalogTuru, LogoEksik } from '#paylasilan/sozlesme/malzemeler.ts';

/* ---------------- Malzeme Kataloğu (prototip) kartları: MKK-1..MKK-15 ---------------- */

type Nesne = Record<string, unknown>;
const nesneMi = (d: unknown): d is Nesne => d !== null && typeof d === 'object' && !Array.isArray(d);

// MKK-1: yeni kartın stok kodu önekini ekran verir ("HM-PAS-00012" → "HM-PAS-"); sırayı sunucu verir, gelen sayı yok sayılır.
// Kabul edilen önek yalnız ekranın standart kod yapısıdır (`katalog.html` `kodOnek`, `KOD_DESEN`): TÜR-GRUP(3 harf ya da rakam)-. Serbest önek reddedilir.
// Logo sınırı: yeni verilen stok kodu en çok 24 karakter. Eski kayıtlardaki uzun kod okunur, yalnız yeni kod ve kod değişimi sınırlanır.
// Sınır önek kabulünde uygulanır: önek, en büyük sıra numarasıyla (`int`, 10 hane) bile sınırı aşmamalı; sıra aşamasında ayrı denetim gerekmez.
export const STOK_KODU_EN_COK = 24;
const EN_BUYUK_SIRA = 2_147_483_647;

// MKK-2: veritabanının ürettiği stok kodunun biçimi; 99999'dan sonra hane sayısı artar, kesilmez.
export const katalogStokKodu = (onek: string, sira: number): string =>
  `${onek}${sira < 100_000 ? String(sira).padStart(5, '0') : String(sira)}`;

export const katalogStokKoduSigarMi = (onek: string, sira: number, enCok = STOK_KODU_EN_COK): boolean => katalogStokKodu(onek, sira).length <= enCok;

const KOD_ONEKI_DESENI = /^((?:HM|YM|MM|SF|DB|HZ|TM)-[A-Z0-9]{3}-)\d+$/;
export function katalogKodOneki(stokKodu: string | null, enCok = STOK_KODU_EN_COK): string | null {
  const onek = KOD_ONEKI_DESENI.exec((stokKodu ?? '').trim().toUpperCase())?.[1] ?? null;
  return onek !== null && katalogStokKoduSigarMi(onek, EN_BUYUK_SIRA, enCok) ? onek : null;
}

// Kart #652: firma kodlu türlerde kod FİRMA-TÜR-sıra (ABC-MM-00001, ABC-YM-00001); firma kodu genel ayardadır (`genel.firmaKodu`),
// boşsa bütün türler tür-grup-sıra yapısında kalır. Sıra önek başınadır: her tür kendi sayacını alır.
// Hangi türlerin firma kodlu olduğu da genel ayardadır (`genel.firmaKoduTurleri`); ayar yoksa mamul ve yarı mamul.
// Tür kısaltması firma kodu olamaz: "HM-MM-00001" hammadde kodu gibi okunur.
const FIRMA_KODU_DESENI = /^[A-Z0-9]{2,5}$/;
const TUR_KISALTMALARI = ['HM', 'YM', 'MM', 'SF', 'DB', 'HZ', 'TM'];
export function katalogFirmaKoduGecerliMi(deger: unknown): boolean {
  if (deger === undefined || deger === null || deger === '') return true;
  return typeof deger === 'string' && FIRMA_KODU_DESENI.test(deger) && !TUR_KISALTMALARI.includes(deger);
}
// Genel ayardaki firma kodu; boş ya da kurala uymayan değer yok sayılır.
export function katalogFirmaKodu(genel: Record<string, unknown> | null): string | null {
  const firma = genel?.['firmaKodu'];
  return typeof firma === 'string' && firma !== '' && katalogFirmaKoduGecerliMi(firma) ? firma : null;
}
const FIRMA_KODLU_VARSAYILAN: readonly string[] = ['mamul', 'yarimamul'];
export function katalogFirmaKoduTurleriGecerliMi(deger: unknown): boolean {
  if (deger === undefined || deger === null) return true;
  return Array.isArray(deger) && new Set(deger).size === deger.length
    && deger.every((t) => typeof t === 'string' && (KATALOG_TURLERI as readonly string[]).includes(t));
}
export function katalogFirmaKodluTurler(genel: Record<string, unknown> | null): readonly string[] {
  const l = genel?.['firmaKoduTurleri'];
  return Array.isArray(l) && katalogFirmaKoduTurleriGecerliMi(l) ? (l as string[]) : FIRMA_KODLU_VARSAYILAN;
}
export function katalogFirmaOneki(genel: Record<string, unknown> | null, tur: string): string | null {
  const turKodu = TUR_ONEKI[tur];
  const firma = katalogFirmaKodu(genel);
  return turKodu === undefined || firma === null || !katalogFirmaKodluTurler(genel).includes(tur) ? null : `${firma}-${turKodu}-`;
}

export interface KatalogGecisi {
  onceki: KatalogKartDurumu | null;
  yeni: KatalogKartDurumu;
  islemler: readonly string[];
  kisiId: number;
  acanKisiId: number | null;
  gonderenKisiId: number | null;
  dortGozAcik: boolean;
  onayAkisiAcik: boolean;
  // Kayıtlı kartın içeriği, benzersiz anahtarı ya da gerekçesi bu yazmayla değişiyor mu (`katalogIcerigiDegistiMi`).
  icerikDegisti: boolean;
  // Aynısı, `onay` alt nesnesi sayılmadan: onay adımı yalnız onayı değiştirir.
  onaysizIcerikDegisti: boolean;
  // Kayıtlı kart hiç onaylanmadı mı (`katalogHicOnaylanmadiMi`); yeni kartta true.
  hicOnaylanmadi: boolean;
}

// MKK-3..MKK-5, MKK-12..MKK-14: kartın onay durumunun değişmesi. Uç yazma yetkisiyle açılır; onay gerektiren geçişi burası ayırır.
export function katalogGecisiDenetle(g: KatalogGecisi): { kod: 'YETKI_YOK' | 'GECERSIZ'; mesaj: string } | null {
  const onaylar = g.islemler.includes('malzemeler.onayla');
  if (g.onceki === 'iptal') return { kod: 'GECERSIZ', mesaj: 'İptal edilen kart değiştirilemez.' };
  // MKK-5: yeni kart onay yolundan geçmeden pasif açılmaz.
  if (g.onceki === null && g.yeni === 'pasif') return { kod: 'GECERSIZ', mesaj: 'Yeni kart pasif olarak açılamaz.' };
  // MKK-12: aktif ya da onaydaki kartı taslağa çekmek (reddetmek, geri çekmek) ve aktif kartı onaya düşürmek onay yetkilisinin işidir;
  // yoksa kullanımdaki kart düşürülüp iptal edilebilir. Ekran aktif kartı kendi başına onaya düşürmez (değişiklik talebi yazar).
  // MLZ-5 a: hiç onaylanmamış kartı açan ya da onaya gönderen, kartı içeriğine dokunmadan onaydan taslağa geri çeker.
  // Kullanılmış kartın onaydan düşürülmesi onay yetkilisinde kalır.
  const sahip = g.kisiId === g.acanKisiId || g.kisiId === g.gonderenKisiId;
  if (g.onceki === 'onayda' && g.yeni === 'taslak' && !onaylar && sahip && g.hicOnaylanmadi) {
    return g.onaysizIcerikDegisti ? { kod: 'GECERSIZ', mesaj: 'Onaydan geri çekerken kartın içeriği değiştirilemez; önce geri çek, sonra düzenle.' } : null;
  }
  if (g.yeni === 'taslak' && (g.onceki === 'aktif' || g.onceki === 'onayda') && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Aktif ya da onaydaki kartı taslağa çekmek için onay yetkisi gerekir.' };
  }
  if (g.onceki === 'aktif' && g.yeni === 'onayda' && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Aktif kartı onaya düşürmek için onay yetkisi gerekir; değişikliği talep olarak gönder.' };
  }
  // MKK-13: onay akışı açıkken aktif kartın içeriği onaysız değişmez; değişiklik talep olarak bekler.
  if (g.onayAkisiAcik && g.onceki === 'aktif' && g.yeni === 'aktif' && g.icerikDegisti && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Aktif kartın içeriğini değiştirmek için onay yetkisi gerekir; değişikliği talep olarak gönder.' };
  }
  // MKK-13: pasif kartın içeriği de onay yetkisi olmadan değişmez.
  if (g.onceki === 'pasif' && g.yeni === 'pasif' && g.icerikDegisti && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Pasif kartın içeriğini değiştirmek için onay yetkisi gerekir.' };
  }
  if (g.yeni === 'aktif' && g.onceki !== 'aktif') {
    // MKK-3: onay akışı açıkken kart ancak onay yetkisiyle aktif olur.
    if (g.onayAkisiAcik && !onaylar) return { kod: 'YETKI_YOK', mesaj: 'Kartı aktif yapmak için onay yetkisi gerekir.' };
    // MKK-4: onay akışı açıkken aktife yalnız onaydan geçilir; adım atlanamaz.
    if (g.onayAkisiAcik && g.onceki !== 'onayda') return { kod: 'GECERSIZ', mesaj: 'Kart önce onaya gönderilmeli.' };
    // MKK-4: dört göz açıkken onaya gönderen ve kartı açan kişi onaylayamaz.
    if (g.onayAkisiAcik && g.dortGozAcik && (g.gonderenKisiId === g.kisiId || g.acanKisiId === g.kisiId)) {
      return { kod: 'YETKI_YOK', mesaj: 'Kendi açtığın ya da onaya gönderdiğin kartı onaylayamazsın.' };
    }
    // MKK-4: dört göz açıkken onaylayan, gönderilen içeriği değiştirip onaylayamaz (onay adımı yalnız onayı değiştirir).
    if (g.onayAkisiAcik && g.dortGozAcik && g.onaysizIcerikDegisti) {
      return { kod: 'YETKI_YOK', mesaj: 'Onay sırasında kartın içeriği değiştirilemez; değiştirirsen kart sana ait olur, başkası onaylamalı.' };
    }
  }
  // MKK-5: pasife alma ve pasiften çıkarma onay yetkisi ister.
  if ((g.yeni === 'pasif') !== (g.onceki === 'pasif') && g.onceki !== null && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Kartı pasife almak ya da yeniden açmak için onay yetkisi gerekir.' };
  }
  return null;
}

// Kart içeriğinin onaysız değişmesi sayılmayan alanlar: ekranın bekleyen değişiklik talebi, geçmiş kaydı ve zaman damgası.
// Talep kartı değiştirmez; onaycı uygulayana kadar kartın içeriği (onay durumu dahil) aynı kalır.
const ICERIK_DISI_ALANLAR = ['talep', 'rev', 'updatedAt'];

function kararliMetin(d: unknown): string {
  if (Array.isArray(d)) return `[${d.map(kararliMetin).join(',')}]`;
  if (d !== null && typeof d === 'object') {
    return `{${Object.entries(d as Nesne).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${kararliMetin(v)}`).join(',')}}`;
  }
  return JSON.stringify(d);
}

// Stok kodunu veritabanı verir (`com.kod` her yazmada ona çekilir); içerik karşılaştırması kodu aynı sayar.
function katalogIcerigi(kayit: Nesne, stokKodu: string, onayDahil: boolean): string {
  const haric = onayDahil ? ICERIK_DISI_ALANLAR : [...ICERIK_DISI_ALANLAR, 'onay'];
  const ic = Object.fromEntries(Object.entries(kayit).filter(([k]) => !haric.includes(k)));
  if (nesneMi(ic['com'])) ic['com'] = { ...ic['com'], kod: stokKodu };
  return kararliMetin(ic);
}

export interface KatalogIcerigi { kayit: Nesne; benzersizAnahtar: string | null; mukerrerGerekcesi: string | null }

export function katalogIcerigiDegistiMi(kayitli: KatalogIcerigi & { stokKodu: string }, gelen: KatalogIcerigi, onayDahil = true): boolean {
  return (kayitli.benzersizAnahtar ?? null) !== (gelen.benzersizAnahtar ?? null)
    || (kayitli.mukerrerGerekcesi ?? null) !== (gelen.mukerrerGerekcesi ?? null)
    || katalogIcerigi(kayitli.kayit, kayitli.stokKodu, onayDahil) !== katalogIcerigi(gelen.kayit, kayitli.stokKodu, onayDahil);
}

export interface KatalogKaydiAlanlari { tur: KatalogTuru; onayDurumu: KatalogOnayDurumu; stokKodu: string | null; hizmetYonu: HizmetYonu | null }
export interface KatalogOzetAlanlari { tur?: string | undefined; onay_durumu?: string | undefined; stok_kodu?: string | null | undefined }

const katalogTuruMu = (d: unknown): d is KatalogTuru => KATALOG_TURLERI.some((t) => t === d);
const katalogOnayDurumuMu = (d: unknown): d is KatalogOnayDurumu => KATALOG_ONAY_DURUMLARI.some((t) => t === d);

// MKK-14: sütuna yazılan tür, onay durumu ve yeni kodun öneki kartın kendisinden okunur; ekran kartı kayıttan çizer, istemcinin özeti değil.
// Ekran gibi: `tur` boşsa hammadde; `onay` yoksa ekran kartı aktif sayar, bu yüzden onay durumu zorunludur. Özet bu alanları taşırsa kartla aynı olmalı.
export function katalogKaydiAlanlari(kayit: Nesne, ozet: KatalogOzetAlanlari): KatalogKaydiAlanlari | { alan: string; mesaj: string } {
  const tur = kayit['tur'] === undefined || kayit['tur'] === null || kayit['tur'] === '' ? 'hammadde' : kayit['tur'];
  if (!katalogTuruMu(tur)) return { alan: 'kayit.tur', mesaj: 'Kartın türü geçerli bir malzeme türü olmalı.' };
  const onayDurumu = nesneMi(kayit['onay']) ? kayit['onay']['durum'] : undefined;
  if (!katalogOnayDurumuMu(onayDurumu)) return { alan: 'kayit.onay.durum', mesaj: 'Kartın onay durumu taslak, onayda, aktif ya da pasif olmalı.' };
  const com = kayit['com'];
  const kod = nesneMi(com) && typeof com['kod'] === 'string' && com['kod'].trim() !== '' ? com['kod'].trim() : null;
  if (ozet.tur !== undefined && ozet.tur !== tur) return { alan: 'kayit.tur', mesaj: 'Kartın türü özetle tutarlı olmalı.' };
  if (ozet.onay_durumu !== undefined && ozet.onay_durumu !== onayDurumu) return { alan: 'kayit.onay.durum', mesaj: 'Kartın onay durumu özetle tutarlı olmalı.' };
  if (ozet.stok_kodu !== undefined && ozet.stok_kodu !== null && ozet.stok_kodu !== kod) return { alan: 'kayit.com.kod', mesaj: 'Kartın stok kodu özetle tutarlı olmalı.' };
  const hizmetYonu = tur === 'hizmet' ? kartHizmetYonu(kayit) : null;
  if (tur === 'hizmet' && hizmetYonu === null) return { alan: 'kayit.g.yon', mesaj: 'Hizmet kartının yönü alınan ya da verilen olmalı.' };
  return { tur, onayDurumu, stokKodu: kod, hizmetYonu };
}

// 208 a: ağırlık ve adlar yalnız hammaddede anlamlıdır; başka türde silinir. Hammaddede özet üçünden birini taşımıyorsa kayıtlı değer
// korunur (null döner): ağırlığı hesaplamayan eski istemci kaydı onu silmesin. Boş ad yazılmaz.
export interface KatalogAgirlikAlanlari { birimAgirlikKg: number | null; kaliteAdi: string | null; formAdi: string | null }
export interface KatalogAgirlikOzeti { birim_agirlik_kg?: number | null | undefined; kalite_adi?: string | null | undefined; form_adi?: string | null | undefined }

export function katalogAgirlikAlanlari(tur: KatalogTuru, ozet: KatalogAgirlikOzeti): KatalogAgirlikAlanlari | null {
  if (tur !== 'hammadde') return { birimAgirlikKg: null, kaliteAdi: null, formAdi: null };
  if (ozet.birim_agirlik_kg === undefined && ozet.kalite_adi === undefined && ozet.form_adi === undefined) return null;
  const ad = (d: string | null | undefined): string | null => d?.trim() || null;
  return { birimAgirlikKg: ozet.birim_agirlik_kg ?? null, kaliteAdi: ad(ozet.kalite_adi), formAdi: ad(ozet.form_adi) };
}

// 1247 d: kartın yazılacak GKK ayarı. Gelmezse kayıtlı değer korunur, null türün varsayılanıdır. GKK'ya giremeyen türde ayar silinir
// (tür değişimi eski ayarı taşımasın); orada açık istenirse reddedilir.
export const GKK_TURU_ILETISI = 'Demirbaş ve hizmet kartında giriş kalite kontrolü açılmaz.';
export function katalogGkkAyari(tur: KatalogTuru, gelen: boolean | null | undefined): { yaz: boolean; deger: boolean | null } | { hata: string } {
  if (GKK_OLMAYAN_TURLER.some((t) => t === tur)) return gelen === true ? { hata: GKK_TURU_ILETISI } : { yaz: true, deger: null };
  return gelen === undefined ? { yaz: false, deger: null } : { yaz: true, deger: gelen };
}

// 334 a: Açıklama 1, 2, 3 ekranın kuralıyla kurulur, sunucu yalnız saklar. Üçü de gelmezse null (kayıtlı değerler korunur); boş metin null.
export type KatalogAciklamalari = [string | null, string | null, string | null];
export interface KatalogAciklamaOzeti { aciklama_1?: string | null | undefined; aciklama_2?: string | null | undefined; aciklama_3?: string | null | undefined }

export function katalogAciklamalari(ozet: KatalogAciklamaOzeti): KatalogAciklamalari | null {
  if (ozet.aciklama_1 === undefined && ozet.aciklama_2 === undefined && ozet.aciklama_3 === undefined) return null;
  const metin = (d: string | null | undefined): string | null => d?.trim() || null;
  return [metin(ozet.aciklama_1), metin(ozet.aciklama_2), metin(ozet.aciklama_3)];
}

// 214 a: talaş = kütük ağırlığı - net parça ağırlığı. Net ağırlık parçanın kendisidir; mamul ve yarı mamul kartında elle girilen
// "Net ağırlık" alanından (`g.net`) okunur. Ekranın reçete toplamına düşen yedeği kütük ağırlığı olduğundan alınmaz.
export function katalogNetAgirlikKg(tur: KatalogTuru, kayit: Nesne): number | null {
  if (tur !== 'mamul' && tur !== 'yarimamul') return null;
  const g = kayit['g'];
  const ham = nesneMi(g) ? g['net'] : undefined;
  const sayi = typeof ham === 'number' ? ham : typeof ham === 'string' && ham.trim() !== '' ? Number(ham.trim().replace(/\s/g, '').replace(',', '.')) : Number.NaN;
  const yuvarlak = Number.isFinite(sayi) && sayi < 1e9 ? Math.round(sayi * 1e4) / 1e4 : 0;
  return yuvarlak > 0 ? yuvarlak : null;
}

// MH5 a: ekran yönü seçim metniyle yazar (`kayit.g.yon`: "Alınan" / "Verilen"); sütun değeri ASCII'dir. Başka değer yön değildir.
const HIZMET_YONU_METNI: Record<string, HizmetYonu> = { 'Alınan': 'alinan', 'Verilen': 'verilen', alinan: 'alinan', verilen: 'verilen' };
export function kartHizmetYonu(kayit: Nesne): HizmetYonu | null {
  const g = kayit['g'];
  if (!nesneMi(g) || typeof g['yon'] !== 'string') return null;
  return HIZMET_YONU_METNI[g['yon'].trim()] ?? null;
}

// Madde 6: hizmet reçete bileşeni ve operasyon sarfı olamaz. Kartın reçetesinde (`bom[].ref`) ve operasyon sarflarında (`ops[].sarf[].ref`)
// başvurduğu kart kimlikleri; serbest satır (ref yok) sayılmaz.
export function kartBilesenKimlikleri(kayit: Nesne): string[] {
  const refler = (l: unknown): string[] => (Array.isArray(l) ? l.filter(nesneMi).map((r) => r['ref']).filter((r): r is string => typeof r === 'string' && r !== '') : []);
  const ops = Array.isArray(kayit['ops']) ? kayit['ops'].filter(nesneMi) : [];
  return [...new Set([...refler(kayit['bom']), ...ops.flatMap((o) => refler(o['sarf']))])];
}

// Bildirim metni için kartın adı (`com.ad`); boş ya da yoksa null.
export function katalogKartAdi(kayit: Nesne): string | null {
  const com = kayit['com'];
  return nesneMi(com) && typeof com['ad'] === 'string' && com['ad'].trim() !== '' ? com['ad'].trim() : null;
}

// MLZ-5 a: ekran onaydan geri çekmeyi ret damgasına `geri: true` ile yazar; geri çekme gönderene ret bildirimi doğurmaz.
export function katalogGeriCekildiMi(kayit: Nesne): boolean {
  const onay = kayit['onay'];
  return nesneMi(onay) && nesneMi(onay['red']) && onay['red']['geri'] === true;
}

// Kart #688: kartın Operasyonlar adımı (`ops[]`) rotaya taslak olarak aktarılır. Kodu boş satır alınmaz; ad yoksa null (kod uydurulmaz).
// Numara ekranın kuralıyla verilir (`katalog.html` `opNoDuzenle`, `opSirala`): numarası olmayan satır kendinden öncekinin 10 fazlasını alır,
// sonra numaraya göre sıralanır (eşitler kart sırasını korur). Rota adım numarası tekil ve artan olmalı: eşit numara bir öncekinin 1 fazlasını alır.
export interface KartOperasyonu { no: number; kod: string; ad: string | null }
interface KartOperasyonSatiri extends KartOperasyonu { merkez: string | null }
function kartOperasyonSatirlari(kayit: Nesne): KartOperasyonSatiri[] {
  const ops = Array.isArray(kayit['ops']) ? kayit['ops'].filter(nesneMi) : [];
  let son = 0;
  const satirlar = ops.map((o) => {
    const n = typeof o['no'] === 'number' && Number.isInteger(o['no']) && o['no'] > 0 ? o['no'] : son + 10;
    son = n;
    const kod = typeof o['kod'] === 'string' ? o['kod'].trim() : '';
    const ad = typeof o['ad'] === 'string' && o['ad'].trim() !== '' ? o['ad'].trim() : null;
    const merkez = typeof o['merkez'] === 'string' && o['merkez'].trim() !== '' ? o['merkez'].trim() : null;
    return { no: n, kod, ad, merkez };
  }).filter((o) => o.kod !== '');
  let onceki = 0;
  return satirlar.map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.no - b.s.no || a.i - b.i)
    .map(({ s }) => {
      onceki = s.no > onceki ? s.no : onceki + 1;
      return { ...s, no: onceki };
    });
}
export function kartOperasyonlari(kayit: Nesne): KartOperasyonu[] {
  return kartOperasyonSatirlari(kayit).map(({ no, kod, ad }) => ({ no, kod, ad }));
}

// C1 (ana veri 1298-1305; OS1): operasyon tipi ve istasyonun sahibi İstasyonlar'dır. Kart kodu ve eski "merkez" metnini tutar;
// kimlikler okumada çözülür, karta yazılmaz (jsonb değişmez, rotalı kartın içerik denetimi etkilenmez). Kod büyük-küçük harf ve
// kenar boşluğu farkı gözetmeden eşlenir; pasif tip ve istasyon da eşlenir (kimlik kimliktir, kullanılıp kullanılmayacağına okuyan
// karar verir). Birden çok adaya uyan ya da hiçbirine uymayan değer null kalır, tahmin edilmez. İstasyon kodla, kod tutmazsa adla aranır.
export interface KimlikliKartOperasyonu extends KartOperasyonu { operasyonTipiId: number | null; istasyonId: number | null }
export function kartOperasyonKimlikleri(
  kayit: Nesne,
  tipler: readonly { id: number; kod: string }[],
  istasyonlar: readonly { id: number; kod: string; ad: string }[],
): KimlikliKartOperasyonu[] {
  const anahtar = (m: string) => m.trim().toLocaleLowerCase('tr-TR');
  const tek = <T extends { id: number }>(l: readonly T[], deger: (x: T) => string, aranan: string): number | null => {
    const bulunan = l.filter((x) => anahtar(deger(x)) === aranan);
    return bulunan.length === 1 ? bulunan[0]!.id : null;
  };
  return kartOperasyonSatirlari(kayit).map(({ no, kod, ad, merkez }) => {
    const m = merkez === null ? null : anahtar(merkez);
    const istasyonId = m === null ? null : tek(istasyonlar, (x) => x.kod, m) ?? tek(istasyonlar, (x) => x.ad, m);
    return { no, kod, ad, operasyonTipiId: tek(tipler, (x) => x.kod, anahtar(kod)), istasyonId };
  });
}

// C1: operasyon listesi İstasyonlar > Operasyon tipleri'ndedir; katalogun eski `operasyonlar` ayarı okunur ama yazılmaz.
export const OPERASYON_AYARI_ILETISI = 'Operasyon listesi İstasyonlar > Operasyon tipleri sayfasında düzenlenir; bu ayar salt okunur.';

// 233 a: rotası olan kartın operasyonları ve reçetesi Reçete ve Rota'da düzenlenir, kart yalnız gösterir. Ekran Operasyonlar adımını
// her çizişte yeniden numaralar; numara kartOperasyonlari kuralıyla verilip sıralanır, böylece yalnız satır içeriği ya da sırası değişince
// değişmiş sayılır. Bekleyen değişiklik talebinin önerdiği kart da aynı denetimden geçer.
function rotaIcerigi(kayit: Nesne): string {
  const ops = Array.isArray(kayit['ops']) ? kayit['ops'].filter(nesneMi) : [];
  let son = 0;
  const numarali = ops.map((o, i) => {
    const n = typeof o['no'] === 'number' && Number.isInteger(o['no']) && o['no'] > 0 ? o['no'] : son + 10;
    son = n;
    return { o: { ...o, no: n }, i };
  }).sort((a, b) => a.o.no - b.o.no || a.i - b.i).map((x) => x.o);
  return kararliMetin({ ops: numarali, bom: Array.isArray(kayit['bom']) ? kayit['bom'] : [] });
}
export function kartRotaIcerigiDegistiMi(kayitli: Nesne, gelen: Nesne): boolean {
  const eski = rotaIcerigi(kayitli);
  const talep = gelen['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? [gelen, talep['yeni']] : [gelen];
  return yeni.some((k) => rotaIcerigi(k) !== eski);
}
export const ROTALI_KART_ILETISI = 'Bu kartın rotası var; operasyon ve reçete Reçete ve Rota\'da düzenlenir.';

// UYUM-BORCU madde 4: hammaddenin ölçüsü ekranın kuralıyla (`katalog.html` `FORMS`, `dimVals`, `dimsErr`) sunucuda da denetlenir; doğrudan API kaydı da aynı sınırı tutar.
// Form bilinmeli, formun her ölçüsü sıfırdan büyük sayı olmalı, form kendi sınırını tutmalı; ölçüsüz hammadde de reddedilir (157 a, ekranın ölçü adımı gibi).
// Kayıtlı kartta yalnız form ya da ölçü değişince bakılır: eski kayıt düzenlemeye kilitlenmez.
type OlcuSiniri = (o: Record<string, number>) => string | null;
const HAMMADDE_FORMLARI: Readonly<Record<string, { olculer: readonly string[]; sinir?: OlcuSiniri }>> = {
  levha: { olculer: ['t', 'w', 'l'] },
  cubuk: { olculer: ['d', 'l'] },
  altigen: { olculer: ['s', 'l'] },
  lama: { olculer: ['a', 'b', 'l'] },
  boru: { olculer: ['D', 't', 'l'], sinir: (o) => (2 * o['t']! < o['D']! ? null : 'Et kalınlığı dış çapın yarısından küçük olmalı.') },
  kutu: { olculer: ['a', 'b', 't', 'l'], sinir: (o) => (2 * o['t']! < o['a']! && 2 * o['t']! < o['b']! ? null : 'Et kalınlığı kenarların yarısından küçük olmalı.') },
  kosebent: { olculer: ['a', 'b', 't', 'l'], sinir: (o) => (o['t']! < o['a']! && o['t']! < o['b']! ? null : 'Et kalınlığı kol boyundan küçük olmalı.') },
  tel: { olculer: ['d', 'L'] },
  kord: { olculer: ['d', 'L'] },
  rulo: { olculer: ['t', 'w', 'L'] },
  blok: { olculer: ['a', 'b', 'h'] },
  disk: { olculer: ['d', 't'] },
  oring: { olculer: ['d1', 'd2'] },
  granul: { olculer: ['kg'] },
  kumas: { olculer: ['g', 'w', 'L'] },
};
const hammaddeMi = (kayit: Nesne): boolean => kayit['tur'] === undefined || kayit['tur'] === null || kayit['tur'] === '' || kayit['tur'] === 'hammadde';
const olcuBilgisi = (kayit: Nesne): string => kararliMetin({ form: kayit['form'] ?? null, dims: kayit['dims'] ?? null });
function olcuHatasi(kayit: Nesne): string | null {
  const form = kayit['form'];
  const dims = kayit['dims'];
  const formVar = typeof form === 'string' && form !== '';
  const tanim = formVar && Object.hasOwn(HAMMADDE_FORMLARI, form) ? HAMMADDE_FORMLARI[form] : undefined;
  if (!tanim) return 'Bir form seç.';
  const o: Record<string, number> = {};
  for (const k of tanim.olculer) {
    const v = nesneMi(dims) ? dims[k] : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 'Tüm ölçüleri sıfırdan büyük girmelisin.';
    o[k] = v;
  }
  return tanim.sinir ? tanim.sinir(o) : null;
}
export function hammaddeOlcuHatasi(kayitli: Nesne | null, gelen: Nesne): string | null {
  const talep = gelen['talep'];
  const adaylar = nesneMi(talep) && nesneMi(talep['yeni']) ? [gelen, talep['yeni']] : [gelen];
  const taban = kayitli && hammaddeMi(kayitli) ? kayitli : null;
  for (const k of adaylar) {
    if (!hammaddeMi(k)) continue;
    if (taban && olcuBilgisi(taban) === olcuBilgisi(k)) continue;
    const hata = olcuHatasi(k);
    if (hata) return hata;
  }
  return null;
}

// Kart #466: tedarikçi Müşteriler ve Tedarikçiler modülündeki firmanın kimliğiyle yazılır (`com.tedId`); yoksa eski serbest metin kalır.
// Dönüş: kimlik yok (null), geçerli kimlik ya da biçim hatası.
export function kartTedarikciKimligi(com: Nesne): number | null | 'gecersiz' {
  const id = com['tedId'];
  if (id === undefined || id === null || id === '') return null;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : 'gecersiz';
}

// Kartın kendisi ve bekleyen değişiklik talebinin önerdiği kart: ikisinin tedarikçi bağı da aynı denetimden geçer
// (talep, onaylanınca karta yazılır; geçersiz bağ onaylayana hiç gitmemeli).
export function kartTedarikciKimlikleri(kayit: Nesne): (number | 'gecersiz')[] {
  const talep = kayit['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? talep['yeni'] : null;
  return [kayit['com'], yeni?.['com']].filter(nesneMi).map(kartTedarikciKimligi).filter((k): k is number | 'gecersiz' => k !== null);
}
// 312 b: kartın kendi tedarikçi bağı (talebin önerdiği değil) yabancı anahtarlı sütuna yazılır; bağ yoksa boş.
export function kartTedarikciFirmaId(kayit: Nesne): number | null {
  const com = kayit['com'];
  const id = nesneMi(com) ? kartTedarikciKimligi(com) : null;
  return typeof id === 'number' ? id : null;
}
// 885 a: demirbaş kartı ölçü aletini Kalibrasyon'daki numarasıyla anar (`g.aletNo`). Kart ve bekleyen talebin önerdiği kart aynı
// denetimden geçer (tedarikçi bağıyla aynı). Dönüş: kırpılmış numara ya da biçim hatası; boş alan yok sayılır.
function kartAletNosu(g: unknown): string | null | 'gecersiz' {
  if (!nesneMi(g)) return null;
  const no = g['aletNo'];
  if (no === undefined || no === null) return null;
  if (typeof no !== 'string' || no.length > 100) return 'gecersiz';
  return no.trim() === '' ? null : no.trim();
}
export function kartAletNolari(kayit: Nesne): (string | 'gecersiz')[] {
  const talep = kayit['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? talep['yeni'] : null;
  return [kayit['g'], yeni?.['g']].map(kartAletNosu).filter((n): n is string => n !== null);
}
export function kartAletNo(kayit: Nesne): string | null {
  const no = kartAletNosu(kayit['g']);
  return no === 'gecersiz' ? null : no;
}
// Bağlı numara Kalibrasyon'daki yazımıyla saklanır (büyük harf); karttaki yazım da ona çekilir.
export function kartAletNoYaz(kayit: Nesne, no: string | null): Nesne {
  const g = kayit['g'];
  if (!nesneMi(g)) return kayit;
  const yeni: Nesne = { ...g };
  if (no === null) delete yeni['aletNo'];
  else yeni['aletNo'] = no;
  return { ...kayit, g: yeni };
}
// 885 a: kalibrasyon ayı, son kalibrasyon ve kuruluşu Kalibrasyon modülünündür; karttaki eski değerler salt okunurdur. Gelen değer
// yok sayılır, kayıtlı değer korunur; yeni kartta bu alanlar boş başlar.
export const ESKI_KALIBRASYON_ALANLARI = ['kalAy', 'sonKal', 'kalKurulus'] as const;
export function eskiKalibrasyonAlanlariniKoru(kayit: Nesne, kayitli: Nesne | null): Nesne {
  const g = kayit['g'];
  if (!nesneMi(g)) return kayit;
  const eski = kayitli !== null && nesneMi(kayitli['g']) ? kayitli['g'] : {};
  const yeni: Nesne = { ...g };
  for (const k of ESKI_KALIBRASYON_ALANLARI) {
    if (eski[k] === undefined) delete yeni[k];
    else yeni[k] = eski[k];
  }
  return { ...kayit, g: yeni };
}
export function tedarikciDegistiMi(kayitliKayit: Nesne | null, tedId: number): boolean {
  const com = kayitliKayit?.['com'];
  return !nesneMi(com) || kartTedarikciKimligi(com) !== tedId;
}
// Malzeme denetimi 1/5 (kullanıcı kararı "Reddedilsin"): kategori yalnız sarf, demirbaş ve hizmette, `g.kat` dolu metin ise vardır (özet sorgusunun
// `KATALOG_KATEGORI` ifadesiyle aynı). Kart ve bekleyen talebin önerdiği kart aynı denetimden geçer.
const KATEGORILI_TURLER = new Set(['sarf', 'demirbas', 'hizmet']);
function kartKategorisi(kayit: Nesne, tur: string): string | null {
  const g = kayit['g'];
  const kat = nesneMi(g) && typeof g['kat'] === 'string' ? g['kat'].trim() : '';
  return KATEGORILI_TURLER.has(tur) && kat !== '' ? kat : null;
}
// Denetlenecek kategoriler: kayıtlı kartta aynı türle duran kategori yeniden sorulmaz (mevcut kartlara dokunulmaz).
// Gerekçeli mükerrer kart anahtar çakışmasını atlar; tek harflik gerekçe denetimi boşa çıkarırdı (kullanıcı kararı 16.10.2026: en az 10 karakter).
export const MUKERRER_GEREKCE_EN_AZ = 10;
export const MUKERRER_GEREKCE_ILETISI = `Mükerrer kart gerekçesi en az ${MUKERRER_GEREKCE_EN_AZ} karakter olmalı; aynı malzemenin neden ayrı kartı gerektiğini yazın.`;
// Kayıtlı gerekçe değişmedikçe sorulmaz: kuraldan önce kısa gerekçeyle kaydolmuş kart yeniden kaydedilir.
export function mukerrerGerekcesiKisaMi(gerekce: string | null, kayitli: string | null): boolean {
  return gerekce !== null && gerekce !== kayitli && Array.from(gerekce.trim()).length < MUKERRER_GEREKCE_EN_AZ;
}

export function denetlenecekKategoriler(kayit: Nesne, tur: string, kayitli: { kayit: Nesne; tur: string } | null): string[] {
  const talep = kayit['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? talep['yeni'] : null;
  const onceki = kayitli && kayitli.tur === tur ? kartKategorisi(kayitli.kayit, tur) : null;
  const katlar = [kartKategorisi(kayit, tur), yeni ? kartKategorisi(yeni, tur) : null].filter((k): k is string => k !== null && k !== onceki);
  return [...new Set(katlar)];
}
// MKK-1: önekin tür kısmı kartın türüyle aynı olmalı (prototipin `KOD_TUR` tablosu).
const TUR_ONEKI: Record<string, string> = { hammadde: 'HM', yarimamul: 'YM', mamul: 'MM', sarf: 'SF', demirbas: 'DB', hizmet: 'HZ', ticari_mal: 'TM' };
export function katalogOnekiTureUyarMi(onek: string, tur: string): boolean {
  const beklenen = TUR_ONEKI[tur];
  return beklenen !== undefined && onek.split('-')[0] === beklenen;
}

// MKK-2b: tür ve stok kodu yalnız hiç aktif olmamış taslakta değişir; onayda, aktif, pasif, iptal durumunda ve bir kez aktif olmuş kartta
// (taslağa çekilse de) kilitlidir.
export const katalogKodDegisebilirMi = (durum: KatalogKartDurumu, aktifOlmus: boolean): boolean => durum === 'taslak' && !aktifOlmus;

// Kural 1a (kullanıcı kartı 17.10.2026): hiç aktif olmamış taslakta ekran grup, çeşit ya da kategori değişince yeni önekli kod gösterir;
// sunucu o öneki alır. Geçersiz ya da türe ters önek kodu değiştirmez (kayıtlı kod kalır, kayıt reddedilmez). Tür değişimi ayrı yoldur.
export function katalogYeniOnek(
  k: { durum: KatalogKartDurumu; aktifOlmus: boolean; kayitliOnek: string; tur: string; gelenKod: string | null },
): string | null {
  if (!katalogKodDegisebilirMi(k.durum, k.aktifOlmus)) return null;
  const onek = katalogKodOneki(k.gelenKod);
  return onek !== null && onek !== k.kayitliOnek && katalogOnekiTureUyarMi(onek, k.tur) ? onek : null;
}

// MKK-10: ekran hammadde ve sarf kartı için her zaman anahtar üretir; yarı mamul, mamul ve demirbaşta resim, müşteri ya da
// seri girilmemişse üretemez (null kabul).
export const katalogAnahtarZorunluMu = (tur: string): boolean => tur === 'hammadde' || tur === 'sarf';

/* ---------------- Sihirbazın zorunlu adımları ve benzersiz anahtar sunucuda (B11, 157 a) ---------------- */

const kartAdaylari = (gelen: Nesne): Nesne[] => {
  const talep = gelen['talep'];
  return nesneMi(talep) && nesneMi(talep['yeni']) ? [gelen, talep['yeni']] : [gelen];
};
const doluMu = (v: unknown): boolean => !(v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0));
const gAlani = (kayit: Nesne, k: string): unknown => (nesneMi(kayit['g']) ? kayit['g'][k] : undefined);
// Boş değerler eşittir: kuraldan önce alanı hiç yazılmamış kart, ekran boş metin gönderdiğinde değişmiş sayılmaz.
const bossaNull = (v: unknown): unknown => (doluMu(v) ? v : null);
const kaliteBilgisi = (kayit: Nesne): string =>
  kararliMetin({ grade: bossaNull(kayit['grade']), ozel: kayit['grade'] === '__ozel' && nesneMi(kayit['custom']) ? bossaNull(kayit['custom']['ad']) : null });
const kaliteVarMi = (kayit: Nesne): boolean =>
  kayit['grade'] === '__ozel' ? nesneMi(kayit['custom']) && doluMu(kayit['custom']['ad']) : doluMu(kayit['grade']);

// Ekranın ilk iki adımı (`stepOk` 0 ve 1): aile ve kalite seçilmeden ölçüye geçilmez. Kalitenin ailenin listesinde olup olmadığı ekranın tablosundadır;
// sunucu yalnız seçilmiş olmasına bakar. Yeni kartta ve alan değişince; kayıtlı eksik kart, alan değişmedikçe kaydolur.
export function hammaddeTanimHatasi(kayitli: Nesne | null, gelen: Nesne): { alan: string; mesaj: string } | null {
  const taban = kayitli && hammaddeMi(kayitli) ? kayitli : null;
  for (const k of kartAdaylari(gelen)) {
    if (!hammaddeMi(k)) continue;
    if ((!taban || bossaNull(taban['fam']) !== bossaNull(k['fam'])) && !doluMu(k['fam'])) return { alan: 'kayit.fam', mesaj: 'Malzeme ailesini seçin.' };
    if ((!taban || kaliteBilgisi(taban) !== kaliteBilgisi(k)) && !kaliteVarMi(k)) return { alan: 'kayit.grade', mesaj: 'Kaliteyi seçin.' };
  }
  return null;
}

// Ekranın yerleşik zorunlu alanları (`katalog.html` `ALAN.*` ve `SARF_KAT` `gerekli: true`, koşulsuz olanlar; `alanZorunlu`): ayar `kurallar[tür].zorunlu`
// false ile kapatabilir, adı kapatamaz. Hizmette ad çeşitten kurulduğu için zorunlu değildir; "Diğer" çeşidin adı zorunludur.
const YERLESIK_ZORUNLU: Readonly<Record<string, readonly string[]>> = {
  yarimamul: ['ad', 'tip'], mamul: ['ad'], ticari_mal: ['ad'], demirbas: ['ad', 'alis'], hizmet: ['yon', 'cesit'],
};
const SARF_ZORUNLU: Readonly<Record<string, readonly string[]>> = {
  kaynak: ['tur', 'sinif'], takim: ['tur'], asindirici: ['tur'], kimyasal: ['tur'], kkd: ['tur'], baglanti: ['tur'], ambalaj: ['tur'], genel: ['tur'],
};
const ALAN_ADLARI: Readonly<Record<string, string>> = {
  ad: 'ad', tip: 'parça tipi', alis: 'alış tarihi', yon: 'hizmet yönü', cesit: 'çeşit', cesitAd: 'çeşit adı', tur: 'tür', sinif: 'sınıf / standart',
};
function yerlesikZorunlular(kayit: Nesne, tur: string): string[] {
  if (tur === 'sarf') {
    const kat = gAlani(kayit, 'kat');
    return typeof kat === 'string' && Object.hasOwn(SARF_ZORUNLU, kat) ? [...SARF_ZORUNLU[kat]!] : [];
  }
  const liste = [...(YERLESIK_ZORUNLU[tur] ?? [])];
  if (tur === 'hizmet' && gAlani(kayit, 'cesit') === 'Diğer') liste.push('cesitAd');
  return liste;
}

// Ekranın ilk adımı (`gStepOk` 0): sarf, demirbaş ve hizmet kategorisiz kaydolmaz; kategorinin listede açık olması ayrı denetimdir.
// Taban: aynı tür ve aynı kategoriyle kayıtlı kart; tür ya da kategori değişince yeni kart gibi bakılır, aynı kalan eksik alan sorulmaz.
export function kartZorunluAlanEksigi(
  kayitli: { kayit: Nesne; tur: string } | null, gelen: Nesne, tur: string, malzemeAyari: Record<string, unknown> | null,
): { alan: string; mesaj: string } | null {
  const kurallar = malzemeAyari?.['kurallar'];
  const kural = nesneMi(kurallar) ? kurallar[tur] : undefined;
  const ayar = nesneMi(kural) && nesneMi(kural['zorunlu']) ? kural['zorunlu'] : {};
  for (const k of kartAdaylari(gelen)) {
    const taban = kayitli && kayitli.tur === tur && gAlani(kayitli.kayit, 'kat') === gAlani(k, 'kat') ? kayitli.kayit : null;
    if (KATEGORILI_TURLER.has(tur) && kartKategorisi(k, tur) === null && !(taban && kartKategorisi(taban, tur) === null)) {
      return { alan: 'kayit.g.kat', mesaj: 'Kategori seçin.' };
    }
    const eksik = yerlesikZorunlular(k, tur)
      .filter((a) => a === 'ad' || ayar[a] !== false)
      .filter((a) => !doluMu(gAlani(k, a)) && !(taban && !doluMu(gAlani(taban, a))));
    if (eksik.length) return { alan: `kayit.g.${eksik[0]}`, mesaj: `Zorunlu alan boş: ${eksik.map((a) => ALAN_ADLARI[a] ?? a).join(', ')}.` };
  }
  return null;
}

// Ekranın varsayılan benzersiz anahtarı (`katalog.html` `kartAnahtari`, `_nm`, `_ak`, `_gImza`) sunucuda kurulur; ekranın gönderdiği anahtar okunmaz.
// Hizmetin anahtarı çeşit tablosuna (`HZ_KAT`, `hzImza`) bağlıdır: undefined döner, ekranınki kalır (açık borç). Kurulamayan anahtar null.
const nm = (v: unknown): string => String(v ?? '').toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]/g, '');
const anahtarSayisi = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '');
const varMi = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && v !== 0 && v !== false && !Number.isNaN(v);
export function katalogSunucuAnahtari(tur: string, kayit: Nesne): string | null | undefined {
  const g = nesneMi(kayit['g']) ? kayit['g'] : {};
  if (tur === 'hammadde') {
    const form = kayit['form'];
    const ozelMi = kayit['grade'] === '__ozel';
    if (!(ozelMi ? nesneMi(kayit['custom']) && varMi(kayit['custom']['ad']) : varMi(kayit['grade'])) || typeof form !== 'string' || !Object.hasOwn(HAMMADDE_FORMLARI, form)) return null;
    const ozel = nesneMi(kayit['custom']) ? kayit['custom'] : {};
    const gk = ozelMi ? nm(varMi(ozel['kod']) ? ozel['kod'] : ozel['ad']) : nm(kayit['grade']);
    const dims = nesneMi(kayit['dims']) ? kayit['dims'] : {};
    const opts = nesneMi(kayit['opts']) ? kayit['opts'] : {};
    return ['HM', String(kayit['fam'] ?? ''), gk, form, HAMMADDE_FORMLARI[form]!.olculer.map((k) => anahtarSayisi(dims[k])).join('x'),
      nm(varMi(opts['durum']) ? opts['durum'] : ''), nm(varMi(opts['yuzey']) ? opts['yuzey'] : '')].join('|');
  }
  if (tur === 'yarimamul' || tur === 'mamul') {
    const on = tur === 'mamul' ? 'MM' : 'YM';
    if (varMi(g['resim'])) return [on, 'R', nm(g['resim']), nm(varMi(g['rev']) ? g['rev'] : '')].join('|');
    if (varMi(g['musteri'])) return [on, 'M', nm(g['musteri'])].join('|');
    return null;
  }
  if (tur === 'sarf') {
    if (!varMi(g['kat'])) return null;
    const imza = JSON.stringify(Object.keys(g).filter((k) => !['depoYeri', 'marka', 'urunKodu'].includes(k)).sort()
      .map((k) => [k, Array.isArray(g[k]) ? [...(g[k] as unknown[])].sort() : nm(g[k])]));
    return `SF|${String(g['kat'])}|${imza}`;
  }
  if (tur === 'hizmet') return undefined;
  if (tur === 'ticari_mal') return varMi(g['urunKodu']) ? ['TM', nm(varMi(g['marka']) ? g['marka'] : ''), nm(g['urunKodu'])].join('|') : null;
  if (tur === 'demirbas') {
    if (varMi(g['seri'])) return ['DB', nm(varMi(g['marka']) ? g['marka'] : ''), nm(g['seri'])].join('|');
    if (varMi(g['plaka'])) return `DB|P|${nm(g['plaka'])}`;
    if (varMi(g['sasi'])) return `DB|S|${nm(g['sasi'])}`;
    return null;
  }
  return null;
}

// MKK-16: çakışma alanları tür ayarındadır (`malzeme` ayarı `kurallar[tür].cakisma`, kullanıcı kartı "Uyarı ve engel" 15.10.2026).
// Liste varsa benzersiz anahtarı sunucu o alanlardan kurar; alanlardan biri boşsa kartın anahtarı yoktur (denetlenmez).
// Liste yoksa ekranın türe göre kurduğu varsayılan anahtar geçerlidir. Değerler ekranla aynı biçimde karşılaştırılır: harf, boşluk, noktalama yok sayılır.
const CAKISMA_ALAN_DESENI = /^[A-Za-z0-9_]{1,40}$/;
// 1879 (kullanıcı 02.11): türün varsayılan kuralı da bir seçimdir; seçilen alanlarla birlikte tek kural olur (hepsi aynıysa çakışma).
// Değeri sunucunun varsayılan anahtarıdır, olduğu gibi (normlanmaz: parçaları zaten normlu, ayırıcıları anlamlı). Kurulamayan
// varsayılan anahtar boş sayılır: kart denetlenmez, ekran bunu söyler. Yalnız varsayılan seçiliyse liste yok sayılır.
const CAKISMA_VARSAYILAN_ALANI = '_varsayilan';
export function katalogCakismaListesiGecerliMi(deger: unknown): boolean {
  if (deger === undefined || deger === null) return true;
  return Array.isArray(deger) && deger.length <= 40 && deger.every((k) => typeof k === 'string' && CAKISMA_ALAN_DESENI.test(k));
}
// Ayardaki kurallar nesnesi: tür başına çakışma listesi geçerli mi (öteki kurallar ekranındır, sunucu saklar).
export function katalogKurallariGecerliMi(kurallar: unknown): boolean {
  if (kurallar === undefined || kurallar === null) return true;
  if (!nesneMi(kurallar)) return false;
  return Object.values(kurallar).every((k) => k === null || (nesneMi(k) && katalogCakismaListesiGecerliMi(k['cakisma'])));
}
export function katalogCakismaAlanlari(malzemeAyari: Record<string, unknown> | null, tur: string): string[] | null {
  const kurallar = malzemeAyari?.['kurallar'];
  const kural = nesneMi(kurallar) ? kurallar[tur] : undefined;
  const liste = nesneMi(kural) ? kural['cakisma'] : undefined;
  if (!Array.isArray(liste) || !liste.length || !katalogCakismaListesiGecerliMi(liste)) return null;
  const alanlar = [...new Set(liste as string[])].sort();
  return alanlar.length === 1 && alanlar[0] === CAKISMA_VARSAYILAN_ALANI ? null : alanlar;
}
const cakismaNormu = (s: string): string => s.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]/g, '');
const metin = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const coklu = (v: unknown): string => (Array.isArray(v) ? v.map(metin).sort().join(',') : metin(v));
// Hammaddenin kalite, form, ölçü, durum ve yüzeyi `g` dışında, kartın kendisindedir (ekranın `cakismaDegeri` ile aynı kural; 1879).
// Ölçü formla birlikte okunur ve binde bire yuvarlanmış tam sayıyla yazılır: noktalama yok sayıldığında 12,5 ile 1,25 karışmasın.
// Ölçülerden biri sıfırdan büyük sayı değilse değer boştur (kart bu kuralla denetlenmez).
function hammaddeCakismaDegeri(kayit: Nesne, alan: string): string | undefined {
  const opts = nesneMi(kayit['opts']) ? kayit['opts'] : {};
  if (alan === '_kalite') {
    if (kayit['grade'] !== '__ozel') return metin(kayit['grade']);
    const ozel = nesneMi(kayit['custom']) ? kayit['custom'] : {};
    return metin(varMi(ozel['kod']) ? ozel['kod'] : ozel['ad']);
  }
  if (alan === '_form') return metin(kayit['form']);
  if (alan === '_olcu') {
    const form = kayit['form'];
    if (typeof form !== 'string' || !Object.hasOwn(HAMMADDE_FORMLARI, form)) return '';
    const dims = nesneMi(kayit['dims']) ? kayit['dims'] : {};
    const olculer = HAMMADDE_FORMLARI[form]!.olculer.map((k) => dims[k]);
    if (!olculer.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) return '';
    return `${form}:${olculer.map((v) => String(Math.round((v as number) * 1000))).join('x')}`;
  }
  if (alan === '_durum' || alan === '_yuzey') return coklu(opts[alan.slice(1)]);
  return undefined;
}
function cakismaDegeri(kayit: Nesne, alan: string): string {
  const com = nesneMi(kayit['com']) ? kayit['com'] : {};
  if (alan === '_ad') return metin(com['ad']);
  if (alan === '_ac') return [1, 2, 3].map((i) => metin(com[`ac${i}`])).join('|');
  const hm = hammaddeMi(kayit) ? hammaddeCakismaDegeri(kayit, alan) : undefined;
  if (hm !== undefined) return hm;
  const g = nesneMi(kayit['g']) ? kayit['g'] : {};
  return coklu(g[alan]);
}
export function katalogKuralAnahtari(tur: string, alanlar: readonly string[], kayit: Nesne): string | null {
  const parcalar = alanlar.map((k) => [k, k === CAKISMA_VARSAYILAN_ALANI ? katalogSunucuAnahtari(tur, kayit) ?? '' : cakismaNormu(cakismaDegeri(kayit, k))] as const);
  if (parcalar.some(([, v]) => v === '')) return null;
  return `K|${tur}|${parcalar.map(([k, v]) => `${k}=${v}`).join('|')}`;
}
// Ayar değişince türün kartlarının yeni anahtarı: liste varsa ondan, yoksa kartın varsayılan anahtarı.
export function katalogYeniAnahtar(tur: string, alanlar: readonly string[] | null, kart: { kayit: Nesne; varsayilanAnahtar: string | null }): string | null {
  return alanlar ? katalogKuralAnahtari(tur, alanlar, kart.kayit) : kart.varsayilanAnahtar;
}
// Yeniden hesaplanan anahtarlar etkin kartlar arasında çakışıyor mu (gerekçeli mükerrer kart sayılmaz; veritabanının tekil dizini de böyledir).
export function katalogAnahtarCakismalari(kartlar: readonly { stokKodu: string; anahtar: string | null; etkin: boolean; gerekceli: boolean }[]): string[][] {
  const gruplar = new Map<string, string[]>();
  for (const k of kartlar) {
    if (!k.anahtar || !k.etkin || k.gerekceli) continue;
    gruplar.set(k.anahtar, [...(gruplar.get(k.anahtar) ?? []), k.stokKodu]);
  }
  return [...gruplar.values()].filter((g) => g.length > 1);
}

/* ---- MKK-15: onay damgaları, değişiklik talebi ve geçmiş kaydı ---- */

export interface KatalogKim { by: number; byAd: string; t: number }

const GECIS_ALANI: Partial<Record<KatalogKartDurumu, string>> = { aktif: 'onay', onayda: 'talep', taslak: 'red', pasif: 'pasif' };
const DAMGA_ALANLARI = ['onay', 'talep', 'red', 'pasif'];

// "Kim onayladı, gönderdi, reddetti, pasife aldı" bilgisini ekran `kayit.onay.{onay,talep,red,pasif}.{by,byAd,t}`'den okur; ilgili
// geçişte sunucu yazar (neden gibi öteki alanlar istemcinin kalır), geçiş olmayan yazmada kayıtlı değer korunur.
export function katalogOnayiBas(g: {
  kayit: Nesne; kayitli: Nesne | null; onceki: KatalogKartDurumu | null; yeni: KatalogKartDurumu; gonderildi: boolean; talepOnaylandi: boolean; kim: KatalogKim;
}): Nesne {
  const gelen = nesneMi(g.kayit['onay']) ? g.kayit['onay'] : {};
  const eski = g.kayitli !== null && nesneMi(g.kayitli['onay']) ? g.kayitli['onay'] : {};
  const damgali = new Set<string>();
  const alan = GECIS_ALANI[g.yeni];
  if (alan && (g.yeni !== g.onceki || g.gonderildi)) damgali.add(alan);
  if (g.talepOnaylandi) damgali.add('onay');
  const onay: Nesne = { ...gelen };
  for (const a of DAMGA_ALANLARI) {
    if (damgali.has(a)) onay[a] = { ...(nesneMi(gelen[a]) ? gelen[a] : {}), by: g.kim.by, byAd: g.kim.byAd, t: g.kim.t };
    else if (eski[a] !== undefined) onay[a] = eski[a];
    else delete onay[a];
  }
  return { ...g.kayit, onay };
}

// `by`, `byAd`, `t`, `farklar` ve `farkOzeti` talebin sunucu basılı alanlarıdır; talebin içeriği (önerilen kart) bunlarsız karşılaştırılır.
const TALEP_SUNUCU_ALANLARI = ['by', 'byAd', 't', 'farklar', 'farkOzeti'];
const talepGovdesi = (t: Nesne): string => kararliMetin(Object.fromEntries(Object.entries(t).filter(([k]) => !TALEP_SUNUCU_ALANLARI.includes(k))));

/* ---- MKK-16 Değişiklik talebinin farkı (kart #226): ekranın `diffItems` farkı biçimlenmiş metindir ve ekranın tanım tablolarına bağlıdır;
   sunucu kendi farkını ham alan yoluyla yazar, ekran saklanan `talep.farklar`ı olduğu gibi gösterir (`talepPanelHTML`, en çok 30 satır). ---- */

// Talebin karşılaştırmasında sayılmayan kart alanları: talep, geçmiş ve damga içerik değildir; `birlesen`, `mukerrerOnay`, `yerine` ekranın
// talebe koymadığı, uygulamada kayıtlıdan taşıdığı alanlardır; stok kodunu veritabanı verir.
const FARK_DISI_ALANLAR = ['talep', 'rev', 'updatedAt', 'onay', 'birlesen', 'mukerrerOnay', 'yerine'];
export const FARK_EN_COK_SATIR = 30;

export interface KatalogFarki { f: string; a: string; b: string }

interface Yaprak { ad: string; karsilastir: string; goster: string }

// Yol dizi olarak anahtarlanır: `"com.ad"` üst anahtarı ile `com: { ad }` yaprağı aynı metne düşüp birbirini ezmesin (kart #226 denetimi).
// Gösterimde nokta içeren parça köşeli ayraçla yazılır, iki yol aynı adla görünmez.
function yapraklariTopla(d: unknown, yol: string[], cikti: Map<string, Yaprak>): void {
  if (nesneMi(d) && (Object.keys(d).length > 0 || yol.length === 0)) {
    for (const [k, v] of Object.entries(d)) if (v !== undefined) yapraklariTopla(v, [...yol, k], cikti);
    return;
  }
  const ad = yol.map((p) => (p.includes('.') || p.startsWith('[') ? `[${p}]` : p)).join('.');
  cikti.set(JSON.stringify(yol), { ad, karsilastir: kararliMetin(d), goster: typeof d === 'string' ? d : kararliMetin(d) });
}

function kartYapraklari(kayit: Nesne): Map<string, Yaprak> {
  const ic = Object.fromEntries(Object.entries(kayit).filter(([k]) => !FARK_DISI_ALANLAR.includes(k)));
  const cikti = new Map<string, Yaprak>();
  yapraklariTopla(ic, [], cikti);
  cikti.delete(JSON.stringify(['com', 'kod']));
  return cikti;
}

// Kesilmemiş farkın tamamı; 30 satır sınırında yalnız adıyla anılan alanların değeri de buradadır.
function tamFark(taban: Nesne, oneri: Nesne): KatalogFarki[] {
  const a = kartYapraklari(taban);
  const b = kartYapraklari(oneri);
  const ad = (y: string): string => (a.get(y) ?? b.get(y))!.ad;
  const yollar = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => (ad(x) < ad(y) ? -1 : ad(x) > ad(y) ? 1 : x < y ? -1 : x > y ? 1 : 0));
  return yollar.filter((y) => a.get(y)?.karsilastir !== b.get(y)?.karsilastir)
    .map((y) => ({ f: ad(y), a: a.get(y)?.goster ?? '—', b: b.get(y)?.goster ?? '—' }));
}

// Bayat talep denetimi kesilmiş farka değil bunun özetine bakar: taşan alanın tabanı değişse de görülür.
const farkOzeti = (taban: Nesne, oneri: Nesne): string => createHash('sha256').update(kararliMetin(tamFark(taban, oneri))).digest('hex');

// Eski kartla önerilen kart arasındaki gerçek fark, alan yolu sırasıyla; ekran en çok 30 satır gösterdiği için fazlası son satırda adı, eski ve yeni
// değeriyle (`alan: değer; ...`) toplanır: onaycı hiçbir değişikliği değerini görmeden onaylamaz.
export function katalogFarki(taban: Nesne, oneri: Nesne): KatalogFarki[] {
  const fark = tamFark(taban, oneri);
  if (fark.length <= FARK_EN_COK_SATIR) return fark;
  const tasan = fark.slice(FARK_EN_COK_SATIR - 1);
  const topla = (deger: (x: KatalogFarki) => string): string => tasan.map((x) => `${x.f}: ${deger(x)}`).join('; ');
  return [...fark.slice(0, FARK_EN_COK_SATIR - 1), { f: `Diğer ${tasan.length} alan`, a: topla((x) => x.a), b: topla((x) => x.b) }];
}

// Ekran talepsiz kartta alanı hiç koymaz ya da `null` bırakır; ikisi de "talep yok"tur.
export const katalogTalepYokMu = (kayit: Nesne): boolean => kayit['talep'] === undefined || kayit['talep'] === null;
export const katalogTalepBicimiGecerliMi = (kayit: Nesne): boolean => katalogTalepYokMu(kayit) || (nesneMi(kayit['talep']) && nesneMi(kayit['talep']['yeni']));

// Bekleyen değişiklik talebini yazan kişiyi ve zamanı sunucu basar; değişmemiş talebin kayıtlı damgası ve farkı korunur.
// Yeni ya da değişen talepte fark istemcinin gönderdiğinden bağımsız olarak sunucuda hesaplanır: önerilen kart ile bu yazmadan sonraki kart.
export function katalogTalebiBas(kayit: Nesne, kayitli: Nesne | null, kim: KatalogKim): Nesne {
  const t = kayit['talep'];
  if (!nesneMi(t)) return kayit;
  const eski = kayitli?.['talep'];
  if (nesneMi(eski) && talepGovdesi(eski) === talepGovdesi(t)) {
    const { farklar: _istemci, farkOzeti: _istemciOzeti, ...govde } = t;
    return { ...kayit, talep: {
      ...govde, ...(eski['farklar'] === undefined ? {} : { farklar: eski['farklar'] }), ...(eski['farkOzeti'] === undefined ? {} : { farkOzeti: eski['farkOzeti'] }),
      by: eski['by'], byAd: eski['byAd'], t: eski['t'],
    } };
  }
  const yeni = nesneMi(t['yeni']) ? t['yeni'] : {};
  return { ...kayit, talep: { ...t, farklar: katalogFarki(kayit, yeni), farkOzeti: farkOzeti(kayit, yeni), by: kim.by, byAd: kim.byAd, t: kim.t } };
}

// Talep uygulanırken (aktif kart talepsiz ve içerik değişmiş yazılıyor): uygulanan içerik talepteki önerilenle aynı olmalı, talep açıldığı günkü
// karta göre hâlâ geçerli olmalı (kayıtlı kartın bugünkü farkı, açılışta yazılan farkla aynı).
export function katalogTalepUygulamaDenetle(kayitli: Nesne, gelen: Nesne): { kod: 'GECERSIZ' | 'CAKISMA'; mesaj: string } | null {
  const talep = kayitli['talep'];
  const yeni = nesneMi(talep) ? talep['yeni'] : undefined;
  if (!nesneMi(talep) || !nesneMi(yeni)) return { kod: 'GECERSIZ', mesaj: 'Bekleyen talebin önerilen içeriği yok; talebi reddet.' };
  if (katalogFarki(gelen, yeni).length > 0 || gelen['mukerrerOnay'] !== undefined || gelen['yerine'] !== undefined
    || kararliMetin(gelen['birlesen']) !== kararliMetin(kayitli['birlesen'])) {
    return { kod: 'GECERSIZ', mesaj: 'Uygulanan içerik talepte önerilenle aynı olmalı.' };
  }
  if (farkOzeti(kayitli, yeni) !== talep['farkOzeti']) {
    return { kod: 'CAKISMA', mesaj: 'Talep açıldıktan sonra kart değişti; talebi reddet ve değişikliği yeniden talep et.' };
  }
  // Onaycının ekranda gördüğü kayıtlı farktır; taşan alanları yalnız adıyla anan eski biçimli talep değer göstermeden onaylatmasın.
  if (kararliMetin(talep['farklar']) !== kararliMetin(katalogFarki(kayitli, yeni))) {
    return { kod: 'CAKISMA', mesaj: 'Talepte görünen fark güncel değil; talebi reddet ve değişikliği yeniden talep et.' };
  }
  return null;
}

// Var olan talebi yalnız sahibi ya da onay yetkilisi değiştirir ya da kaldırır.
export function katalogTalepDenetle(kayitli: Nesne | null, gelen: Nesne, kisiId: number, onaylar: boolean): string | null {
  const eskiTalep = kayitli?.['talep'];
  if (nesneMi(eskiTalep) && !onaylar && eskiTalep['by'] !== kisiId) {
    const t = gelen['talep'];
    if (!nesneMi(t) || talepGovdesi(t) !== talepGovdesi(eskiTalep)) return 'Bekleyen değişiklik talebini yalnız sahibi ya da onay yetkilisi değiştirir.';
  }
  return null;
}

// Değişiklik geçmişi (`rev`): ekran her kaydetmede (`withRev`, `onayUygula`, `talepOlustur`, `talepUygula`) sona TEK kayıt ekler ve
// son 30'u tutar. Kayıtlı kayıtlar korunur (istemcideki kopyada sunucunun bastığı `by`, `byAd`, `t` farklı olabilir, o alanlar
// karşılaştırılmaz); eklenen kaydın kimi ve zamanını sunucu basar.
const GECMIS_DAMGASI = ['by', 'byAd', 't'];
const GECMIS_EN_COK = 30;
const gecmisGovdesi = (e: unknown): string =>
  nesneMi(e) ? kararliMetin(Object.fromEntries(Object.entries(e).filter(([k]) => !GECMIS_DAMGASI.includes(k)))) : kararliMetin(e);

function gecmisHesapla(eski: unknown[], gelen: unknown[]): { eklenen: 0 | 1; temel: unknown[] } | null {
  for (const eklenen of [0, 1] as const) {
    const temel = eski.slice(Math.max(0, eski.length + eklenen - GECMIS_EN_COK));
    if (gelen.length === temel.length + eklenen && temel.every((e, i) => gecmisGovdesi(e) === gecmisGovdesi(gelen[i]))) return { eklenen, temel };
  }
  return null;
}

export function katalogGecmisiDenetle(kayitli: Nesne | null, gelen: Nesne): { kod: 'YETKI_YOK' | 'DOGRULAMA'; mesaj: string } | null {
  const eski = kayitli?.['rev'];
  const yeni = gelen['rev'];
  if (Array.isArray(eski)) {
    if (!Array.isArray(yeni) || gecmisHesapla(eski, yeni) === null) {
      return { kod: 'YETKI_YOK', mesaj: 'Değişiklik geçmişi silinemez ya da değiştirilemez; yalnız sona bir kayıt eklenir.' };
    }
    return null;
  }
  if (yeni !== undefined && (!Array.isArray(yeni) || yeni.length > 1)) return { kod: 'DOGRULAMA', mesaj: 'Kartın değişiklik geçmişi en çok bir kayıtla başlar.' };
  return null;
}

export function katalogGecmisiniBas(kayitli: Nesne | null, kayit: Nesne, kim: KatalogKim): Nesne {
  const yeni = kayit['rev'];
  if (!Array.isArray(yeni)) return kayit;
  const eski = Array.isArray(kayitli?.['rev']) ? (kayitli!['rev'] as unknown[]) : [];
  const h = gecmisHesapla(eski, yeni);
  if (h === null) return kayit;
  const son = yeni[yeni.length - 1];
  const eklenen = h.eklenen === 1 ? [{ ...(nesneMi(son) ? son : {}), by: kim.by, byAd: kim.byAd, t: kim.t }] : [];
  return { ...kayit, rev: [...h.temel, ...eklenen] };
}

// Onay yetkilisi kullanılmamış her kartı siler; yetkisi olmayan yalnız kendi açtığı kartı (2114-1 a). Kullanımı veritabanı denetler.
export function katalogIptalYetkiliMi(g: { islemler: readonly string[]; kisiId: number; acanKisiId: number }): boolean {
  if (g.islemler.includes('malzemeler.onayla')) return true;
  return g.acanKisiId === g.kisiId;
}

// Kartın onay damgası (`onay.onay`) hiç basılmadıysa kart hiç aktif olmamıştır.
export function katalogHicOnaylanmadiMi(kayit: Nesne): boolean {
  const onay = nesneMi(kayit['onay']) ? kayit['onay'] : {};
  return !nesneMi(onay['onay']);
}

// Logo'da karşılığı olan kart TMI'den tek başına silinmez: Logo'da sahipsiz kart kalır (2114-2 teyit).
export const katalogSilinirMi = (logoKayitNo: string | null): boolean => logoKayitNo === null;

// Arşivden geri gelen kart (2114c): bir kez aktif olmuşsa pasif döner (seçimlere kendiliğinden girmez), hiç aktif olmamışsa taslak.
export const arsivdenDonusDurumu = (aktifOlmus: boolean): 'taslak' | 'pasif' => (aktifOlmus ? 'pasif' : 'taslak');

export interface ArsivIzi {
  modul: string;
  kayit: string;
  tur: 'kesin' | 'olasi';
  adet: number;
  ornek: string | null;
}

export const arsivIzAdetleri = (izler: readonly ArsivIzi[] | null): { kesin: number | null; olasi: number | null } => {
  if (izler === null) return { kesin: null, olasi: null };
  const topla = (tur: ArsivIzi['tur']): number => izler.filter((i) => i.tur === tur).reduce((t, i) => t + i.adet, 0);
  return { kesin: topla('kesin'), olasi: topla('olasi') };
};

// Kalıcı silme (2114-4 a): kesin bağ da olası iz de engeller; bağ sayımı bağlı değilse (izler null) bilinmeyen bağ var sayılır.
// Stok kodu yeniden yazılarak onaylanır; Logo'ya gönderilmiş kart kalıcı silinmez: Logo'dan silinmez, orada kullanım dışı durur (2114-7).
export function arsivKaliciSilmeEngeli(g: { izler: readonly ArsivIzi[] | null; logoyaGitti: boolean; stokKodu: string; girilenKod: string }): string | null {
  if (g.girilenKod.trim() !== g.stokKodu) return 'Yazılan stok kodu kartla aynı değil.';
  if (g.logoyaGitti) return 'Kart Logo\'ya gönderilmiş; Logo\'da kullanım dışı olarak durduğu için kalıcı silinemez.';
  if (g.izler === null) return 'Bağ sayımı bağlı değil; kartın bağları bilinmeden kalıcı silinmez.';
  if (g.izler.length > 0) return 'Kartın bağı ya da olası izi var; kalıcı silinemez.';
  return null;
}

// MKK-7: sürüm, okunan sürümle aynı olmalı; değilse başkası yazmıştır.
export const katalogSurumUyarMi = (kayitli: number, gelen: number | null): boolean => gelen === kayitli;

// MKK-8: prototipin rolü TMI işlemlerinden türetilir; prototipin kendi rol ayarı geçersizdir.
// Ekranın 'yonetici' rolü TMI'nin bayraklı yöneticisi değildir: ekran ayar sayfasını bu role bağlar, müdür de buraya düşer.
// Bayrak isteyen tek ayar (onay akışı) serviste ayrıca denetlenir.
export function katalogRolu(islemler: readonly string[]): 'talep' | 'sorumlu' | 'yonetici' | null {
  if (islemler.includes('malzemeler.tanim-yaz') && islemler.includes('malzemeler.onayla')) return 'yonetici';
  if (islemler.includes('malzemeler.onayla')) return 'sorumlu';
  if (islemler.includes('malzemeler.yaz')) return 'talep';
  return null;
}

// MKK-9: onay akışı ayarı prototipin "genel" ayarından okunur; ayar yoksa açıktır.
export const katalogOnayAkisiAcikMi = (genel: Record<string, unknown> | null): boolean => genel?.['onayAkisi'] !== false;

/* ---------------- Logo'ya gönderime hazırlık (kart #232): MKL-1..MKL-5 ----------------
   MKL-1 (ilk aktiflikte "bekliyor"), MKL-5'in "gönderilmiş kart geri dönmez" yarısı ve MKL-3'ün kilidi veritabanı tetikleyicisindedir
   (göç `20261008122500_malzemeler_logo_hazirlik.sql`); burada saf olanlar. */

export interface LogoHazirlikAlanlari {
  tur: string; stokKodu: string | null; ad: string | null; birim: string | null; logoKartTuru: string | null; logoBirimSeti: string | null;
}

// MKL-4: kartın Logo'ya gidebilmesi için eksik olanlar, sabit sırada. Eksik kart aktif olmayı engellemez; "bekliyor" kalır, gönderilmez.
// `gecerliBirimler` verilirse listede olmayan birim karşılığı da eksik sayılır (LOG-1 a): Logo onu reddeder, kart "hazır" görünmemeli.
export function logoEksikleri(k: LogoHazirlikAlanlari, gecerliBirimler: ReadonlySet<string> | null = null): LogoEksik[] {
  const dolu = (d: string | null): boolean => d !== null && d.trim() !== '';
  const eksikler: LogoEksik[] = [];
  if (!dolu(k.stokKodu)) eksikler.push('stok_kodu');
  if (!dolu(k.ad)) eksikler.push('ad');
  if (!dolu(k.birim)) eksikler.push('birim');
  // Hizmet tür karşılığına girmez (Logo'da ayrı hizmet kartıdır); eksik sayılmaz.
  if (k.tur !== 'hizmet' && !dolu(k.logoKartTuru)) eksikler.push('tur_karsiligi');
  // Birimi olmayan kartın birim karşılığı da yoktur; iki eksik ayrı görünür.
  if (!dolu(k.logoBirimSeti) || (gecerliBirimler !== null && !gecerliBirimler.has(k.logoBirimSeti!.trim()))) eksikler.push('birim_karsiligi');
  return eksikler;
}

// MKL-3: Logo kaydı olan kartın birimi (`kayit.com.birim`) değişmez. Karşılaştırma veritabanının `#>> '{com,birim}'` okumasıyla aynıdır.
const birimMetni = (kayit: Nesne): string | null => {
  const com = kayit['com'];
  if (!nesneMi(com) || com['birim'] === undefined || com['birim'] === null) return null;
  return typeof com['birim'] === 'string' ? com['birim'] : JSON.stringify(com['birim']);
};
export const logoBirimiDegistiMi = (kayitli: Nesne, yeni: Nesne): boolean => birimMetni(kayitli) !== birimMetni(yeni);

// S4 b (#777): Logo'ya gitmiş kartın adı değişince Logo'daki kart güncellenir. Ad veritabanının okumasıyla aynıdır
// (`kayit.com.ad` dolu metin, kırpılmış; değilse null): yalnız boşluğu değişen ad değişmiş sayılmaz.
const adMetni = (kayit: Nesne): string | null => {
  const com = kayit['com'];
  if (!nesneMi(com) || typeof com['ad'] !== 'string') return null;
  const ad = com['ad'].replace(/^ +| +$/g, '');
  return ad === '' ? null : ad;
};
export const logoAdiDegistiMi = (kayitli: Nesne, yeni: Nesne): boolean => adMetni(kayitli) !== adMetni(yeni);

export type LogoGuncellemeSonucu = { ad: string | null } & ({ tamam: true } | { hata: string });
// Logo'nun güncelleme cevabı; `ad` kuyruktaki ad olduğu gibi döner. Gönderilen ad karttaki güncel addan farklıysa ad bu arada yine değişmiştir: güncelleme bekliyor kalır,
// sonraki tur yeni adı gönderir (null: yazılacak bir şey yok). Boş hata metni reddedilir ('bos-hata').
export function logoGuncellemeSonucuDurumu(sonuc: LogoGuncellemeSonucu, guncelAd: string | null):
  { durum: 'gonderildi' | 'hata'; hata: string | null } | null | 'bos-hata' {
  if ('tamam' in sonuc) return sonuc.ad === guncelAd ? { durum: 'gonderildi', hata: null } : null;
  const hata = logoHataMetni(sonuc.hata);
  if (hata === null) return 'bos-hata';
  return sonuc.ad === guncelAd ? { durum: 'hata', hata } : null;
}

// MKL-5: Logo'nun döndürdüğü hata metni saklanır; boş hata kabul edilmez, uzun metin kesilir (son hata yalnız gösterilir).
export const LOGO_HATA_EN_COK = 2000;
export function logoHataMetni(hata: string): string | null {
  const metin = hata.trim();
  return metin === '' ? null : metin.slice(0, LOGO_HATA_EN_COK);
}

// Durum listesinde eksikli kartlar üstte; sonra hatalı, bekleyen ve gönderilmiş; aynı grupta sayı kimliği sırası.
const DURUM_SIRASI = { hata: 0, bekliyor: 1, gonderildi: 2 } as const;
export function logoDurumSirasi(a: { id: number; durum: keyof typeof DURUM_SIRASI; eksikler: readonly string[] },
  b: { id: number; durum: keyof typeof DURUM_SIRASI; eksikler: readonly string[] }): number {
  const eksikA = a.durum !== 'gonderildi' && a.eksikler.length > 0 ? 0 : 1;
  const eksikB = b.durum !== 'gonderildi' && b.eksikler.length > 0 ? 0 : 1;
  return eksikA - eksikB || DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] || a.id - b.id;
}

const LOGO_TICARI_MAL_KODU = '1';
// LB7 (kart #232): karşılık yalnız Logo'nun kabul ettiği değer. Tür: dört Logo kart türü kodu, demirbaşın karşılığı boş (LB2 a); birim: boşluksuz kod
// (Logo listesinde olup olmadığına Logo modülü gönderimde bakar). Boş değer her zaman geçer. Veritabanı kısıtı `malzeme_logo_karsiligi_izinli` aynısı.
// LOG-1 a: birim karşılığı yalnız geçerli Logo birim setlerinden biri olabilir; boş liste de hiçbir koda izin vermez.
export function logoBirimSetiGecersizHatasi(kod: string, gecerli: ReadonlySet<string>): string | null {
  if (gecerli.has(kod)) return null;
  return gecerli.size === 0
    ? `Birim seti ${kod} Logo birim seti listesinde yok; liste boş. Önce Logo birim setleri kartından ekleyin.`
    : `Birim seti ${kod} Logo birim seti listesinde yok.`;
}

export function logoKarsiligiHatasi(k: { cesit: 'tur' | 'birim'; tmiDegeri: string; logoDegeri: string | null }): string | null {
  if (k.logoDegeri === null) return null;
  if (k.cesit === 'birim') return /^\S+$/.test(k.logoDegeri) ? null : 'Logo birim seti kodu boşluk taşımaz.';
  if (k.tmiDegeri === 'demirbas') return 'Demirbaş şimdilik Logo\'ya gönderilmez; karşılığı boş kalır.';
  // Kart #1218: ticari mal yalnız Logo ticari mal kartına (1) gider; öteki türler ticari mal kodunu alamaz.
  if (k.tmiDegeri === 'ticari_mal') return k.logoDegeri === LOGO_TICARI_MAL_KODU ? null : `Ticari malın Logo kart türü ${LOGO_TICARI_MAL_KODU} (ticari mal) olabilir.`;
  const izinli = LOGO_KART_TURLERI.filter((t) => t.kod !== LOGO_TICARI_MAL_KODU);
  return izinli.some((t) => t.kod === k.logoDegeri)
    ? null
    : `Logo kart türü ${izinli.map((t) => `${t.kod} (${t.ad.toLocaleLowerCase('tr')})`).join(', ')} olabilir.`;
}

/* ---------------- Ölçü birimi ve kategori listesi (kart #163, SH4 a, ML2 b) ---------------- */

// Kartın birimi: `kayit.com.birim` dolu metin ise kırpılmış hali; yoksa null (ekranın varsayılan birimi uydurulmaz).
// Onaya gönderilen ya da aktif yapılan kartın birimi ve ayarda zorunlu işaretli alanları dolu olmalı (kullanıcı kararları
// "İstesin" ve "Denetlensin"); taslak eksikle kaydolur. Ayarın `kurallar[tür].zorunlu` değeri true olan alan kartın `g` nesnesinde
// aranır; ekranın bu kartta göstermediğini bildirdiği alan sayılmaz.
export function katalogOnayEksigi(kayit: Nesne, malzemeAyari: Record<string, unknown> | null, tur: string, uygulanmayan: readonly string[]): { alan: string; mesaj: string } | null {
  if (kartBirimi(kayit) === null) return { alan: 'kayit.com.birim', mesaj: 'Birimi boş kart onaya gönderilemez ve aktif yapılamaz; birimi seçin.' };
  const kurallar = malzemeAyari?.['kurallar'];
  const kural = nesneMi(kurallar) ? kurallar[tur] : undefined;
  const zorunlu = nesneMi(kural) && nesneMi(kural['zorunlu']) ? kural['zorunlu'] : {};
  const g = nesneMi(kayit['g']) ? kayit['g'] : {};
  const bos = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
  const eksik = Object.entries(zorunlu).filter(([k, z]) => z === true && !uygulanmayan.includes(k) && bos(g[k])).map(([k]) => k).sort();
  return eksik.length ? { alan: `kayit.g.${eksik[0]}`, mesaj: `Zorunlu alan boş: ${eksik.join(', ')}. Doldurup yeniden gönderin.` } : null;
}

export function kartBirimi(kayit: Nesne): string | null {
  const com = kayit['com'];
  if (!nesneMi(com) || typeof com['birim'] !== 'string') return null;
  const b = com['birim'].trim();
  return b === '' ? null : b;
}

export const BIRIM_EN_COK = 40;

// 323 b: tedarikçinin biriminden alınan kalem stoka kartın biriminde girer; kart tek alış birimi ve katsayısını tutar
// (1 alış birimi = katsayı kadar stok birimi). İki alan birlikte dolu ya da birlikte boştur; katsayı numeric(18,6) sütununa sığar.
export interface BirimDonusumu { alisBirimi: string; katsayi: string }
const KATSAYI = /^\d{1,12}(\.\d{1,6})?$/;
export function kartBirimDonusumu(kayit: Nesne): BirimDonusumu | null | { mesaj: string; alan: 'alisBirimi' | 'alisKatsayisi' } {
  const com = kayit['com'];
  if (!nesneMi(com)) return null;
  const b = com['alisBirimi'];
  const birim = typeof b === 'string' ? b.trim() : '';
  const k = com['alisKatsayisi'];
  const metin = typeof k === 'number' ? String(k) : typeof k === 'string' ? k.trim().replace(',', '.') : '';
  if (birim === '' && metin === '') return null;
  if (birim === '') return { mesaj: 'Alış katsayısı yazıldıysa alış birimi de seçilir.', alan: 'alisBirimi' };
  if (birim.length > BIRIM_EN_COK) return { mesaj: `Alış birimi en çok ${BIRIM_EN_COK} karakterdir.`, alan: 'alisBirimi' };
  if (birim === kartBirimi(kayit)) return { mesaj: 'Alış birimi stok biriminden farklı olmalı; aynı birimde dönüşüm gerekmez.', alan: 'alisBirimi' };
  if (metin === '') return { mesaj: 'Alış birimi seçildiyse katsayı da yazılır (1 alış birimi kaç stok birimi).', alan: 'alisKatsayisi' };
  if (!KATSAYI.test(metin) || Number(metin) <= 0) {
    return { mesaj: 'Alış katsayısı sıfırdan büyük bir sayı olmalı (en çok 6 ondalık, ör. 50 ya da 1,5).', alan: 'alisKatsayisi' };
  }
  return { alisBirimi: birim, katsayi: metin };
}
// Kart ve bekleyen talebin önerdiği kart aynı denetimden geçer; `onek` hatanın alan yoludur.
export function kartBirimDonusumleri(kayit: Nesne): { onek: string; kayit: Nesne; donusum: ReturnType<typeof kartBirimDonusumu> }[] {
  const talep = kayit['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? talep['yeni'] : null;
  return [{ onek: 'kayit.com.', kayit }, ...(yeni ? [{ onek: 'kayit.talep.yeni.com.', kayit: yeni }] : [])]
    .map((x) => ({ ...x, donusum: kartBirimDonusumu(x.kayit) }));
}
const BIRIM_LISTESI = /^birim(\|.+)?$/;

const metinler = (d: unknown): string[] => (Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string').map((x) => x.trim()) : []);

// Prototipin malzeme ayarındaki liste farkından (listeler['birim'], listeler['birim|<tür>'] = { ekle, gizle }) birimlerin seçilebilirliği:
// birim, yerleşik olduğu ya da eklendiği listelerden en az birinde gizli değilse aktiftir. Tablodaki ama hiçbir listede olmayan birim pasiftir.
export function ayarBirimleri(
  deger: Nesne, tablo: readonly { kod: string; yerlesikListeler: readonly string[] }[],
): { kod: string; aktif: boolean }[] | { hata: string } {
  const listeler = nesneMi(deger['listeler']) ? deger['listeler'] : {};
  const uyelik = new Map<string, Set<string>>(tablo.map((b) => [b.kod, new Set(b.yerlesikListeler)]));
  const gizli = new Map<string, Set<string>>();
  for (const [liste, l] of Object.entries(listeler)) {
    if (!BIRIM_LISTESI.test(liste) || !nesneMi(l)) continue;
    for (const kod of metinler(l['ekle'])) {
      if (kod === '' || kod.length > BIRIM_EN_COK) return { hata: `Birim boş olamaz ve en çok ${BIRIM_EN_COK} karakterdir: "${kod}".` };
      if (!uyelik.has(kod)) uyelik.set(kod, new Set());
      uyelik.get(kod)!.add(liste);
    }
    gizli.set(liste, new Set(metinler(l['gizle'])));
  }
  return [...uyelik].map(([kod, l]) => ({ kod, aktif: [...l].some((liste) => !gizli.get(liste)?.has(kod)) }));
}

// Ayardaki eklenmiş kategoriler (kategoriler.<tür> = [{ key, ad, kod }]) ve gizlenenler (gizliKategoriler = ['<tür>|<key>']).
// Yerleşik kategori gizli değilse aktiftir; eklenmiş kategori ayarda durdukça ve gizli değilse aktiftir.
export type KategoriTuru = 'sarf' | 'demirbas' | 'hizmet';
export interface KategoriSatiri { tur: KategoriTuru; kod: string; ad: string; kisaKod: string | null; aktif: boolean }
export function ayarKategorileri(
  deger: Nesne, tablo: readonly { tur: KategoriTuru; kod: string; ad: string; kisaKod: string | null; yerlesik: boolean }[],
): KategoriSatiri[] | { hata: string } {
  const gizli = new Set(metinler(deger['gizliKategoriler']));
  const kategoriler = nesneMi(deger['kategoriler']) ? deger['kategoriler'] : {};
  const sonuc = new Map<string, KategoriSatiri>();
  for (const k of tablo) sonuc.set(`${k.tur}|${k.kod}`, { tur: k.tur, kod: k.kod, ad: k.ad, kisaKod: k.kisaKod, aktif: false });
  const ayarda = new Set<string>();
  for (const tur of ['sarf', 'demirbas'] as const) {
    const l = kategoriler[tur];
    if (!Array.isArray(l)) continue;
    for (const c of l) {
      if (!nesneMi(c)) continue;
      const kod = typeof c['key'] === 'string' ? c['key'].trim() : '';
      const ad = typeof c['ad'] === 'string' ? c['ad'].trim() : '';
      const kisa = typeof c['kod'] === 'string' && c['kod'].trim() !== '' ? c['kod'].trim() : null;
      if (kod === '' || kod.length > 40 || ad === '' || ad.length > 80 || (kisa !== null && kisa.length > 10)) {
        return { hata: `Kategori anahtarı (en çok 40), adı (en çok 80) ve kısa kodu (en çok 10) geçerli olmalı: "${kod || ad}".` };
      }
      const anahtar = `${tur}|${kod}`;
      if (tablo.some((t) => t.yerlesik && `${t.tur}|${t.kod}` === anahtar)) continue;
      ayarda.add(anahtar);
      sonuc.set(anahtar, { tur, kod, ad, kisaKod: kisa, aktif: false });
    }
  }
  for (const k of tablo) if (k.yerlesik) ayarda.add(`${k.tur}|${k.kod}`);
  return [...sonuc].map(([anahtar, k]) => ({ ...k, aktif: ayarda.has(anahtar) && !gizli.has(anahtar) }));
}

// 2465: kategori ağacı. Ek aile ayarda `aileler = [{ key, ad }]`, gizlenen aile `gizliAileler = ['<key>']` (ekranın malzemeAyarUygula'sı);
// taban aileyle aynı anahtarlı ek aile ekranda da yok sayılır. Bozuk girdi atlanır. Kategorilerde yerleşik önce, sonra ad sırası.
export const KATEGORI_AGACI_TUR_ADLARI: Readonly<Record<KategoriAgaciTuru, string>> = { hammadde: 'Hammadde', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet' };
export function kategoriAgaciKur(
  ayar: Readonly<Record<string, unknown>> | null,
  kategoriler: readonly { tur: KategoriAgaciTuru; kod: string; ad: string; yerlesik: boolean; aktif: boolean }[],
): KategoriAgaciDugumu[] {
  const gizli = new Set(metinler(ayar?.['gizliAileler']));
  const aileler: { kod: string; ad: string }[] = TABAN_HAMMADDE_AILELERI.map((a) => ({ ...a }));
  const ekler = Array.isArray(ayar?.['aileler']) ? ayar['aileler'] : [];
  for (const a of ekler) {
    if (!nesneMi(a) || typeof a['key'] !== 'string' || typeof a['ad'] !== 'string') continue;
    const kod = a['key'].trim();
    const ad = a['ad'].trim();
    if (kod === '' || ad === '' || aileler.some((x) => x.kod === kod)) continue;
    aileler.push({ kod, ad });
  }
  const hammadde = aileler.map((a): KategoriAgaciDugumu => ({ tur: 'hammadde', kod: a.kod, ad: a.ad, ustAd: KATEGORI_AGACI_TUR_ADLARI.hammadde, aktif: !gizli.has(a.kod) }));
  const digerleri = KATEGORI_AGACI_TURLERI.filter((t) => t !== 'hammadde').flatMap((tur) => kategoriler
    .filter((k) => k.tur === tur)
    .sort((a, b) => Number(b.yerlesik) - Number(a.yerlesik) || a.ad.localeCompare(b.ad, 'tr') || a.kod.localeCompare(b.kod))
    .map((k): KategoriAgaciDugumu => ({ tur, kod: k.kod, ad: k.ad, ustAd: KATEGORI_AGACI_TUR_ADLARI[tur], aktif: k.aktif })));
  return [...hammadde, ...digerleri];
}

/* ---------------- Örnek veri (kart #906) ---------------- */

// Örnek kartların kimliği `ornek-<anahtar>`; stok kodunu sunucu verdiği için (firma kodu ayarına göre de değişir) başka modüller
// örnek kartı bu anahtarla bulur.
export const ORNEK_MALZEME_ANAHTARLARI = ['mil', 'flans', 'burc', 'cubuk', 'levha', 'kesme-yagi', 'isil-islem'] as const;
export type OrnekMalzemeAnahtari = (typeof ORNEK_MALZEME_ANAHTARLARI)[number];
export const ornekKartKimligi = (anahtar: OrnekMalzemeAnahtari): string => `ornek-${anahtar}`;

// 1480: Malzeme ayarlarında eklenen kalitelerin yoğunluğu (`kaliteler[].p.ro`, g/cm³), "aile|kod" anahtarıyla. Biçimi tutmayan ya da
// pozitif olmayan değer alınmaz (uydurulmaz).
export function ayarKaliteYogunluklari(ayar: Readonly<Record<string, unknown>> | null): Map<string, number> {
  const m = new Map<string, number>();
  const liste = ayar?.['kaliteler'];
  if (!Array.isArray(liste)) return m;
  for (const g of liste as unknown[]) {
    if (typeof g !== 'object' || g === null) continue;
    const { fam, kod, p } = g as { fam?: unknown; kod?: unknown; p?: unknown };
    const ro = typeof p === 'object' && p !== null ? (p as { ro?: unknown }).ro : undefined;
    if (typeof fam === 'string' && typeof kod === 'string' && typeof ro === 'number' && Number.isFinite(ro) && ro > 0 && !m.has(`${fam}|${kod}`)) m.set(`${fam}|${kod}`, ro);
  }
  return m;
}

/* ---------------- Demirbaş teknik bilgisi (1595) ---------------- */
// İlk kayıt sürümsüz gelir, sonrakiler okunan sürümle; ikisi karışırsa kayıt sessizce ezilmez.
export function demirbasTeknikYazimi(mevcutSurum: number | null, istenenSurum: number | null): 'ekle' | 'guncelle' | 'eski-surum' {
  if (mevcutSurum === null) return istenenSurum === null ? 'ekle' : 'eski-surum';
  return istenenSurum === mevcutSurum ? 'guncelle' : 'eski-surum';
}

// Teknik bilgi yalnız demirbaş kartına yazılır; iptal edilmiş karta yazılmaz.
export function demirbasTeknikYazilabilirMi(tur: string, onayDurumu: string): string | null {
  if (tur !== 'demirbas') return 'Teknik bilgi yalnız demirbaş kartına girilir.';
  if (onayDurumu === 'iptal') return 'Silinmiş karta teknik bilgi girilmez.';
  return null;
}

// Aynı adlı iki özellik ayırt edilemez; ad büyük-küçük harf ve Türkçe harf farkı gözetmeden karşılaştırılır.
export function tekrarlananOzellik(adlar: readonly string[]): string | null {
  const gorulen = new Set<string>();
  for (const ad of adlar) {
    const anahtar = ad.trim().toLocaleLowerCase('tr-TR');
    if (gorulen.has(anahtar)) return ad;
    gorulen.add(anahtar);
  }
  return null;
}

/* ---------------- Logo'dan gelen kartlar (2116; kararlar 2116-2 a, 2116-3 c, 2116-4 a) ---------------- */

// Logo kodu TMI kod biçimine uyuyorsa kart aynı koduyla açılır: tür-grup-sıra (HM-PAS-00012) ya da firma kodlu tür önekiyle sıra.
// Sıra kodun kendisidir; baştaki sıfırlar TMI'nin yazdığı gibi olmalı (kod geri üretilince aynısı çıkmalı).
const SIRA_DESENI = /^(\d+)$/;
export function logoKodBicimi(kod: string, firmaKodu: string | null): { onek: string; sira: number } | null {
  const k = kod.trim();
  if (k !== kod || k.length > STOK_KODU_EN_COK) return null;
  const standart = KOD_ONEKI_DESENI.exec(k)?.[1] ?? null;
  const firma = firmaKodu === null ? null : new RegExp(`^(${firmaKodu}-(?:${TUR_KISALTMALARI.join('|')})-)\\d+$`).exec(k)?.[1] ?? null;
  const onek = standart ?? firma;
  if (onek === null) return null;
  const sayi = SIRA_DESENI.exec(k.slice(onek.length))?.[1];
  const sira = sayi === undefined ? NaN : Number(sayi);
  if (!Number.isSafeInteger(sira) || sira < 1 || sira > EN_BUYUK_SIRA || katalogStokKodu(onek, sira) !== k) return null;
  return { onek, sira };
}

// Biçime uyan kod, kartın türüne de uymalı: standart önekte tür kısaltması, firma kodlu türde ayarın öneki.
export function logoKoduTureUyar(b: { onek: string }, tur: string, firmaOneki: string | null): boolean {
  if (firmaOneki !== null) return b.onek === firmaOneki;
  return KOD_ONEKI_DESENI.test(`${b.onek}1`) && katalogOnekiTureUyarMi(b.onek, tur);
}

export type LogoGelenDurumu = 'yeni' | 'bagsiz' | 'bagli';
export interface LogoyaBagliTmiKarti { kimlik: string; stokKodu: string; logoKayitNo: string | null }

// Eşleşme sırası: Logo kayıt numarası, kod eşlemesi (2116-3 c), aynı stok kodu. Aynı kodlu kart başka Logo kaydına bağlıysa "bagsiz"
// görünür ama bağlanamaz (servis reddeder).
export function logoGelenDurumu<T extends LogoyaBagliTmiKarti>(
  k: { logoKayitNo: number; kod: string }, refle: ReadonlyMap<string, T>, kodla: ReadonlyMap<string, T>, esleme: ReadonlyMap<string, string>,
): { durum: LogoGelenDurumu; tmi: T | null } {
  const bagli = refle.get(String(k.logoKayitNo)) ?? (esleme.has(k.kod) ? kodla.get(esleme.get(k.kod)!) : undefined);
  if (bagli) return { durum: 'bagli', tmi: bagli };
  const ayni = kodla.get(k.kod);
  return ayni ? { durum: 'bagsiz', tmi: ayni } : { durum: 'yeni', tmi: null };
}

// 2088-1: Açıklama 1 Logo adıdır (boşsa TMI adı gider), Açıklama 2 ve 3 NAME3 ve NAME4. Fark bu üç alanda aranır; boşluklar kırpılır.
export type LogoFarkAlani = 'aciklama_1' | 'aciklama_2' | 'aciklama_3';
export interface LogoFarki { alan: LogoFarkAlani; logo: string | null; tmi: string | null }
const dolu = (d: string | null | undefined): string | null => (typeof d === 'string' && d.trim() !== '' ? d.trim() : null);
export function logoKartFarklari(
  logo: { ad: string | null; aciklama2: string | null; aciklama3: string | null },
  tmi: { ad: string | null; aciklama1: string | null; aciklama2: string | null; aciklama3: string | null },
): LogoFarki[] {
  const ciftler: [LogoFarkAlani, string | null, string | null][] = [
    ['aciklama_1', dolu(logo.ad), dolu(tmi.aciklama1) ?? dolu(tmi.ad)],
    ['aciklama_2', dolu(logo.aciklama2), dolu(tmi.aciklama2)],
    ['aciklama_3', dolu(logo.aciklama3), dolu(tmi.aciklama3)],
  ];
  return ciftler.filter(([, l, t]) => l !== t).map(([alan, l, t]) => ({ alan, logo: l, tmi: t }));
}

// Logo geçişi (3068): satırın toplu işleme girip girmediği. Toplu bağlama yalnız aynı kodlu, bağsız, iptal olmayan ve birimi
// karşılıkla (ya da aynen) tutan kartta; toplu alma yalnız CORE'da olmayan, Logo'da kullanımda ve kodu CORE biçimine uyan kartta.
// Geri kalanı tek tek karar ister; neden ekranda yazar.
export type LogoGecisKararNedeni = 'birim-farki' | 'kod-eslenecek' | 'kullanim-disi' | 'iptal-kart';
export function logoGecisAdayligi(o: {
  durum: LogoGelenDurumu; aktif: boolean; koduUyar: boolean; logoBirimSeti: string | null;
  tmi: { birim: string | null; onayDurumu: string } | null;
  birimKarsiliklari: readonly { tmiDegeri: string; logoDegeri: string | null }[];
}): { topluBaglanir: boolean; topluAlinir: boolean; kararNedeni: LogoGecisKararNedeni | null } {
  const yok = { topluBaglanir: false, topluAlinir: false };
  if (o.durum === 'bagli') return { ...yok, kararNedeni: null };
  if (!o.aktif) return { ...yok, kararNedeni: 'kullanim-disi' };
  if (o.durum === 'yeni') return o.koduUyar ? { ...yok, topluAlinir: true, kararNedeni: null } : { ...yok, kararNedeni: 'kod-eslenecek' };
  if (!o.tmi || o.tmi.onayDurumu === 'iptal') return { ...yok, kararNedeni: 'iptal-kart' };
  const tmiBirim = o.tmi.birim;
  const tutar = tmiBirim !== null && o.logoBirimSeti !== null
    && (tmiBirim.toLocaleUpperCase('tr-TR') === o.logoBirimSeti.toLocaleUpperCase('tr-TR')
      || o.birimKarsiliklari.some((k) => k.tmiDegeri === tmiBirim && k.logoDegeri === o.logoBirimSeti));
  return tutar ? { ...yok, topluBaglanir: true, kararNedeni: null } : { ...yok, kararNedeni: 'birim-farki' };
}

// 3079 a: Logo geçişinde "Kullanılanlar": stoğu olan, son 12 ayda hareketi olan ya da açık siparişte geçen kart. Nedenler satırda yazar.
// Kullanım izi okunmamış kartta yalnız stok bakılır. Tarihler gün metnidir (yyyy-mm-dd); karşılaştırma metinle, saat dilimi girmez.
export const LOGO_KULLANIM_AY = 12;
export type LogoKullanimNedeni = 'stok' | 'hareket' | 'siparis';
export function logoKullanimEsigi(bugun: string): string {
  const [y, a, g] = bugun.split('-').map(Number) as [number, number, number];
  const esik = new Date(Date.UTC(y, a - 1 - LOGO_KULLANIM_AY, 1));
  const ayinSonGunu = new Date(Date.UTC(esik.getUTCFullYear(), esik.getUTCMonth() + 1, 0)).getUTCDate();
  esik.setUTCDate(Math.min(g, ayinSonGunu));
  return esik.toISOString().slice(0, 10);
}
export function logoKullanimNedenleri(
  k: { stok: string | null; sonHareket: string | null; acikSiparis: boolean | null }, esik: string,
): LogoKullanimNedeni[] {
  const n: LogoKullanimNedeni[] = [];
  if (k.stok !== null && Number(k.stok) > 0) n.push('stok');
  if (k.sonHareket !== null && k.sonHareket >= esik) n.push('hareket');
  if (k.acikSiparis === true) n.push('siparis');
  return n;
}
