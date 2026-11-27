import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { VARSAYILAN_CEVRIMDE_PARCA, VARSAYILAN_DURUS_ESIGI_DK } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import type { TezgahEslemeCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { makineler as coreMakineleri } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { eslemeOnerisi } from './kurallar.ts';
import { lsv2ListesiOku } from './servis.ts';
import * as s from './sorgular.ts';

// Deneme sayfası (kart 3811): yalnız kendi tablolarına yazar (eşleme ve deneme ayarları); başka modülleri disari.ts ile okur.

export async function esleme(db: Db): Promise<TezgahEslemeCevabi> {
  const makineler = (await coreMakineleri(db, { pasiflerDahil: false })).map((m) => ({ id: m.id, kod: m.kod, ad: m.ad }));
  const eslemeler = new Map((await s.eslemeleriGetir(db)).map((e) => [e.cihazAdi, e]));
  const lsv2 = new Set((await lsv2ListesiOku(db)).map((m) => m.cihazAdi.toLowerCase()));
  const adlar = await kisiAdlari(db, [...new Set([...eslemeler.values()].map((e) => e.degistirenKisiId))]);
  const cihazlar = [...new Set([...(await s.okumalar(db)).map((o) => o.cihazAdi), ...eslemeler.keys()])].sort((a, b) => a.localeCompare(b, 'tr'));
  return {
    makineler,
    cihazlar: cihazlar.map((cihazAdi) => {
      const e = eslemeler.get(cihazAdi);
      return {
        cihazAdi,
        kaynak: lsv2.has(cihazAdi.toLowerCase()) ? 'lsv2' as const : 'mtconnect' as const,
        makineId: e?.makineId ?? null,
        oneriMakineId: eslemeOnerisi(cihazAdi, makineler),
        cevrimdeParca: e?.cevrimdeParca ?? VARSAYILAN_CEVRIMDE_PARCA,
        durusEsigiDk: e?.durusEsigiDk ?? VARSAYILAN_DURUS_ESIGI_DK,
        degistiren: e === undefined ? null : adlar.get(e.degistirenKisiId) ?? null,
        degisti: e?.degisti ?? null,
      };
    }),
  };
}

export async function eslemeKaydet(
  db: Db, kullanici: Kullanici, cihazAdi: string, govde: { makineId: number | null; cevrimdeParca: number; durusEsigiDk: number },
): Promise<TezgahEslemeCevabi> {
  if (await s.okumaGetir(db, cihazAdi) === null) throw bulunamadi('Tezgâh bulunamadı.');
  if (govde.makineId !== null) {
    if (!(await coreMakineleri(db, { pasiflerDahil: false })).some((m) => m.id === govde.makineId)) throw dogrulama('Makine bulunamadı ya da pasif.', 'makineId');
    const baska = await s.makineninEslemesi(db, govde.makineId);
    if (baska !== null && baska !== cihazAdi) throw dogrulama(`Bu makine ${baska} tezgâhına eşli.`, 'makineId');
  }
  await s.eslemeYaz(db, cihazAdi, govde, kullanici.id);
  return esleme(db);
}
