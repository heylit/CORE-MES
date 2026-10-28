import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { butunIzinleriGorurMu, gorulenKaynaklar, kayitlariSirala } from './kurallar.ts';

test('TK-K1: yetkisi olmayan kaynak hiç görünmez; bağlanmamış kaynak yetkisi varsa bekleyenlerde; izin herkese (kendi izni)', () => {
  assert.deepEqual(gorulenKaynaklar([]), { okunan: ['izin', 'planli-durus'], bekleyen: [] });
  assert.deepEqual(gorulenKaynaklar(['kalibrasyon.oku', 'plan.oku', 'sevkiyat.oku']), {
    okunan: ['kalibrasyon', 'izin', 'planli-durus'], bekleyen: ['emir-plan', 'emir-bitis', 'sevk'],
  });
  assert.deepEqual(gorulenKaynaklar(['siparisler.oku', 'denetim-hazirlik.oku', 'finans.oku', 'satin-alma.oku']), {
    okunan: ['siparis', 'denetim', 'izin', 'vergi', 'planli-durus'], bekleyen: ['satin-alma'],
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
