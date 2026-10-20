import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';
import { ILETILER } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const YOL = '/roller/:id/islem-degistir';

describe('rol yetkisini ekrandan değiştirme: POST /roller/:id/islem-degistir (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yoneticiCerezi = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  async function girisYap(rolKodu: string): Promise<{ cerez: string; islemler: string[] }> {
    const kullaniciAdi = `d${(sayac += 1)}-${rolKodu.replaceAll('_', '-')}`;
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (yoneticiId === 0) yoneticiId = yeni;
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', islemler: c.json().kullanici.islemler as string[] };
  }
  const degistir = (cerez: string, rol: number, islem: string, verildi: boolean): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api/roller/${rol}/islem-degistir`, headers: { cookie: cerez }, payload: { islem, verildi } });

  before(async () => {
    ortam = await testVeritabaniKur('yetkiduzen');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiCerezi = (await girisYap('yonetici')).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yönetici rolün işlemini verir ve alır; yeni giriş farkı taşır, matris cevabı günceldir, aynı komut ikinci kez sonucu değiştirmez, her komut denetime yazılır', async () => {
    const depo = await rolId('depo');
    const once = await girisYap('depo');
    assert.ok(!once.islemler.includes('finans.oku'));

    for (let i = 0; i < 2; i += 1) {
      const c = await degistir(yoneticiCerezi, depo, 'finans.oku', true);
      assert.equal(c.statusCode, 200, c.body);
      assert.ok((c.json() as RolIslemleriCevabi).roller.find((r) => r.id === depo)?.islemler.includes('finans.oku'));
    }
    assert.ok((await girisYap('depo')).islemler.includes('finans.oku'));

    const al = await degistir(yoneticiCerezi, depo, 'finans.oku', false);
    assert.equal(al.statusCode, 200, al.body);
    assert.ok(!(al.json() as RolIslemleriCevabi).roller.find((r) => r.id === depo)?.islemler.includes('finans.oku'));
    assert.equal((await degistir(yoneticiCerezi, depo, 'finans.oku', false)).statusCode, 200);
    assert.ok(!(await girisYap('depo')).islemler.includes('finans.oku'));

    const kayitlar = await vt().sorgu<{ govde: { islem: string; verildi: boolean } }>(
      'SELECT govde FROM denetim_kaydi WHERE yol = $1 ORDER BY id', [YOL],
    );
    assert.deepEqual(kayitlar.map((k) => k.govde), [
      { islem: 'finans.oku', verildi: true }, { islem: 'finans.oku', verildi: true },
      { islem: 'finans.oku', verildi: false }, { islem: 'finans.oku', verildi: false },
    ]);
  });

  test('bayraklı rol ve kayıtsız işlem 422; olmayan rol 404; satır değişmez', async () => {
    const yonetici = await rolId('yonetici');
    const bayrakli = await degistir(yoneticiCerezi, yonetici, 'stok.geri-al', false);
    assert.deepEqual({ durum: bayrakli.statusCode, mesaj: bayrakli.json().mesaj }, { durum: 422, mesaj: ILETILER.bayrakliMatris });
    const kayitsiz = await degistir(yoneticiCerezi, await rolId('depo'), 'yok.boyle', true);
    assert.deepEqual({ durum: kayitsiz.statusCode, mesaj: kayitsiz.json().mesaj }, { durum: 422, mesaj: ILETILER.islemKayitsiz });
    assert.equal((await degistir(yoneticiCerezi, 2147483000, 'stok.geri-al', true)).statusCode, 404);
    assert.equal((await vt().tek<{ sayi: number }>("SELECT count(*)::int AS sayi FROM rol_islemi WHERE islem = 'yok.boyle'"))?.sayi, 0);
  });

  test('rol yöneten ama bayraksız kişi 403 alır (kendi yetkisini büyütemez); rol yönetmeyen 403, oturumsuz 401', async () => {
    const yonetenId = await vt().tx(async (db) => {
      const r = await db.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('rol_yoneten', 'Rol Yöneten') RETURNING id");
      await db.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'kisiler.rol-yonet'), ($1, 'kisiler.oku')", [r?.id]);
      return r?.id ?? 0;
    });
    const yoneten = await girisYap('rol_yoneten');
    assert.ok(yoneten.islemler.includes('kisiler.rol-yonet'));
    const c = await degistir(yoneten.cerez, yonetenId, 'ayarlar.yaz', true);
    assert.deepEqual({ durum: c.statusCode, mesaj: c.json().mesaj }, { durum: 403, mesaj: ILETILER.matrisYetkisiz });
    assert.equal((await vt().tek<{ sayi: number }>("SELECT count(*)::int AS sayi FROM rol_islemi WHERE islem = 'ayarlar.yaz'"))?.sayi, 0);

    const planlama = await girisYap('planlama_proje');
    assert.equal((await degistir(planlama.cerez, await rolId('depo'), 'stok.sayim', true)).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/roller/1/islem-degistir', payload: { islem: 'stok.sayim', verildi: true } })).statusCode, 401);
  });
});
