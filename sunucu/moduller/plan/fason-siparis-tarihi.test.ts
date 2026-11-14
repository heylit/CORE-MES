import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { tesisGunBasi } from '#paylasilan/zaman.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { fasonSiparisTarihleri, gelisleriBirlestir } from './planlama-kurallar.ts';
import { planlanacakIsler } from './servis.ts';

describe('plan satın alma gelişleri (3256-2, 3257 a)', () => {
  test('açık sipariş ve onaylı talep gelişleri malzeme başına birleşir, önce siparişler', () => {
    const m = gelisleriBirlestir(new Map([[1, ['s1']], [2, ['s2']]]), new Map([[1, ['t1']], [3, ['t3']]]));
    assert.deepEqual([...m], [[1, ['s1', 't1']], [2, ['s2']], [3, ['t3']]]);
  });
  test('fason iş emrinin en geç sipariş dönüşü esastır; tarihsiz sipariş, talep ve emirsiz satır sayılmaz', () => {
    const m = fasonSiparisTarihleri([
      { isEmriId: 7, asama: 'siparis', termin: '2099-02-01' },
      { isEmriId: 7, asama: 'siparis', termin: '2099-02-05' },
      { isEmriId: 7, asama: 'siparis', termin: '2099-01-20' },
      { isEmriId: 8, asama: 'siparis', termin: null },
      { isEmriId: 9, asama: 'talep', termin: null },
      { isEmriId: null, asama: 'siparis', termin: '2099-02-01' },
    ]);
    assert.deepEqual([...m], [[7, '2099-02-05']]);
  });
});

describe('plan fason siparişi teslim tarihi uçtan uca (3257 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  after(async () => { await ortam?.kaldir(); });

  test('fason adımın açık siparişindeki teslim tarihi sonraki adımın beklemesini verir; sipariş yoksa termin günü', async () => {
    ortam = await testVeritabaniKur('plan_fason_siparis_tarihi');
    const s = ortam.sahip;
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    const proje = (await s.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('PL.FS', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('FSM', 'Deneme Merkezi') RETURNING id"))!.id;
    const ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('FSI', 'Deneme İstasyonu', $1) RETURNING id", [im]))!.id;
    const makine = (await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('FSK1', 'Tezgah', $1) RETURNING id", [ist]))!.id;
    const tip = (await s.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('FS-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const firma = (await s.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FS-', 0) ON CONFLICT (onek) DO NOTHING");
    const urun = (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('fs-1', 'mamul', 'FS-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'fs-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    const rev = (await s.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urun, yoneticiId]))!.id;
    const adim = (sira: number, fason: boolean): IsEmriGirdisi => ({
      sira, opNo: sira * 10, ad: fason ? 'Deneme kaplama' : 'Deneme tornalama', operasyonTipiId: tip,
      kaynak: fason ? { tur: 'fason', id: firma } : { tur: 'makine', id: makine },
      ayarSuresiDk: fason ? null : '10.00', birimSureDk: fason ? null : '1.5000', terminGun: fason ? 4 : null,
      bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    });
    const ac = () => ortam!.vt.tx((db) => uretimEmriAc(db, yonetici, { projeId: proje, malzemeNo: urun, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(1, true), adim(2, false)] }));
    const siparisli = await ac();
    const siparissiz = await ac();

    const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, 82001, 'Deneme fason talebi', $2, $2, 'siparis_verildi')", [t, yoneticiId]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar, birim, is_emri_id) VALUES ($1, $2, 1, 'Deneme kaplama', 10, 'adet', $3)", [t, kl, siparisli.isEmriIdleri[0]]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, current_date)", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, beklenen_teslim) VALUES ($1, $2, 'SP-2099-FS1', '2099-03-01')", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet')", [t, tk, kl]);

    const once = Date.now();
    const isler = await ortam.vt.okumaTx((db) => planlanacakIsler(db, { taslakDahil: true, fasonTahmini: true }));
    const sonra = Date.now();
    const bekleme = (isEmriId: number | undefined) => isler.find((i) => i.id === isEmriId)?.fasonBekleGun;
    const gelis = tesisGunBasi('2099-03-01') + 8 * 3_600_000;
    const b = bekleme(siparisli.isEmriIdleri[1])!;
    assert.ok(b <= (gelis - once) / 86_400_000 && b >= (gelis - sonra) / 86_400_000, `sipariş tarihi esas: ${String(b)}`);
    assert.equal(bekleme(siparissiz.isEmriIdleri[1]), 4, 'siparişsiz adım termin gününü bekler');
    const tahminsiz = await ortam.vt.okumaTx((db) => planlanacakIsler(db, { taslakDahil: true }));
    assert.equal(tahminsiz.find((i) => i.id === siparisli.isEmriIdleri[1])?.fasonBekleGun, 4, 'yalnız planın kendi okuması sipariş tarihini sorar');
  });
});
