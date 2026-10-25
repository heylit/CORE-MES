import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { tedarikTerminleri } from '../satin-alma/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { gerekenTarihler } from './kurallar.ts';
import { yaz } from './servis.ts';

// 533 a: plan malzemenin olması gereken tarihini hesaplar ve kaydedilince Satın Alma'ya bildirir. Veriler uydurmadır.
const calisma = (malzemeKodu: string, plan: unknown) => ({
  surum: 2, dataVer: 1, plan,
  D: {
    meta: { baslangic: '2026-10-19' },
    malzemeler: [{ kod: malzemeKodu, muayeneGun: 1 }],
    siparisler: [
      { id: 'E-1', urun: 'U1', adet: 2, malzeme: [{ kod: malzemeKodu, miktar: 1 }] },
      { id: 'E-2', urun: 'U1', adet: 1, malzeme: [{ kod: malzemeKodu, miktar: 1 }] },
      { id: 'E-3', urun: 'U1', adet: 1, havuz: true, malzeme: [{ kod: 'H9', miktar: 1 }] },
    ],
  },
});
const PLAN = { dataVer: 1, ops: {
  'E-1.10': { job: 'E-1', S: 4 * 24 + 8, C: 4 * 24 + 10 }, 'E-1.20': { job: 'E-1', S: 2 * 24 + 8, C: 2 * 24 + 9, done: 1 },
  'E-2.10': { job: 'E-2', S: 3 * 24 + 13, C: 3 * 24 + 15 }, 'E-3.10': { job: 'E-3', S: 1, C: 2 },
} };

describe('olması gereken tarih', () => {
  test('ilk işin başlangıcı eksi muayene, planın günü; bitmiş işlem ve havuz sayılmaz; plan yoksa boş', () => {
    // E-2 22 Ekim 13:00'te başlar, bir gün muayene: 21 Ekim
    assert.deepEqual(gerekenTarihler(calisma('60', PLAN)), [{ kod: '60', gerekenTarih: '2026-10-21' }]);
    assert.deepEqual(gerekenTarihler(calisma('60', null)), []);
    assert.deepEqual(gerekenTarihler({ D: {} }), []);
  });

  describe('kaydedilince Satın Alma\'ya (gerçek PostgreSQL)', () => {
    let ortam: TestVeritabani | undefined;
    let kullanici: Kullanici;
    let no = 0;
    const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
    before(async () => {
      ortam = await testVeritabaniKur('recete_rota_gereken_tarih');
      const id = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
      kullanici = { id, ad: 'Deneme Yonetici', islemler: [...ISLEMLER] };
      await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('GT-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
      const r = await ortam.sahip.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ('gt-dnm-1', 'hammadde', 'GT-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
        [JSON.stringify({ id: 'gt-dnm-1', com: { ad: 'Deneme cubuk' } }), id],
      );
      no = r?.no ?? 0;
    });
    after(async () => { await ortam?.kaldir(); });
    const kaydet = (deger: object, beklenenSurum: number | null) =>
      vt().tx((db) => yaz(db, kullanici, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, beklenenSurum }));
    const gereken = async () => (await vt().tx((db) => tedarikTerminleri(db, [no]))).get(no)?.gerekenTarih ?? null;

    test('plan kaydı tarihi yazar; katalogda olmayan kod atlanır; plan malzemeyi istemeyince tarih boşalır', async () => {
      const k1 = await kaydet({ ...calisma(String(no), PLAN), D: { ...calisma(String(no), PLAN).D, siparisler: [...calisma(String(no), PLAN).D.siparisler, { id: 'E-4', urun: 'U1', adet: 1, malzeme: [{ kod: '999999', miktar: 1 }] }] } }, null);
      assert.equal(await gereken(), '2026-10-21');
      await kaydet(calisma(String(no), null), k1.kayit.surum);
      assert.equal(await gereken(), null);
    });
  });
});
