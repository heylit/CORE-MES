import type { Db } from '#cekirdek/db.ts';
import type { KapanisMaddeBilgisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { emirlerinMalzemeIhtiyaci, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import { binde, ihtiyacToplami, kapanisIzlenebilirligi, kapanisStoguIslendi, stoklanirMi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Onaylı kapanışın stok maddeleri (1074 a): Üretim Emirleri bu çözücüleri madde başına kaydeder (bağı kablolama kurar; stok onu
// ithal eder, tersi olmaz). Bulunamayan ya da ürün kartı olmayan (eski) emirde null döner; madde orada 'bilinmiyor' olur.
// Salt okur, yetki denetlemez. Sorgular sırayla atılır: çağıranın işlemindeki tek bağlantıda eşzamanlı koşamaz.

// Emrin stoklu bileşenlerinin brüt ihtiyacı (binde). Hizmet bileşeni stoklanmaz, sayılmaz; kartı okunamayan bileşen stoklu sayılır
// (stokta tamamlamayla aynı). Emir tanınmıyorsa null.
async function stokluIhtiyac(db: Db, uretimEmriId: number): Promise<Map<number, bigint> | null> {
  const satirlar = (await emirlerinMalzemeIhtiyaci(db, [uretimEmriId])).get(uretimEmriId) ?? null;
  if (satirlar === null) return null;
  const ihtiyac = ihtiyacToplami(satirlar.map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut })));
  if (ihtiyac.size === 0) return ihtiyac;
  for (const [malzemeId, o] of await malzemeOzetleri(db, [...ihtiyac.keys()])) if (!stoklanirMi(o.tur)) ihtiyac.delete(malzemeId);
  return ihtiyac;
}

// İzlenebilirlik: refakat kartlarında lot ve sertifika no.
export async function izlenebilirlikDurumu(db: Db, uretimEmriId: number): Promise<KapanisMaddeBilgisi | null> {
  const ihtiyac = await stokluIhtiyac(db, uretimEmriId);
  if (ihtiyac === null) return null;
  const kartlar = (await sorgular.emrinRefakatPartileri(db, uretimEmriId)).filter((r) => r.durum !== 'iptal');
  return kapanisIzlenebilirligi(kartlar, ihtiyac.size > 0);
}

// Stoğa işlendi: ürün sağlam adedi kadar girdi, istasyonda emrin eksiden düştüğü açık satır yok (1214 O-5) ve emrin istasyonda kalan artı
// bakiyesi yok (K-2 a, 1386). Tüketim fiilidir, kalan sarf aranmaz (K-1 a, 1385). Sağlamsız emirde giriş gerekmez (1079 a).
export async function stokDurumu(db: Db, uretimEmriId: number): Promise<KapanisMaddeBilgisi | null> {
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (emir === null || emir.malzemeNo === null) return null;
  const girilen = emir.saglamAdet === 0 ? 0n : binde(await sorgular.emirUretimGirisi(db, uretimEmriId, emir.malzemeNo));
  const eksiler = emir.saglamAdet === 0 ? [] : await sorgular.emrinIstasyonEksileri(db, uretimEmriId);
  const artilar = await sorgular.emrinIstasyonArtilari(db, uretimEmriId);
  const kartlar = await malzemeOzetleri(db, [...new Set([...eksiler, ...artilar].map((x) => x.malzemeId))]);
  const kod = (id: number): string => kartlar.get(id)?.kod ?? `#${String(id)}`;
  const istasyonEksileri = eksiler.map((x) => ({
    malzeme: kod(x.malzemeId), konum: x.konumKod, miktar: binde(x.miktar), statulu: x.statuId !== null,
    karsiliklar: x.karsiliklar.map((k) => ({ konum: k.konumKod, miktar: binde(k.miktar) })),
  }));
  const istasyonArtilari = artilar.map((x) => ({ malzeme: kod(x.malzemeId), konum: x.konumKod, miktar: binde(x.miktar), statulu: x.statuId !== null }));
  return kapanisStoguIslendi({ adet: emir.adet, saglamAdet: emir.saglamAdet, girilen, istasyonEksileri, istasyonArtilari });
}
