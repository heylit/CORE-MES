import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  AlternatifBaglami, AlternatifKarti, AlternatifKuraliKaydetGovdesi, AlternatifSeti, AlternatifSetiKaydetGovdesi, AlternatifSirasiGovdesi,
  AlternatifTanimlariCevabi, AlternatifZarfi, KabulSiniriKaydetGovdesi, GrupSinirlariCevabi, KartAlternatifleriCevabi, KartZarfiCevabi,
  MuadilTuru, OnerilmesinGovdesi, SeciliAlternatif, SeciliAlternatifKaydetGovdesi, SetNiteligiYazimi, SetOnizlemeCevabi, SetUyanKarti,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { GENIS_SET_ESIGI, SINIR_NITELIKLERI } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import {
  KAPSAM_DOGRULAMA, alternatifOnceligi, setHatasi, setTuru, setUyumu, sinirHatasi, uyanSinir, zarfaGirenler, zarfDegerlendir, zarfHesapla,
  type SetNiteligiSatiri, type ZarfKarti,
} from './kurallar.ts';
import * as s from './sorgular.ts';

const KAPSAM_ADI = { aile: 'Aile', sinif: 'Sınıf', kalite: 'Kalite' } as const;

const KISITLAR = {
  malzeme_alternatif_kurali_kapsam_tek: { ileti: 'Bu kapsam için kural zaten var.', alan: 'kapsam' },
  malzeme_alternatif_kurali_kapali_gerekceli: { ileti: 'Alternatifi kapatırken gerekçe yazın.', alan: 'gerekce' },
  malzeme_alternatif_kurali_pay_butun: { ileti: 'Pay türü ve değeri birlikte girilir.', alan: 'payDeger' },
  malzeme_kalite_muadili_pkey: { ileti: 'Bu muadil zaten var.', alan: 'muadil' },
  malzeme_durum_muadili_pkey: { ileti: 'Bu muadil zaten var.', alan: 'muadil' },
  malzeme_kalite_muadili_kendisi: { ileti: 'Kalite kendisinin muadili olamaz.', alan: 'muadil' },
  malzeme_durum_muadili_kendisi: { ileti: 'Durum kendisinin muadili olamaz.', alan: 'muadil' },
  malzeme_kabul_siniri_tek: { ileti: 'Bu nitelik için sınır zaten var.', alan: 'nitelik' },
  malzeme_kabul_siniri_sira: { ileti: 'Alt sınır üst sınırdan büyük olamaz.', alan: 'alt' },
  malzeme_kabul_siniri_bicim: { ileti: 'Liste niteliğine değer, ölçüye alt ya da üst sınır girilir.', alan: 'nitelik' },
  malzeme_esdeger_bagi_pkey: { ileti: 'Kart başka bir eşdeğer grubunda; önce oradan çıkarın.', alan: 'esdegerNo' },
} as const;

export async function alternatifTanimlari(db: Db): Promise<AlternatifTanimlariCevabi> {
  const [kurallar, kaliteMuadilleri, durumMuadilleri] = [await s.kurallar(db), await s.kaliteMuadilleri(db), await s.durumMuadilleri(db)];
  const adlar = await kisiAdlari(db, [...new Set(kurallar.map((k) => k.guncelleyenKisiId))]);
  return {
    kurallar: kurallar.map(({ guncelleyenKisiId, ...k }) => ({ ...k, guncelleyen: adlar.get(guncelleyenKisiId) ?? null })),
    kaliteMuadilleri, durumMuadilleri,
  };
}

