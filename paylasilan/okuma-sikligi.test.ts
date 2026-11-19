import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PENCERE_EN_COK_TUR, sonrakiTur, turBaslasinMi, turBitti, yeniSiklikDurumu } from './okuma-sikligi.ts';
import type { SiklikDurumu } from './okuma-sikligi.ts';

const t = (dk: number): Date => new Date(Date.UTC(2026, 10, 19, 8, 0) + dk * 60_000);

// Kapıyı iş gibi dakikada bir döndürür; her açılışta okuma "koşar" ve sonucu verilir. Kaç kez okunduğunu sayar.
function dondur(siklik: Parameters<typeof turBaslasinMi>[1], dakika: number, sonuc: (i: number) => { kayitGeldi: boolean } | null, enAzTur = 1): number {
  let d: SiklikDurumu = yeniSiklikDurumu();
  let okuma = 0;
  for (let i = 0; i < dakika; i++) {
    const a = turBaslasinMi(d, siklik, t(i));
    if (a === null) continue;
    okuma++;
    d = turBitti(a, sonuc(okuma), enAzTur, t(i));
  }
  return okuma;
}

describe('okuma sıklığı kapısı (3445)', () => {
  test('15 dakikada birde bir saatlik dakika tiki dört okuma yapar; ilk tik hemen okur', () => {
    assert.equal(dondur('15dk', 60, () => ({ kayitGeldi: false })), 4);
    assert.equal(dondur('1dk', 10, () => ({ kayitGeldi: false })), 10);
    assert.equal(dondur('gunluk', 600, () => ({ kayitGeldi: false })), 1);
  });

  test('"Yalnız elle" istenmeden hiç okumaz; "Şimdi oku" art arda basılsa da tek tur açar', () => {
    assert.equal(dondur('elle', 120, () => ({ kayitGeldi: false })), 0);
    let d = turBitti(turBaslasinMi(yeniSiklikDurumu(), '60dk', t(0))!, { kayitGeldi: false }, 1, t(0));
    assert.equal(turBaslasinMi(d, '60dk', t(5)), null);
    d = { ...d, istendi: true };
    d = { ...d, istendi: true };
    const a = turBaslasinMi(d, '60dk', t(5));
    assert.ok(a);
    assert.equal(a.istendi, false);
    assert.deepEqual(a.zorlaAni, t(5));
    const b = turBitti(a, { kayitGeldi: false }, 1, t(5));
    assert.equal(turBaslasinMi(b, '60dk', t(6)), null, 'istek tüketildi; ikinci basış ayrıca okutmaz');
    assert.deepEqual(sonrakiTur(b, '60dk'), t(65));
  });

  test('kayıt geldikçe pencere açık kalır (sayfa sayfa yetişme), sınırda kapanır; en az tur sayısı tutulur', () => {
    assert.equal(dondur('60dk', 5, (i) => ({ kayitGeldi: i <= 3 })), 4, 'üç dolu sayfa ve boş dönen dördüncü tur');
    assert.equal(dondur('60dk', PENCERE_EN_COK_TUR + 20, () => ({ kayitGeldi: true })), PENCERE_EN_COK_TUR);
    assert.equal(dondur('60dk', 30, () => ({ kayitGeldi: false }), 2), 2);
  });

  test('kapalı akış ya da bağlantı yokken (null sonuç) zaman yazılmaz: açılınca ilk tikte okunur', () => {
    const a = turBaslasinMi(yeniSiklikDurumu(), '60dk', t(0))!;
    const kapali = turBitti(a, null, 1, t(0));
    assert.equal(kapali.sonTur, null);
    assert.equal(kapali.pencere, false);
    assert.ok(turBaslasinMi(kapali, '60dk', t(1)));
  });

  test('sonraki tur: pencere açıkken ve "Yalnız elle"de bilinmez', () => {
    const a = turBaslasinMi(yeniSiklikDurumu(), '15dk', t(0))!;
    assert.equal(sonrakiTur(a, '15dk'), null);
    const b = turBitti(a, { kayitGeldi: false }, 1, t(0));
    assert.deepEqual(sonrakiTur(b, '15dk'), t(15));
    assert.equal(sonrakiTur(b, 'elle'), null);
  });
});
