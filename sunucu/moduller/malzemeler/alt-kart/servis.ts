import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AileKarti, AltKartAilesiCevabi, AltKartTuru, RevizyonDurumu } from '#paylasilan/sozlesme/malzeme-alt-kart.ts';
import { altBagHatasi, bagKaldirmaHatasi, revizyonBagDurumlari, revizyonEtiketi, yururlugeAlmaHatasi } from './kurallar.ts';
import * as s from './sorgular.ts';

// Servis kuralları yazmadan önce denetler; kısıt eşzamanlı yazmada ya da servisi atlayan yolda tetiklenir.
const KISITLAR = {
  malzeme_katalog_karti_tek_seviye: 'Alt kartın alt kartı olmaz; tek seviye.',
  malzeme_katalog_karti_alt_etiket_tek: 'Bu ailede aynı etiketli alt kart az önce açıldı; başka etiket verin.',
  malzeme_katalog_karti_tek_yururlukte: 'Bu ailede başka bir revizyon az önce yürürlüğe alındı; sayfayı yenileyin.',
  malzeme_katalog_karti_ana_degismez: 'Alt kartın ana kartı değişmez.',
} as const;

async function satir(db: Db, kimlik: string): Promise<s.AltKartSatiri> {
  const k = await s.altKartSatiri(db, kimlik);
  if (!k || k.onayDurumu === 'iptal') throw bulunamadi('Malzeme kartı bulunamadı.');
  return k;
}

const aileKarti = (k: s.AltKartSatiri): AileKarti => ({
  kimlik: k.kimlik, no: k.no, stokKodu: k.stokKodu, ad: k.ad, onayDurumu: k.onayDurumu, altTur: k.altTur,
  etiket: revizyonEtiketi(k), revDurumu: k.revDurumu,
});

export async function aileGetir(db: Db, kimlik: string): Promise<AltKartAilesiCevabi> {
  const k = await satir(db, kimlik);
  const liste = await s.aileSatirlari(db, k.anaKartNo ?? k.no);
  const [ana, ...altlar] = liste;
  if (!ana) throw bulunamadi('Malzeme kartı bulunamadı.');
  return {
    ana: aileKarti(ana),
    revizyonlar: altlar.filter((x) => x.altTur === 'revizyon').map(aileKarti),
    alternatifler: altlar.filter((x) => x.altTur === 'alternatif').map(aileKarti),
  };
}

// Kart, ana kartın altına bağlanır. Alternatif bağı 3437'nin kuralıyla (zarf içi) alternatif modülünün yazımından gelir; bu işlev zarfı denetlemez.
export async function altKartaBagla(
  db: Db, kullanici: Kullanici, kimlik: string, g: { anaKimlik: string; tur: AltKartTuru; etiket: string; eskiRevizyon?: boolean },
): Promise<{ id: string }> {
  const anaNo = await s.anaKartNoKimlikle(db, g.anaKimlik);
  if (!anaNo) throw bulunamadi('Ana kart bulunamadı.');
  await s.aileyiKilitle(db, anaNo.no);
  const [kart, ana] = [await satir(db, kimlik), await satir(db, g.anaKimlik)];
  const etiket = g.etiket.trim();
  const hata = altBagHatasi(kart, ana, g.tur, etiket, await s.aileSatirlari(db, ana.no));
  if (hata) throw gecersiz(hata);
  await kisitKorumali(KISITLAR, async () => {
    if (g.tur === 'revizyon') {
      const d = revizyonBagDurumlari(ana, g.eskiRevizyon ?? false);
      if (d.ana) await s.revDurumuYaz(db, ana.no, d.ana, kullanici.id);
      await s.altBagYaz(db, kart.no, { anaKartNo: ana.no, altTur: 'revizyon', altEtiket: etiket, revDurumu: d.kart }, kullanici.id);
    } else {
      await s.altBagYaz(db, kart.no, { anaKartNo: ana.no, altTur: 'alternatif', altEtiket: etiket, revDurumu: null }, kullanici.id);
    }
  });
  return { id: kimlik };
}

export async function altBaginiKaldir(db: Db, kullanici: Kullanici, kimlik: string): Promise<{ id: string }> {
  const ilk = await satir(db, kimlik);
  if (ilk.anaKartNo === null) throw gecersiz('Kart bir alt kart değil.');
  await s.aileyiKilitle(db, ilk.anaKartNo);
  const kart = await satir(db, kimlik);
  const hata = bagKaldirmaHatasi(kart);
  if (hata) throw gecersiz(hata);
  const anaNo = kart.anaKartNo!;
  await s.altBagYaz(db, kart.no, { anaKartNo: null, altTur: null, altEtiket: null, revDurumu: null }, kullanici.id);
  // Son revizyon çıkınca aile revizyonsuz kalır: ana kartın yürürlük işareti kalkar (bağdan önceki hali).
  const kalan = await s.aileSatirlari(db, anaNo);
  const ana = kalan[0];
  if (ana && ana.revDurumu === 'yururlukte' && !kalan.some((x) => x.altTur === 'revizyon')) await s.revDurumuYaz(db, ana.no, null, kullanici.id);
  return { id: kimlik };
}

// Revizyon yürürlüğe girer, ailede yürürlükteki öteki revizyon eskiye geçer. Açık emir kendi kartıyla kalır (1609 a): emir kart no tutar.
export async function yururlugeAl(db: Db, kullanici: Kullanici, kimlik: string): Promise<{ id: string }> {
  const ilk = await satir(db, kimlik);
  await s.aileyiKilitle(db, ilk.anaKartNo ?? ilk.no);
  const kart = await satir(db, kimlik);
  const hata = yururlugeAlmaHatasi(kart);
  if (hata) throw gecersiz(hata);
  const aile = await s.aileSatirlari(db, kart.anaKartNo ?? kart.no);
  await kisitKorumali(KISITLAR, async () => {
    for (const x of aile) if (x.revDurumu === 'yururlukte') await s.revDurumuYaz(db, x.no, 'eski', kullanici.id);
    await s.revDurumuYaz(db, kart.no, 'yururlukte', kullanici.id);
  });
  return { id: kimlik };
}

// Başka modüller (emir, sipariş) için: kartın revizyonu, durumu ve ailesindeki yürürlükteki kart.
// Revizyon ailesinde olmayan kart ve alternatif alt kart haritada yoktur.
export interface RevizyonBilgisi {
  etiket: string | null;
  durum: RevizyonDurumu;
  yururlukteki: { no: number; stokKodu: string; etiket: string | null };
}
export async function revizyonBilgileri(db: Db, nolar: readonly number[]): Promise<Map<number, RevizyonBilgisi>> {
  if (nolar.length === 0) return new Map();
  const l = await s.revizyonSatirlari(db, nolar);
  return new Map(l.map((x) => [x.no, {
    etiket: x.etiket, durum: x.revDurumu, yururlukteki: { no: x.yururlukteNo, stokKodu: x.yururlukteKodu, etiket: x.yururlukteEtiketi },
  }]));
}