export async function alternatifKuraliKaydet(db: Db, k: Kullanici, g: AlternatifKuraliKaydetGovdesi): Promise<{ tamam: true }> {
  const hata = KAPSAM_DOGRULAMA.kapsamHatasi(g.kapsamTuru, g.kapsam);
  if (hata) throw dogrulama(hata, 'kapsam');
  const payHatasi = KAPSAM_DOGRULAMA.payHatasi(g.payTuru, g.payDeger, g.payEnAzMm);
  if (payHatasi) throw dogrulama(payHatasi, 'payDeger');
  if (g.kapali === true && g.gerekce === null) throw dogrulama('Alternatifi kapatırken gerekçe yazın.', 'gerekce');
  if (g.kapsamTuru === 'kart' && !(await s.zarfKarti(db, Number(g.kapsam)))) throw bulunamadi('Kart bulunamadı.');
  // Yalnız yeni kuralda: kart silinse de var olan kural düzenlenebilir kalır.
  if (g.kapsamTuru !== 'kart' && g.surum === undefined && !(await s.kapsamKatalogdaMi(db, g.kapsamTuru, g.kapsam))) {
    throw dogrulama(`${KAPSAM_ADI[g.kapsamTuru]} katalogdaki hiçbir kartta yok: ${g.kapsam}`, 'kapsam');
  }
  const yazim: s.KuralYazimi = {
    kapsamTuru: g.kapsamTuru, kapsam: g.kapsam, kaliteAcik: g.kaliteAcik, durumAcik: g.durumAcik, sartliAcik: g.sartliAcik,
    boyUzunKesilir: g.boyUzunKesilir, yuzeySerbest: g.yuzeySerbest, payTuru: g.payTuru, payDeger: g.payDeger, payEnAzMm: g.payEnAzMm,
    kapali: g.kapali, gerekce: g.gerekce,
  };
  await kisitKorumali(KISITLAR, async () => {
    if (g.surum === undefined) { await s.kuralEkle(db, yazim, k.id); return; }
    if ((await s.kuralGuncelle(db, yazim, g.surum, k.id)) !== null) return;
    if (await s.kuralVarMi(db, g.kapsamTuru, g.kapsam)) throw eskiSurum();
    throw bulunamadi('Kural bulunamadı.');
  });
  return { tamam: true };
}

export async function alternatifKuraliKaldir(db: Db, id: number, surum: number): Promise<{ tamam: true }> {
  if (await s.kuralSil(db, id, surum)) return { tamam: true };
  throw (await s.kuralGetir(db, id)) ? eskiSurum() : bulunamadi('Kural bulunamadı.');
}

export async function muadilKaydet(db: Db, k: Kullanici, t: 'kalite' | 'durum',
  g: { deger: string; muadil: string; tur: MuadilTuru; notu: string | null; surum?: number | undefined }): Promise<{ tamam: true }> {
  await kisitKorumali(KISITLAR, async () => {
    if (g.surum === undefined) { await s.muadilEkle(db, t, g.deger, g.muadil, g.tur, g.notu, k.id); return; }
    if (await s.muadilGuncelle(db, t, g.deger, g.muadil, g.tur, g.notu, g.surum, k.id)) return;
    throw (await s.muadilVarMi(db, t, g.deger, g.muadil)) ? eskiSurum() : bulunamadi('Muadil bulunamadı.');
  });
  return { tamam: true };
}

export async function muadilKaldir(db: Db, t: 'kalite' | 'durum', deger: string, muadil: string, surum: number): Promise<{ tamam: true }> {
  if (await s.muadilSil(db, t, deger, muadil, surum)) return { tamam: true };
  throw (await s.muadilVarMi(db, t, deger, muadil)) ? eskiSurum() : bulunamadi('Muadil bulunamadı.');
}

const sayiNesnesi = (o: Record<string, unknown> | null): Record<string, number> =>
  Object.fromEntries(Object.entries(o ?? {}).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0));
const zarfKartina = (r: s.ZarfKartSatiri): ZarfKarti => ({
  no: r.no, aile: r.aile, sinif: r.sinif, kalite: r.kalite, durum: r.durum, yuzey: r.yuzey, form: r.form, olcu: sayiNesnesi(r.olcu),
});

async function zarfOku(db: Db, r: s.ZarfKartSatiri): Promise<AlternatifZarfi | null> {
  if (r.tur !== 'hammadde' || r.kalite === null) return null;
  return zarfHesapla(zarfKartina(r), await s.kurallar(db), await s.kaliteMuadilleri(db), await s.durumMuadilleri(db), await s.siniri(db));
}

export async function kartZarfi(db: Db, no: number): Promise<KartZarfiCevabi> {
  const r = await s.zarfKarti(db, no);
  if (!r) throw bulunamadi('Kart bulunamadı.');
  const zarf = await zarfOku(db, r);
  const kartlar = zarf === null || r.form === null ? [] : zarfaGirenler(zarf, zarfKartina(r), (await s.zarfAdaylari(db, r.form)).map((a) => ({ ...zarfKartina(a), kod: a.kod, ad: a.ad })));
  return {
    kart: { no: r.no, kod: r.kod, ad: r.ad, aile: r.aile, sinif: r.sinif },
    zarf,
    kartlar: kartlar.map((a) => ({ no: a.no, kod: a.kod, ad: a.ad, kalite: a.kalite, durum: a.durum, form: a.form, olcu: { ...a.olcu }, sonuc: a.sonuc, nedenler: a.nedenler })),
  };
}

