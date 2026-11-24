import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Veritabani } from './db.ts';
import { acilisKancalariniCalistir, acilisKancasiKaydet } from './surec.ts';

describe('açılış kancaları', () => {
  test('kayıtlı kanca bağlamla çalışır; hata atan kanca açılışı durdurmaz, sonraki kanca yine çalışır', async () => {
    const hatalar: string[] = [];
    const gorulen: string[] = [];
    acilisKancasiKaydet(() => Promise.reject(new Error('kanca düştü')));
    acilisKancasiKaydet((b) => { gorulen.push(b.gunlukDizini); return Promise.resolve(); });
    await acilisKancalariniCalistir({
      vt: {} as Veritabani, gunluk: { error: (n, m) => { hatalar.push(`${m}|${String((n as { err?: unknown }).err)}`); } }, gunlukDizini: 'g', acilis: new Date(0),
    });
    // Kablolama yüklüyse gerçek kancalar da kayıtlıdır (sahte veritabanında onlar da düşer); yalnız bizimkini sayarız.
    assert.equal(hatalar.filter((h) => h.includes('kanca düştü')).length, 1);
    assert.ok(hatalar.every((h) => h.startsWith('Açılış kancası başarısız')));
    assert.deepEqual(gorulen, ['g']);
  });
});
