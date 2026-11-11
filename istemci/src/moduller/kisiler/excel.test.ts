import { describe, expect, it } from 'vitest';
import type { KisiOzeti } from '#paylasilan/sozlesme/kisiler.ts';
import { planKur } from '../../ortak/excel/kurallar.ts';
import { KISI_SAYFASI, kisiSatiri, kisiTanimi } from './excel.ts';

// Sentetik veri: gerçek ad ya da sicil yok.
const kisi = (id: number, ek: Partial<KisiOzeti>): KisiOzeti => ({
  id, ad: `Kişi ${String(id)}`, aktif: true, girisVar: false, kullaniciAdi: null, pinVar: false, sicilNo: null, gorev: null,
  roller: [], surum: 3, ozlukIk: false, ozlukCikisTarihi: null, korumali: false, ...ek,
});
const KISILER = [
  kisi(1, { sicilNo: 'S-1', gorev: 'Tornacı' }),
  kisi(2, { sicilNo: 'S-2', ozlukIk: true }),
  kisi(3, { sicilNo: 'S-3', korumali: true }),
  kisi(4, { ad: 'Aynı Ad' }),
];
const oku = (...satirlar: (string | null)[][]) =>
  ({ [KISI_SAYFASI]: [{ no: 1, hucreler: ['Sicil no', 'Ad soyad *', 'Görev'] }, ...satirlar.map((h, i) => ({ no: i + 2, hucreler: h }))] });

describe('kişi Excel tanımı', () => {
  it('sicil no ile eşleşir (harf farkı önemsiz); sicilsiz satır adı aynı olsa da yeni kişidir', () => {
    const { plan } = planKur(kisiTanimi(KISILER), oku(['s-1', null, 'Frezeci'], [null, 'Aynı Ad', null], ['S-9', 'Yeni Kişi', null]));
    expect(plan.map((p) => [p.islem, p.hatalar])).toEqual([['guncelle', []], ['ekle', []], ['ekle', []]]);
    // 2679 a: aynı adda kişi uyarısı yalnız yeni kişi satırında; yazımı durdurmaz (harf ve boşluk farkı önemsiz).
    expect(plan.map((p) => p.uyarilar ?? [])).toEqual([[], ['Aynı adda kişi var; aynı kişiyse sicil yazın.'], []]);
    expect(planKur(kisiTanimi(KISILER), oku([null, '  aynı   ad ', null], ['S-1', 'Kişi 4', null])).plan.map((p) => [p.islem, p.uyarilar ?? []]))
      .toEqual([['ekle', ['Aynı adda kişi var; aynı kişiyse sicil yazın.']], ['guncelle', []]]);
    expect(kisiSatiri(plan[0]!, 1)).toEqual({ islem: 'guncelle', satir: 1, id: 1, surum: 3, gorev: 'Frezeci' });
    expect(kisiSatiri(plan[1]!, 2)).toEqual({ islem: 'ekle', satir: 2, ad: 'Aynı Ad', sicilNo: null, gorev: null });
  });
  it('özlüğü İK\'da olan ve korumalı kişiye fark getiren satır hatadır; değişiklik yoksa değişmeyendir', () => {
    const { plan } = planKur(kisiTanimi(KISILER), oku(['S-2', 'Başka Ad', null], ['S-3', null, 'Yeni görev'], ['S-2', null, null]));
    expect(plan[0]?.hatalar).toEqual(['Bu kişinin ad, sicil no ve görevi İK personel kartından gelir; İK\'da değiştirin.']);
    expect(plan[1]?.hatalar).toEqual(['Bu kişinin kaydını düzenleme yetkiniz yok.']);
    expect(plan[2]?.hatalar).toContain('Aynı kod 2. satırda da var.');
  });
  it('şablonda rol, hesap, parola ya da PIN sütunu yok', () => {
    expect(kisiTanimi(KISILER).sayfalar[0]?.sutunlar.map((s) => s.anahtar)).toEqual(['sicilNo', 'ad', 'gorev']);
  });
});