// Başka modüller için (talep, satın alma, stok kontrol sonraki dilimlerde): kartın zarfı; hammadde dışı ya da olmayan kartta null.
export async function alternatifZarfiOku(db: Db, no: number): Promise<AlternatifZarfi | null> {
  const r = await s.zarfKarti(db, no);
  return r ? zarfOku(db, r) : null;
}

// Aday nitelikleri (kalite, durum, yüzey, form, ölçü) zarfa göre; kart yoksa ya da zarf hesaplanamıyorsa null.
export async function alternatifDegerlendir(db: Db, no: number, aday: Omit<ZarfKarti, 'no' | 'aile' | 'sinif'>) {
  const zarf = await alternatifZarfiOku(db, no);
  if (zarf === null) return null;
  return zarfDegerlendir(zarf, { ...aday, no: 0, aile: null, sinif: null });
}



// 3463, 3572 a: kartın yerine kabul edilen kartlar, K4 önceliğiyle: eşdeğerler önce; Önerilmesin işaretli kart hiç gelmez; tekil
// kartlar ve setler kullanıcının sırasıyla (yalnız kullanım yerinde geçerli olanlar); sonra kabul sınırına girenler (aynı, içinde,
// şartlı). Kart yoksa boş liste. Yetki denetlemez.
export async function kartinAlternatifKartlari(db: Db, no: number, baglam: AlternatifBaglami): Promise<AlternatifKarti[]> {
  const r = await s.zarfKarti(db, no);
  if (!r) return [];
  const g = await alternatifGirdisi(db, r);
  return alternatifOnceligi({ ...g, kullanimYeri: baglam.kullanimYeri });
}

async function kuraldanGelenler(db: Db, r: s.ZarfKartSatiri, disarida: ReadonlySet<number>) {
  const zarf = await zarfOku(db, r);
  if (zarf === null || r.form === null) return [];
  const adaylar = (await s.zarfAdaylari(db, r.form)).filter((a) => !disarida.has(a.no)).map((a) => ({ ...zarfKartina(a), kod: a.kod, ad: a.ad }));
  return zarfaGirenler(zarf, zarfKartina(r), adaylar).flatMap((a) => (a.sonuc === 'disi' ? [] : [{
    no: a.no, kod: a.kod, ad: a.ad, sonuc: a.sonuc, nedenler: a.nedenler,
  }]));
}

const setKartina = (a: s.SetAdaySatiri) => ({ ...zarfKartina(a), standartlar: a.standartlar });
const setUyanlari = (n: readonly SetNiteligiSatiri[], anaNo: number, adaylar: readonly s.SetAdaySatiri[]) =>
  adaylar.flatMap((a) => {
    if (a.no === anaNo) return [];
    const u = setUyumu(n, setKartina(a));
    return u.uyar ? [{ no: a.no, kod: a.kod, ad: a.ad, neden: u.neden, yeni: a.yeni }] : [];
  });

async function alternatifGirdisi(db: Db, r: s.ZarfKartSatiri) {
  const esdeger = await s.esdegerler(db, r.no);
  const secili = await s.secililer(db, r.no);
  const setKayitlari = r.tur === 'hammadde' ? await s.setler(db, r.no) : [];
  const adaylar = setKayitlari.length > 0 ? await s.setAdaylari(db) : [];
  const setler = setKayitlari.map((t) => ({ ...t, uyanlar: setUyanlari(t.nitelikler, r.no, adaylar) }));
  const kuraldan = await kuraldanGelenler(db, r, new Set(esdeger.map((e) => e.no)));
  return { esdeger, secili, setler, kuraldan };
}

