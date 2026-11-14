import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, cokBuyuk, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { TalimatlarCevabi, TalimatAdimi, TalimatSablonKopyalariCevabi, TalimatSablonlariCevabi, TalimatSablonuCevabi } from '#paylasilan/sozlesme/rota.ts';
import { MEDYA_SINIRI } from '#paylasilan/sozlesme/rota.ts';
import { denetimSatiri, medyaTutamagi } from '../../dosya/disari.ts';
import type { BagliDosya } from '#paylasilan/sozlesme/dosya.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { operasyonTipleri as katalogTipleri } from '../../istasyonlar/disari.ts';
import { adimliTalimatMetni, eskiTalimatAdimi, kontrolAyrisi, medyaSinirHatasi, medyaTuru, talimatAdimiHatasi, urunMedyaToplami } from '../kurallar.ts';
import type { TalimatAdimiYazisi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import { SARTNAME_YOK, surumAdimlari, talimatAdimlariKur, urunOzetleri } from './ortak.ts';

export async function talimatListesi(db: Db, urunId: number, opNo: number): Promise<TalimatlarCevabi> {
  const satirlar = await s.talimatlar(db, urunId, opNo);
  const tsl = await s.talimatTaslagi(db, urunId, opNo);
  const adlar = await kisiAdlari(db, [...satirlar.map((t) => t.yazanKisiId), ...(tsl ? [tsl.yazanKisiId] : [])]);
  const adimlar = await surumAdimlari(db, satirlar.map((t) => t.id));
  const kokenler = new Map((await s.talimatKokenleri(db, satirlar.map((t) => t.id))).map((k) => [k.sahipId, k]));
  return {
    taslak: tsl && {
      surum: tsl.surum, tabanSurum: tsl.tabanSurum, yazan: { id: tsl.yazanKisiId, ad: adlar.get(tsl.yazanKisiId) ?? null }, yazma: tsl.yazma,
      adimlar: talimatAdimlariKur(await s.taslakAdimlari(db, tsl.id), await s.taslakMedyalari(db, tsl.id)).get(tsl.id) ?? [],
      koken: kokenCevabi(await s.taslakKokeni(db, tsl.id)),
    },
    surumler: satirlar.map((t) => {
      const a = adimlar.get(t.id);
      return {
        surum: t.surum, metin: t.metin, yazan: { id: t.yazanKisiId, ad: adlar.get(t.yazanKisiId) ?? null }, yazma: t.yazma,
        adimli: a !== undefined, adimlar: a ?? [eskiTalimatAdimi(t.metin)], koken: kokenCevabi(kokenler.get(t.id) ?? null),
      };
    }),
  };
}

/* ---------------- şablon kökeni (2588 a) ---------------- */

type KaynakSablon = { id: number; surum: number };

const kokenCevabi = (k: s.KokenSatiri | null): TalimatlarCevabi['surumler'][number]['koken'] =>
  k && { sablon: { id: k.sablonId, kod: k.sablonKodu, ad: k.sablonAdi }, surum: k.sablonSurum };

// Köken ekranın gördüğü şablon sürümüyle yazılır: şablon o arada değiştiyse kopya eski içeriktir, kayıt yanlış sürümü göstermesin.
// Şablon satırı kilitlenir; böylece denetimle yazım arasında şablon değişemez.
async function kokenDenetle(db: Db, k: KaynakSablon): Promise<s.KokenYazisi> {
  const x = await s.talimatSablonKilitle(db, k.id);
  if (!x) throw bulunamadi(TALIMAT_SABLONU_YOK);
  if (x.surum !== k.surum) throw eskiSurum();
  return { sablonId: k.id, sablonSurum: k.surum };
}

// Verilmeyen köken dayanılan yayın sürümünden gelir: kopyadan düzenlenen sürüm "nereden başladı" bilgisini kaybetmesin (Mimar K1).
async function tabanKokeni(db: Db, urunId: number, opNo: number, surum: number | null): Promise<s.KokenYazisi | null> {
  if (surum === null) return null;
  const t = await s.talimatSurumuKimligi(db, urunId, opNo, surum);
  const k = t && (await s.talimatKokenleri(db, [t.id]))[0];
  return k ? { sablonId: k.sablonId, sablonSurum: k.sablonSurum } : null;
}

const kokenCoz = async (db: Db, k: KaynakSablon | null | undefined, taban: () => Promise<s.KokenYazisi | null>): Promise<s.KokenYazisi | null> =>
  k ? kokenDenetle(db, k) : k === null ? null : taban();

/* ---------------- talimat medyası (995 a, 1004 a) ---------------- */

// İçerik ortak dosya deposundadır (ADR 0009); bağ özet başına tek kayıttır, böylece sürümler ve şablon kopyası dosyayı yeniden
// yüklemeden kullanır. İlk bağlayan içeriği kendisi göndermiş olmalıdır (DSb); bağlı dosya her oturuma açıktır (talimat da öyledir).
const medyaDeposu = medyaTutamagi('rota');
const medyaKaydi = (ozet: string): string => `medya:${ozet}`;
// Video yalnız disk deposu açıkken bağlanır (tutamak kapalıyken mp4'ü sınırdan düşürür).
const MEDYA_DOSYA_TURLERI = ['png', 'jpeg', 'webp', 'mp4'] as const;

async function medyaCoz(
  db: Db, kullanici: Kullanici, m: { ozet: string; ad: string }, denetimEki: DenetimEki,
): Promise<s.MedyaYazisi> {
  const kayit = medyaKaydi(m.ozet);
  const bagli: BagliDosya = (await medyaDeposu.bagliDosyalar(db, kayit))[0]
    ?? await medyaDeposu.dosyaBagla(db, kullanici, { ozet: m.ozet, kayit, ad: m.ad, belgeTuru: null }, {
      turler: MEDYA_DOSYA_TURLERI, azamiBayt: Math.max(MEDYA_SINIRI.resimBayt, MEDYA_SINIRI.videoBayt),
    }).then((d) => { denetimEki([denetimSatiri('bagla', d)]); return d; });
  const tur = medyaTuru(bagli.tur);
  if (tur === null) throw dogrulama('Talimata yalnız resim ve video eklenir.', 'medya');
  const hata = medyaSinirHatasi(tur, bagli.boyut, MEDYA_SINIRI);
  if (hata) throw cokBuyuk(hata);
  return { ozet: m.ozet, ad: m.ad, tur, boyut: bagli.boyut };
}

async function adimYazilari(
  db: Db, kullanici: Kullanici, adimlar: readonly TalimatAdimiYazisi[], denetimEki: DenetimEki,
): Promise<s.TalimatAdimiYazisi[]> {
  for (const [i, a] of adimlar.entries()) {
    const hata = talimatAdimiHatasi(a);
    if (hata) throw dogrulama(hata, `adimlar.${i}`);
  }
  const sonuc: s.TalimatAdimiYazisi[] = [];
  for (const a of adimlar) {
    const medya: s.MedyaYazisi[] = [];
    for (const m of a.medya) medya.push(await medyaCoz(db, kullanici, m, denetimEki));
    const { tur, ayar } = kontrolAyrisi(a.kontrol);
    sonuc.push({ baslik: a.baslik, metin: a.metin, kontrolTuru: tur, kontrolAyari: ayar, zorunlu: a.zorunlu, medya, asama: a.asama, hedefSureDk: a.hedefSureDk });
  }
  return sonuc;
}

// Rotada artık kullanılmayan dosyanın bağı kalkar; dosya modülü bağsız dosyayı süresi dolunca siler.
async function kullanilmayanMedyayiBirak(db: Db, ozetler: readonly string[], denetimEki: DenetimEki): Promise<void> {
  const kullanilan = new Set(await s.kullanilanMedyalar(db, ozetler));
  for (const ozet of new Set(ozetler)) {
    if (kullanilan.has(ozet)) continue;
    for (const d of await medyaDeposu.bagKaldir(db, medyaKaydi(ozet), ozet)) denetimEki([denetimSatiri('kaldir', d)]);
  }
}

// Bağlı medya her oturuma okunur: talimat ve şablon da oturumla okunur.
export async function talimatMedyasi(db: Db, ozet: string): Promise<IkiliCevap> {
  const akis = await medyaDeposu.dosyaAkisi(db, medyaKaydi(ozet), ozet);
  if (!akis) throw bulunamadi('Medya bulunamadı.');
  return akis;
}

export async function talimatYaz(
  db: Db, kullanici: Kullanici, urunId: number, govde: { opNo: number; metin: string; okunanSurum: number | null },
): Promise<TalimatlarCevabi> {
  if (!(await s.opNoAdimiVarMi(db, urunId, govde.opNo))) {
    throw dogrulama(`OP ${govde.opNo} bu ürünün hiçbir revizyonunda yok; talimat yazılamaz.`, 'opNo');
  }
  const son = (await s.talimatlar(db, urunId, govde.opNo))[0]?.surum ?? null;
  if (son !== govde.okunanSurum) {
    throw eskiSurum();
  }
  await s.talimatEkle(db, urunId, govde.opNo, (son ?? 0) + 1, govde.metin, kullanici.id);
  return talimatListesi(db, urunId, govde.opNo);
}

// Adımlı yazım da yeni talimat sürümüdür (989 a): metni adım başlıklarıdır, adımlar ayrı tabloda sürüme bağlanır.
export async function adimliTalimatYaz(
  db: Db, kullanici: Kullanici, urunId: number,
  govde: { opNo: number; okunanSurum: number | null; adimlar: readonly TalimatAdimiYazisi[]; kaynakSablon?: KaynakSablon | null | undefined },
  denetimEki: DenetimEki,
): Promise<TalimatlarCevabi> {
  if (!(await s.opNoAdimiVarMi(db, urunId, govde.opNo))) {
    throw dogrulama(`OP ${govde.opNo} bu ürünün hiçbir revizyonunda yok; talimat yazılamaz.`, 'opNo');
  }
  const yazilar = await adimYazilari(db, kullanici, govde.adimlar, denetimEki);
  const toplam = urunMedyaToplami(await s.urunMedyalari(db, urunId), yazilar.flatMap((a) => a.medya));
  if (toplam > MEDYA_SINIRI.urunBayt) throw cokBuyuk('Ürünün talimat medyası 1 GB sınırını aşıyor.');
  const son = (await s.talimatlar(db, urunId, govde.opNo))[0]?.surum ?? null;
  if (son !== govde.okunanSurum) throw eskiSurum();
  const koken = await kokenCoz(db, govde.kaynakSablon, () => tabanKokeni(db, urunId, govde.opNo, son));
  const id = await s.talimatEkle(db, urunId, govde.opNo, (son ?? 0) + 1, adimliTalimatMetni(govde.adimlar), kullanici.id);
  await s.talimatAdimlariniEkle(db, id, yazilar);
  if (koken) await s.talimatKokeniYaz(db, id, koken);
  return talimatListesi(db, urunId, govde.opNo);
}

/* ---------------- talimat taslağı ve yayını (1194 b) ---------------- */

// Taslak OP başına tektir ve yayınlanana kadar emre geçmez. Yayın, taslağın dayandığı sürümden sonra başka sürüm yayınlanmadıysa yapılır.
const TALIMAT_TASLAGI_KISITLARI = { rota_talimat_taslagi_op_tekil: { ileti: 'Bu OP için başka bir taslak açıldı; ekranı yenile.', alan: 'opNo' } };
const TALIMAT_TASLAGI_YOK = 'Bu OP için talimat taslağı yok.';

const sonYayin = async (db: Db, urunId: number, opNo: number): Promise<number | null> => (await s.talimatlar(db, urunId, opNo))[0]?.surum ?? null;

async function taslakAl(db: Db, urunId: number, opNo: number, taslakSurum: number): Promise<s.TalimatTaslagiSatiri> {
  const t = await s.talimatTaslagi(db, urunId, opNo, true);
  if (!t) throw bulunamadi(TALIMAT_TASLAGI_YOK);
  if (t.surum !== taslakSurum) throw eskiSurum();
  return t;
}

export async function talimatTaslakKaydet(
  db: Db, kullanici: Kullanici, urunId: number,
  govde: {
    opNo: number; okunanSurum: number | null; taslakSurum: number | null; adimlar: readonly TalimatAdimiYazisi[]; kaynakSablon?: KaynakSablon | null | undefined;
  },
  denetimEki: DenetimEki,
): Promise<TalimatlarCevabi> {
  if (!(await s.opNoAdimiVarMi(db, urunId, govde.opNo))) {
    throw dogrulama(`OP ${govde.opNo} bu ürünün hiçbir revizyonunda yok; talimat yazılamaz.`, 'opNo');
  }
  const mevcut = await s.talimatTaslagi(db, urunId, govde.opNo, true);
  if ((mevcut?.surum ?? null) !== govde.taslakSurum) throw eskiSurum();
  if ((await sonYayin(db, urunId, govde.opNo)) !== govde.okunanSurum) throw eskiSurum();
  const koken = govde.kaynakSablon === undefined && mevcut ? undefined
    : await kokenCoz(db, govde.kaynakSablon, () => tabanKokeni(db, urunId, govde.opNo, govde.okunanSurum));
  const yazilar = await adimYazilari(db, kullanici, govde.adimlar, denetimEki);
  const toplam = urunMedyaToplami(await s.urunMedyalari(db, urunId), yazilar.flatMap((a) => a.medya));
  if (toplam > MEDYA_SINIRI.urunBayt) throw cokBuyuk('Ürünün talimat medyası 1 GB sınırını aşıyor.');
  const onceki = mevcut ? (await s.taslakMedyalari(db, mevcut.id)).map((m) => m.ozet) : [];
  const taslakId = await kisitKorumali(TALIMAT_TASLAGI_KISITLARI, () => s.talimatTaslagiYaz(db, {
    malzemeId: urunId, opNo: govde.opNo, tabanSurum: govde.okunanSurum, kisiId: kullanici.id, adimlar: yazilar,
  }, mevcut));
  if (koken !== undefined) await s.taslakKokeniYaz(db, taslakId, koken);
  await kullanilmayanMedyayiBirak(db, onceki, denetimEki);
  return talimatListesi(db, urunId, govde.opNo);
}

export async function talimatYayinla(
  db: Db, kullanici: Kullanici, urunId: number, govde: { opNo: number; taslakSurum: number },
): Promise<TalimatlarCevabi> {
  const t = await taslakAl(db, urunId, govde.opNo, govde.taslakSurum);
  const son = await sonYayin(db, urunId, govde.opNo);
  if (son !== t.tabanSurum) {
    throw cakisma(`Taslak açıldıktan sonra OP ${govde.opNo} talimatının ${String(son)}. sürümü yayınlandı; taslağı son sürüme bakarak yeniden kaydet.`);
  }
  const satirlar = await s.taslakAdimlari(db, t.id);
  const medyalar = await s.taslakMedyalari(db, t.id);
  const yazilar: s.TalimatAdimiYazisi[] = satirlar.map((a) => ({
    baslik: a.baslik, metin: a.metin, kontrolTuru: a.kontrolTuru, kontrolAyari: a.kontrolAyari, zorunlu: a.zorunlu, asama: a.asama, hedefSureDk: a.hedefSureDk,
    medya: medyalar.filter((m) => m.adimSira === a.sira).map((m) => ({ ozet: m.ozet, ad: m.ad, tur: m.tur, boyut: m.boyut })),
  }));
  const id = await s.talimatEkle(db, urunId, govde.opNo, (son ?? 0) + 1, adimliTalimatMetni(yazilar), kullanici.id);
  await s.talimatAdimlariniEkle(db, id, yazilar);
  const koken = await s.taslakKokeni(db, t.id);
  if (koken) await s.talimatKokeniYaz(db, id, koken);
  await s.talimatTaslagiSil(db, t.id);
  return talimatListesi(db, urunId, govde.opNo);
}

export async function talimatTaslakSil(
  db: Db, urunId: number, govde: { opNo: number; taslakSurum: number }, denetimEki: DenetimEki,
): Promise<TalimatlarCevabi> {
  const t = await taslakAl(db, urunId, govde.opNo, govde.taslakSurum);
  const ozetler = (await s.taslakMedyalari(db, t.id)).map((m) => m.ozet);
  await s.talimatTaslagiSil(db, t.id);
  await kullanilmayanMedyayiBirak(db, ozetler, denetimEki);
  return talimatListesi(db, urunId, govde.opNo);
}

// Emre sabitlenen talimat sürümünün adımları (terminal okur); sürüm yoksa null, düz metin sürüm tek adımdır.
export async function talimatSurumuAdimlari(db: Db, malzemeId: number, opNo: number, surum: number): Promise<TalimatAdimi[] | null> {
  const t = await s.talimatSurumuKimligi(db, malzemeId, opNo, surum);
  if (!t) return null;
  return (await surumAdimlari(db, [t.id])).get(t.id) ?? [eskiTalimatAdimi(t.metin)];
}

/* ---------------- talimat şablonu (989 a) ---------------- */

type DenetimEki = (satirlar: readonly DenetimSecimi[]) => void;

const TALIMAT_SABLONU_YOK = 'Talimat şablonu bulunamadı.';
const TALIMAT_SABLON_KISITLARI = {
  rota_talimat_sablonu_kod_tekil: { ileti: 'Bu kod başka bir talimat şablonunda kullanılıyor.', alan: 'kod' },
  rota_talimat_sablonu_emre_gelir_tekil: { ileti: 'Bu operasyon tipinde emre kendiliğinden gelen başka bir şablon var.', alan: 'emreGelir' },
};
const OPERASYON_TIPI_YOK = 'Operasyon tipi bulunamadı.';
const EMRE_GELIR_TIPSIZ = 'Emre kendiliğinden gelmesi için operasyon tipi seçin.';

type TipAdlari = ReadonlyMap<number, { id: number; kod: string; ad: string }>;
const tipAdlari = async (db: Db): Promise<TipAdlari> =>
  new Map((await katalogTipleri(db, { pasiflerDahil: true })).map((t) => [t.id, { id: t.id, kod: t.kod, ad: t.ad }]));
const sablonOzeti = (x: s.TalimatSablonSatiri, tipler: TipAdlari) => ({
  id: x.id, kod: x.kod, ad: x.ad, aktif: x.aktif, surum: x.surum, adimSayisi: x.adimSayisi,
  kontrolSayisi: x.kontrolSayisi, resimSayisi: x.resimSayisi, videoSayisi: x.videoSayisi,
  sartname: x.sartnameId === null ? null : { id: x.sartnameId, kod: x.sartnameKodu ?? '', ad: x.sartnameAdi ?? '' },
  operasyonTipi: x.operasyonTipiId === null ? null : (tipler.get(x.operasyonTipiId) ?? { id: x.operasyonTipiId, kod: '', ad: '' }),
  emreGelir: x.emreGelir,
});

export async function talimatSablonlari(db: Db): Promise<TalimatSablonlariCevabi> {
  const tipler = await tipAdlari(db);
  return { sablonlar: (await s.talimatSablonlari(db)).map((x) => sablonOzeti(x, tipler)) };
}

export async function talimatSablonu(db: Db, id: number): Promise<TalimatSablonuCevabi> {
  const x = (await s.talimatSablonlari(db, [id]))[0];
  if (!x) throw bulunamadi(TALIMAT_SABLONU_YOK);
  return { sablon: { ...sablonOzeti(x, await tipAdlari(db)), adimlar: talimatAdimlariKur(await s.talimatSablonAdimlari(db, id), await s.sablonMedyalari(db, id)).get(id) ?? [] } };
}

// Kopyalar şablonun güncel sürümüyle karşılaştırılır; ürün özeti malzemeler modülünden toplu alınır.
export async function talimatSablonKopyalari(db: Db, id: number): Promise<TalimatSablonKopyalariCevabi> {
  const x = (await s.talimatSablonlari(db, [id]))[0];
  if (!x) throw bulunamadi(TALIMAT_SABLONU_YOK);
  const satirlar = await s.sablonKopyalari(db, id);
  const urunler = await urunOzetleri(db, satirlar.map((k) => k.malzemeId));
  return {
    sablon: { id: x.id, kod: x.kod, ad: x.ad, surum: x.surum },
    kopyalar: satirlar.flatMap((k) => {
      const urun = urunler.get(k.malzemeId);
      return urun ? [{ urun, opNo: k.opNo, talimatSurumu: k.talimatSurumu, taslak: k.taslak, sablonSurumu: k.sablonSurumu, geride: k.sablonSurumu < x.surum, gecerli: k.gecerli }] : [];
    }),
  };
}

async function sablonSartnamesiDenetle(db: Db, sartnameId: number | null): Promise<void> {
  if (sartnameId !== null && !(await s.sartnameVarMi(db, sartnameId))) throw dogrulama(SARTNAME_YOK, 'sartnameId');
}

// 3249 b: tip katalogda olmalı (pasif tip eski şablonda kalabilir, yeni seçimde de kabul edilir: emre gelmesi rota adımına bağlıdır).
async function sablonOperasyonu(db: Db, tipId: number | null, emreGelir: boolean): Promise<{ operasyonTipiId: number | null; emreGelir: boolean }> {
  if (tipId !== null && !(await tipAdlari(db)).has(tipId)) throw dogrulama(OPERASYON_TIPI_YOK, 'operasyonTipiId');
  if (emreGelir && tipId === null) throw dogrulama(EMRE_GELIR_TIPSIZ, 'emreGelir');
  return { operasyonTipiId: tipId, emreGelir };
}

export async function talimatSablonEkle(
  db: Db, kullanici: Kullanici,
  g: { kod: string; ad: string; sartnameId: number | null; adimlar: readonly TalimatAdimiYazisi[]; operasyonTipiId?: number | null | undefined; emreGelir?: boolean | undefined },
  denetimEki: DenetimEki,
): Promise<TalimatSablonuCevabi> {
  await sablonSartnamesiDenetle(db, g.sartnameId);
  const op = await sablonOperasyonu(db, g.operasyonTipiId ?? null, g.emreGelir ?? false);
  const yazilar = await adimYazilari(db, kullanici, g.adimlar, denetimEki);
  const id = await kisitKorumali(TALIMAT_SABLON_KISITLARI, () => s.talimatSablonEkle(db, { ...g, ...op }));
  await s.talimatSablonAdimlariniYaz(db, id, yazilar);
  return talimatSablonu(db, id);
}

async function sablonKomutIcinAl(db: Db, id: number, surum: number): Promise<void> {
  const x = await s.talimatSablonKilitle(db, id);
  if (!x) throw bulunamadi(TALIMAT_SABLONU_YOK);
  if (x.surum !== surum) throw eskiSurum();
}

export async function talimatSablonKaydet(
  db: Db, kullanici: Kullanici, id: number,
  g: { surum: number; ad: string; sartnameId: number | null; adimlar: readonly TalimatAdimiYazisi[]; operasyonTipiId?: number | null | undefined; emreGelir?: boolean | undefined },
  denetimEki: DenetimEki,
): Promise<TalimatSablonuCevabi> {
  await sablonKomutIcinAl(db, id, g.surum);
  await sablonSartnamesiDenetle(db, g.sartnameId);
  const simdi = (await s.talimatSablonlari(db, [id]))[0];
  const op = await sablonOperasyonu(db, g.operasyonTipiId === undefined ? (simdi?.operasyonTipiId ?? null) : g.operasyonTipiId, g.emreGelir ?? simdi?.emreGelir ?? false);
  const yazilar = await adimYazilari(db, kullanici, g.adimlar, denetimEki);
  const onceki = (await s.sablonMedyalari(db, id)).map((m) => m.ozet);
  await kisitKorumali(TALIMAT_SABLON_KISITLARI, () => s.talimatSablonGuncelle(db, id, { ...g, ...op }));
  await s.talimatSablonAdimlariniYaz(db, id, yazilar);
  await kullanilmayanMedyayiBirak(db, onceki, denetimEki);
  return talimatSablonu(db, id);
}

// Şablon silinmez, pasife alınır: kopyalanmış talimatlar şablona bağlı değildir, pasif şablon yalnız seçimden çıkar.
export async function talimatSablonDurumuYaz(db: Db, id: number, g: { surum: number; aktif: boolean }): Promise<TalimatSablonuCevabi> {
  await sablonKomutIcinAl(db, id, g.surum);
  await s.talimatSablonDurumu(db, id, g.aktif);
  return talimatSablonu(db, id);
}
