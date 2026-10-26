import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADIM_SECILMELI, ISTASYON_DOLU, MAKINEDE_AYNI_IS, MAKINE_DOLU, adimEksigi, adimEksikleri, baslatilabilirAdimlar, eksiyleBitirmeUyarisi, emirEksiUyarisi,
  makineDoluIhlali, oncekiBitmediIhlali, oncekiParalelAdim, sayimAsimiUyarisi, siraDisiBaslatmaUyarisi, uyarilariBirlestir, varsayilanAdim,
} from './kurallar.ts';
import type { EksikAdimi, ParalelAdim } from './kurallar.ts';

type Adim = ParalelAdim & { istasyonId: number | null; fasonFirmaId: number | null };
const adim = (sira: number, ek: Partial<Adim> = {}): Adim => ({
  id: sira * 100, sira, opNo: sira * 10, durum: 'bekliyor', bagimlilik: 'bekleyen', devirAdedi: null, istasyonId: sira, fasonFirmaId: null, ...ek,
});

describe('paralel adım kuralları (kart 639)', () => {
  test('önceki adım: bir küçük sıradaki adım; bağımsız adımın ve ilk adımın önceki adımı yok', () => {
    const a = [adim(1), adim(2, { bagimlilik: 'akisli' }), adim(3, { bagimlilik: 'bagimsiz' })];
    assert.equal(oncekiParalelAdim(a, a[1]!)?.id, 100);
    assert.equal(oncekiParalelAdim(a, a[0]!), null);
    assert.equal(oncekiParalelAdim(a, a[2]!), null);
  });

  test('varsayılan adım: tek açık adım, açık yoksa sıradaki; iki açık adımda adım sorulur; fasondaki adım açık sayılmaz', () => {
    assert.equal((varsayilanAdim([adim(1, { durum: 'tamam' }), adim(2)]) as Adim).id, 200);
    assert.equal((varsayilanAdim([adim(1, { durum: 'calisiyor' }), adim(2)]) as Adim).id, 100);
    assert.equal(varsayilanAdim([adim(1, { durum: 'calisiyor' }), adim(2, { durum: 'calisiyor' })]), ADIM_SECILMELI);
    assert.equal((varsayilanAdim([adim(1, { durum: 'calisiyor', fasonFirmaId: 7 }), adim(2, { durum: 'calisiyor' })]) as Adim).id, 200);
    assert.equal(varsayilanAdim([adim(1, { durum: 'tamam' })]), null);
  });

  test('626 a: sıra dışı başlatma uyarı döner; bekleyen önceki bitmeden, akışlı devir adedi gelmeden; bağımsız ve ilk adım uyarmaz', () => {
    const bekleyen = [adim(1, { durum: 'calisiyor' }), adim(2)];
    assert.equal(siraDisiBaslatmaUyarisi(bekleyen, bekleyen[1]!, 50), 'OP 10 bitmeden OP 20 başlatıldı.');
    assert.equal(siraDisiBaslatmaUyarisi(bekleyen, bekleyen[0]!, 0), null);
    const akisli = [adim(1, { durum: 'calisiyor' }), adim(2, { bagimlilik: 'akisli', devirAdedi: 5 })];
    assert.match(siraDisiBaslatmaUyarisi(akisli, akisli[1]!, 4) ?? '', /devir adedi \(5\) gelmeden OP 20 başlatıldı; gelen 4/);
    assert.equal(siraDisiBaslatmaUyarisi(akisli, akisli[1]!, 5), null, 'sınırda uyarı yok');
    const bagimsiz = [adim(1, { durum: 'calisiyor' }), adim(2, { bagimlilik: 'bagimsiz' })];
    assert.equal(siraDisiBaslatmaUyarisi(bagimsiz, bagimsiz[1]!, 0), null);
    const bitti = [adim(1, { durum: 'tamam' }), adim(2)];
    assert.equal(siraDisiBaslatmaUyarisi(bitti, bitti[1]!, 0), null);
  });

  test('başlatılabilir adımlar: bekleyen, istasyonlu, fason olmayan ve uyarısız olanlar', () => {
    const a = [
      adim(1, { durum: 'calisiyor' }), adim(2, { bagimlilik: 'akisli', devirAdedi: 3 }), adim(3, { bagimlilik: 'bagimsiz' }),
      adim(4, { bagimlilik: 'bagimsiz', istasyonId: null }), adim(5, { bagimlilik: 'bagimsiz', fasonFirmaId: 9 }), adim(6),
    ];
    assert.deepEqual(baslatilabilirAdimlar(a, (x) => (x.sira === 2 ? 3 : 0)), [200, 300]);
    assert.deepEqual(baslatilabilirAdimlar(a, () => 2), [300], 'devir adedi gelmeyen akışlı adım listede yok');
  });

  test('649 a: akışlı ya da bekleyen adım önceki bitmeden bitmez; bağımsız adım bekler değil', () => {
    const a = [adim(1, { durum: 'calisiyor' }), adim(2, { durum: 'calisiyor', bagimlilik: 'akisli' }), adim(3, { durum: 'calisiyor', bagimlilik: 'bagimsiz' })];
    assert.equal(oncekiBitmediIhlali(a, a[1]!), 'OP 10 bitmeden OP 20 bitirilemez; önce OP 10 bitirilmeli.');
    assert.equal(oncekiBitmediIhlali(a, a[2]!), null);
    assert.equal(oncekiBitmediIhlali(a, a[0]!), null);
    assert.equal(oncekiBitmediIhlali([adim(1, { durum: 'tamam' }), a[1]!], a[1]!), null);
  });

  test('eksik: artı gelmiş işlenmemiş, eksi önceki adımda eksi; önceki adımı olmayanda null', () => {
    assert.equal(adimEksigi(10, 7), 3);
    assert.equal(adimEksigi(4, 6), -2);
    assert.equal(adimEksigi(null, 6), null);
    const e = (sira: number, ek: Partial<EksikAdimi>): EksikAdimi => ({ ...adim(sira), saglamAdet: null, saglam: 0, hurda: 0, kararBekliyor: 0, ...ek });
    const harita = adimEksikleri([
      e(1, { durum: 'tamam', saglamAdet: 8, saglam: 9 }), e(2, { durum: 'calisiyor', saglam: 5, hurda: 1, kararBekliyor: 1 }),
      e(3, { durum: 'calisiyor', bagimlilik: 'akisli', saglam: 9 }), e(4, { bagimlilik: 'bagimsiz', saglam: 2 }),
    ]);
    assert.deepEqual([...harita.entries()], [[100, null], [200, 1], [300, -4], [400, null]], 'bitmiş adımın kapanışı, bitmemişin o anki sağlamı girer');
  });

  test('647 a: sayım aşımı uyarısı; düşürme ve sınır içi uyarmaz', () => {
    assert.equal(sayimAsimiUyarisi(4, 3, 2, 20), 'Bu adımda sayılan 5, önceki adımdan gelen 4; 1 fazla (OP 20). Önceki adımın sayımı eksik girilmiş olabilir.');
    assert.equal(sayimAsimiUyarisi(4, 3, 1, 20), null);
    assert.equal(sayimAsimiUyarisi(4, 6, -1, 20), null);
    assert.equal(sayimAsimiUyarisi(null, 100, 5, 10), null);
  });

  test('654 a ve emir bitişi: eksi bakiyeyle bitiş uyarır', () => {
    assert.equal(eksiyleBitirmeUyarisi(5, { opNo: 20, sayilan: 7 }), "OP 20'de bu adımdan 2 fazla parça sayıldı; eksi 2 kaldı.");
    assert.equal(eksiyleBitirmeUyarisi(7, { opNo: 20, sayilan: 7 }), null);
    assert.equal(eksiyleBitirmeUyarisi(7, null), null);
    assert.equal(emirEksiUyarisi([{ opNo: 10, eksik: null }, { opNo: 20, eksik: 0 }, { opNo: 30, eksik: 2 }]), null);
    assert.equal(emirEksiUyarisi([{ opNo: 20, eksik: -1 }, { opNo: 30, eksik: -3 }]), "Emir eksi bakiyeyle bitti: OP 20'de 1 fazla sayıldı, OP 30'de 3 fazla sayıldı.");
    assert.equal(uyarilariBirlestir(null, 'a', '', 'b'), 'a b');
    assert.equal(uyarilariBirlestir(null, ''), null);
  });

  test('yer: aynı emrin öteki adımı yeri doldurur; adım bilinmiyorsa aynı emir aynı iştir', () => {
    assert.equal(makineDoluIhlali(1, 1, true, 10, 20), MAKINE_DOLU);
    assert.equal(makineDoluIhlali(1, 1, false, 10, 20), ISTASYON_DOLU);
    assert.equal(makineDoluIhlali(1, 1, true, 10, 10), MAKINEDE_AYNI_IS);
    assert.equal(makineDoluIhlali(1, 1, true, null, 20), MAKINEDE_AYNI_IS);
    assert.equal(makineDoluIhlali(1, 1, true), MAKINEDE_AYNI_IS);
    assert.equal(makineDoluIhlali(null, 1, true, null, 20), null);
  });
});
