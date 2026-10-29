import type { Db } from '#cekirdek/db.ts';
import { eslesmePuani, type KayitAramaIstegi, type KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import { malzemeAdlari } from '../malzemeler/disari.ts';
import { emirNolari } from '../uretim-emirleri/disari.ts';
import { partiEtiketi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Genel arama (Ctrl K, kart 1234): stoğun parti/lot ve depo konumu kaynakları. Stok ekranlarını açabilen bütün roller
// arar (`/stok/ara` ile aynı okuma); kayıt göstermek yeni yetki açmaz, yol mevcut ayrıntı ekranıdır.
const OKUMA = ['sayfa.stok', ...STOK_ISLEMLERI] as const;

const RAF_TURU: Record<sorgular.KonumKaydi['rafTuru'] & string, string> = { palet: 'Palet rafı', celik: 'Hafif çelik raf', konsol: 'Konsol raf', zemin: 'Zemin istif alanı' };

async function partiAra(db: Db, istek: KayitAramaIstegi): Promise<KayitAramaSonucu[]> {
  const partiler = await sorgular.partiKayitAra(db, istek);
  if (partiler.length === 0) return [];
  const adlar = await malzemeAdlari(db, [...new Set(partiler.map((p) => p.malzemeId))]);
  const nolar = await emirNolari(db, partiler.flatMap((p) => (p.uretimEmriId === null ? [] : [p.uretimEmriId])));
  return partiler.map((p) => {
    const emirNo = p.uretimEmriId === null ? null : nolar.get(p.uretimEmriId) ?? null;
    const kaynak = partiEtiketi({ ...p, lotNo: null }, emirNo);
    return {
      anahtar: String(p.partiId),
      baslik: p.lotNo,
      aciklama: [adlar.get(p.malzemeId) ?? `Kart ${p.malzemeId}`, kaynak].filter((x) => x !== null && x !== '').join(' · '),
      yol: `/stok/hareketler?partiId=${p.partiId}`,
    };
  });
}

// Raf, depo konumunun parçasıdır: ayrı tür açılmaz, raflar konumlarla birlikte puanlanır.
async function konumAra(db: Db, istek: KayitAramaIstegi): Promise<KayitAramaSonucu[]> {
  const satirlar = await sorgular.konumKayitAra(db, istek);
  return satirlar
    .map((k, sira) => ({ k, sira, puan: eslesmePuani(istek.q, k.kod) }))
    .sort((a, b) => b.puan - a.puan || a.sira - b.sira)
    .slice(0, istek.sinir)
    .map(({ k }): KayitAramaSonucu => (k.rafTuru !== null
      ? { anahtar: `raf-${k.id}`, baslik: `Raf ${k.kod}`, aciklama: RAF_TURU[k.rafTuru], yol: `/stok/raflar/${k.id}` }
      : { anahtar: String(k.id), baslik: k.kod, aciklama: [k.ad, k.satirSayisi > 0 ? `${k.satirSayisi} stok satırı` : 'Boş'].filter((x) => x !== null).join(' · '), yol: `/stok/konumlar/${k.id}` }));
}

export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [
  { tur: 'parti', yetki: OKUMA, ara: partiAra },
  { tur: 'konum', yetki: OKUMA, ara: konumAra },
];
