import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { isEmriDugumleri, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';

// 1476-E: rota adımına giden bağ (düğüm malzemesi, rotadaki op numarası, patlatma) dışarıya düğüm başına okunur; tek katmanlı iş emri haritada yoktur.
describe('uretim-emirleri: iş emri düğümü okuması (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let planlama: Kullanici;
  let tipId = 0;
  let projeId = 0;
  let sayac = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function kartKur(): Promise<number> {
    sayac += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DG-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'DG-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`dg-dnm-${sayac}`, sayac, JSON.stringify({ id: `dg-dnm-${sayac}`, com: { ad: `Deneme mamul ${sayac}` } }), yoneticiId],
    );
    return r!.no;
  }
  const revizyonKur = async (malzemeNo: number, harf: string): Promise<number> => (await o().sahip.tek<{ id: number }>(
    "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id",
    [malzemeNo, yoneticiId, harf]))!.id;
  const adim = (sira: number, opNo: number, ek: Partial<IsEmriGirdisi> = {}): IsEmriGirdisi => ({
    sira, opNo, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1', terminGun: null,
    bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], ...ek,
  });

  before(async () => {
    ortam = await testVeritabaniKur('uretim_dugum_okuma');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    planlama = (await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Planlama', kullaniciAdi: 'planlama', parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return kullaniciYukle(db, yeni);
    }))!;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.DUGUM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('DG-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('çok katmanlı emirde düğüm, düğüm malzemesi, kaynak_op_no ve patlatma döner; tek katmanlı iş emri ve boş liste haritada yoktur', async () => {
    const kok = await kartKur();
    const alt = await kartKur();
    const kokRev = await revizyonKur(kok, 'DA');
    const patlatmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO rota_patlatma (kok_malzeme_id, kok_rota_revizyonu_id, ozet, kisi_id) VALUES ($1, $2, 'deneme', $3) RETURNING id", [kok, kokRev, yoneticiId]))!.id;
    const cok = await o().vt.tx((db) => uretimEmriAc(db, planlama, {
      malzemeNo: kok, adet: 2, teslim: null, kaynakRotaRevizyonId: kokRev, taslak: true, projeId, patlatmaId,
      isEmirleri: [
        adim(1, 1010, { dugum: { ad: '0.1', malzemeNo: alt, kaynakOpNo: 10, birimCarpani: '2' } }),
        adim(2, 10, { dugum: { ad: '0', malzemeNo: kok, kaynakOpNo: 10, birimCarpani: '1' } }),
      ],
    }));
    const tek = await o().vt.tx((db) => uretimEmriAc(db, planlama, {
      malzemeNo: kok, adet: 2, teslim: null, kaynakRotaRevizyonId: kokRev, taslak: true, projeId, isEmirleri: [adim(1, 10)],
    }));
    const [altAdim, kokAdim] = cok.isEmriIdleri as [number, number];
    const harita = await o().vt.tx((db) => isEmriDugumleri(db, [...cok.isEmriIdleri, ...tek.isEmriIdleri, altAdim]));
    assert.deepEqual([...harita.values()].sort((a, b) => a.isEmriId - b.isEmriId), [
      { isEmriId: altAdim, dugum: '0.1', dugumMalzemeNo: alt, kaynakOpNo: 10, patlatmaId },
      { isEmriId: kokAdim, dugum: '0', dugumMalzemeNo: kok, kaynakOpNo: 10, patlatmaId },
    ].sort((a, b) => a.isEmriId - b.isEmriId));
    assert.equal(harita.has(tek.isEmriIdleri[0]!), false);
    assert.equal((await o().vt.tx((db) => isEmriDugumleri(db, []))).size, 0);
  });
});
