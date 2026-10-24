import { describe, expect, it } from 'vitest';
import { ayEkle } from '../kurallar.ts';
import type { KmVerisi } from '../veri.ts';
import { arsivAdaylari } from '../arsiv/hesap.ts';
import { yedekBelgeleri, yedekOku } from '../ayarlar/yedek.ts';
import { baglanacaklar } from '../belgeler/index.tsx';
import { kalibrasyonYuku } from '../cihazlar/index.tsx';
import { izCsvSatirlari } from '../iz/index.tsx';
import { aylar } from './Grafik.tsx';
import { aylikIlkGecis, gostergeleriHesapla, oranTonu, pareto, ppmTonu } from './hesap.ts';

const BUGUN = '2026-06-15';
const bos: KmVerisi = {
  ncr: [], capa: [], insp: [], dev: [], sup: [], frm: [], lot: [], tpl: [], spc: [], cizim: [], parca: [], iz: [], belge: [], emir: [], bayrak: [],
  ayarlar: {}, kisi: 'Deneme',
};
const v = (o: Partial<KmVerisi>): KmVerisi => ({ ...bos, ...o });

describe('gostergeleriHesapla', () => {
  it('kayıt yokken oranlar null, sıfır uydurulmaz', () => {
    const g = gostergeleriHesapla(bos, BUGUN);
    expect([g.ilkGecis, g.lotKabul, g.ppm.toplam]).toEqual([null, null, null]);
    expect(g.bos).toBe(true);
    expect(oranTonu(null)).toBe('');
  });

  it('ilk geçiş, lot kabul, kapılar ve karantina', () => {
    const g = gostergeleriHesapla(v({
      insp: [
        { _id: 'a', tur: 'Final', tarih: '2026-06-10', sonuc: 'Kabul' },
        { _id: 'b', tur: 'Giriş', tarih: '2026-06-11', sonuc: 'Ret', tedarikci: 's1', miktar: 1000 },
        { _id: 'c', tur: 'Proses', tarih: '2026-06-12', sonuc: 'Devam ediyor' },
        { _id: 'd', tur: 'Final', tarih: '2026-06-12', sonuc: 'Beklemede', miktar: 5 },
      ],
      lot: [{ _id: 'l', tarih: '2026-05-01', karar: 'Kabul' }],
      ncr: [{ _id: 'n', tarih: '2026-06-12', durum: 'Açık', ciddiyet: 'Kritik', tedarikci: 's1', miktar: 3 }],
    }), BUGUN);
    expect(g.ilkGecis).toBe(33);
    expect(g.ilkGecisSayisi).toBe(3);
    expect(g.lotKabul).toBe(100);
    expect(g.ppm.toplam).toBe(3000);
    expect(ppmTonu(g.ppm.toplam)).toBe('kotu');
    expect(g.kapilar.find((k) => k.tur === 'Giriş')).toEqual({ tur: 'Giriş', n: 1, ret: 1 });
    expect(g.sevkeHazir).toBe(1);
    expect(g.karantinaSayisi).toBe(2);
    expect(g.karantinaTonu).toBe('kotu');
    expect([g.acikNcr, g.kritikNcr]).toEqual([1, 1]);
  });

  it('aylık ilk geçiş ve Pareto', () => {
    expect(aylikIlkGecis(v({ insp: [{ _id: 'a', tarih: '2026-05-02', sonuc: 'Ret' }], lot: [{ _id: 'l', tarih: '2026-05-03', karar: 'Kabul' }] }), ['2026-04', '2026-05']))
      .toEqual([null, 50]);
    expect(pareto([{ _id: '1', hataTipi: 'Boyutsal' }, { _id: '2', hataTipi: 'Boyutsal' }, { _id: '3' }]))
      .toEqual([{ etiket: 'Boyutsal', adet: 2, kumulatif: 67 }, { etiket: 'Diğer', adet: 1, kumulatif: 100 }]);
  });

  it('ay etiketleri geriye ve ileriye', () => {
    const s = new Date(2026, 0, 10);
    expect(aylar(2, false, s).map((a) => a.anahtar)).toEqual(['2025-12', '2026-01']);
    expect(aylar(2, true, s).map((a) => a.etiket)).toEqual(['Oca 26', 'Şub 26']);
  });
});

