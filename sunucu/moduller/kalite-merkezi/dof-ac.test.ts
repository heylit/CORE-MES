import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { dofAc, dofDurumlari } from './disari.ts';
import type { DofAcIstegi } from './disari.ts';
import * as servis from './servis.ts';

// T4 (155 a): DÖF'ün tek sahibi Kalite Merkezi'dir; denetim hazırlığı bulgusundan DÖF'ü buradan açar ve durumunu buradan okur.
describe('Kalite Merkezi DÖF açma ve durumu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (kaynakAnahtari: string, ek: Partial<DofAcIstegi> = {}): DofAcIstegi =>
    ({ kaynak: 'denetim-hazirlik', kaynakAnahtari, baslik: ' Ölçü kaydı eksik ', madde: '8.5.1', seviye: 'minor', aciklama: null, ...ek });
  const ac = (i: DofAcIstegi) => o().vt.tx((db) => dofAc(db, kisi, i));
  const durumlar = (refler: string[]) => o().vt.tx((db) => dofDurumlari(db, 'denetim-hazirlik', refler));
  const govde = async (kimlik: string) =>
    (await o().sahip.tek<{ govde: Record<string, unknown>; surum: number }>(
      "SELECT govde, surum::int FROM kalite_merkezi_belge WHERE koleksiyon = 'capa' AND kimlik = $1", [kimlik]))!;
  const reddedilir = async (is: Promise<unknown>, kod: string): Promise<void> => {
    await assert.rejects(is, (h: { kod?: string; message?: string }) => {
      assert.equal(h.kod, kod, h.message);
      return true;
    });
  };

  before(async () => {
    ortam = await testVeritabaniKur('km_dof_ac');
    const id = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Denetci', kullaniciAdi: 'denetci', parola: 'dogru-parola-1' }));
    kisi = (await ortam.vt.tx((db) => kullaniciYukle(db, id)))!;
  });
  after(async () => { await ortam?.kaldir(); });

  test('T4 DÖF açma: uygulamanın DÖF biçiminde açık kayıt, kalıptan numara, kaynak bağı; aynı anahtar ikinci DÖF açmaz', async () => {
    const anahtar = 'profil1|denetim7|8.5.1|Ölçü kaydı eksik';
    const ilk = await ac(istek(anahtar, { seviye: 'major', aciklama: ' kumpas ' }));
    assert.equal(ilk.yeni, true);
    assert.equal(ilk.durum, 'Açık');
    assert.match(ilk.kimlik, /^capa-[0-9a-f]{40}$/);
    const m = /^DOF-(\d{4})-(\d{4})$/.exec(ilk.no);
    assert.ok(m, ilk.no);
    const { govde: g } = await govde(ilk.kimlik);
    assert.deepEqual({ ...g, acilis: typeof g.acilis }, {
      no: ilk.no, acilis: 'string', termin: '', baslik: '8.5.1 Ölçü kaydı eksik', sorumlu: '', tur: 'Düzeltici', adim: 0, durum: 'Açık',
      etkinlik: 'Doğrulanmadı', kaynak: 'denetim-hazirlik', kaynakAnahtari: anahtar, kaynakMadde: '8.5.1', kaynakSeviye: 'major', kaynakAciklama: 'kumpas',
    });
    assert.match(String(g.acilis), /^\d{4}-\d{2}-\d{2}$/);

    const ikinci = await ac(istek(anahtar, { baslik: 'başka başlık' }));
    assert.deepEqual(ikinci, { kimlik: ilk.kimlik, no: ilk.no, durum: 'Açık', yeni: false });
    assert.equal((await govde(ilk.kimlik)).govde.baslik, '8.5.1 Ölçü kaydı eksik', 'var olan DÖF değişmez');

    const sonraki = await ac(istek('profil1|denetim7||Gözlem dışı', { madde: null }));
    assert.equal(sonraki.no, `DOF-${m[1]}-${String(Number(m[2]) + 1).padStart(4, '0')}`);
    assert.equal((await govde(sonraki.kimlik)).govde.baslik, 'Ölçü kaydı eksik', 'maddesiz bulguda başlık yalnız metin');
  });

  test('T4 DÖF numarası: uygulamanın açtığı DÖF\'ün numarası doluysa atlanır; uygulamanın kaydı değişmez', async () => {
    const ilk = await ac(istek('audits.a2.b0'));
    const [, yil, sira] = /^DOF-(\d{4})-(\d{4})$/.exec(ilk.no)!;
    const dolu = `DOF-${yil}-${String(Number(sira) + 1).padStart(4, '0')}`;
    await o().vt.tx((db) => servis.yaz(db, kisi, 'capa', 'capa-uygulama1', { no: dolu, durum: 'Açık' }, null));
    assert.equal((await ac(istek('audits.a2.b1'))).no, `DOF-${yil}-${String(Number(sira) + 2).padStart(4, '0')}`);
    assert.equal((await govde('capa-uygulama1')).govde.no, dolu);
  });

  test('T4 DÖF açma reddi: tanınmayan kaynak, boş ya da 200 karakteri aşan anahtar, boş başlık ve tanınmayan seviye 400; kayıt açılmaz', async () => {
    const once = await o().sahip.tek<{ adet: number }>("SELECT count(*)::int AS adet FROM kalite_merkezi_belge WHERE koleksiyon = 'capa'");
    for (const i of [
      istek('r1', { kaynak: 'portal' as 'denetim-hazirlik' }), istek(''), istek('x'.repeat(201)),
      istek('r2', { baslik: '  ' }), istek('r3', { seviye: 'obs' as 'minor' }),
    ]) await reddedilir(ac(i), 'DOGRULAMA');
    const sonra = await o().sahip.tek<{ adet: number }>("SELECT count(*)::int AS adet FROM kalite_merkezi_belge WHERE koleksiyon = 'capa'");
    assert.equal(sonra?.adet, once?.adet);
  });

  test('T4 DÖF durumu: açık ve kapalı DÖF anahtar başına döner, kapanış günüyle; açılmamış ve silinmiş anahtar haritada yok', async () => {
    const acik = await ac(istek('audits.a3.b0'));
    const kapanacak = await ac(istek('audits.a3.b1'));
    const silinecek = await ac(istek('audits.a3.b2'));
    const k = await govde(kapanacak.kimlik);
    await o().vt.tx((db) => servis.onayla(db, kisi, 'capa', kapanacak.kimlik, { ...k.govde, durum: 'Kapalı', adim: 8, kapanis: '2026-10-23' }, k.surum));
    await o().vt.tx(async (db) => servis.sil(db, kisi, 'capa', silinecek.kimlik, (await govde(silinecek.kimlik)).surum));

    const d = await durumlar(['audits.a3.b0', 'audits.a3.b1', 'audits.a3.b2', 'audits.a3.yok', 'boşluklu anahtar']);
    assert.deepEqual([...d.entries()].sort(), [
      ['audits.a3.b0', { kimlik: acik.kimlik, no: acik.no, durum: 'Açık', kapanis: null }],
      ['audits.a3.b1', { kimlik: kapanacak.kimlik, no: kapanacak.no, durum: 'Kapalı', kapanis: '2026-10-23' }],
    ]);
    assert.deepEqual([...(await durumlar([])).entries()], []);

    assert.deepEqual(await ac(istek('audits.a3.b1')), { kimlik: kapanacak.kimlik, no: kapanacak.no, durum: 'Kapalı', yeni: false }, 'kapanmış DÖF yeniden açılmaz, var olan döner');
    const yeniden = await ac(istek('audits.a3.b2'));
    assert.equal(yeniden.yeni, true, 'silinmiş DÖF\'ün anahtarı yeni DÖF açar');
    assert.notEqual(yeniden.no, silinecek.no);
  });

  test('T4 DÖF açma, eşzamanlı: aynı anahtarla 6 açıştan yalnız biri DÖF açar, hepsi aynı DÖF\'ü döner', async () => {
    const sonuclar = await Promise.all(Array.from({ length: 6 }, () => ac(istek('audits.a4.b0'))));
    assert.equal(sonuclar.filter((s) => s.yeni).length, 1);
    assert.equal(new Set(sonuclar.map((s) => `${s.kimlik}|${s.no}`)).size, 1);
  });
});
