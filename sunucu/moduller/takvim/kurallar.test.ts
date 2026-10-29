import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { butunIzinleriGorurMu, gorulenKaynaklar, kayitlariSirala } from './kurallar.ts';

test('TK-K1: yetkisi olmayan kaynak hiç görünmez; emir kaynakları emir listesi sayfasıyla açılır; izin herkese (kendi izni)', () => {
  assert.deepEqual(gorulenKaynaklar([]), { okunan: ['izin', 'planli-durus'], bekleyen: [] });
  assert.deepEqual(gorulenKaynaklar(['kalibrasyon.oku', 'plan.oku', 'sevkiyat.oku']), {
    okunan: ['sevk', 'kalibrasyon', 'izin', 'planli-durus'], bekleyen: [],
  });
  assert.deepEqual(gorulenKaynaklar(['sayfa.uretim-emirleri', 'siparisler.oku', 'denetim-hazirlik.oku', 'finans.oku', 'satin-alma.oku']), {
    okunan: ['siparis', 'emir-plan', 'emir-bitis', 'satin-alma', 'denetim', 'izin', 'vergi', 'planli-durus'], bekleyen: [],
  });
});

test('TK-K2: kayıtlar tarihe, aynı günde kaynak sırasına, sonra kimliğe göre dizilir', () => {
  const k = (kaynak: TakvimKaydi['kaynak'], tarih: string, kimlik: string): TakvimKaydi =>
    ({ kaynak, kimlik, tarih, no: null, baslik: 'B', ilgili: null, durum: 'D', bitti: false });
  const sirali = kayitlariSirala([k('vergi', '2031-03-02', '1'), k('siparis', '2031-03-02', '9'), k('siparis', '2031-03-02', '10'), k('izin', '2031-03-01', '5')]);
  assert.deepEqual(sirali.map((x) => `${x.tarih} ${x.kaynak} ${x.kimlik}`), [
    '2031-03-01 izin 5', '2031-03-02 siparis 10', '2031-03-02 siparis 9', '2031-03-02 vergi 1',
  ]);
});

test('TK-K3 (1191 a): bütün izinleri ik.oku ya da ik.izin-oku olan görür', () => {
  assert.equal(butunIzinleriGorurMu([]), false);
  assert.equal(butunIzinleriGorurMu(['ik.izin-talep', 'ik.izin-onay']), false);
  assert.equal(butunIzinleriGorurMu(['ik.izin-oku']), true);
  assert.equal(butunIzinleriGorurMu(['ik.oku']), true);
});
