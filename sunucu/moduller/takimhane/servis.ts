import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import type {
  AcikTeslim, AktarimSatiri, SeceneklerCevabi, CikisGovdesi, EmirTakimiGovdesi, EmirTakimListesi, IadeGovdesi, KategoriOzeti, OzellikGovdesi, TakimhaneOzeti, TakimSatiri,
} from '#paylasilan/sozlesme/takimhane.ts';
import { aktifIstasyonlar, istasyonAdlari } from '../istasyonlar/disari.ts';
import { kisiAdlari, kisiSecenekleri } from '../kisiler/disari.ts';
import { malzemeAra } from '../malzemeler/disari.ts';
import { alandakiTakimlar, takimCikisi, takimEsikleri, takimIadesi, takimKonumTurToplamlari } from '../stok/disari.ts';
import { acikEmir, acikEmirler } from '../uretim-emirleri/disari.ts';
import { aktarimOnizle, bosDagilim, dagilimToplami, dagilimaEkle, konumGrubu, kritikMi, stokDurumu, takimKoduMu } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const SAYFA_BOYU = 200;
const EN_COK_SAYFA = 25;

interface TakimKarti { id: number; kod: string; ad: string; kategori: string }

// Takım kartları katalogdadır (tek kayıt): sarf ya da demirbaş türünde, stok kodu TKM ile başlayan aktif kartlar (varsayım; kategori ağacı bu işte açılmaz).
async function takimKartlari(db: Db, metin: string | null): Promise<TakimKarti[]> {
  const sonuc: TakimKarti[] = [];
  for (let sayfa = 1; sayfa <= EN_COK_SAYFA; sayfa += 1) {
    const r = await malzemeAra(db, { metin: metin === null || metin === '' ? 'TKM' : metin, turler: ['sarf', 'demirbas'], yalnizAktif: true, sayfa, sayfaBoyu: SAYFA_BOYU });
    for (const m of r.satirlar) if (takimKoduMu(m.kod)) sonuc.push({ id: m.id, kod: m.kod, ad: m.ad ?? m.kod, kategori: m.kategoriAdi ?? m.kategori ?? 'Kategorisiz' });
    if (sayfa * SAYFA_BOYU >= (r.toplam ?? 0)) break;
  }
  return sonuc;
}

const tamSayi = (m: string): number => Math.trunc(Number(m));

export async function takimlar(db: Db, metin: string | null): Promise<TakimSatiri[]> {
  const kartlar = await takimKartlari(db, metin);
  const idler = kartlar.map((k) => k.id);
  const ozellikler = await sorgular.ozellikler(db, idler);
  const toplamlar = await takimKonumTurToplamlari(db, idler);
  const esikler = await takimEsikleri(db, idler);
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
  const harita = new Map(kartlar.map((k) => [k.id, k]));
  const satirlar = await alandakiTakimlar(db, kartlar.map((k) => k.id));
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

async function kartiDenetle(db: Db, kartKimlik: number): Promise<void> {
  if (!(await takimKartlari(db, null)).some((k) => k.id === kartKimlik)) throw bulunamadi('Takım kartı bulunamadı.');
}

export async function cikis(db: Db, k: Kullanici, g: CikisGovdesi): Promise<TeslimCevabi> {
  await kartiDenetle(db, g.kartKimlik);
  return takimCikisi(db, k, { malzemeId: g.kartKimlik, adet: g.adet, kisiId: g.kisiId, istasyonId: g.istasyonId, uretimEmriId: g.uretimEmriId, kaynakKimligi: `tkm:cikis:${g.istekKimligi}`.slice(0, 120) });
}

export async function iade(db: Db, k: Kullanici, g: IadeGovdesi): Promise<TeslimCevabi> {
  await kartiDenetle(db, g.kartKimlik);
  const eldeki = (await alandakiTakimlar(db, [g.kartKimlik])).find((s) => s.konumId === g.konumKimligi);
  if (eldeki === undefined) throw dogrulama('Bu konumda iade edilecek bu takım yok.', 'konumKimligi');
  if (g.adet > tamSayi(eldeki.miktar)) throw dogrulama(`Konumda yalnız ${String(tamSayi(eldeki.miktar))} adet var.`, 'adet');
  return takimIadesi(db, k, { malzemeId: g.kartKimlik, konumId: g.konumKimligi, adet: g.adet, durum: g.durum, neden: g.neden, kaynakKimligi: `tkm:iade:${g.istekKimligi}`.slice(0, 120) });
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

export function aktarimOnizleme(satirlar: Parameters<typeof aktarimOnizle>[0]): { satirlar: AktarimSatiri[]; uygun: boolean } {
  return aktarimOnizle(satirlar);
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
