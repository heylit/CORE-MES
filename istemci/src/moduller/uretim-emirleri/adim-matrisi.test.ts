import { describe, expect, it } from 'vitest';
import type { AdimMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import {
  BOS_SUZGEC, aralik, duzKalemler, emirleriSuz, geriAlGovdeleri, gecerliSecim, gorunenStatu, gorunumOku, istekGovdeleri, kalemAnahtari, oncekiDefteri, opKalemleri,
  opSutunlari, secimiAcKapa, secimiSay, sirala, yazilacaklar, yazimOzeti, emrinKalemleri,
} from './adim-matrisi.ts';

type E = AdimMatrisiCevabi['emirler'][number];
type A = E['adimlar'][number];
const adim = (isEmriId: number, opNo: number, sistemStatusu: A['sistemStatusu'], elle: A['elle'] = null): A =>
  ({ isEmriId, opNo, ad: `Adım ${String(opNo)}`, durum: 'bekliyor', hedef: 10, yapilan: 0, yuzde: 0, sistemStatusu, elle });
const emir = (emirId: number, emirNo: string, adimlar: A[], durum: E['durum'] = 'basladi', teslim: string | null = null): E =>
  ({ emirId, emirNo, urun: { kod: `ORN-${emirNo}`, ad: `Deneme ${emirNo}` }, durum, teslim, adimlar });
const ELLE = { statu: 'malzeme', not: 'Gelmedi', kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
const E1 = emir(1, 'UE-1', [adim(11, 10, 'baslayabilir'), adim(12, 20, 'onceki', ELLE), adim(13, 25, 'onceki')], 'basladi', '2026-12-05');
const E2 = emir(2, 'UE-2', [adim(21, 10, 'uretimde'), adim(22, 30, 'durdu')], 'planli', '2026-12-01');
const E3 = emir(3, 'UE-3', [adim(31, 10, 'beklemede'), adim(32, 20, 'beklemede')], 'planli');
const E4 = emir(4, 'UE-4', [adim(41, 10, 'bitti')], 'bitti');
const HEPSI = [E1, E2, E3, E4];

describe('Adım Durumu matrisi: saf kurallar (3604)', () => {
  it('görünüm adreste; bilinmeyen değer Emir görünümüne düşer', () => {
    expect(['emir', 'matris', 'tablo', null, 'x'].map(gorunumOku)).toEqual(['emir', 'matris', 'tablo', 'emir', 'emir']);
  });
  it('OP sütunları emirlerin op birleşimidir; ek adım kendi sütununu alır', () => {
    expect(opSutunlari(HEPSI).map((s) => s.opNo)).toEqual([10, 20, 25, 30]);
  });
  it('görünen statü elle yazılan, yoksa sistem; süzgeç statü, elle ve sorunlu ile satırı daraltır', () => {
    expect(gorunenStatu(E1.adimlar[1] as A)).toBe('malzeme');
    expect(gorunenStatu(E1.adimlar[0] as A)).toBe('baslayabilir');
    expect(emirleriSuz(HEPSI, BOS_SUZGEC, false).map((e) => e.emirId)).toEqual([1, 2, 3]);
    expect(emirleriSuz(HEPSI, BOS_SUZGEC, true).map((e) => e.emirId)).toEqual([1, 2, 3, 4]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, yalnizElle: true }, false).map((e) => e.emirId)).toEqual([1]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, yalnizSorunlu: true }, false).map((e) => e.emirId)).toEqual([1, 2]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, statu: 'malzeme' }, false).map((e) => e.emirId)).toEqual([1]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, arama: 'ue-2' }, false).map((e) => e.emirId)).toEqual([2]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, arama: 'ORN-UE-3' }, false).map((e) => e.emirId)).toEqual([3]);
  });
  it('seçim: tümü seçiliyse çıkar, değilse ekler; satır, sütun ve aralık kalemleri', () => {
    const satir = emrinKalemleri(E1).map((k) => k.anahtar);
    expect(satir).toEqual(['1:11', '1:12', '1:13']);
    const bir = secimiAcKapa(new Set(), satir);
    expect([...bir]).toEqual(satir);
    expect([...secimiAcKapa(bir, satir)]).toEqual([]);
    expect([...secimiAcKapa(new Set(['1:11']), satir)].length).toBe(3);
    expect(opKalemleri(HEPSI, 10).map((k) => k.anahtar)).toEqual(['1:11', '2:21', '3:31', '4:41']);
    expect(aralik(E1, 25, 10).map((k) => k.adim.opNo)).toEqual([10, 20, 25]);
  });
  it('veri yenilenince var olmayan seçim düşer', () => {
    expect([...gecerliSecim(new Set(['1:11', '9:99']), HEPSI)]).toEqual(['1:11']);
  });
  it('sayım sunucu kuralıyla aynı: bekleyen yazılır, çalışan ve beklemede ve biten atlanır', () => {
    const hepsi = duzKalemler(HEPSI, BOS_SUZGEC);
    const s = secimiSay(hepsi, 'cizim');
    expect(s.yazilir).toBe(3);
    expect(s.nedenler).toEqual([{ neden: 'emir-kapali', sayi: 1 }, { neden: 'beklemede', sayi: 2 }, { neden: 'calisiyor', sayi: 2 }]);
    expect(yazilacaklar(hepsi, 'cizim').map((k) => k.anahtar)).toEqual(['1:11', '1:12', '1:13']);
    expect(secimiSay(hepsi, 'cizim', true).yazilir).toBe(5);
    expect(secimiSay(hepsi, null).yazilir).toBe(1);
  });
  it('istek 100 kalemde bölünür; not boşsa null, kırpılır', () => {
    const emirler = Array.from({ length: 30 }, (_, i) => emir(100 + i, `U-${String(i)}`, [1, 2, 3, 4, 5].map((j) => adim(1000 + i * 10 + j, j * 10, 'baslayabilir'))));
    const kalemler = duzKalemler(emirler, BOS_SUZGEC);
    const g = istekGovdeleri(kalemler, 'siparis', '  ', false);
    expect(g.map((x) => x.kalemler.length)).toEqual([100, 50]);
    expect(g[0]?.kalemler[0]).toEqual({ emirId: 100, isEmriId: 1001, statu: 'siparis', not: null, sistemStatusu: 'baslayabilir' });
    expect(istekGovdeleri(kalemler.slice(0, 1), null, ' Not ', true)[0]).toEqual({ kalemler: [{ emirId: 100, isEmriId: 1001, statu: null, not: 'Not', sistemStatusu: 'baslayabilir' }], calisanOnay: true });
  });
  it('geri al: önceki elle değere (yoksa otomatiğe) döner', () => {
    const k = [...emrinKalemleri(E1)];
    const onceki = oncekiDefteri(k);
    const g = geriAlGovdeleri(k, onceki)[0];
    expect(g?.kalemler.map((x) => [x.isEmriId, x.statu, x.not])).toEqual([[11, null, null], [12, 'malzeme', 'Gelmedi'], [13, null, null]]);
    expect(geriAlGovdeleri(k, new Map())).toEqual([]);
  });
  it('yazım özeti kalem sonuçlarını sayar; başarısızlar anahtarla kalır', () => {
    const o = yazimOzeti([{ kalemler: [
      { emirId: 1, isEmriId: 11, sonuc: 'yazildi', neden: null }, { emirId: 1, isEmriId: 12, sonuc: 'kaldirildi', neden: null },
      { emirId: 2, isEmriId: 21, sonuc: 'atlandi', neden: 'adım bitti' }, { emirId: 2, isEmriId: 22, sonuc: 'eski', neden: 'Durum değişti' },
    ] }]);
    expect([o.yazildi, o.kaldirildi, o.atlandi]).toEqual([1, 1, 1]);
    expect(o.basarisiz).toEqual([{ anahtar: kalemAnahtari(2, 22), sonuc: 'eski', neden: 'Durum değişti' }]);
  });
  it('sıralama: emir no, termin (teslimsiz sonda) ve statü adı; yön çevrilir', () => {
    const k = duzKalemler([E1, E2], BOS_SUZGEC);
    const ad = (s: string): string => s;
    expect(sirala(k, { sutun: 'emir', yon: 1 }, ad).map((x) => x.anahtar)).toEqual(['1:11', '1:12', '1:13', '2:21', '2:22']);
    expect(sirala(k, { sutun: 'termin', yon: 1 }, ad)[0]?.emir.emirId).toBe(2);
    expect(sirala(k, { sutun: 'emir', yon: -1 }, ad)[0]?.anahtar).toBe('2:22');
    expect(sirala(duzKalemler([E1, E3], BOS_SUZGEC), { sutun: 'termin', yon: 1 }, ad).at(-1)?.emir.emirId).toBe(3);
  });
});
