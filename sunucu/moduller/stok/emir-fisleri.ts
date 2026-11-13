// Emrin fişleri (3175 a): emrin sayfasındaki "Fişler" bölümü. Yalnız okur; fiyat taşımaz. Kural saftır (kurallar.ts), veri sorgulardan.
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { EmirFisleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { isEmriPlanBilgileri, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { emirFisKartlari, emirHareketiTuru, hareketYazani, partiEtiketi } from './kurallar.ts';
import { emrinFisOzetleri } from './malzeme-fisi.ts';
import * as sorgular from './sorgular.ts';
import { emirNoHaritasi, emirNoDe } from './servis/ortak.ts';

export async function emrinFisleri(db: Db, emirId: number): Promise<EmirFisleriCevabi> {
  if ((await uretimEmriOzeti(db, emirId)) === null) throw bulunamadi('Üretim emri bulunamadı.');
  const ham = await sorgular.emrinHareketleri(db, emirId);
  const satirlar = ham.flatMap((h) => { const tur = emirHareketiTuru(h); return tur === null ? [] : [{ h, tur }]; });
  const kartlar = await malzemeOzetleri(db, satirlar.map((x) => x.h.malzemeId));
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.map((x) => x.h.kisiId))]);
  const adimlar = await isEmriPlanBilgileri(db, satirlar.flatMap((x) => (x.h.isEmriId === null ? [] : [x.h.isEmriId])));
  const nolar = await emirNoHaritasi(db, satirlar.map((x) => x.h.partiEmirId));
  const fisler = await emrinFisOzetleri(db, emirId, satirlar.flatMap((x) => (x.tur === 'ambar' && x.h.malzemeFisiId !== null ? [x.h.malzemeFisiId] : [])));
  const fisNo = new Map(fisler.map((f) => [f.id, f.no]));
  const hareketler: EmirFisleriCevabi['hareketler'] = satirlar.map(({ h, tur }) => {
    const k = kartlar.get(h.malzemeId);
    const geriAlma = h.tur === 'geri_alma';
    return {
      id: h.id, zaman: h.zaman, tur, geriAlma,
      belgeNo: tur === 'teslim' ? h.teslimNo : h.malzemeFisiId === null ? null : (fisNo.get(h.malzemeFisiId) ?? null),
      malzemeId: h.malzemeId, malzemeKod: k?.kod ?? null, malzemeAd: k?.ad ?? null, birim: k?.birim ?? null,
      partiEtiketi: h.partiId === null ? null : partiEtiketi({ lotNo: h.lotNo, tedarikciPartiNo: h.tedarikciPartiNo, dokumNo: h.dokumNo, uretimEmriId: h.partiEmirId }, emirNoDe(nolar, h.partiEmirId)),
      miktar: geriAlma ? `-${h.miktar}` : h.miktar,
      kaynakKonumKod: h.kaynakKonumKod, hedefKonumKod: h.hedefKonumKod,
      opNo: h.isEmriId === null ? null : (adimlar.get(h.isEmriId)?.opNo ?? null),
      kaynak: hareketYazani(h.akis), kisiAd: kisiler.get(h.kisiId) ?? null,
    };
  });
  return { kartlar: emirFisKartlari(hareketler, fisler.map((f) => ({ tur: f.tur, no: f.no, logo: f.logo.durum }))), hareketler };
}
