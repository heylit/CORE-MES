import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { projeKoduSemasi } from '#paylasilan/sozlesme/projeler.ts';
import {
  FIRMA_PASIF, FIRMA_SIPARISTEN, FIRMA_YOK, SIPARIS_ONAYSIZ, aramaKalibi, butce, firmaReddi, siparisFirmasiReddi, siparisReddi,
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
});
