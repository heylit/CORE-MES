import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import * as servis from './servis.ts';

// K2 a (kart 1779e, KM-1..4): kalite kararı, kapanış koşulu, numara, parça, muayeneci ve değişiklik izi sunucuda yeniden denetlenir;
// istemcinin hesabına güvenilmez. Kurallar ekranın kurallarıyla aynıdır (eşitliği kurallar.test.ts korur).
describe('Kalite Merkezi kayıt içeriği denetimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici: Kullanici;
  let kaliteci: Kullanici;
  let muayeneci: Kullanici;
  let parcaKodu = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yaz = (k: Kullanici, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    o().vt.tx((db) => servis.yaz(db, k, koleksiyon, kimlik, govde, surum));
  const onayla = (k: Kullanici, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    o().vt.tx((db) => servis.onayla(db, k, koleksiyon, kimlik, govde, surum));
  const govde = async (koleksiyon: string, kimlik: string) =>
    (await o().sahip.tek<{ govde: Record<string, unknown> }>('SELECT govde FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND kimlik = $2', [koleksiyon, kimlik]))?.govde ?? null;
  const reddedilir = async (is: Promise<unknown>, kod: string, alan?: string): Promise<void> => {
    await assert.rejects(is, (h: { kod?: string; alan?: string; message?: string }) => {
      assert.equal(h.kod, kod, h.message);
      if (alan !== undefined) assert.equal(h.alan, alan, h.message);
      return true;
    });
  };
  const bugun = (): string => tesisGunu(Date.now());
  const yarin = (): string => new Date(Date.parse(`${bugun()}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const kar = (olcum: string, sonuc?: string) => ({ ad: 'Çap', nominal: '10', alt: '0.1', ust: '0.1', olcum, ...(sonuc === undefined ? {} : { sonuc }) });
  const plan = { N: 500, seviye: 'II', kr: '0.65', mj: '1.0', mn: '2.5', siddet: 'Normal', bKr: 0, bMn: 0 };

  before(async () => {
    ortam = await testVeritabaniKur('km_icerik_denetimi');
    const kisi = async (kullaniciAdi: string, rolKodu: string | null, ek: string[] = []): Promise<Kullanici> => {
      const id = await o().vt.tx(async (db) => {
        const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
        if (rolKodu !== null) {
          const rol = async (kod: string) => (await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
          await rolAta(db, yonetici.id, yeni, await rol(rolKodu));
          await rolAl(db, yonetici.id, yeni, await rol('yonetici'));
          for (const islem of ek) await db.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $3)', [yeni, islem, yonetici.id]);
        }
        return yeni;
      });
      return (await o().vt.tx((db) => kullaniciYukle(db, id)))!;
    };
    yonetici = await kisi('icd-yonetici', null);
    kaliteci = await kisi('icd-kalite', 'kalite');
    muayeneci = await kisi('icd-muayeneci', 'operator', ['kalite-merkezi.oku', 'kalite-merkezi.yaz']);
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ICD-DNM-', 1) ON CONFLICT (onek) DO NOTHING");
    parcaKodu = (await o().sahip.tek<{ kod: string }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('icd-dnm-1', 'yarimamul', 'ICD-DNM-', 1, 'aktif', $1, $2, $2) RETURNING stok_kodu AS kod`,
      [JSON.stringify({ id: 'icd-dnm-1', com: { ad: 'Deneme parça' } }), yonetici.id],
    ))!.kod;
  });
  after(async () => { await ortam?.kaldir(); });

  test('KM-1 lot kararı: karar plandan ve bulunan sayılardan yeniden hesaplanır; uymayan karar, lot büyüklüğü, sayı ve plan 400', async () => {
    await reddedilir(yaz(kaliteci, 'lot', 'lot_c1', { no: 'LOT-C1', ...plan, bMj: 2, karar: 'Kabul' }), 'DOGRULAMA', 'karar');
    await reddedilir(yaz(kaliteci, 'lot', 'lot_c1', { no: 'LOT-C1', ...plan, N: 1, bMj: 0, karar: 'Kabul' }), 'DOGRULAMA', 'N');
    await reddedilir(yaz(kaliteci, 'lot', 'lot_c1', { no: 'LOT-C1', ...plan, N: 20, bMj: 21, karar: 'Ret' }), 'DOGRULAMA', 'bMj');
    await reddedilir(yaz(kaliteci, 'lot', 'lot_c1', { no: 'LOT-C1', ...plan, bMj: -1, karar: 'Kabul' }), 'DOGRULAMA', 'bMj');
    await reddedilir(yaz(kaliteci, 'lot', 'lot_c1', { no: 'LOT-C1', ...plan, siddet: 'Gevşek', bMj: 0, karar: 'Kabul' }), 'DOGRULAMA', 'siddet');
    await reddedilir(yaz(kaliteci, 'lot', 'lot_c1', { no: 'LOT-C1', ...plan, bMj: 0, karar: 'Kabul', plan: { Majör: { n: 2, ac: 5, re: 6 } } }), 'DOGRULAMA', 'plan');
    assert.equal(await govde('lot', 'lot_c1'), null, 'reddedilen lot yazılmaz');
    await yaz(kaliteci, 'lot', 'lot_c1', { no: 'LOT-C1', ...plan, bMj: 2, karar: 'Ret' });
    await yaz(kaliteci, 'lot', 'lot_c2', { no: 'LOT-C2', N: '', karar: '' });
  });

  test('KM-1 muayene: satır sonucu ölçüm ve toleransa, genel sonuç satırlara ve belge kontrolüne uyar; miktar ve numune tutarlı', async () => {
    await reddedilir(yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', chars: [kar('10.5', 'OK')], sonuc: 'Ret' }), 'DOGRULAMA', 'chars');
    await reddedilir(yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', chars: [kar('10.5', 'NOK')], sonuc: 'Kabul' }), 'DOGRULAMA', 'sonuc');
    await reddedilir(yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', tur: 'Giriş', chars: [kar('10', 'OK')], gchk: [0], sonuc: 'Kabul' }), 'DOGRULAMA', 'sonuc');
    await reddedilir(yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', chars: [], sonuc: 'Kabul' }), 'DOGRULAMA', 'sonuc');
    await reddedilir(yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', miktar: '-5' }), 'DOGRULAMA', 'miktar');
    await reddedilir(yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', miktar: '5', numune: '8' }), 'DOGRULAMA', 'numune');
    await reddedilir(yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', tarih: yarin() }), 'DOGRULAMA', 'tarih');
    assert.equal(await govde('insp', 'insp_c1'), null);
    await yaz(kaliteci, 'insp', 'insp_c1', { no: 'MUA-C1', tur: 'Giriş', tarih: bugun(), miktar: '5', numune: '5', chars: [kar('10', 'OK')], gchk: [0], sonuc: 'Beklemede' });
    await yaz(kaliteci, 'insp', 'insp_c2', { no: 'MUA-C2', chars: [kar('10.05', 'OK'), kar('')], sonuc: 'Devam ediyor' });
  });

  test('KM-1 eski kayıt: tarih değişmeden ileri tarihli eski kayıt düzenlenir; yalnız arşiv bayrağı içeriğe bakılmadan yazılır', async () => {
    const eski = (await o().sahip.tek<{ surum: string }>(
      `INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ('ncr', 'ncr_eski', $1, $2) RETURNING surum`,
      [JSON.stringify({ no: 'NCR-ESKI', tarih: '2099-01-01', durum: 'Açık' }), yonetici.id],
    ))!;
    const r = await yaz(kaliteci, 'ncr', 'ncr_eski', { no: 'NCR-ESKI', tarih: '2099-01-01', durum: 'Açık', not: 'ek' }, Number(eski.surum));
    await yaz(yonetici, 'ncr', 'ncr_eski', { no: 'NCR-ESKI', tarih: '2099-01-01', durum: 'Açık', not: 'ek', arsiv: true }, r.surum);
  });

  test('KM-2 numara: aynı koleksiyonda başka kayıtta olan numara 400; kaydın kendi numarası ve lot yeniden başlatması tekrar yazılır', async () => {
    const n = await yaz(kaliteci, 'ncr', 'ncr_n1', { no: 'NCR-N1', durum: 'Açık' });
    await reddedilir(yaz(kaliteci, 'ncr', 'ncr_n2', { no: ' NCR-N1 ', durum: 'Açık' }), 'DOGRULAMA', 'no');
    await yaz(kaliteci, 'capa', 'capa_n1', { no: 'NCR-N1', durum: 'Açık' });
    await yaz(kaliteci, 'ncr', 'ncr_n1', { no: 'NCR-N1', durum: 'Açık', not: 'ek' }, n.surum);
    await yaz(kaliteci, 'lot', 'lot_r1', { no: 'RESET-X', tip: 'reset', anahtar: 'A|IC' });
    await yaz(kaliteci, 'lot', 'lot_r2', { no: 'RESET-X', tip: 'reset', anahtar: 'B|IC' });
  });

  test('KM-2 parça: muayene ve lotta parça no Malzemeler\'de olmalı (harf ve boşluk farkı yok sayılır)', async () => {
    await reddedilir(yaz(kaliteci, 'insp', 'insp_p1', { no: 'MUA-P1', parcaNo: 'YOK-00001' }), 'DOGRULAMA', 'parcaNo');
    await reddedilir(yaz(kaliteci, 'lot', 'lot_p1', { no: 'LOT-P1', parcaNo: 'YOK-00001' }), 'DOGRULAMA', 'parcaNo');
    await yaz(kaliteci, 'insp', 'insp_p1', { no: 'MUA-P1', parcaNo: ` ${parcaKodu.toLowerCase()} ` });
    await yaz(kaliteci, 'ncr', 'ncr_p1', { no: 'NCR-P1', parcaNo: 'SERBEST-METIN' });
  });

  test('KM-2 muayeneci: oturumdaki kişidir; başkası adına yalnız yönetici yazar', async () => {
    await reddedilir(yaz(kaliteci, 'insp', 'insp_m1', { no: 'MUA-M1', muayeneci: 'Başka Kişi' }), 'DOGRULAMA', 'muayeneci');
    await reddedilir(yaz(muayeneci, 'lot', 'lot_m1', { no: 'LOT-M1', muayeneci: 'Başka Kişi' }), 'DOGRULAMA', 'muayeneci');
    await yaz(kaliteci, 'insp', 'insp_m1', { no: 'MUA-M1', muayeneci: kaliteci.ad });
    await yaz(yonetici, 'insp', 'insp_m2', { no: 'MUA-M2', muayeneci: 'Başka Kişi' });
  });

  test('KM-3 değişiklik izi: kişi, rol ve zaman sunucudan; işlem ve kayıt ekranın listesinden; kilit açma onay, arşivleme yönetici ister', async () => {
    const once = Date.now();
    await yaz(muayeneci, 'iz', 'iz_c1', { islem: 'değişiklik', col: 'ncr', id: 'ncr_n1', kim: 'Sahte', rol: 'Kalite yöneticisi', t: '2020-01-01T00:00:00.000Z' });
    const g = (await govde('iz', 'iz_c1'))!;
    assert.deepEqual([g['kim'], g['rol'], g['islem'], g['col'], g['id']], [muayeneci.ad, 'Muayeneci', 'değişiklik', 'ncr', 'ncr_n1']);
    assert.ok(Date.parse(String(g['t'])) >= once - 1000, String(g['t']));
    await yaz(kaliteci, 'iz', 'iz_c2', { islem: 'kilit açma', col: 'insp', id: 'insp_c1' });
    assert.equal((await govde('iz', 'iz_c2'))?.['rol'], 'Kalite mühendisi');
    await yaz(yonetici, 'iz', 'iz_c3', { islem: 'arşivleme', col: 'ncr', id: 'ncr_n1' });
    assert.equal((await govde('iz', 'iz_c3'))?.['rol'], 'Kalite yöneticisi');
    await reddedilir(yaz(kaliteci, 'iz', 'iz_c4', { islem: 'sahte', col: 'ncr', id: 'ncr_n1' }), 'DOGRULAMA', 'islem');
    await reddedilir(yaz(kaliteci, 'iz', 'iz_c4', { islem: 'oluşturma', col: 'iz', id: 'iz_c1' }), 'DOGRULAMA', 'col');
    await reddedilir(yaz(kaliteci, 'iz', 'iz_c4', { islem: 'oluşturma', col: 'ncr' }), 'DOGRULAMA', 'id');
    await reddedilir(yaz(muayeneci, 'iz', 'iz_c4', { islem: 'kilit açma', col: 'ncr', id: 'ncr_n1' }), 'DOGRULAMA', 'islem');
    await reddedilir(yaz(kaliteci, 'iz', 'iz_c4', { islem: 'arşivleme', col: 'ncr', id: 'ncr_n1' }), 'DOGRULAMA', 'islem');
    assert.equal(await govde('iz', 'iz_c4'), null);
  });

  test('KM-4 kapanış: DÖF etkinlik, kök neden ve son adım; NCR MRB kararı, müşteri onaylı kararda onay referansı ister; termin açılıştan önce olamaz', async () => {
    const d = await yaz(kaliteci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Açık', adim: 8, acilis: '2026-01-10' });
    await reddedilir(yaz(kaliteci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Açık', adim: 8, acilis: '2026-01-10', termin: '2026-01-09' }, d.surum), 'DOGRULAMA', 'termin');
    await reddedilir(onayla(kaliteci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Kapalı', adim: 7, etkinlik: 'Etkin', kokNeden: 'x' }, d.surum), 'DOGRULAMA', 'adim');
    await reddedilir(onayla(kaliteci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Kapalı', adim: 8, etkinlik: 'Etkin değil', kokNeden: 'x' }, d.surum), 'DOGRULAMA', 'etkinlik');
    await reddedilir(onayla(kaliteci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Kapalı', adim: 8, etkinlik: 'Etkin', kokNeden: ' ' }, d.surum), 'DOGRULAMA', 'kokNeden');
    await onayla(kaliteci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Kapalı', adim: 8, etkinlik: 'Etkin', kokNeden: 'Bağlama' }, d.surum);

    const n = await yaz(kaliteci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Açık', mrb: 'Karar bekliyor' });
    await reddedilir(onayla(kaliteci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Kapalı', mrb: 'Karar bekliyor' }, n.surum), 'DOGRULAMA', 'mrb');
    await reddedilir(onayla(kaliteci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Kapalı', mrb: 'Tamir (müşteri onaylı)' }, n.surum), 'DOGRULAMA', 'mrbGerekce');
    await reddedilir(onayla(kaliteci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Açık', mrb: 'Olduğu gibi kullan (müşteri onaylı)' }, n.surum), 'DOGRULAMA', 'mrbGerekce');
    await onayla(kaliteci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Kapalı', mrb: 'Tamir (müşteri onaylı)', mrbGerekce: 'Müşteri onayı MO-1' }, n.surum);
  });

  test('KM-1 lot sıkılığı: son beş lotta iki ret sıkılaştırır; sıkılaştırılmış parçada normal sıkılıkla karar 400, sıkı karar yazılır', async () => {
    const lot = (i: number, bMj: number, karar: string, siddet = 'Normal') =>
      ({ no: `LOT-S${i}`, tarih: `2026-02-0${i}`, parcaNo: parcaKodu, anahtar: `${parcaKodu}|IC`, ...plan, siddet, bMj, karar });
    await yaz(kaliteci, 'lot', 'lot_s1', lot(1, 2, 'Ret'));
    await yaz(kaliteci, 'lot', 'lot_s2', lot(2, 2, 'Ret'));
    await reddedilir(yaz(kaliteci, 'lot', 'lot_s3', lot(3, 0, 'Kabul')), 'DOGRULAMA', 'siddet');
    await yaz(kaliteci, 'lot', 'lot_s3', lot(3, 0, 'Kabul', 'Sıkılaştırılmış'));
  });
});
