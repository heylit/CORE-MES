import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import { bulunamadi, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import type {
  AcikTeslim, SeceneklerCevabi, CikisGovdesi, EmirTakimiGovdesi, EmirTakimListesi, GirisCevabi, GirisGovdesi, IadeGovdesi, KategoriOzeti, KutuphaneCevabi,
  KartAcCevabi, KartAcGovdesi, OzellikGovdesi, RafGozleriCevabi, TakimhaneOzeti, TakimSatiri, TopluGirisCevabi, TopluGirisGovdesi,
} from '#paylasilan/sozlesme/takimhane.ts';
import { cncKurulumDurumu, takimOmruDurumlari } from '../cnc-kurulum/disari.ts';
import { aktifIstasyonlar, istasyonAdlari } from '../istasyonlar/disari.ts';
import { kisiAdlari, kisiSecenekleri } from '../kisiler/disari.ts';
import { cncKimligiBagla, cncKimlikliMalzemeler, malzemeAra, takimKartiAc } from '../malzemeler/disari.ts';
import {
  aktifRafGozleri, alandakiTakimlar, emirAparatCikislari, takimAcilisi, takimCikisi, takimEsikleri, takimGozleri, takimGozTuru, takimIadesi, takimKonumTurToplamlari,
  takimSayimi, takimTopluDenetle, takimTopluYaz,
} from '../stok/disari.ts';
import { acikEmir, acikEmirler } from '../uretim-emirleri/disari.ts';
import { bosDagilim, dagilimToplami, dagilimaEkle, konumGrubu, kritikMi, ozelKalemler, stokDurumu, takimKoduMu } from './kurallar.ts';
import { aparatKartKimlikleri, aparatKartListesi } from './aparat.ts';
import * as sorgular from './sorgular.ts';

const SAYFA_BOYU = 200;
const EN_COK_SAYFA = 25;

interface TakimKarti { id: number; kod: string; ad: string; kategori: string; kutuphaneKimligi: string | null; durum: TakimSatiri['kartDurumu'] }

// Takım kartları katalogdadır (tek kayıt). 3762: CNC kütüphanesine bağlı her sarf ve demirbaş kartı takımdır (taslak ve onaydakiler dahil,
// açılışı kart aktif olunca girer); kütüphaneye bağlanmamış eski kartlar stok kodu TKM ile başlayan aktif kartlardır.
async function takimKartlari(db: Db, metin: string | null): Promise<TakimKarti[]> {
  const bagli = await cncKimlikliMalzemeler(db);
  const harita = new Map<number, TakimKarti>();
  const aranan = metin === null || metin.trim() === '' ? null : metin.trim().toLocaleLowerCase('tr-TR');
  for (const [kimlik, k] of bagli) {
    if (k.onayDurumu === 'iptal') continue;
    if (aranan !== null && ![k.kod, k.ad ?? '', kimlik].some((x) => x.toLocaleLowerCase('tr-TR').includes(aranan))) continue;
    harita.set(k.malzemeId, { id: k.malzemeId, kod: k.kod, ad: k.ad ?? k.kod, kategori: 'Kütüphane', kutuphaneKimligi: kimlik, durum: k.onayDurumu });
  }
  for (let sayfa = 1; sayfa <= EN_COK_SAYFA; sayfa += 1) {
    const r = await malzemeAra(db, { metin: aranan === null ? 'TKM' : metin, turler: ['sarf', 'demirbas'], yalnizAktif: true, sayfa, sayfaBoyu: SAYFA_BOYU });
    for (const m of r.satirlar) {
      const var0 = harita.get(m.id);
      const kategori = m.kategoriAdi ?? m.kategori ?? 'Kategorisiz';
      if (var0 !== undefined) var0.kategori = kategori;
      else if (takimKoduMu(m.kod)) harita.set(m.id, { id: m.id, kod: m.kod, ad: m.ad ?? m.kod, kategori, kutuphaneKimligi: null, durum: 'aktif' });
    }
    if (sayfa * SAYFA_BOYU >= (r.toplam ?? 0)) break;
  }
  return [...harita.values()];
}

const tamSayi = (m: string): number => Math.trunc(Number(m));

export async function takimlar(db: Db, metin: string | null): Promise<TakimSatiri[]> {
  const kartlar = await takimKartlari(db, metin);
  const idler = kartlar.map((k) => k.id);
  const ozellikler = await sorgular.ozellikler(db, idler);
  const toplamlar = await takimKonumTurToplamlari(db, idler);
  const esikler = await takimEsikleri(db, idler);
  // Ömür CNC'nin tezgâh yüklerindendir; kalem kimliği bağın kimliğiyle eşlenir (canlı takım öneki CNC'de olduğu gibi atılır).
  const omur = new Map<string, number>();
  for (const d of await takimOmruDurumlari(db, (await aktifIstasyonlar(db)).map((i) => i.id))) {
    if (d.kalanPay === null) continue;
    const anahtar = d.takimKimligi.replace(/^lv_/, '');
    omur.set(anahtar, Math.min(omur.get(anahtar) ?? 100, Math.round(d.kalanPay * 100)));
  }
  const gozler = new Map<number, TakimSatiri['gozler']>();
  for (const g of await takimGozleri(db, idler)) gozler.set(g.malzemeId, [...(gozler.get(g.malzemeId) ?? []), { konumKimligi: g.konumId, kod: g.kod, adet: tamSayi(g.miktar) }]);
  const ozellikHaritasi = new Map(ozellikler.map((o) => [o.kartNo, o]));
  const esikHaritasi = new Map(esikler.map((e) => [e.malzemeId, e]));
  const dagilimlar = new Map<number, ReturnType<typeof bosDagilim>>();
  for (const t of toplamlar) {
    const grup = konumGrubu(t.tur);
    if (grup === null) continue;
    const d = dagilimlar.get(t.malzemeId) ?? bosDagilim();
    dagilimaEkle(d, grup, tamSayi(t.miktar));
    dagilimlar.set(t.malzemeId, d);
  }
  return kartlar.map((k): TakimSatiri => {
    const o = ozellikHaritasi.get(k.id);
    const e = esikHaritasi.get(k.id);
    const konumlar = dagilimlar.get(k.id) ?? bosDagilim();
    return {
      kartKimlik: k.id, kod: k.kod, ad: k.ad, kategori: k.kategori,
      sinif: (o?.sinif ?? 'diger') as TakimSatiri['sinif'], capMm: o?.capMm ?? null, kesiciSayisi: o?.kesiciSayisi ?? null, isoKodu: o?.isoKodu ?? null,
      malzemeGruplari: (o?.malzemeGruplari ?? []) as TakimSatiri['malzemeGruplari'], yenidenBilenir: o?.yenidenBilenir ?? false,
      izleme: (o?.izleme ?? 'adet') as TakimSatiri['izleme'], rafKodu: e?.rafKodu ?? null, konumlar, toplam: dagilimToplami(konumlar),
      kritikSeviye: e?.kritikSeviye == null ? null : tamSayi(e.kritikSeviye),
      kutuphaneKimligi: k.kutuphaneKimligi, kartDurumu: k.durum, gozler: gozler.get(k.id) ?? [],
      omurYuzde: k.kutuphaneKimligi === null ? null : omur.get(k.kutuphaneKimligi) ?? null,
    };
  });
}

export async function ozet(db: Db): Promise<TakimhaneOzeti> {
  const liste = await takimlar(db, null);
  const konumlar = bosDagilim();
  const kategoriler = new Map<string, KategoriOzeti>();
  let adet = 0; let kritik = 0; let sifir = 0; let esiksiz = 0;
  for (const t of liste) {
    adet += t.toplam;
    for (const g of ['raf', 'tezgah', 'kisi', 'bileme', 'ara'] as const) if (t.konumlar[g] !== null) dagilimaEkle(konumlar, g, t.konumlar[g]);
    const durum = stokDurumu(t.toplam, t.kritikSeviye);
    if (durum === 'sifir') sifir += 1;
    if (durum === 'esiksiz') esiksiz += 1;
    if (kritikMi(t)) kritik += 1;
    const k = kategoriler.get(t.kategori) ?? { kategori: t.kategori, kalem: 0, adet: 0, kritik: 0 };
    k.kalem += 1; k.adet += t.toplam; if (kritikMi(t)) k.kritik += 1;
    kategoriler.set(t.kategori, k);
  }
  // Bekleyen iade = kişilerin elinde duran takım adedi (zimmet); tezgâhtaki takım kullanımdadır, iade beklemez.
  return { kalem: liste.length, adet, kritik, sifir, esiksiz, konumlar, bekleyenIade: konumlar.kisi ?? 0, kategoriler: [...kategoriler.values()].sort((a, b) => a.kategori.localeCompare(b.kategori, 'tr')) };
}

export async function teslimdekiler(db: Db): Promise<AcikTeslim[]> {
  const kartlar = await takimKartlari(db, null);
  // Aparat da teslimdedir (3651): kartı Malzemeler'den, adı kodu kendi kümesinden gelir.
  const aparatlar = await aparatKartListesi(db);
  const harita = new Map([...kartlar, ...aparatlar].map((k) => [k.id, k]));
  const satirlar = await alandakiTakimlar(db, [...harita.keys()]);
  const kisiler = await kisiAdlari(db, satirlar.flatMap((s) => (s.kisiId === null ? [] : [s.kisiId])));
  const istasyonlar = await istasyonAdlari(db, satirlar.flatMap((s) => (s.istasyonId === null ? [] : [s.istasyonId])));
  return satirlar.flatMap((s): AcikTeslim[] => {
    const kart = harita.get(s.malzemeId);
    if (kart === undefined) return [];
    const kisi = s.konumTur === 'kisi';
    const alan = (kisi ? kisiler.get(s.kisiId ?? -1) : istasyonlar.get(s.istasyonId ?? -1)) ?? s.konumAd ?? '—';
    return [{ konumKimligi: s.konumId, kartKimlik: kart.id, kod: kart.kod, ad: kart.ad, adet: tamSayi(s.miktar), alan, alanTuru: kisi ? 'kisi' : 'istasyon', verildi: s.gelis }];
  });
}

// Takım kümesi aparatı da kapsar (3651): çıkış ve iade ikisi için de aynı uçlardandır.
async function kartiDenetle(db: Db, kartKimlik: number): Promise<void> {
  if ((await takimKartlari(db, null)).some((k) => k.id === kartKimlik)) return;
  if (!(await aparatKartKimlikleri(db)).has(kartKimlik)) throw bulunamadi('Takım ya da aparat kartı bulunamadı.');
}

export async function cikis(db: Db, k: Kullanici, g: CikisGovdesi): Promise<TeslimCevabi> {
  await kartiDenetle(db, g.kartKimlik);
  return takimCikisi(db, k, {
    malzemeId: g.kartKimlik, adet: g.adet, kisiId: g.kisiId, istasyonId: g.istasyonId, uretimEmriId: g.uretimEmriId, kaynakKimligi: `tkm:cikis:${g.istekKimligi}`.slice(0, 120),
    kaynakKonumId: g.konumKimligi,
  });
}

export async function iade(db: Db, k: Kullanici, g: IadeGovdesi): Promise<TeslimCevabi> {
  await kartiDenetle(db, g.kartKimlik);
  const eldeki = (await alandakiTakimlar(db, [g.kartKimlik])).find((s) => s.konumId === g.konumKimligi);
  if (eldeki === undefined) throw dogrulama('Bu konumda iade edilecek bu takım yok.', 'konumKimligi');
  if (g.adet > tamSayi(eldeki.miktar)) throw dogrulama(`Konumda yalnız ${String(tamSayi(eldeki.miktar))} adet var.`, 'adet');
  // Aparat çıkışı emre bağlıdır: iade, o konumda aparatı duran en eski emre yazılır ki emrin "dışarıda" adedi düşsün (kart 3651).
  const emir = (await emirAparatCikislari(db, [g.kartKimlik])).filter((r) => r.konumId === g.konumKimligi && r.emirId !== null && tamSayi(r.disarida) > 0)
    .sort((a, b) => a.emirId! - b.emirId!)[0];
  return takimIadesi(db, k, {
    malzemeId: g.kartKimlik, konumId: g.konumKimligi, adet: g.adet, durum: g.durum, neden: g.neden, kaynakKimligi: `tkm:iade:${g.istekKimligi}`.slice(0, 120),
    uretimEmriId: emir?.emirId ?? null,
  });
}

export async function ozellikYaz(db: Db, kartKimlik: number, g: OzellikGovdesi): Promise<{ tamam: true }> {
  await kartiDenetle(db, kartKimlik);
  await sorgular.ozellikYaz(db, { kartNo: kartKimlik, sinif: g.sinif, capMm: g.capMm, kesiciSayisi: g.kesiciSayisi, isoKodu: g.isoKodu, malzemeGruplari: g.malzemeGruplari, yenidenBilenir: g.yenidenBilenir, izleme: g.izleme });
  return { tamam: true };
}

export async function emirTakimListesi(db: Db, emirId: number): Promise<EmirTakimListesi> {
  const emir = await acikEmir(db, emirId);
  if (emir === null) throw bulunamadi('Emir bulunamadı ya da açık değil.');
  const satirlar = await sorgular.emirTakimlari(db, emirId);
  const kartlar = new Map((await takimKartlari(db, null)).map((k) => [k.id, k]));
  const dagilim = new Map((await takimlar(db, null)).map((t) => [t.kartKimlik, t.konumlar]));
  const cikti = satirlar.flatMap((s): EmirTakimListesi['satirlar'] => {
    const kart = kartlar.get(s.kartNo);
    if (kart === undefined) return [];
    const d = dagilim.get(s.kartNo) ?? bosDagilim();
    const tezgahta = d.tezgah ?? 0;
    const rafta = d.raf ?? 0;
    const eksik = Math.max(0, s.adet - tezgahta - rafta);
    const durum = eksik > 0 ? 'eksik' : tezgahta >= s.adet ? 'tezgahta' : 'rafta';
    return [{ cep: s.cep, kod: kart.kod, ad: kart.ad, adet: s.adet, durum, eksik }];
  });
  return { emirNo: emir.emirNo, parca: emir.parcaAd, istasyon: emir.istasyon.ad, hazir: cikti.length > 0 && cikti.every((s) => s.durum !== 'eksik'), satirlar: cikti };
}

export async function emirTakimListesiYaz(db: Db, emirId: number, g: EmirTakimiGovdesi): Promise<EmirTakimListesi> {
  if ((await acikEmir(db, emirId)) === null) throw bulunamadi('Emir bulunamadı ya da açık değil.');
  const anahtarlar = new Set<string>();
  const kartlar = new Set((await takimKartlari(db, null)).map((k) => k.id));
  for (const s of g.satirlar) {
    if (!kartlar.has(s.kartKimlik)) throw dogrulama('Listedeki kart bir takım kartı değil.', 'satirlar');
    const a = `${s.cep.toLocaleUpperCase('tr-TR')}|${String(s.kartKimlik)}`;
    if (anahtarlar.has(a)) throw dogrulama('Aynı cepte aynı takım iki kez yazılmaz.', 'satirlar');
    anahtarlar.add(a);
  }
  await sorgular.emirTakimlariniSil(db, emirId);
  for (const s of g.satirlar) await sorgular.emirTakimiEkle(db, emirId, { cep: s.cep.trim(), kartNo: s.kartKimlik, adet: s.adet });
  return emirTakimListesi(db, emirId);
}

export async function secenekler(db: Db): Promise<SeceneklerCevabi> {
  const kisiler = await kisiSecenekleri(db);
  const istasyonlar = await aktifIstasyonlar(db);
  const emirler = await acikEmirler(db);
  return {
    kisiler: kisiler.map((k) => ({ id: k.id, ad: k.ad })),
    istasyonlar: istasyonlar.map((i) => ({ id: i.id, ad: i.ad })),
    emirler: emirler.map((e) => ({ id: e.id, emirNo: e.emirNo, parca: e.parcaAd })),
  };
}

// ---- 3762: tek kütüphane, raf gözü, açılış ve kör sayım ---------------------------------------------------------------------------

// CNC kütüphanesinin atölyede eklenen kalemleri; hazır katalog istemcidedir (CNC kurulumla aynı kaynak).
export async function kutuphane(db: Db): Promise<KutuphaneCevabi> {
  return { ozelKalemler: ozelKalemler((await cncKurulumDurumu(db))?.deger ?? null) };
}

// Göz seçici: aktif raf gözleri; kart verilirse gözde o takımın olup olmadığı (boş: açılış, dolu: sayım). Adet dönmez: sayım kördür.
export async function rafGozleri(db: Db, metin: string | null, kartKimlik: number | null): Promise<RafGozleriCevabi> {
  const gozler = await aktifRafGozleri(db, metin === '' ? null : metin);
  const dolu = kartKimlik === null ? new Set<number>() : new Set((await takimGozleri(db, [kartKimlik])).map((g) => g.konumId));
  return { gozler: gozler.map((g) => ({ konumKimligi: g.konumId, kod: g.kod, ad: g.ad, dolu: dolu.has(g.konumId) })) };
}

async function aktifTakimKarti(db: Db, kartKimlik: number): Promise<void> {
  const kart = (await takimKartlari(db, null)).find((k) => k.id === kartKimlik);
  if (kart === undefined) throw bulunamadi('Takım kartı bulunamadı.');
  if (kart.durum !== 'aktif') throw dogrulama('Kart henüz aktif değil; kart onaylanınca giriş yapılır.', 'kartKimlik');
}

// Boş gözde açılış (stok.giris), dolu gözde kör sayım (stok.sayim). Tür sunucuda gözden belirlenir; çağıranın yetkisi türe göre denetlenir.
export async function giris(db: Db, k: Kullanici, g: GirisGovdesi): Promise<GirisCevabi> {
  await aktifTakimKarti(db, g.kartKimlik);
  const tur = await takimGozTuru(db, g.kartKimlik, g.konumKimligi);
  if (tur === 'acilis') {
    if (!islemVarMi(k, 'stok.giris')) throw yetkiYok('Açılış girişi için stok giriş yetkisi gerekir.');
    if (g.adet <= 0) throw dogrulama('Açılışta adet sıfırdan büyük olur.', 'adet');
    return { tur, belgeNo: (await takimAcilisi(db, k, { malzemeId: g.kartKimlik, konumId: g.konumKimligi, adet: g.adet, istekKimligi: g.istekKimligi })).belgeNo, onayaGiden: 0 };
  }
  if (!islemVarMi(k, 'stok.sayim')) throw yetkiYok('Sayım için stok sayım yetkisi gerekir.');
  const r = await takimSayimi(db, k.id, { malzemeId: g.kartKimlik, konumId: g.konumKimligi, adet: g.adet });
  return { tur, belgeNo: null, onayaGiden: r.onayaGiden };
}

async function topluKartlar(db: Db, g: Pick<TopluGirisGovdesi, 'satirlar'>): Promise<Map<number, TakimKarti>> {
  const kartlar = new Map((await takimKartlari(db, null)).map((k) => [k.id, k]));
  for (const s of g.satirlar) {
    const kart = kartlar.get(s.kartKimlik);
    if (kart === undefined) throw dogrulama(`Satır ${String(s.sira)}: takım kartı bulunamadı.`, 'satirlar');
  }
  return kartlar;
}
const pasifHatasi = (kartlar: Map<number, TakimKarti>, kartKimlik: number): string | null =>
  kartlar.get(kartKimlik)?.durum === 'aktif' ? null : 'Kart henüz aktif değil.';

export async function topluDenetle(db: Db, g: Pick<TopluGirisGovdesi, 'satirlar'>): Promise<TopluGirisCevabi> {
  const kartlar = await topluKartlar(db, g);
  const r = await takimTopluDenetle(db, g.satirlar.map((s) => ({ sira: s.sira, malzemeId: s.kartKimlik, gozKodu: s.gozKodu, adet: s.adet })));
  return { satirlar: r.map((x, i) => ({ sira: x.sira, tur: x.tur, hata: pasifHatasi(kartlar, g.satirlar[i]!.kartKimlik) ?? x.hata })), yazildi: false, belgeNo: null, sayim: 0 };
}

export async function topluYaz(db: Db, k: Kullanici, g: TopluGirisGovdesi): Promise<TopluGirisCevabi> {
  const on = await topluDenetle(db, g);
  if (on.satirlar.some((s) => s.hata !== null)) return on;
  if (on.satirlar.some((s) => s.tur === 'sayim') && !islemVarMi(k, 'stok.sayim')) throw yetkiYok('Dolu gözlü satırlar sayımdır; stok sayım yetkisi gerekir.');
  const r = await takimTopluYaz(db, k, { satirlar: g.satirlar.map((s) => ({ sira: s.sira, malzemeId: s.kartKimlik, gozKodu: s.gozKodu, adet: s.adet })), dosyaOzeti: g.dosyaOzeti, dosyaAdi: g.dosyaAdi });
  return { satirlar: r.sonuc.map((x) => ({ sira: x.sira, tur: x.tur, hata: x.hata })), yazildi: r.sonuc.every((x) => x.hata === null), belgeNo: r.belgeNo, sayim: r.sayim };
}

// Eski TKM kartını bir kütüphane kalemine bağlar. Bağ kart verisidir: CNC kurulumdaki gibi Malzemeler yazma yetkisi ister.
export async function kutuphaneyeBagla(db: Db, k: Kullanici, kartKimlik: number, kimlik: string): Promise<{ tamam: true }> {
  if (!islemVarMi(k, 'malzemeler.yaz')) throw yetkiYok('Kartı kütüphaneye bağlamak Malzemeler yazma yetkisi ister.');
  // Denetim ile yazım arasında başka bir bağ girmesin: iki kişi aynı kalemi iki karta bağlayamaz.
  await islemKilidiAl(db, 'takimhane.kutuphane-bagi');
  const kart = (await takimKartlari(db, null)).find((x) => x.id === kartKimlik);
  if (kart === undefined) throw bulunamadi('Takım kartı bulunamadı.');
  if (kart.kutuphaneKimligi !== null) throw dogrulama('Kart zaten bir kütüphane kalemine bağlı.', 'kimlik');
  if ((await cncKimlikliMalzemeler(db, [kimlik])).has(kimlik)) throw dogrulama('Bu kütüphane kalemi başka bir karta bağlı.', 'kimlik');
  await cncKimligiBagla(db, kartKimlik, kimlik);
  return { tamam: true };
}

// 3762 (fark 1 a): kartı olmayan kütüphane kalemine kesici takım kartı açar. Bağ kilidi altında: aynı kaleme iki kart açılmaz.
export async function kartAc(db: Db, k: Kullanici, g: KartAcGovdesi): Promise<KartAcCevabi> {
  if (!islemVarMi(k, 'malzemeler.yaz')) throw yetkiYok('Kart açmak Malzemeler yazma yetkisi ister.');
  await islemKilidiAl(db, 'takimhane.kutuphane-bagi');
  const r = await takimKartiAc(db, k, { ad: g.ad, takimTuru: g.takimTuru, isoKodu: g.isoKodu === '' ? null : g.isoKodu, capMm: g.capMm, kutuphaneKimligi: g.kimlik });
  return { kartKimlik: r.malzemeId, stokKodu: r.stokKodu, onayDurumu: r.onayDurumu };
}
