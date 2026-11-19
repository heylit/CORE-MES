import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MalzemeSecenekleriCevabi, SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { eskiRevizyonReddi } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('3438 a: sipariş kalemi yürürlükteki revizyonla açılır (kural)', () => {
  const r = { kod: 'ORN-MM-00001', etiket: 'R01', yururlukte: false, yururluktekiKodu: 'ORN-MM-00002', yururluktekiEtiketi: 'R02' };
  test('yürürlükte olmayan revizyon gerekçesiz yeni kaleme girmez; gerekçeyle, kayıtlı kalemde ya da ailesiz kartta girer', () => {
    assert.match(eskiRevizyonReddi(r, null, false) ?? '', /ORN-MM-00001 \(R01\) yürürlükteki revizyon değil; yürürlükteki ORN-MM-00002 \(R02\)/);
    assert.notEqual(eskiRevizyonReddi(r, '  ', false), null);
    assert.equal(eskiRevizyonReddi(r, 'Müşteri bu revizyonu istedi', false), null);
    assert.equal(eskiRevizyonReddi(r, null, true), null);
    assert.equal(eskiRevizyonReddi({ ...r, yururlukte: true }, null, false), null);
    assert.equal(eskiRevizyonReddi(null, null, false), null);
  });
});

describe('3438 a: sipariş kalemi ve revizyon ailesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kisiId = 0;
  let musteriId = 0;
  let sayac = 0;
  let anaNo = 0;
  let r2No = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const gonder = (yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  async function kartAc(ad: string, bag: { ana: number; etiket: string; durum: string } | null, revDurumu: string | null): Promise<number> {
    sayac += 1;
    const kimlik = `rev-sip-${sayac}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, ana_kart_no, alt_tur, alt_etiket, rev_durumu)
       VALUES ($1, 'mamul', 'ORN-REV-', $2, 'aktif', $3, $4, $4, $5, $6, $7, $8) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad }, g: { rev: 'R01' } }), kisiId, bag?.ana ?? null, bag === null ? null : 'revizyon', bag?.etiket ?? null, bag?.durum ?? revDurumu],
    ))!.no;
  }
  const kalem = (malzemeNo: number, ek: Record<string, unknown> = {}) => ({ malzemeNo, miktar: '5', birimFiyat: '10', termin: null, aciklama: null, ...ek });
  const govde = (satirlar: unknown[]) => ({
    firmaId: musteriId, musteriSiparisNo: null, siparisTarihi: '2026-11-19', termin: '2026-12-15', kdvOrani: '20', odemeKosulu: null, aciklama: null, satirlar,
  });

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_revizyon');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme revizyon', kullaniciAdi: 'rev-siparis', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'rev-siparis', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-REV-', 0) ON CONFLICT (onek) DO NOTHING");
    const f = await gonder('/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Firma Revizyon', tur: 'musteri' });
    assert.equal(f.statusCode, 200, f.body);
    musteriId = f.json<{ firma: { id: number } }>().firma.id;
    // Ana kart R01 eskiye düştü, alt kart R02 yürürlükte.
    anaNo = await kartAc('ORN Revizyonlu mil', null, 'eski');
    r2No = await kartAc('ORN Revizyonlu mil', { ana: anaNo, etiket: 'R02', durum: 'yururlukte' }, null);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yürürlükteki revizyonla açılır; eski revizyon gerekçesiz 400 alanıyla, gerekçeyle açılır ve gerekçe okunur', async () => {
    const ret = await gonder('/siparisler/ekle', govde([kalem(anaNo)]));
    assert.equal(ret.statusCode, 400, ret.body);
    assert.match(ret.body, /satirlar\.0\.eskiRevizyonGerekcesi/);
    assert.match(ret.body, /yürürlükteki revizyon değil/);

    const yeni = await gonder('/siparisler/ekle', govde([kalem(r2No, { eskiRevizyonGerekcesi: 'unutulan eski metin' })]));
    assert.equal(yeni.statusCode, 200, yeni.body);
    const y = yeni.json<SiparisAyrintisi>().satirlar[0];
    assert.deepEqual([y?.revizyon?.etiket, y?.revizyon?.yururlukte, y?.eskiRevizyonGerekcesi], ['R02', true, null], 'yürürlükteki kartta gerekçe saklanmaz');

    const eski = await gonder('/siparisler/ekle', govde([kalem(anaNo, { eskiRevizyonGerekcesi: 'Müşteri R01 istedi' })]));
    assert.equal(eski.statusCode, 200, eski.body);
    const s = eski.json<SiparisAyrintisi>();
    assert.deepEqual(
      [s.satirlar[0]?.revizyon?.yururlukte, s.satirlar[0]?.revizyon?.yururluktekiNo, s.satirlar[0]?.eskiRevizyonGerekcesi],
      [false, r2No, 'Müşteri R01 istedi'],
    );

    // Kayıtlı kalem kartı değişmeden düzenlenince gerekçe yeniden istenmez.
    const duz = await gonder(`/siparisler/${s.id}/guncelle`, { ...govde([kalem(anaNo, { id: s.satirlar[0]?.id, miktar: '7' })]), surum: s.surum });
    assert.equal(duz.statusCode, 200, duz.body);
  });

  test('kart arama yürürlükteki revizyonu önce verir; eski revizyon işaretli gelir', async () => {
    const c = await oku(`/siparisler/malzeme-secenekleri?ara=${encodeURIComponent('ORN Revizyonlu')}`);
    assert.equal(c.statusCode, 200, c.body);
    const l = c.json<MalzemeSecenekleriCevabi>().satirlar.filter((m) => m.no === anaNo || m.no === r2No);
    assert.deepEqual(l.map((m) => [m.no, m.revizyon?.yururlukte]), [[r2No, true], [anaNo, false]]);
  });
});