describe('K4 hesapları', () => {
  it('kalibrasyon yükü: süresi dolan ilk sütunda, kullanım dışı sayılmaz', () => {
    const simdi = new Date();
    const y = kalibrasyonYuku([
      { _id: 'a', sonKal: '2020-01-01', periyot: 12 },
      { _id: 'b', sonKal: '2020-01-01', periyot: 12, kullanimDisi: true },
    ], simdi);
    expect(y.etiketler).toHaveLength(7);
    expect(y.degerler[0]).toBe(1);
  });

  it('arşiv adayı yalnız kapanmış ve sınırdan eski kayıt', () => {
    const eski = ayEkle(BUGUN, -30);
    const A = arsivAdaylari(v({
      ncr: [{ _id: '1', durum: 'Kapalı', tarih: eski }, { _id: '2', durum: 'Açık', tarih: eski }, { _id: '3', durum: 'Kapalı', tarih: BUGUN }, { _id: '4', durum: 'Kapalı', tarih: eski, arsiv: true }],
    }), 24, BUGUN);
    const ncr = A.find((x) => x.kol === 'ncr')!;
    expect(ncr.kayitlar.map((r) => r._id)).toEqual(['1']);
    expect(ncr.arsivde).toBe(1);
  });

  it('yedek: ölçü aleti girmez, biçimsiz dosya reddedilir', () => {
    const docs = yedekBelgeleri(v({ ncr: [{ _id: 'n1', no: 'NCR-1' }], dev: [{ _id: 'd1' }], ayarlar: { firma: 'Deneme' } }));
    expect(docs.ncr).toEqual({ n1: { no: 'NCR-1' } });
    expect(docs.dev).toBeUndefined();
    expect(docs.settings).toEqual({ genel: { firma: 'Deneme' } });
    expect(yedekOku('{')).toEqual({ hata: 'Dosya okunamadı.' });
    expect(yedekOku('{"format":"x"}')).toEqual({ hata: 'Bu bir Kalite Merkezi yedek dosyası değil.' });
    const r = yedekOku(JSON.stringify({ format: 'kalite-merkezi-yedek', docs: { ncr: { a: {} }, dev: { d: {} } }, files: { f: { b64: 'AA==' } } }));
    expect(r).toMatchObject({ kayit: 1, dosya: 1 });
  });

  it('iz CSV eskiden yeniye', () => {
    const s = izCsvSatirlari([
      { _id: '2', t: '2026-06-02T10:00:00Z', kim: 'B', islem: 'silme', col: 'ncr', no: 'NCR-2' },
      { _id: '1', t: '2026-06-01T10:00:00Z', kim: 'A', islem: 'değişiklik', col: 'sup', degisen: [{ alan: 'Ad', eski: 'x', yeni: 'y' }] },
    ]);
    expect(s.map((r) => r[1])).toEqual(['A', 'B']);
    expect(s[0]?.[4]).toBe('Tedarikçi');
    expect(s[0]?.[6]).toBe('Ad: x -> y');
  });

  it('belge bağlanacak kayıtlar parça, lot, cihaz, tedarikçi ve emirden', () => {
    const L = baglanacaklar(v({ lot: [{ _id: 'l', no: 'LOT-1', parcaNo: 'P-1' }, { _id: 'r', tip: 'reset' }], sup: [{ _id: 's', ad: 'Deneme Ted' }] }));
    expect(L.map((x) => x.bagi.col)).toEqual(['parca', 'lot', 'sup']);
    expect(L[0]?.bagi).toMatchObject({ id: 'p-P-1', parcaNo: 'P-1' });
  });
});