// 3463: kartın Alternatifler bölümü: karta uyan sınırlar (her nitelik için en dar kapsam) ve eşdeğer kartlar.
export async function kartAlternatifleri(db: Db, no: number): Promise<KartAlternatifleriCevabi> {
  const r = await s.zarfKarti(db, no);
  if (!r) throw bulunamadi('Kart bulunamadı.');
  const tum = await s.siniri(db);
  const kart = zarfKartina(r);
  const uyan = SINIR_NITELIKLERI.flatMap((n) => { const x = uyanSinir(kart, tum, n); return x ? [x as s.SinirKaydi] : []; });
  const g = await alternatifGirdisi(db, r);
  const onerilmez = new Set(g.secili.filter((x) => x.onerilmez).map((x) => x.no));
  const tekil = new Set(g.secili.filter((x) => !x.onerilmez).map((x) => x.no));
  const kuraldan = new Set(g.kuraldan.map((x) => x.no));
  const setler: AlternatifSeti[] = g.setler.map(({ anaNo: _a, uyanSayi: _u, uyanlar, ...t }) => ({
    ...t, uyanSayisi: uyanlar.length, uyanlar: uyanDurumlari(uyanlar, tekil, onerilmez).slice(0, UYAN_EN_COK),
  }));
  const secili: SeciliAlternatif[] = g.secili.map(({ no: alternatifNo, ...x }) => ({
    alternatifNo, ...x, setler: g.setler.filter((t) => t.uyanlar.some((u) => u.no === alternatifNo)).map((t) => t.id), kuraldan: kuraldan.has(alternatifNo),
  }));
  return {
    siniri: uyan.map((x) => ({ ...x, degerler: x.degerler === null ? null : [...x.degerler] })), esdegerler: g.esdeger,
    setler, secili, genisEsik: GENIS_SET_ESIGI, hesap: new Date().toISOString(),
  };
}

// 3572 a: set penceresi ve föy en çok bu kadar uyan kart gösterir; sayı her zaman tamdır.
const UYAN_EN_COK = 50;
const uyanDurumlari = (l: readonly { no: number; kod: string | null; ad: string | null; neden: string; yeni: boolean }[], tekil: ReadonlySet<number>,
  onerilmez: ReadonlySet<number>): SetUyanKarti[] =>
  l.map((u) => ({ ...u, durum: onerilmez.has(u.no) ? 'onerilmez' : tekil.has(u.no) ? 'tekil' : 'gecer' }));

async function setAnaKarti(db: Db, anaNo: number): Promise<s.ZarfKartSatiri> {
  const r = await s.zarfKarti(db, anaNo);
  if (!r) throw bulunamadi('Kart bulunamadı.');
  if (r.tur !== 'hammadde') throw dogrulama('Alternatif seti yalnız hammadde kartında kurulur; alternatifi Kart ekle ile seçin.', 'anaNo');
  return r;
}

export async function setOnizleme(db: Db, anaNo: number, nitelikler: readonly SetNiteligiYazimi[]): Promise<SetOnizlemeCevabi> {
  const r = await setAnaKarti(db, anaNo);
  const hata = nitelikler.length === 0 ? null : setHatasi(nitelikler);
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  const uyanlar = nitelikler.length === 0 ? [] : setUyanlari(nitelikler, anaNo, await s.setAdaylari(db));
  const secili = await s.secililer(db, anaNo);
  const durumlu = uyanDurumlari(uyanlar, new Set(secili.filter((x) => !x.onerilmez).map((x) => x.no)), new Set(secili.filter((x) => x.onerilmez).map((x) => x.no)));
  return {
    uyanSayisi: uyanlar.length, uyanlar: durumlu.slice(0, UYAN_EN_COK), sartli: setTuru('tam', nitelikler, await zarfOku(db, r)) === 'sartli',
    hesap: new Date().toISOString(),
  };
}

const SET_KISITLARI = {
  malzeme_alternatif_seti_niteligi_sira: { ileti: 'En az en çoktan büyük olamaz.', alan: 'nitelikler' },
  malzeme_alternatif_seti_niteligi_bicim: { ileti: 'Liste alanına değer, ölçüye en az ya da en çok girilir.', alan: 'nitelikler' },
  malzeme_secili_alternatif_pkey: { ileti: 'Bu kart zaten listede.', alan: 'alternatifNo' },
} as const;

