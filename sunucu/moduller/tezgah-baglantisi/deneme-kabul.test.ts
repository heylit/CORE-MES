import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { tezgahDurusCevabi, tezgahGecisCevabi, tezgahOeeCevabi, tezgahSayimCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import {
  artislar, durumCizgisi, duruslar, gecisOlcutleri, gercekCevrim, isSayimlari, pencereAraligi, programDegistiMi, programEslesmesi, programKullanimi,
} from './deneme-kurallar.ts';
import type { Artis, GecisGirdisi, IsAraligi, SayacDegisimi } from './deneme-kurallar.ts';
import * as deneme from './deneme-servis.ts';
import { uretimArtisiMi } from './kurallar.ts';
import { eslemeYaz } from './sorgular.ts';

// Kart 3811 ve 3811-2 kabul: gölge hesaplar. Makine, iş ve program adları uydurmadır (ORN-).
const t = (hhmmss: string) => Date.parse(`2026-04-10T${hhmmss}+03:00`);
const satir = (zaman: number, onceki: number | null, deger: number, ek: Partial<SayacDegisimi> = {}): SayacDegisimi =>
  ({ zaman, onceki, deger, program: 'TNC:\\ORN\\ORN-P100-OP10.H', kip: 'AUTOMATIC', dryrun: false, singleblock: false, ...ek });

describe('Deneme kuralları (kart 3811, 3811-2)', () => {
  test('üretim artışı: kip otomatik, Dryrun ve Singleblock kapalı; Dryrun, tek tümce ve elle kip deneme/ayar', () => {
    assert.equal(uretimArtisiMi({ kip: 'AUTOMATIC', dryrun: false, singleblock: false }), true);
    assert.equal(uretimArtisiMi({ kip: 'AUTOMATIC', dryrun: true, singleblock: false }), false);
    assert.equal(uretimArtisiMi({ kip: 'AUTOMATIC', dryrun: null, singleblock: true }), false);
    assert.equal(uretimArtisiMi({ kip: 'SEMI_AUTOMATIC', dryrun: null, singleblock: null }), false);
    assert.equal(uretimArtisiMi({ kip: 'MANUAL', dryrun: null, singleblock: null }), false);
    assert.equal(uretimArtisiMi({ kip: null, dryrun: null, singleblock: null }), true);
  });

  test('taban satırı artış değildir; geri gidişte taban yenilenir; çevrimde parça 4 × 3 üretim artışı = 12, Dryrun deneme/ayara', () => {
    const a = artislar([
      satir(t('09:30:00'), null, 50), satir(t('09:31:00'), 50, 51), satir(t('09:32:00'), 51, 52, { dryrun: true }), satir(t('09:33:00'), 52, 53),
      satir(t('09:34:00'), 53, 0), satir(t('09:35:00'), 0, 1), satir(t('09:36:00'), 1, 2, { kip: 'MANUAL' }),
    ]);
    assert.deepEqual(a.map((x) => [x.adet, x.uretim, x.geriGitti]), [[1, true, false], [1, false, false], [1, true, false], [0, true, true], [1, true, false], [1, false, false]]);
    const [is] = isSayimlari([{ bas: t('09:30:00'), bit: t('10:30:00'), isEmriNo: 'ORN-UE-1', op: '10', parcaNo: 'ORN-P100', ilkParcaOnayi: t('09:33:30') }], a,
      [{ zaman: t('10:00:00'), saglam: 10, hurda: 1, red: 0, standartSaniye: 0, suresizSaglam: 10 }], 4, { bas: t('00:00:00'), bit: t('23:59:59') }, null);
    assert.deepEqual([is?.tezgahAdedi, is?.denemeAyarAdedi, is?.ayarAdedi, is?.sayacFarki, is?.saglam, is?.hurda, is?.farkAdet, is?.sayacGeriGitti, is?.golgeOneri],
      [12, 8, 8, 5, 10, 1, 1, true, 1]);
  });

  test('program eşleşmesi: NC alanı varsa kesin ya da uyuşmuyor; yoksa parça no ve OP ile tahmin, bulunmazsa bilinmiyor', () => {
    const p = ['TNC:\\ORN\\ORN-P100-OP10.H'];
    assert.equal(programEslesmesi(p, 'ORN-P100-OP10.H', 'ORN-P100', '10'), 'kesin');
    assert.equal(programEslesmesi(p, 'ORN-P999.H', 'ORN-P100', '10'), 'uyusmuyor');
    assert.equal(programEslesmesi(p, null, 'ORN-P100', '10'), 'tahmin');
    assert.equal(programEslesmesi(p, null, 'ORN-P100', '20'), 'bilinmiyor');
    assert.equal(programEslesmesi(['O1204'], null, 'ORN-P100', '10'), 'bilinmiyor');
    assert.equal(programEslesmesi([], null, 'ORN-P100', '10'), 'bilinmiyor');
  });

  test('program değişti: işin ilk eşleştiği andaki sürümden sonra boyut ya da tarih değişirse işaret; liste yoksa null', () => {
    const v = (boyut: number, ilk: number) => ({ ad: 'ORN\\ORN-P100-OP10.H', boyut, tarih: '2026-04-01T00:00:00.000Z', ilkGoruldu: ilk });
    const prog = 'TNC:\\ORN\\ORN-P100-OP10.H';
    assert.equal(programDegistiMi(prog, t('09:00:00'), [v(1200, t('07:00:00'))]), false);
    assert.equal(programDegistiMi(prog, t('09:00:00'), [v(1200, t('07:00:00')), v(1300, t('11:00:00'))]), true);
    assert.equal(programDegistiMi(prog, t('12:00:00'), [v(1200, t('07:00:00')), v(1300, t('11:00:00'))]), false, 'onaylı sürüm yeni olandır');
    assert.equal(programDegistiMi(prog, t('09:00:00'), null), null);
    assert.equal(programDegistiMi('TNC:\\BASKA\\X-ORN-P100-OP10.H', t('09:00:00'), [v(1200, t('07:00:00')), v(1300, t('11:00:00'))]), null, 'ad tam klasör sınırında eşleşir');
  });

  test('gerçek çevrim: her 100 sn artış ve araya giren 12 dk boşlukta ortanca 100 sn; deneme artışı çifti bozar', () => {
    const a: Artis[] = [];
    for (let k = 0; k < 10; k += 1) a.push({ zaman: t('08:00:00') + k * 100_000, adet: 1, uretim: true, program: 'P', geriGitti: false });
    for (let k = 0; k < 13; k += 1) a.push({ zaman: t('08:30:00') + k * 100_000, adet: 1, uretim: true, program: 'P', geriGitti: false });
    assert.equal(gercekCevrim(a), 100);
    assert.equal(gercekCevrim([a[0]!, { ...a[1]!, uretim: false }, a[2]!]), null);
  });

  test('duruş: plan içinde eşikten uzun alarm arıza adayı, kısa duruş toplanır, işte açık duruş kayıtsız sayılır', () => {
    const pencere = { bas: t('08:00:00'), bit: t('09:00:00') };
    const cizgi = durumCizgisi([
      { zaman: t('07:00:00'), durum: 'calisiyor' }, { zaman: t('08:17:00'), durum: 'alarm' }, { zaman: t('08:29:00'), durum: 'calisiyor' },
      { zaman: t('08:40:00'), durum: 'bekliyor' }, { zaman: t('08:42:00'), durum: 'calisiyor' },
    ], pencere, null);
    const d = duruslar(cizgi, 5, [{ bas: t('07:30:00'), bit: null, isEmriNo: 'ORN-UE-1', op: '10', parcaNo: 'ORN-P100', ilkParcaOnayi: t('07:45:00') }],
      [{ bas: t('08:17:00'), bit: t('08:29:00'), kod: null, metin: 'ORN eksen hatası' }], pencere.bit);
    assert.deepEqual(d.adaylar.map((x) => [x.saniye, x.sinif, x.metin, x.isEmriNo]), [[720, 'ariza', 'ORN eksen hatası', 'ORN-UE-1']]);
    assert.deepEqual([d.kisa, d.toplamSaniye, d.kayitsizSaniye], [{ adet: 1, saniye: 120 }, 840, 840]);
  });

  test('program kullanımı: işe bağlı ve bağsız programlar ayrı görünür', () => {
    const a: Artis[] = [
      { zaman: t('08:10:00'), adet: 1, uretim: true, program: 'A.H', geriGitti: false },
      { zaman: t('11:10:00'), adet: 1, uretim: true, program: 'B.H', geriGitti: false },
      { zaman: t('08:20:00'), adet: 2, uretim: false, program: 'A.H', geriGitti: false },
    ];
    const k = programKullanimi([{ bas: t('08:00:00'), bit: t('09:00:00'), isEmriNo: 'ORN-UE-1', op: '10', parcaNo: 'ORN-P', ilkParcaOnayi: null }], a, t('12:00:00'));
    assert.deepEqual(k.map((x) => [x.program, x.uretimArtisi, x.denemeArtisi, x.isEmirleri]), [['A.H', 1, 2, ['ORN-UE-1']], ['B.H', 1, 0, []]]);
  });

  test('pencere: dün tesis gününün tamamı, son 7 gün bugünle birlikte 7 gün', () => {
    const simdi = Date.parse('2026-04-11T12:00:00+03:00');
    assert.deepEqual(pencereAraligi('dun', simdi), { bas: t('00:00:00'), bit: Date.parse('2026-04-11T00:00:00+03:00') });
    assert.equal(pencereAraligi('yedi-gun', simdi).bas, Date.parse('2026-04-05T00:00:00+03:00'));
    assert.equal(pencereAraligi('bugun', simdi).bit, simdi);
  });
});

describe('Durum çizgisi, duruş sınıfı ve geçiş ölçütü sınırları (kart 3811)', () => {
  const pencere = { bas: t('06:00:00'), bit: t('12:00:00') };
  const is = (ek: Partial<IsAraligi> = {}): IsAraligi =>
    ({ bas: t('06:00:00'), bit: t('12:00:00'), isEmriNo: 'ORN-UE-9', op: '10', parcaNo: 'ORN-P900', ilkParcaOnayi: null, ...ek });

  test('tanımlı vardiyada plan dışı süre vardiya dışıdır; çalışma plan dışında da çalışmadır', () => {
    const ornekler = [{ zaman: t('06:00:00'), durum: 'bekliyor' }, { zaman: t('09:00:00'), durum: 'calisiyor' }, { zaman: t('11:00:00'), durum: 'bekliyor' }];
    const cizgi = durumCizgisi(ornekler, pencere, [{ bas: t('07:00:00'), bit: t('10:00:00') }]);
    assert.deepEqual(cizgi.map((p) => [p.bas, p.bit, p.hal]), [
      [t('06:00:00'), t('07:00:00'), 'vardiya-disi'], [t('07:00:00'), t('09:00:00'), 'bekliyor'],
      [t('09:00:00'), t('11:00:00'), 'calisiyor'], [t('11:00:00'), t('12:00:00'), 'vardiya-disi'],
    ]);
  });

  test('bekleme parçasıyla kesişen alarm olayı arızadır, metni gelir', () => {
    const cizgi = [{ bas: t('07:00:00'), bit: t('07:20:00'), hal: 'bekliyor' as const }];
    const d = duruslar(cizgi, 5, [is({ ilkParcaOnayi: t('06:30:00') })], [{ bas: t('07:10:00'), bit: t('07:15:00'), kod: 'ORN-1', metin: 'ORN eksen hatası' }], pencere.bit);
    assert.deepEqual(d.adaylar.map((a) => [a.sinif, a.metin]), [['ariza', 'ORN eksen hatası']]);
  });

  test('ilk parça onayından önce ya da onay yokken duruş ölçümdür; onaydan sonra neden sorulur; iş yoksa iş yok', () => {
    const cizgi = [
      { bas: t('07:00:00'), bit: t('07:20:00'), hal: 'bekliyor' as const }, { bas: t('09:00:00'), bit: t('09:20:00'), hal: 'bekliyor' as const },
      { bas: t('11:00:00'), bit: t('11:20:00'), hal: 'bekliyor' as const },
    ];
    const isler = [is({ bit: t('10:00:00'), ilkParcaOnayi: t('08:00:00') })];
    assert.deepEqual(duruslar(cizgi, 5, isler, [], pencere.bit).adaylar.map((a) => a.sinif), ['olcum', 'neden-sorulacak', 'is-yok']);
    assert.deepEqual(duruslar(cizgi.slice(0, 1), 5, [is()], [], pencere.bit).adaylar.map((a) => a.sinif), ['olcum']);
  });

  test('sayaç farkı ölçütü fark küçük olsa da en az 3 kapanan iş ister', () => {
    const g = (n: number): GecisGirdisi => ({
      eslendi: true, planliMs: 1000, baglantiYokMs: 0, kapananlar: Array.from({ length: n }, () => ({ tezgah: 10, terminal: 10 })), eslesmeler: ['tahmin'],
      ncAlaniVar: false, alarmTani: null, saatFarkiSn: 0, saatTani: null, uretimArtisi: 1, iseBagliUretimArtisi: 1,
    });
    const fark = (n: number) => gecisOlcutleri(g(n)).find((o) => o.olcut === 'sayac-farki')!;
    assert.deepEqual([fark(2).tamam, fark(2).neden], [false, 'En az 3 kapanan iş gerekir']);
    assert.equal(fark(3).tamam, true);
  });
});

describe('Deneme sayfası kabul senaryosu (kart 3811, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici: Kullanici;
  let makineId = 0;
  let istasyonId = 0;
  let yoneticiId = 0;
  let parcaNo = '';
  let emirNo = '';
  const simdi = Date.parse('2026-04-11T12:00:00+03:00');
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const z = (hhmmss: string) => `2026-04-10T${hhmmss}+03:00`;

  before(async () => {
    ortam = await testVeritabaniKur('tezkabul');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    const projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TZ.KBL', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const planlamaci = (await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Planlama', kullaniciAdi: 'planlama_proje', parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return kullaniciYukle(db, yeni);
    }))!;
    const tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('TZK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-P-', 0) ON CONFLICT (onek) DO NOTHING");
    const urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('orn-p-1', 'mamul', 'ORN-P-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'orn-p-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    const revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TZKM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('TZKI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('ORN-M-1', 'ORN tezgah', $1) RETURNING id", [istasyonId]))!.id;
    const adim = (sira: number): IsEmriGirdisi => ({
      sira, opNo: sira * 10, ad: `Adım ${String(sira)}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
      ayarSuresiDk: '10', birimSureDk: '1', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    });
    const { uretimEmriId: e, isEmriIdleri: [i1, i2] } = await ortam.vt.tx((db) => uretimEmriAc(db, planlamaci, {
      malzemeNo: urunNo, adet: 100, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: [adim(1), adim(2)],
    }));
    const emir = (await ortam.sahip.tek<{ no: string; parca: string }>('SELECT emir_no AS no, parca_no AS parca FROM uretim_emri WHERE id = $1', [e]))!;
    emirNo = emir.no;
    parcaNo = emir.parca;
    const kullanim = (isEmriId: number, bas: string, bit: string) => ortam!.sahip.sorgu(
      `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $5)`, [e, isEmriId, istasyonId, makineId, yoneticiId, bas, bit]);
    const sayim = (isEmriId: number, tur: 'saglam' | 'hurda', adet: number, zaman: string) => ortam!.sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id, makine_id)
       VALUES ($1, $2, $3, $4, $5, NULL, false, $6::timestamptz, $7, $8)`, [e, yoneticiId, istasyonId, tur, adet, zaman, isEmriId, makineId]);
    await kullanim(i1!, z('08:00:00'), z('09:00:00'));
    await kullanim(i2!, z('09:30:00'), z('10:30:00'));
    await sayim(i1!, 'saglam', 1, z('08:05:00'));
    await sayim(i1!, 'saglam', 22, z('08:55:00'));
    await sayim(i2!, 'saglam', 12, z('10:20:00'));

    // Tezgâh: iş 1'de her 100 sn bir artış, 08:17-08:29 arası alarmda 12 dk boşluk; iş 2'de 3 üretim ve 2 Dryrun artışı.
    const prog1 = `TNC:\\ORN\\${parcaNo}-OP10.H`, prog2 = `TNC:\\ORN\\${parcaNo}-OP20.H`;
    const satirlar: [string, number | null, number, string, boolean][] = [[z('07:59:00'), null, 100, prog1, false]];
    let deger = 100;
    for (let k = 1; k <= 10; k += 1) satirlar.push([new Date(Date.parse(z('08:00:00')) + k * 100_000).toISOString(), deger, ++deger, prog1, false]);
    for (let k = 0; k < 13; k += 1) satirlar.push([new Date(Date.parse(z('08:30:00')) + k * 100_000).toISOString(), deger, ++deger, prog1, false]);
    for (const [hhmm, dry] of [['09:40:00', false], ['09:45:00', true], ['09:50:00', false], ['09:55:00', true], ['10:00:00', false]] as const) {
      satirlar.push([z(hhmm), deger, ++deger, prog2, dry]);
    }
    for (const [zaman, onceki, d, program, dryrun] of satirlar) {
      await ortam.sahip.sorgu(
        "INSERT INTO tezgah_sayac_artisi (cihaz_adi, zaman, onceki, deger, program, kip, dryrun, singleblock) VALUES ('ORN-T1', $1, $2, $3, $4, 'AUTOMATIC', $5, false)",
        [zaman, onceki, d, program, dryrun]);
    }
    for (const [hhmm, durum] of [['07:59:00', 'calisiyor'], ['08:17:00', 'alarm'], ['08:29:00', 'calisiyor'], ['08:52:00', 'bekliyor'], ['09:40:00', 'calisiyor'], ['10:05:00', 'bekliyor']] as const) {
      await ortam.sahip.sorgu("INSERT INTO tezgah_ornek (cihaz_adi, zaman, durum, sayac) VALUES ('ORN-T1', $1, $2, NULL)", [z(hhmm), durum]);
    }
    await ortam.sahip.sorgu("INSERT INTO tezgah_alarm_olayi (cihaz_adi, oge, kod, metin, baslangic, bitis) VALUES ('ORN-T1', 'k1', NULL, 'ORN eksen hatası', $1, $2)", [z('08:17:00'), z('08:29:00')]);
    await ortam.sahip.sorgu(
      `INSERT INTO tezgah_okuma (cihaz_adi, durum, calisma, mod, program, sayac, takim, is_mili_hizi, is_mili_yuku, ilerleme, alarm, ogeler, okundu)
       VALUES ('ORN-T1', 'bekliyor', 'READY', 'AUTOMATIC', NULL, $1, NULL, NULL, NULL, NULL, NULL, '[]'::jsonb, $2)`, [deger, z('10:06:00')]);
    await ortam.vt.tx((db) => eslemeYaz(db, 'ORN-T1', { makineId, cevrimdeParca: 1, durusEsigiDk: 5 }, yoneticiId));
  });
  after(async () => { await ortam?.kaldir(); });

  // Başka modüllerin bütün tablolarının içeriği (tezgah_ ile başlamayanlar): hesaplardan önce ve sonra aynı olmalı.
  const parmakIzi = async (): Promise<Map<string, string>> => {
    const tablolar = await o().sahip.sorgu<{ ad: string }>(
      "SELECT format('%I', table_name) AS ad FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'tezgah\\_%' ORDER BY 1");
    const iz = new Map<string, string>();
    for (const { ad } of tablolar) {
      iz.set(ad, (await o().sahip.tek<{ m: string | null }>(`SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS m FROM ${ad} t`))?.m ?? '');
    }
    return iz;
  };

  test('iki iş, her 100 sn artış, 12 dk alarm boşluğu: adetler, gerçek çevrim 100 sn, arıza adayı; başka modüle hiçbir şey yazılmaz', async () => {
    const once = await parmakIzi();
    const [sy, du, oe, ge] = await o().vt.tx(async (db) => [
      tezgahSayimCevabi.parse(await deneme.sayim(db, 'dun', simdi)),
      tezgahDurusCevabi.parse(await deneme.durus(db, 'dun', simdi)),
      tezgahOeeCevabi.parse(await deneme.oee(db, yonetici, 'dun', simdi)),
      tezgahGecisCevabi.parse(await deneme.gecis(db, simdi)),
    ] as const);
    const sonra = await parmakIzi();
    assert.deepEqual([...sonra.entries()].filter(([k, v]) => once.get(k) !== v).map(([k]) => k), [], 'başka modülün tablosu değişmedi');

    const m = sy.makineler.find((x) => x.cihazAdi === 'ORN-T1')!;
    assert.deepEqual(m.isler.map((i) => [i.isEmriNo, i.op, i.tezgahAdedi, i.denemeAyarAdedi, i.saglam, i.farkAdet, i.programEslesmesi]), [
      [emirNo, '10', 23, 0, 23, 0, 'tahmin'],
      [emirNo, '20', 3, 2, 12, -9, 'tahmin'],
    ]);
    assert.equal(m.isler[0]?.ayarAdedi, 2, 'ilk sağlam 08:05 öncesi iki artış');
    assert.deepEqual(m.programKullanimi.map((p) => [p.uretimArtisi, p.denemeArtisi, p.isEmirleri]), [[23, 0, [emirNo]], [3, 2, [emirNo]]]);
    assert.ok(sy.eksikler.some((e) => e.includes('NC program alanı yok')));

    const d = du.makineler.find((x) => x.cihazAdi === 'ORN-T1')!;
    const ariza = d.adaylar.find((a) => a.sinif === 'ariza');
    assert.deepEqual([ariza?.saniye, ariza?.metin, ariza?.isEmriNo], [720, 'ORN eksen hatası', emirNo]);
    assert.deepEqual(du.enSikAlarmlar.map((a) => [a.metin, a.adet, a.saniye]), [['ORN eksen hatası', 1, 720]]);
    assert.equal(du.alarmOlaylari[0]?.isEmriNo, emirNo);
    assert.equal(d.alarmTani, 'Kumanda koşul (alarm) bilgisi vermiyor');

    const oo = oe.makineler.find((x) => x.cihazAdi === 'ORN-T1')!;
    assert.equal(oo.gercekCevrimSaniye, 100);
    assert.equal(oo.standartCevrimSaniye, 60, 'birim süre 1 dk');
    assert.equal(oo.planliSaniye, null, 'vardiya takvimi yok');

    const g = ge.makineler.find((x) => x.cihazAdi === 'ORN-T1')!;
    const olcut = new Map(g.olcutler.map((x) => [x.olcut, x]));
    assert.deepEqual([olcut.get('esleme')?.tamam, olcut.get('is-eslesmesi')?.tamam, olcut.get('uyusmazlik')?.tamam, olcut.get('uyusmazlik')?.neden, g.hazir],
      [true, true, false, 'NC program alanı yok; ölçülemiyor', false]);
    assert.equal(olcut.get('sayac-farki')?.tamam, false, 'iki kapanan iş üçten az');
  });
});
