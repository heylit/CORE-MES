import { describe, expect, it } from 'vitest';
import { finansMotoru } from '../motor.ts';
import { genisDurum, ornekDurum, ORNEK_BUGUN } from '../ornek-veri.ts';
import { anaSayilar, nakitHukmu, selam } from './ozet.ts';
import { yapilacaklar } from './yapilacaklar.ts';

function kur(genis: boolean) {
  const motor = finansMotoru(ORNEK_BUGUN);
  const durum = genis ? genisDurum(motor) : ornekDurum(motor);
  durum.cheques.forEach((q, i) => { q._cekId = i + 1; });
  durum.recurring.push({ id: 'r9', name: 'Kredi taksiti', cat: 'Kredi anapara', amount: 12000, day: 18, _duzenliId: 9 });
  motor.durum = motor.normalize(JSON.parse(JSON.stringify(durum)));
  return { motor };
}

describe('F4 ana sayfa: sayılar ve metinler', () => {
  it('dört temel sayı örnek veride elle hesaplanan değerdir', () => {
    const { motor } = kur(false);
    const s = anaSayilar(motor, []);
    expect(s.nakit).toBe(motor.cashToday());
    expect(s.alacak).toBe(60000);
    expect(s.alacakGeciken).toBe(0);
    expect(s.alacakCek).toBe(5000);
    expect(s.borc).toBe(14400);
    expect(s.borcHafta).toBe(14400);
    expect(s.siparisHafta).toEqual({ adet: 0, tutar: 0 });
  });

  it('çek satırının düğmeleri gruba ve duruma göredir; sunucu kimliği taşır', () => {
    const { motor } = kur(true);
    const ib = yapilacaklar(motor);
    const portfoy = ib.find((x) => x.baslik.includes('Deneme Musteri çeki'))!;
    expect(portfoy.g).toBe(2);
    expect(portfoy.eylemler.map((e) => e.etiket)).toEqual(['Bankaya verdim', 'Tahsil edildi']);
    const verilen = ib.find((x) => x.baslik === 'Verilen çek · hesapta para bulunmalı')!;
    expect(verilen.g).toBe(1);
    expect(verilen.eylemler).toEqual([{ tur: 'cek', etiket: 'Ödendi', durum: 'odendi', birincil: true, cekId: expect.any(Number) }]);
    const kredi = ib.find((x) => x.baslik === 'Kredi taksiti')!;
    expect(kredi.eylemler).toEqual([{ tur: 'duzenli', etiket: 'Ödendi', duzenliId: 9, birincil: true }]);
  });

  it('nakit hükmü tolerans ve eşik olasılığına göre', () => {
    const { motor } = kur(false);
    const A = motor.runAnalysis();
    const mc = A.mc!;
    expect(nakitHukmu(motor, { ...A, mc: { ...mc, pNeg: 0.5 } })).toMatchObject({ ton: 'hata' });
    expect(nakitHukmu(motor, { ...A, mc: { ...mc, pNeg: 0, pBelow: 0.3 } })).toMatchObject({ ton: 'uyari' });
    expect(nakitHukmu(motor, { ...A, mc: { ...mc, pNeg: 0, pBelow: 0 } })).toEqual({ ton: 'tamam', metin: 'Önümüzdeki 13 hafta nakit yeterli görünüyor.' });
    expect(nakitHukmu(motor, { ...A, mc: null })).toBeNull();
  });

  it('selam saate göre', () => {
    expect([selam(9), selam(14), selam(20)]).toEqual(['Günaydın', 'İyi günler', 'İyi akşamlar']);
  });
});