// K5: sete sonradan açılan uyan kart kendiliğinden girer. Eşik üstünde "bu kadar geniş olduğunu biliyorum" işareti ister; 0 kart
// kaydedilebilir (ekran uyarır). Z4: şartlı muadil değer işaretliyse set şartlı kaydedilir.
export async function setKaydet(db: Db, k: Kullanici, g: AlternatifSetiKaydetGovdesi): Promise<{ id: number; tur: MuadilTuru; uyanSayisi: number }> {
  if ((g.id === undefined) !== (g.surum === undefined)) throw dogrulama('Var olan seti değiştirirken kimlik ve sürüm birlikte gelir.', 'surum');
  await s.anaKilidi(db, g.anaNo);
  const r = await setAnaKarti(db, g.anaNo);
  const hata = setHatasi(g.nitelikler);
  if (hata) throw dogrulama(hata.ileti, hata.alan === 'nitelikler' ? 'nitelikler' : `nitelikler.${hata.alan}`);
  const uyanSayi = setUyanlari(g.nitelikler, g.anaNo, await s.setAdaylari(db)).length;
  if (uyanSayi > GENIS_SET_ESIGI && !g.genisOnay) {
    throw dogrulama(`Bu set ${String(uyanSayi)} kartı kabul eder; kaydetmek için "Bu kadar geniş olduğunu biliyorum" işaretleyin.`, 'genisOnay');
  }
  const tur = setTuru(g.tur, g.nitelikler, await zarfOku(db, r));
  const yazim: s.SetYazimi = { anaNo: g.anaNo, ad: g.ad, tur, kullanimYerleri: g.kullanimYerleri, notu: g.notu, uyanSayi, genisOnay: g.genisOnay };
  const id = await kisitKorumali(SET_KISITLARI, async () => {
    let yeniId = g.id;
    if (yeniId === undefined) yeniId = await s.setEkle(db, yazim, await s.sonrakiSira(db, g.anaNo), k.id);
    else if (!(await s.setGuncelle(db, yeniId, yazim, g.surum!, k.id))) {
      const var_ = await s.setGetir(db, yeniId);
      throw var_ && var_.anaNo === g.anaNo ? eskiSurum() : bulunamadi('Set bulunamadı.');
    }
    await s.setNitelikleriYaz(db, g.anaNo, yeniId, g.nitelikler);
    return yeniId;
  });
  return { id, tur, uyanSayisi: uyanSayi };
}

// Açık talep, sipariş ve emirdeki seçimler değişmez (seçim somut karta yazılır).
export async function setKaldir(db: Db, id: number, surum: number): Promise<{ tamam: true }> {
  const var_ = await s.setGetir(db, id);
  if (!var_) throw bulunamadi('Set bulunamadı.');
  await s.anaKilidi(db, var_.anaNo);
  if (await s.setSil(db, id, surum)) return { tamam: true };
  throw (await s.setGetir(db, id)) ? eskiSurum() : bulunamadi('Set bulunamadı.');
}

async function seciliDenetle(db: Db, anaNo: number, alternatifNo: number): Promise<void> {
  if (anaNo === alternatifNo) throw dogrulama('Kart kendisinin alternatifi olamaz.', 'alternatifNo');
  if (!(await s.zarfKarti(db, anaNo))) throw bulunamadi('Kart bulunamadı.');
  const a = await s.seciliAdayi(db, anaNo, alternatifNo);
  if (!a) throw bulunamadi('Alternatif kart bulunamadı.');
  if (a.esdeger) throw dogrulama('Kart bu kartın eşdeğeri; eşdeğer bağ her zaman geçer.', 'alternatifNo');
  if (!a.aktif) throw dogrulama('Yalnız aktif kart alternatif olarak eklenir.', 'alternatifNo');
}

// K1: tanım yetkisiyle eklenen kart kabul sınırı dışında da olabilir (talepte seçilebilir hale gelir).
export async function seciliKaydet(db: Db, k: Kullanici, g: SeciliAlternatifKaydetGovdesi): Promise<{ tamam: true }> {
  await s.anaKilidi(db, g.anaNo);
  await seciliDenetle(db, g.anaNo, g.alternatifNo);
  const var_ = await s.seciliGetir(db, g.anaNo, g.alternatifNo);
  const sira = var_?.sira ?? await s.sonrakiSira(db, g.anaNo);
  const yazim: s.SeciliYazimi = { anaNo: g.anaNo, alternatifNo: g.alternatifNo, onerilmez: false, tur: g.tur, sira, kullanimYerleri: g.kullanimYerleri, notu: g.notu };
  await seciliYaz(db, k, yazim, var_, g.surum);
  return { tamam: true };
}

export async function onerilmesin(db: Db, k: Kullanici, g: OnerilmesinGovdesi): Promise<{ tamam: true }> {
  await s.anaKilidi(db, g.anaNo);
  await seciliDenetleOnerilmez(db, g.anaNo, g.alternatifNo);
  const var_ = await s.seciliGetir(db, g.anaNo, g.alternatifNo);
  await seciliYaz(db, k, { anaNo: g.anaNo, alternatifNo: g.alternatifNo, onerilmez: true, tur: null, sira: null, kullanimYerleri: null, notu: g.neden }, var_, g.surum);
  return { tamam: true };
}

