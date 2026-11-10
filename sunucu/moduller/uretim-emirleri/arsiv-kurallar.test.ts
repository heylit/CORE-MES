import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADIMLI_IPTAL_KOLLU, ARSIV_BASLAMAMIS, ARSIV_HATALI_ACIK, ARSIV_DURUMU, ARSIV_FASONDA, ARSIV_GIRIS, ARSIV_YARI_MAMUL, arsivIhlali, arsivUyarilari } from './kurallar.ts';

const acik = { durum: 'basladi' as const, arsiv: false, baslamisAdimVar: true, acikKolVar: false };

test('2721: başlamış açık emir arşive alınır; bitmiş, iptal, eski arşiv, başlamamış, açık kollu emir alınmaz', () => {
  assert.equal(arsivIhlali(acik), null);
  assert.equal(arsivIhlali({ ...acik, durum: 'planli' }), null, 'emir planlı görünüp adımı başlamış olabilir');
  assert.equal(arsivIhlali({ ...acik, durum: 'bitti' }), ARSIV_DURUMU);
  assert.equal(arsivIhlali({ ...acik, durum: 'iptal' }), ARSIV_DURUMU);
  assert.equal(arsivIhlali({ ...acik, arsiv: true }), ARSIV_DURUMU);
  assert.equal(arsivIhlali({ ...acik, baslamisAdimVar: false }), ARSIV_BASLAMAMIS);
  assert.equal(arsivIhlali({ ...acik, acikKolVar: true }), ADIMLI_IPTAL_KOLLU);
});

test('2721: uyarı cümleleri giriş ile başlar, yarı mamul ile biter; yalnız olan durum yazılır', () => {
  const bos = arsivUyarilari({ calisan: [], saglam: null, hurda: 0, kararBekleyen: 0, fasondaAdet: 0, hataliAcik: 0 });
  assert.deepEqual(bos, [ARSIV_GIRIS, ARSIV_YARI_MAMUL]);
  const dolu = arsivUyarilari({ calisan: [{ opNo: 20, operator: 'Ali' }, { opNo: null, operator: null }], saglam: { opNo: 20, adet: 4 }, hurda: 1, kararBekleyen: 2, fasondaAdet: 3, hataliAcik: 1 });
  assert.deepEqual(dolu.slice(1, -1), [
    'OP 20 çalışıyor (Ali): iş terminalden hemen düşer.',
    'İş çalışıyor: iş terminalden hemen düşer.',
    'Sayılanlar kalır: sağlam 4 (OP 20), hurda 1.',
    '2 parça kalite kararı bekliyor; karar arşivde de verilir.',
    ARSIV_HATALI_ACIK(1),
    ARSIV_FASONDA,
  ]);
  assert.ok(!dolu.some((u) => / 3 /.test(u)), '2721 2/3 b: fasondaki sayı ekranda fasonda[] ile yazılır, cümlede tekrarlanmaz');
});
