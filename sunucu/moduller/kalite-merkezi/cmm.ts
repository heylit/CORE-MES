import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import type {
  KmCmmEsleme, KmCmmOnizlemeCevabi, KmCmmPlaniCevabi, KmCmmSatiri, KmCmmYazCevabi, KmCmmYazVerisi,
} from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import { uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  CMM_ILETILER, baslikVarMi, bicimSez, csvOku, csvSatirlari, eslemeOner, planSatiri, qifSatirlari, satirlariDegerlendir, xmlOku, yazilacakSatirlar,
} from './cmm-kurallar.ts';
import type { CmmHamSatir, CmmIletisi } from './cmm-kurallar.ts';
import { STUDYO_ILETILER } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import { olcumYaz } from './studyo.ts';

// CMM sonuç dönüşü (1439 a) ve ölçüm planı raporu. Ölçüm yazımı stüdyonun `olcumYaz`'ıdır (kaynak `cmm`): balon, numune ve uygunluk
// denetimi tektir. Dosya saklanmaz; yazma dosyayı yeniden okur.

const ret = (anahtar: CmmIletisi, alan = 'metin') => dogrulama(CMM_ILETILER[anahtar], alan);

// Resim emrin parçasının etkin resmi olmalı: balon numarası resim başınadır.
async function emirResmi(db: Db, uretimEmriId: number, resimId: number): Promise<sorgular.ResimSatiri> {
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (emir === null) throw bulunamadi(STUDYO_ILETILER.emirYok);
  const resim = await sorgular.resim(db, resimId);
  if (resim === null || !resim.aktif) throw bulunamadi(STUDYO_ILETILER.resimYok);
  if (resim.malzemeNo !== emir.malzemeNo) throw dogrulama(STUDYO_ILETILER.balonEmirDisi, 'resimId');
  return resim;
}

function dosyaOku(metin: string, istenen: KmCmmEsleme | undefined): Omit<KmCmmOnizlemeCevabi, 'resimSurumu' | 'satirlar'> & { ham: CmmHamSatir[] } {
  if (bicimSez(metin) === 'qif') {
    const kok = xmlOku(metin);
    if ('ret' in kok) throw ret(kok.ret);
    const ham = qifSatirlari(kok);
    if ('ret' in ham) throw ret(ham.ret);
    return { bicim: 'qif', ayirici: null, basliklar: [], esleme: null, ham };
  }
  const csv = csvOku(metin);
  if ('ret' in csv) throw ret(csv.ret);
  const baslik = baslikVarMi(csv.satirlar);
  const basliklar = baslik ? csv.satirlar[0]! : (csv.satirlar[0] ?? []).map((_, i) => `Sütun ${String(i + 1)}`);
  const esleme = istenen ?? eslemeOner(baslik ? basliklar : []);
  if (esleme === null) return { bicim: 'csv', ayirici: csv.ayirici, basliklar, esleme: null, ham: [] };
  const ham = csvSatirlari(csv.satirlar, esleme, baslik);
  if ('ret' in ham) throw ret(ham.ret, 'esleme');
  return { bicim: 'csv', ayirici: csv.ayirici, basliklar, esleme, ham };
}

async function degerlendir(db: Db, resimId: number, ham: readonly CmmHamSatir[]): Promise<KmCmmSatiri[]> {
  return satirlariDegerlendir(ham, await sorgular.resimBalonlari(db, [resimId]));
}

export async function cmmOnizle(db: Db, g: { uretimEmriId: number; resimId: number; metin: string; esleme?: KmCmmEsleme | undefined }): Promise<KmCmmOnizlemeCevabi> {
  const resim = await emirResmi(db, g.uretimEmriId, g.resimId);
  const { ham, ...dosya } = dosyaOku(g.metin, g.esleme);
  return { ...dosya, resimSurumu: resim.surum, satirlar: await degerlendir(db, g.resimId, ham) };
}

export async function cmmYaz(db: Db, kisiId: number, g: KmCmmYazVerisi): Promise<KmCmmYazCevabi> {
  const resim = await emirResmi(db, g.uretimEmriId, g.resimId);
  if (resim.surum !== g.resimSurumu) throw cakisma(STUDYO_ILETILER.surumDegisti);
  const { ham, esleme, bicim } = dosyaOku(g.metin, g.esleme);
  if (bicim === 'csv' && esleme === null) throw ret('yazilacakYok');
  const satirlar = await degerlendir(db, g.resimId, ham);
  const yazilacak = yazilacakSatirlar(satirlar, g.onaylananlar);
  if ('ret' in yazilacak) throw ret(yazilacak.ret, yazilacak.ret === 'onayDisi' ? 'onaylananlar' : 'metin');
  const olcumler = await olcumYaz(db, kisiId, 'cmm', {
    uretimEmriId: g.uretimEmriId,
    ...(g.numuneId !== undefined ? { numuneId: g.numuneId } : {}),
    ...(g.parcaSayisi !== undefined ? { parcaSayisi: g.parcaSayisi } : {}),
    olcumler: yazilacak.map((s) => ({ balonId: s.balonId!, deger: s.olculen! })),
  });
  return { olcumler, atlanan: satirlar.length - yazilacak.length };
}

// Plan raporu yöntemi CMM olan balonlardan çıkar; resimde CMM işaretli balon yoksa hepsinden.
export async function cmmPlani(db: Db, resimId: number): Promise<KmCmmPlaniCevabi> {
  const resim = await sorgular.resim(db, resimId);
  if (resim === null || !resim.aktif) throw bulunamadi(STUDYO_ILETILER.resimYok);
  const balonlar = await sorgular.resimBalonlari(db, [resimId]);
  const cmm = balonlar.filter((b) => b.yontem === 'cmm');
  const secilen = cmm.length ? cmm : balonlar;
  return {
    resim: { id: resim.id, ad: resim.ad, revizyon: resim.revizyon, malzemeNo: resim.malzemeNo },
    kapsam: cmm.length ? 'cmm' : 'hepsi',
    satirlar: secilen.map(planSatiri),
  };
}