// Önerilmesin pasif kartta da konur (kart yeniden açılırsa yine önerilmesin); eşdeğerde konmaz.
async function seciliDenetleOnerilmez(db: Db, anaNo: number, alternatifNo: number): Promise<void> {
  if (anaNo === alternatifNo) throw dogrulama('Kart kendisinin alternatifi olamaz.', 'alternatifNo');
  if (!(await s.zarfKarti(db, anaNo))) throw bulunamadi('Kart bulunamadı.');
  const a = await s.seciliAdayi(db, anaNo, alternatifNo);
  if (!a) throw bulunamadi('Alternatif kart bulunamadı.');
  if (a.esdeger) throw dogrulama('Eşdeğer kart önerilmesin diye işaretlenmez; önce eşdeğer bağı kaldırın.', 'alternatifNo');
}

async function seciliYaz(db: Db, k: Kullanici, y: s.SeciliYazimi, var_: { surum: number } | null, surum: number | undefined): Promise<void> {
  await kisitKorumali(SET_KISITLARI, async () => {
    if (var_ === null) {
      if (surum !== undefined) throw bulunamadi('Alternatif bulunamadı.');
      await s.seciliEkle(db, y, k.id);
      return;
    }
    if (surum === undefined) throw dogrulama('Bu kart zaten listede.', 'alternatifNo');
    if (!(await s.seciliGuncelle(db, y, surum, k.id))) throw eskiSurum();
  });
}

// Listeden kaldır ya da Önerilmesin'i geri al: kart kuraldan geliyorsa yine kuraldan gelir.
export async function seciliKaldir(db: Db, anaNo: number, alternatifNo: number, surum: number): Promise<{ tamam: true }> {
  await s.anaKilidi(db, anaNo);
  if (await s.seciliSil(db, anaNo, alternatifNo, surum)) return { tamam: true };
  throw (await s.seciliGetir(db, anaNo, alternatifNo)) ? eskiSurum() : bulunamadi('Alternatif bulunamadı.');
}

// Setler ve tekil kartlar tek sırada; gelen liste kartın bütün sıralı öğeleridir.
export async function siraKaydet(db: Db, g: AlternatifSirasiGovdesi): Promise<{ tamam: true }> {
  await s.anaKilidi(db, g.anaNo);
  const setler = await s.setler(db, g.anaNo);
  const kartlar = (await s.secililer(db, g.anaNo)).filter((x) => !x.onerilmez);
  const beklenen = new Set([...setler.map((t) => `set:${String(t.id)}`), ...kartlar.map((x) => `kart:${String(x.no)}`)]);
  const gelen = g.ogeler.map((o) => `${o.tur}:${String(o.no)}`);
  if (new Set(gelen).size !== gelen.length || gelen.length !== beklenen.size || gelen.some((x) => !beklenen.has(x))) {
    throw eskiSurum();
  }
  for (const [i, o] of g.ogeler.entries()) await s.siraYaz(db, g.anaNo, o.tur, o.no, i);
  return { tamam: true };
}

// K5: katalog değişince (kart onaylanır, iptal edilir, nitelikleri değişir) setlerin uyan sayısı tazelenir; değişim Geçmiş'e düşer.
export async function setSayilariniTazele(db: Db): Promise<void> {
  const setler = await s.butunSetler(db);
  if (setler.length === 0) return;
  const adaylar = await s.setAdaylari(db);
  for (const t of setler) await s.setUyanSayisiYaz(db, t.id, setUyanlari(t.nitelikler, t.anaNo, adaylar).length);
}

