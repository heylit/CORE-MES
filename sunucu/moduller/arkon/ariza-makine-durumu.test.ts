import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { arizaMakineGecisi } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

// AR-15 (bulgu 15.6): Arkon Bakım'da açılan arıza makineyi TMI'de arızalı yapar, "Kapat · makine hazır" çalışır yapar.
describe('arkon arıza kaydı makine durumuna yansır', () => {
  test('karar: yeni açık arıza "ariza", açığın kapanması "calisir"; başka yazım, kapalı yeni kayıt ve periyodik bakım değiştirmez', () => {
    const acik = { type: 'ariza', status: 'open', mc: 'MK-1', st: 'IS-1', title: 'Hidrolik kaçak' };
    assert.deepEqual(arizaMakineGecisi('maint', acik, undefined), { durum: 'ariza', makine: 'MK-1', istasyon: 'IS-1', baslik: 'Hidrolik kaçak' });
    assert.equal(arizaMakineGecisi('maint', { ...acik, cause: 'conta' }, acik), null);
    assert.deepEqual(arizaMakineGecisi('maint', { ...acik, status: 'done' }, acik)?.durum, 'calisir');
    assert.equal(arizaMakineGecisi('maint', { ...acik, status: 'done' }, undefined), null);
    assert.equal(arizaMakineGecisi('maint', { ...acik, status: 'done', note: 'x' }, { ...acik, status: 'done' }), null);
    assert.equal(arizaMakineGecisi('maint', { type: 'pm', mc: 'MK-1' }, undefined), null);
    assert.equal(arizaMakineGecisi('pkgs', acik, undefined), null);
    assert.deepEqual(arizaMakineGecisi('maint', { type: 'ariza', status: 'open', mc: '', st: ' ' }, undefined), { durum: 'ariza', makine: null, istasyon: null, baslik: '' });
  });

  describe('gerçek PostgreSQL', () => {
    let ortam: TestVeritabani | undefined;
    let app: FastifyInstance;
    let yonetici = '';
    let yoneticiId = 0;
    let sayac = 0;

    const vt = (): TestVeritabani['vt'] => {
      if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
      return ortam.vt;
    };
    const kod = (onek: string): string => `${onek}-${(sayac += 1)}`;

    async function girisCerezi(kullaniciAdi: string): Promise<string> {
      const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
      assert.equal(cevap.statusCode, 200);
      return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
    }
    async function istek<T = unknown>(cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
      const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
      return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
    }
    async function kisiKur(rol: string[] | string): Promise<string> {
      const kullaniciAdi = kod('amd').replace('-', '');
      const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      const hedef = typeof rol === 'string'
        ? await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol])
        : await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
      if (!yoneticiRolu || !hedef) throw new Error('rol kurulamadı');
      if (typeof rol !== 'string') for (const islem of rol) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [hedef.id, islem]);
      await vt().tx(async (db) => {
        const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
        await rolAta(db, yoneticiId, yeni, hedef.id);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      });
      return girisCerezi(kullaniciAdi);
    }
    async function istasyonKur(makineSayisi = 1): Promise<{ istasyon: string; makineler: { kod: string; id: number }[] }> {
      const im = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: kod('BM'), ad: 'Bakım Merkezi' });
      const ist = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/istasyonlar', { kod: kod('BI'), ad: 'Bakım İstasyonu', isMerkeziId: im.govde.id, tip: 'talasli' });
      const makineler: { kod: string; id: number }[] = [];
      for (let i = 0; i < makineSayisi; i += 1) {
        const mk = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/makineler', { kod: kod('BK'), ad: 'Bakım Makinesi', istasyonId: ist.govde.id });
        assert.equal(mk.durum, 200, JSON.stringify(mk.govde));
        makineler.push({ kod: mk.govde.kod, id: mk.govde.id });
      }
      return { istasyon: ist.govde.kod, makineler };
    }
    const durum = async (makineId: number): Promise<string | null> =>
      (await vt().tek<{ durum: string }>('SELECT durum FROM istasyonlar_makine_durumu WHERE makine_id = $1', [makineId]))?.durum ?? null;
    async function yaz(cerez: string, govde: { id: string } & Record<string, unknown>, taban: number | null = null): Promise<number> {
      const c = await istek<{ sonuc: string; surum: number }>(cerez, 'POST', `/arkon/belgeler/maint/${govde.id}/yaz`, { taban, govde, kaynak: 'amd' });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal(c.govde.sonuc, 'yazildi', JSON.stringify(c.govde));
      return c.govde.surum;
    }

    before(async () => {
      ortam = await testVeritabaniKur('arkonariza');
      app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
      yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
      yonetici = await girisCerezi('yonetici');
    });

    after(async () => {
      await ortam?.kaldir();
    });

    test('bakımcı arıza açınca makine arızalı, kapatınca çalışır olur; plan ve Saat aynı durumu okur', async () => {
      const bakim = await kisiKur('bakim');
      const t = await istasyonKur();
      const mk = t.makineler[0]!;
      const ariza = { id: kod('ar'), type: 'ariza', status: 'open', st: t.istasyon, mc: mk.kod, title: 'Hidrolik kaçak', openedAt: Date.now() };
      const surum = await yaz(bakim, ariza);
      assert.equal(await durum(mk.id), 'ariza');
      const satir = await vt().tek<{ aciklama: string | null }>('SELECT aciklama FROM istasyonlar_makine_durumu WHERE makine_id = $1', [mk.id]);
      assert.equal(satir?.aciklama, 'Arkon Bakım: Hidrolik kaçak');
      const surum2 = await yaz(bakim, { ...ariza, cause: 'Conta' }, surum);
      assert.equal(await durum(mk.id), 'ariza', 'kapanmayan yazım durumu değiştirmez');
      await yaz(bakim, { ...ariza, cause: 'Conta', status: 'done', closedAt: Date.now() }, surum2);
      assert.equal(await durum(mk.id), 'calisir');
    });

    test('makine kodu boşsa istasyonun tek makinesi alınır; iki makineli istasyonda hiçbiri değişmez', async () => {
      const tek = await istasyonKur();
      await yaz(yonetici, { id: kod('ar'), type: 'ariza', status: 'open', st: tek.istasyon, mc: '', title: 'Tek makine' });
      assert.equal(await durum(tek.makineler[0]!.id), 'ariza');
      const cift = await istasyonKur(2);
      await yaz(yonetici, { id: kod('ar'), type: 'ariza', status: 'open', st: cift.istasyon, mc: '', title: 'Hangi makine' });
      for (const m of cift.makineler) assert.equal(await durum(m.id), null);
    });

    test('aynı makinede açık başka arıza varsa ya da makine elle bakıma alındıysa kapanış çalışır yapmaz', async () => {
      const t = await istasyonKur();
      const mk = t.makineler[0]!;
      const a = { id: kod('ar'), type: 'ariza', status: 'open', st: t.istasyon, mc: mk.kod, title: 'Birinci' };
      const b = { id: kod('ar'), type: 'ariza', status: 'open', st: t.istasyon, mc: mk.kod, title: 'İkinci' };
      const sa = await yaz(yonetici, a);
      const sb = await yaz(yonetici, b);
      await yaz(yonetici, { ...a, status: 'done' }, sa);
      assert.equal(await durum(mk.id), 'ariza', 'ikinci arıza hâlâ açık');
      await yaz(yonetici, { ...b, status: 'done' }, sb);
      assert.equal(await durum(mk.id), 'calisir');

      const c = { id: kod('ar'), type: 'ariza', status: 'open', st: t.istasyon, mc: mk.kod, title: 'Üçüncü' };
      const sc = await yaz(yonetici, c);
      const bakimda = await istek(yonetici, 'POST', `/makineler/${mk.id}/durum`, { durum: 'bakim', aciklama: 'Elle' });
      assert.equal(bakimda.durum, 200, JSON.stringify(bakimda.govde));
      await yaz(yonetici, { ...c, status: 'done' }, sc);
      assert.equal(await durum(mk.id), 'bakim');
    });

    test('makine durumu yetkisi olmayan kişinin arıza kaydı yazılır, makine durumu değişmez', async () => {
      const yetkisiz = await kisiKur(['arkon.bakim', 'sayfa.arkon']);
      const t = await istasyonKur();
      await yaz(yetkisiz, { id: kod('ar'), type: 'ariza', status: 'open', st: t.istasyon, mc: t.makineler[0]!.kod, title: 'Yetkisiz' });
      assert.equal(await durum(t.makineler[0]!.id), null);
    });
  });
});
