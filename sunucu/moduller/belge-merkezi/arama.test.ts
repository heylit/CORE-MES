import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { aramaSade, basDeseni, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import type { BelgeAyrintisi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kayitAramaKaynaklari } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2500)]);

describe('çizim merkezi genel arama kaynağı (kart 1240, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let operator = '';
  let operatorIslemleri: readonly string[] = [];
  const [kaynak] = kayitAramaKaynaklari;
  // Çekirdeğin kaynağa verdiği istek: desenler kaçırılmış.
  const cizimAra = (q: string, sinir: number): Promise<readonly KayitAramaSonucu[]> => vt().tx((db) => kaynak!.ara(db, {
    q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: 1, islemler: [] },
  }));
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const gonder = (yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });

  // Belge açılır (taslak A); yayinla verilirse A yayına alınır, resimNo verilirse belgeye yazılır.
  async function belge(ad: string, o: { yayinla?: boolean; resimNo?: string; tur?: string } = {}): Promise<BelgeAyrintisi> {
    const icerik = pdf();
    const ozet = createHash('sha256').update(icerik).digest('hex');
    const p = await app.inject({
      method: 'POST', url: `/api/dosyalar/${ozet}/parca`, headers: { cookie: cerez }, payload: { sira: 0, toplam: 1, veri: icerik.toString('base64') },
    });
    assert.equal(p.statusCode, 200, p.body);
    let c = await gonder('/cizimler', { ad, tur: o.tur ?? 'teknik-resim', ozet, dosyaAdi: 'deneme.pdf', ...(o.resimNo ? { resimNo: o.resimNo } : {}) });
    assert.equal(c.statusCode, 200, c.body);
    let b = c.json<BelgeAyrintisi>();
    if (o.yayinla !== false) {
      c = await gonder(`/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
      assert.equal(c.statusCode, 200, c.body);
      b = c.json<BelgeAyrintisi>();
    }
    return b;
  }

  before(async () => {
    ortam = await testVeritabaniKur('cizimara');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx(async (db) => {
      const yonetici = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'cz-ara', parola: PAROLA });
      const op = await yoneticiOlustur(db, { ad: 'Deneme Operatör', kullaniciAdi: 'cz-ara-op', parola: PAROLA });
      const rol = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
      const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAta(db, yonetici, op, rol?.id ?? 0);
      await rolAl(db, yonetici, op, yon?.id ?? 0);
    });
    const giris = async (kullaniciAdi: string): Promise<string> => {
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
      return String(g.headers['set-cookie']).split(';')[0] ?? '';
    };
    cerez = await giris('cz-ara');
    operator = await giris('cz-ara-op');
    operatorIslemleri = (await app.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: operator } })).json<{ kullanici: { islemler: string[] } }>().kullanici.islemler;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('adda ya da resim numarasında geçen yayındaki belge belgenin sayfasına giden sonuç olur; tam resim no önce gelir', async () => {
    const flans = await belge('Deneme flanş kapağı', { resimNo: 'TR-ARA-100' });
    const kapak = await belge('Deneme kapak TR-ARA-1', { resimNo: 'TR-ARA-1', tur: 'sertifika' });
    const sonuc = await cizimAra('tr-ara-1', 5);
    assert.deepEqual(sonuc.map((s) => s.anahtar), [String(kapak.id), String(flans.id)]);
    assert.deepEqual(sonuc[0], {
      anahtar: String(kapak.id), baslik: 'TR-ARA-1 Deneme kapak TR-ARA-1', aciklama: 'Sertifika · Rev A', yol: `/cizimler/belge/${kapak.id}`,
    });
    assert.deepEqual((await cizimAra('FLANŞ KAPA', 5)).map((s) => s.anahtar), [String(flans.id)]);
    // Türkçe harf dil ayarına bırakılmaz: büyük İ/I ve ı/i, Ş/ş aynı sadeleşmeden geçer.
    const isik = await belge('Deneme IŞIK SİPERİ', { resimNo: 'TR-İŞ-7' });
    for (const q of ['ışık siperi', 'isik', 'tr-iş-7', 'TR-IS-7']) {
      assert.deepEqual((await cizimAra(q, 5)).map((s) => s.anahtar), [String(isik.id)], q);
    }
  });

  test('reddedilen: yalnız taslağı olan ve arşivdeki belge bulunmaz; joker karakter düz metindir; sınır uygulanır', async () => {
    await belge('Deneme taslak gizli', { yayinla: false });
    const arsiv = await belge('Deneme arşiv gizli');
    const c = await gonder(`/cizimler/${arsiv.id}/arsivle`, { surum: arsiv.surum });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(await cizimAra('gizli', 5), []);
    assert.deepEqual(await cizimAra('%', 5), []);
    assert.deepEqual(await cizimAra('__', 5), []);
    for (let i = 0; i < 3; i += 1) await belge(`Deneme sınır ${i}`);
    assert.equal((await cizimAra('sınır', 2)).length, 2);
  });

  test('izinli ve reddedilen: kaynağın yetkisi okuma uçlarıyla aynı; işlemi olmayan kişi (operatör) kaynağa ulaşmaz', async () => {
    assert.equal(kaynak?.tur, 'cizim');
    assert.deepEqual(kaynak?.yetki, ['sayfa.cizimler', 'belge-merkezi.oku']);
    const okur = (c: string) => app.inject({ method: 'GET', url: '/api/cizimler', headers: { cookie: c } });
    assert.equal((await okur(cerez)).statusCode, 200);
    assert.equal((await okur(operator)).statusCode, 403);
    assert.ok(operatorIslemleri.length > 0);
    assert.equal(kaynak?.yetki.some((i) => operatorIslemleri.includes(i)), false);
  });

  test('arama sütunlarında trigram indeksi var', async () => {
    // Tanım süzgeci SQL'de değil burada: SQL'de planlayıcı pg_get_indexdef'i şema süzgecinden önce, aynı veritabanındaki
    // bütün test şemalarının dizinleri için çağırıyor; eşzamanlı dosyanın sildiği dizinde "could not open relation" ile düşüyordu.
    const satirlar = await vt().sorgu<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'belge_merkezi_belge' ORDER BY indexname",
    );
    assert.deepEqual(satirlar.filter((s) => s.indexdef.includes('gin_trgm_ops')).map((s) => s.indexname), ['belge_merkezi_belge_ad_trgm', 'belge_merkezi_belge_resim_no_trgm']);
  });
});
