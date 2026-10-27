import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { projeKoduSemasi, statuYazGovdesi } from '#paylasilan/sozlesme/projeler.ts';
import {
  BITTI_GERCEK_BITIS, FIRMA_PASIF, FIRMA_SIPARISTEN, FIRMA_YOK, GERCEK_BASLANGIC_GEREKLI, GERCEK_SIRASI, PROJE_KAPALI, SERBEST_STATU_KAPALI,
  SIPARIS_ONAYSIZ, STATU_ETKIN_DEGIL, STATU_YOK, TABAN_AYNI, aramaKalibi, butce, firmaReddi, gorevDurumuDuzelt, oncekiDonguVarMi,
  projeAcikReddi, projeIlerlemesi, siparisFirmasiReddi, siparisReddi, statuReddi, tabanReddi,
} from './kurallar.ts';

describe('projeler kuralları (saf)', () => {
  test('PRJ-01 kod: küçük harf ve Türkçe i büyütülür; tire ve Türkçe harf reddedilir', () => {
    assert.equal(projeKoduSemasi.parse(' p12.a_b '), 'P12.A_B');
    assert.equal(projeKoduSemasi.parse('istanbul'), 'ISTANBUL');
    for (const k of ['P-12', 'ŞİRKET', 'A'.repeat(25), '  ']) assert.equal(projeKoduSemasi.safeParse(k).success, false, k);
    assert.equal(projeKoduSemasi.safeParse('A'.repeat(24)).success, true);
  });

  test('PRJ-05 firma: olmayan reddedilir; pasif yeni seçilemez ama mevcut bağ kalır', () => {
    assert.equal(firmaReddi({ var: false, aktif: false }, 5, null), FIRMA_YOK);
    assert.equal(firmaReddi({ var: true, aktif: false }, 5, null), FIRMA_PASIF);
    assert.equal(firmaReddi({ var: true, aktif: false }, 5, 5), null);
    assert.equal(firmaReddi({ var: true, aktif: true }, 5, 7), null);
  });

  test('PRJ-07 sipariş: yalnız onaylı siparişten proje açılır', () => {
    assert.equal(siparisReddi('onayli'), null);
    for (const d of ['taslak', 'kapandi', 'iptal']) assert.equal(siparisReddi(d), SIPARIS_ONAYSIZ, d);
  });

  test('PRJ-08 siparişe bağlı projede firma değişmez; siparişsiz projede serbest', () => {
    assert.equal(siparisFirmasiReddi(3, 5, 5), null);
    assert.equal(siparisFirmasiReddi(3, 5, 7), FIRMA_SIPARISTEN);
    assert.equal(siparisFirmasiReddi(3, 5, null), FIRMA_SIPARISTEN);
    assert.equal(siparisFirmasiReddi(null, 5, 7), null);
  });

  test('PRJ-09 bütçe: görmeyenin girdisi yok sayılır, var olan kalır; para birimi varsayılanı TRY; tutarsız saklanmaz', () => {
    const mevcut = { butceTutari: '10.00', butceParaBirimi: 'EUR' };
    assert.deepEqual(butce(false, '99', 'USD', mevcut), mevcut);
    assert.deepEqual(butce(false, '99', 'USD', null), { butceTutari: null, butceParaBirimi: null });
    assert.deepEqual(butce(true, '99', null, mevcut), { butceTutari: '99', butceParaBirimi: 'TRY' });
    assert.deepEqual(butce(true, null, 'USD', mevcut), { butceTutari: null, butceParaBirimi: null });
  });

  test('arama kalıbı: boş arama süzmez; joker karakterler kaçırılır', () => {
    assert.equal(aramaKalibi(undefined), null);
    assert.equal(aramaKalibi('  '), null);
    assert.equal(aramaKalibi('a%b_c\\'), '%a\\%b\\_c\\\\%');
  });

  test('PRJ-11 statü: seçilen var ve etkin olmalı; elle yazı yalnız izinle; gövde ikisinden tam birini ister', () => {
    assert.deepEqual(statuReddi({ statuId: 3, metin: null }, null, true), { ileti: STATU_YOK, alan: 'statuId' });
    assert.deepEqual(statuReddi({ statuId: 3, metin: null }, { etkin: false }, true), { ileti: STATU_ETKIN_DEGIL, alan: 'statuId' });
    assert.equal(statuReddi({ statuId: 3, metin: null }, { etkin: true }, false), null);
    assert.deepEqual(statuReddi({ statuId: null, metin: 'Elle' }, null, false), { ileti: SERBEST_STATU_KAPALI, alan: 'metin' });
    assert.equal(statuReddi({ statuId: null, metin: 'Elle' }, null, true), null);
    assert.equal(statuYazGovdesi.safeParse({ statuId: 1, metin: 'İkisi' }).success, false);
    assert.equal(statuYazGovdesi.safeParse({ metin: '   ' }).success, false);
    assert.deepEqual(statuYazGovdesi.parse({ metin: ' Bekliyor ', not: ' ' }), { statuId: null, metin: 'Bekliyor', not: null });
  });

  test('PRJ-12 görev: bitti gerçekleşen bitiş ister ve ilerlemeyi 100 yapar; gerçekleşen tarihler sıralı; önceki zinciri döngüsüz', () => {
    const g = { durum: 'suruyor', ilerleme: 30, gercekBaslangic: null, gercekBitis: null };
    assert.deepEqual(gorevDurumuDuzelt(g), { ilerleme: 30 });
    assert.deepEqual(gorevDurumuDuzelt({ ...g, durum: 'bitti' }), { ileti: BITTI_GERCEK_BITIS, alan: 'gercekBitis' });
    assert.deepEqual(gorevDurumuDuzelt({ ...g, gercekBitis: '2026-11-03' }), { ileti: GERCEK_BASLANGIC_GEREKLI, alan: 'gercekBaslangic' });
    assert.deepEqual(gorevDurumuDuzelt({ ...g, gercekBaslangic: '2026-11-04', gercekBitis: '2026-11-03' }), { ileti: GERCEK_SIRASI, alan: 'gercekBitis' });
    assert.deepEqual(gorevDurumuDuzelt({ ...g, durum: 'bitti', gercekBaslangic: '2026-11-01', gercekBitis: '2026-11-03' }), { ilerleme: 100 });
    const zincir = new Map<number, number | null>([[2, 1], [3, 2], [1, null]]);
    assert.equal(oncekiDonguVarMi(1, 3, zincir), true);
    assert.equal(oncekiDonguVarMi(4, 3, zincir), false);
    assert.equal(oncekiDonguVarMi(1, null, zincir), false);
    assert.equal(oncekiDonguVarMi(9, 5, new Map([[5, 6], [6, 5]])), false);
  });

  test('PRJ-13 taban: aynı tarihe yenileme reddedilir', () => {
    assert.equal(tabanReddi('2026-11-01', '2026-11-01'), TABAN_AYNI);
    assert.equal(tabanReddi('2026-11-01', '2026-11-05'), null);
  });

  test('PRJ-14 ilerleme: iptal hariç, plan süresiyle ağırlıklı; görev yoksa null', () => {
    assert.equal(projeIlerlemesi([]), null);
    assert.equal(projeIlerlemesi([{ durum: 'iptal', ilerleme: 50, planBaslangic: '2026-11-01', planBitis: '2026-11-01' }]), null);
    assert.equal(projeIlerlemesi([
      { durum: 'bitti', ilerleme: 100, planBaslangic: '2026-11-01', planBitis: '2026-11-01' },
      { durum: 'suruyor', ilerleme: 20, planBaslangic: '2026-11-01', planBitis: '2026-11-03' },
    ]), 40);
  });

  test('PRJ-15 kapanmış projeye görev yazılmaz', () => {
    assert.equal(projeAcikReddi('aktif'), null);
    assert.equal(projeAcikReddi('tamamlandi'), PROJE_KAPALI);
    assert.equal(projeAcikReddi('iptal'), PROJE_KAPALI);
  });
});
