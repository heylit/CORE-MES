import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planlamaKaynagi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// 2216-1 a: planlama kaynağı kapalı emirlerden yalnız son 30 günde kapananları, kayıtlı planlama çalışmasının andıklarını ve gelen emrin
// üst emrini gönderir; açık emirlerin hepsi gider. Veriler uydurmadır.
describe('planlama kaynağı kapalı emir süzgeci (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici: Kullanici;
  const no = new Map<string, number>();
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('plan_kaynak_kapali');
    const s = o().sahip;
    const kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Kaynak Deneme', kullaniciAdi: 'kaynak-kapali', parola: 'dogru-parola-1' }));
    yonetici = { id: kisi, ad: 'Kaynak Deneme', islemler: [...ISLEMLER] };
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KK-', 0)");
    const kart = (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kk-1', 'mamul', 'KK-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kk-1', com: { ad: 'Deneme' } }), kisi]))!.no;
    // ad, durum, kapanış (gün önce), üst emir
    const emirler: [string, 'planli' | 'bitti' | 'iptal', number | null, string | null][] = [
      ['acik', 'planli', null, null],
      ['yeni-biten', 'bitti', 5, null],
      ['eski-biten', 'bitti', 90, null],
      ['yeni-iptal', 'iptal', 10, null],
      ['eski-iptal', 'iptal', 120, null],
      ['plandaki-eski', 'bitti', 200, null],
      ['eski-ust', 'bitti', 300, null],
      ['acik-kol', 'planli', null, 'eski-ust'],
    ];
    for (const [ad, durum, gun, ust] of emirler) {
      const an = gun === null ? null : `now() - make_interval(days => ${String(gun)})`;
      const id = (await s.tek<{ id: number }>(
        `INSERT INTO uretim_emri (emir_no, parca_no, parca_ad, adet, malzeme_no, acan_id, durum, baslama, bitis, iptal, saglam_adet, ust_emir_id, bolunme_sira)
         VALUES ($1, 'P', 'Parca', 5, $2, $3, $4,
                 ${durum === 'bitti' ? `${an!} - interval '1 day'` : 'NULL'}, ${durum === 'bitti' ? an! : 'NULL'}, ${durum === 'iptal' ? an! : 'NULL'},
                 ${durum === 'bitti' ? '5' : 'NULL'}, $5, $6) RETURNING id`,
        [`KK-${ad}`, kart, kisi, durum, ust === null ? null : no.get(ust)!, ust === null ? null : 1]))!.id;
      no.set(ad, id);
    }
    const calisma = { surum: 2, D: { siparisler: [{ id: String(no.get('plandaki-eski')) }, { id: `${String(no.get('eski-iptal'))}-Y1` }, { id: 'SP-901' }] } };
    await o().vt.tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: kisi }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('açık, son 30 gün, planın andığı ve üst emir gelir; eski kapalı gelmez', async () => {
    const d = await o().vt.okumaTx((db) => planlamaKaynagi(db, yonetici));
    const gelen = new Set((d.emirler?.orders ?? []).map((x) => x.id));
    const ad = (x: string) => String(no.get(x));
    for (const x of ['acik', 'yeni-biten', 'yeni-iptal', 'plandaki-eski', 'eski-iptal', 'acik-kol', 'eski-ust']) assert.ok(gelen.has(ad(x)), `${x} gelmeli`);
    for (const x of ['eski-biten']) assert.ok(!gelen.has(ad(x)), `${x} gelmemeli`);
    assert.equal(gelen.size, 7);
  });
});
