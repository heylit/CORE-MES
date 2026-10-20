import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Veritabani } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { CEREZ_ADI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

// Gerçek veritabanını sarar: kesikken her çağrı ağ koduyla reddedilir; çağrı sayısı sayılır.
function izlenenVt(asil: Veritabani): { vt: Veritabani; kes: (kesik: boolean) => void; cagri: () => number; sifirla: () => void } {
  let kesik = false;
  let sayi = 0;
  const gec = <T>(is: () => Promise<T>): Promise<T> => {
    sayi += 1;
    return kesik
      ? Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
      : is();
  };
  const vt: Veritabani = {
    sorgu: <T>(sql: string, p?: readonly unknown[]) => gec(() => asil.sorgu<T>(sql, p)),
    tek: <T>(sql: string, p?: readonly unknown[]) => gec(() => asil.tek<T>(sql, p)),
    tx: (is) => gec(() => asil.tx(is)),
    okumaTx: (is) => gec(() => asil.okumaTx(is)),
    kapat: () => asil.kapat(),
  };
  return { vt, kes: (y) => { kesik = y; }, cagri: () => sayi, sifirla: () => { sayi = 0; } };
}

describe('GET /oturum çerezsiz (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let izle: ReturnType<typeof izlenenVt>;
  let gecerliCerez = '';

  before(async () => {
    ortam = await testVeritabaniKur('oturum_cerezsiz');
    izle = izlenenVt(ortam.vt);
    app = await uygulamaKur({ vt: izle.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(izle.vt) });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({
      method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA },
    });
    assert.equal(giris.statusCode, 200);
    gecerliCerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });

  after(async () => {
    await ortam?.kaldir();
  });

  const al = (cerez?: string) =>
    app.inject({ method: 'GET', url: '/api/oturum', ...(cerez === undefined ? {} : { headers: { cookie: cerez } }) });

  test('çerezsiz istek veritabanı erişilemezken de 200 ve null verir, veritabanına çağrı gitmez', async () => {
    izle.kes(true);
    izle.sifirla();
    try {
      const cevap = await al();
      assert.equal(cevap.statusCode, 200);
      assert.equal(cevap.json().kullanici, null);
      assert.equal(izle.cagri(), 0);
    } finally {
      izle.kes(false);
    }
  });

  test('çerezsiz istek veritabanı sağlamken de aynı cevabı verir, çağrı gitmez', async () => {
    izle.sifirla();
    const cevap = await al();
    assert.equal(cevap.statusCode, 200);
    assert.deepEqual(cevap.json(), { kullanici: null });
    assert.equal(izle.cagri(), 0);
  });

  test('geçerli çerez kullanıcıyı döndürür; veritabanı erişilemezken 503 VERITABANI_YOK', async () => {
    const var_ = await al(gecerliCerez);
    assert.equal(var_.statusCode, 200);
    assert.equal(var_.json().kullanici.ad, 'Deneme Yönetici');

    izle.kes(true);
    try {
      const yok = await al(gecerliCerez);
      assert.equal(yok.statusCode, 503);
      assert.equal(yok.json().kod, 'VERITABANI_YOK');
    } finally {
      izle.kes(false);
    }
  });

  test('geçersiz çerez null verir; veritabanı erişilemezken 503', async () => {
    const cevap = await al(`${CEREZ_ADI}=uydurma`);
    assert.equal(cevap.statusCode, 200);
    assert.equal(cevap.json().kullanici, null);

    izle.kes(true);
    try {
      const yok = await al(`${CEREZ_ADI}=uydurma`);
      assert.equal(yok.statusCode, 503);
      assert.equal(yok.json().kod, 'VERITABANI_YOK');
    } finally {
      izle.kes(false);
    }
  });
});
