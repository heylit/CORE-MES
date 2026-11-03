import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { ArkonBenCevabi, ArkonKisilerCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

// 2001 b: istasyona bağlı ekibe üye operatör terminalde istasyonsuz kalıyordu ("Size atanmış istasyon yok"). Ekibin istasyonu
// kişinin yetkili istasyonudur; istasyon ataması yoksa açılış istasyonudur. İstasyonsuz ekip ve kalkan üyelik istasyon vermez.
describe('arkon kişisi ekip istasyonu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let yoneticiId = 0;
  let operatorId = 0;
  let sayac = 0;
  const kod = (onek: string): string => `${onek}-${(sayac += 1)}`;

  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`, headers: cerez ? { cookie: cerez } : {}, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istasyonKur(): Promise<{ kod: string; id: number }> {
    const im = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: kod('EM'), ad: 'Ekip Merkezi' });
    const ist = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/istasyonlar', { kod: kod('EI'), ad: 'Ekip İstasyonu', isMerkeziId: im.govde.id, tip: 'kalite' });
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    return { kod: ist.govde.kod, id: ist.govde.id };
  }

  async function ekipKur(istasyonId: number | null): Promise<number> {
    const ekip = await istek<{ id: number }>(yonetici, 'POST', '/ekipler', { kod: kod('EK'), ad: 'Deneme ekibi', istasyonId });
    assert.equal(ekip.durum, 200, JSON.stringify(ekip.govde));
    return ekip.govde.id;
  }

  const uyeYap = async (ekipId: number, yuzde = '100') => {
    const c = await istek(yonetici, 'POST', `/ekipler/${ekipId}/uyeler/ata`, { kisiId: operatorId, yuzde });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };
  const uyelikKaldir = async (ekipId: number) => {
    const c = await istek(yonetici, 'POST', `/ekipler/${ekipId}/uyeler/${operatorId}/cikar`, {});
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };
  const ben = async () => (await istek<ArkonBenCevabi>(operator, 'GET', '/arkon/ben')).govde.kisi;

  before(async () => {
    ortam = await testVeritabaniKur('arkon_ekip');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const gecici = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_arkon', 'Geçici Arkon') RETURNING id");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!gecici || !yoneticiRolu) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.operator'), ($1, 'sayfa.arkon')", [gecici.id]);
    operatorId = await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme operator1', kullaniciAdi: 'operator1', parola: PAROLA });
      await rolAta(db, yoneticiId, id, gecici.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
    yonetici = await girisCerezi('yonetici');
    operator = await girisCerezi('operator1');
  });

  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('istasyona bağlı ekibin üyesi o istasyonla açılır ve onu yetkili görür; üyelik kalkınca düşer', async () => {
    const ist = await istasyonKur();
    const ekipId = await ekipKur(ist.id);
    assert.deepEqual([(await ben()).istasyon, (await ben()).istasyonlar], [null, []]);
    await uyeYap(ekipId);
    const kisi = await ben();
    assert.deepEqual([kisi.istasyon, kisi.istasyonlar], [ist.kod, [ist.kod]]);
    const liste = (await istek<ArkonKisilerCevabi>(yonetici, 'GET', '/arkon/kisiler')).govde.kisiler;
    assert.deepEqual(liste.find((k) => k.kimlik === String(operatorId))?.istasyonlar, [ist.kod]);
    await uyelikKaldir(ekipId);
    assert.deepEqual([(await ben()).istasyon, (await ben()).istasyonlar], [null, []]);
  });

  test('istasyonsuz ekibin üyeliği istasyon vermez', async () => {
    const ekipId = await ekipKur(null);
    await uyeYap(ekipId);
    try {
      assert.deepEqual([(await ben()).istasyon, (await ben()).istasyonlar], [null, []]);
    } finally {
      await uyelikKaldir(ekipId);
    }
  });

  test('istasyon ataması ekipten önce gelir; ekip istasyonu yetkili listeye eklenir', async () => {
    const atanan = await istasyonKur();
    const ekipIst = await istasyonKur();
    const ekipId = await ekipKur(ekipIst.id);
    assert.equal((await istek(yonetici, 'POST', `/istasyonlar/${atanan.id}/kisiler/ata`, { kisiId: operatorId, yuzde: '50' })).durum, 200);
    await uyeYap(ekipId, '50');
    const kisi = await ben();
    assert.deepEqual([kisi.istasyon, kisi.istasyonlar], [atanan.kod, [atanan.kod, ekipIst.kod].sort((a, b) => a.localeCompare(b))]);
  });
});
