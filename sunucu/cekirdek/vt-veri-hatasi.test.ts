import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import pg from 'pg';
import { hataYonetiminiKur } from './uygulama.ts';

function vtHatasi(kod: string, ileti: string): pg.DatabaseError {
  const hata = new pg.DatabaseError(ileti, ileti.length, 'error');
  hata.code = kod;
  return hata;
}

// Ön denetimden kaçan bozuk değer kullanıcının düzeltebileceği bir girdidir: 500 "beklenmeyen hata" değil, 422 ve
// ne yapacağını söyleyen ileti döner. Sunucu iletisi girilen değeri taşır; cevaba girmez.
const DURUMLAR = [
  { kod: '22003', ileti: 'value "99999999999" is out of range for type integer', aranan: /aralı/ },
  { kod: '22P02', ileti: 'invalid input syntax for type integer: "1.250"', aranan: /biçim/ },
  { kod: '22001', ileti: 'value too long for type character varying(20)', aranan: /uzun/ },
  { kod: '22007', ileti: 'invalid input syntax for type date: "31.31.2026"', aranan: /tarih/i },
  { kod: '22008', ileti: 'date/time field value out of range: "2026-13-45"', aranan: /tarih/i },
  { kod: '23502', ileti: 'null value in column "ad" of relation "gizli_tablo" violates not-null constraint', aranan: /boş/ },
] as const;

for (const d of DURUMLAR) {
  test(`veritabanı ${d.kod} hatası 422 GECERSIZ ve anlamlı iletiyle döner, sunucu iletisi sızmaz`, async () => {
    const app = Fastify();
    hataYonetiminiKur(app);
    app.post('/yaz', async () => {
      throw vtHatasi(d.kod, d.ileti);
    });
    const cevap = await app.inject({ method: 'POST', url: '/yaz' });
    assert.equal(cevap.statusCode, 422);
    assert.equal(cevap.json().kod, 'GECERSIZ');
    assert.match(cevap.json().mesaj, d.aranan);
    assert.equal(cevap.body.includes('gizli_tablo'), false);
    assert.equal(cevap.body.includes('1.250'), false);
    assert.equal(cevap.body.includes('99999999999'), false);
  });
}

test('eşlenmemiş veritabanı hatası yine 500 SUNUCU döner', async () => {
  const app = Fastify();
  hataYonetiminiKur(app);
  app.get('/patla', async () => {
    throw vtHatasi('42P01', 'relation "gizli_tablo" does not exist');
  });
  const cevap = await app.inject({ method: 'GET', url: '/patla' });
  assert.equal(cevap.statusCode, 500);
  assert.equal(cevap.json().kod, 'SUNUCU');
});

// Disk dolunca her yazma aynı hatayı verir; kullanıcı düzeltemez, beklemekle de geçmez. "Beklenmeyen hata" yerine
// kime haber vereceğini söyleyen 503 döner; sunucu iletisi (dosya yolu) cevaba girmez.
test('veritabanı 53100 (disk dolu) 503 ve "bilgi işleme haber verin" iletisiyle döner, sunucu iletisi sızmaz', async () => {
  const app = Fastify();
  hataYonetiminiKur(app);
  app.post('/yaz', async () => {
    throw vtHatasi('53100', 'could not extend file "base/16384/gizli_dosya": No space left on device');
  });
  const cevap = await app.inject({ method: 'POST', url: '/yaz' });
  assert.equal(cevap.statusCode, 503);
  assert.equal(cevap.json().kod, 'VERITABANI_YOK');
  assert.equal(cevap.json().mesaj, 'Sunucu diski dolu, bilgi işleme haber verin.');
  assert.equal(cevap.body.includes('gizli_dosya'), false);
});