export async function kabulSiniriKaydet(db: Db, k: Kullanici, g: KabulSiniriKaydetGovdesi): Promise<{ tamam: true }> {
  const kapsamHatasi = KAPSAM_DOGRULAMA.kapsamHatasi(g.kapsamTuru, g.kapsam);
  if (kapsamHatasi) throw dogrulama(kapsamHatasi, 'kapsam');
  const hata = sinirHatasi(g.nitelik, g.degerler, g.alt, g.ust);
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  if (g.kapsamTuru === 'kart' && !(await s.zarfKarti(db, Number(g.kapsam)))) throw bulunamadi('Kart bulunamadı.');
  if (g.kapsamTuru !== 'kart' && g.surum === undefined && !(await s.kapsamKatalogdaMi(db, g.kapsamTuru, g.kapsam))) {
    throw dogrulama(`${KAPSAM_ADI[g.kapsamTuru]} katalogdaki hiçbir kartta yok: ${g.kapsam}`, 'kapsam');
  }
  const yazim: s.SinirYazimi = { kapsamTuru: g.kapsamTuru, kapsam: g.kapsam, nitelik: g.nitelik, degerler: g.degerler, alt: g.alt, ust: g.ust };
  await kisitKorumali(KISITLAR, async () => {
    if (g.surum === undefined) { await s.sinirEkle(db, yazim, k.id); return; }
    if (await s.sinirGuncelle(db, yazim, g.surum, k.id)) return;
    throw (await s.sinirVarMi(db, g.kapsamTuru, g.kapsam, g.nitelik)) ? eskiSurum() : bulunamadi('Sınır bulunamadı.');
  });
  return { tamam: true };
}

export async function kabulSiniriKaldir(db: Db, id: number, surum: number): Promise<{ tamam: true }> {
  if (await s.sinirSil(db, id, surum)) return { tamam: true };
  throw (await s.sinirGetir(db, id)) ? eskiSurum() : bulunamadi('Sınır bulunamadı.');
}

const kartAnahtari = (x: { tur: string; form: string | null; anahtarlar: string[]; birim: string | null }) =>
  JSON.stringify([x.tur, x.form, x.anahtarlar, x.birim]);

// Eşdeğer bağ yalnız aynı tür, form, ölçü anahtarı ve stok biriminde kurulur (Risk K1): stok bu kartlar arasında birlikte sayılacak.
export async function esdegerBagla(db: Db, k: Kullanici, kartNo: number, esdegerNo: number): Promise<{ tamam: true }> {
  if (kartNo === esdegerNo) throw dogrulama('Kart kendisine eşdeğer bağlanamaz.', 'esdegerNo');
  const [a, b] = [await s.esdegerKarti(db, kartNo), await s.esdegerKarti(db, esdegerNo)];
  if (!a || !b) throw bulunamadi('Kart bulunamadı.');
  if (a.birim === null || kartAnahtari(a) !== kartAnahtari(b)) {
    throw dogrulama('Eşdeğer kart aynı tür, form, ölçü alanları ve stok biriminde olmalı.', 'esdegerNo');
  }
  await s.esdegerKilidi(db);
  const [ga, gb] = [await s.esdegerGrubu(db, kartNo, true), await s.esdegerGrubu(db, esdegerNo, true)];
  if (ga !== null && ga === gb) throw dogrulama('Kartlar zaten eşdeğer.', 'esdegerNo');
  if (gb !== null) throw dogrulama('Kart başka bir eşdeğer grubunda; önce oradan çıkarın.', 'esdegerNo');
  await kisitKorumali(KISITLAR, async () => {
    const grup = ga ?? kartNo;
    if (ga === null) await s.esdegerEkle(db, kartNo, grup, k.id);
    await s.esdegerEkle(db, esdegerNo, grup, k.id);
  });
  return { tamam: true };
}

export async function esdegerKaldir(db: Db, kartNo: number): Promise<{ tamam: true }> {
  await s.esdegerKilidi(db);
  const grup = await s.esdegerGrubu(db, kartNo, true);
  if (grup === null) throw bulunamadi('Kart bir eşdeğer grubunda değil.');
  await s.esdegerCikar(db, kartNo, grup);
  return { tamam: true };
}

// 3463-1b (Risk K1): stok ve plan, eşdeğer kartların stoğunu birlikte sayar. Yetki denetlemez.
export const esdegerGruplari = (db: Db, nolar: readonly number[]): Promise<Map<number, number[]>> => s.esdegerUyeleri(db, nolar);

// 3463-1b: grup şablonu (aile, sınıf, kalite kapsamındaki sınırlar), geniş kapsamdan dara.
export async function grupSinirlari(db: Db): Promise<GrupSinirlariCevabi> {
  return {
    siniri: (await s.siniri(db)).filter((x) => x.kapsamTuru !== 'kart').map((x) => ({ ...x, degerler: x.degerler === null ? null : [...x.degerler] })),
    kapsamlar: await s.kapsamSayilari(db),
  };
}
