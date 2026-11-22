import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ILETILER, cizimIzni, merkezCizimiAdi, talepCizimiKaldirmaReddi, talepCizimiTaleptenMi } from './kurallar.ts';

const YAZ = ['satin-alma.yaz'];
const OKU = ['satin-alma.oku'];
const ONAY = ['satin-alma.onayla'];
const TALEP = ['satin-alma.talep-ac'];

test('3442-2 izinli: satın alma yazan her adımda görür ve ekler; okuyan ve onaylayan görür; talep eden kendi taslağına ekler, sonra görür', () => {
  assert.equal(cizimIzni(YAZ, false, false, 'yaz'), true);
  assert.equal(cizimIzni(OKU, false, false, 'oku'), true);
  assert.equal(cizimIzni(ONAY, false, false, 'oku'), true);
  assert.equal(cizimIzni(TALEP, true, true, 'yaz'), true);
  assert.equal(cizimIzni(TALEP, true, false, 'oku'), true);
});

test('3442-2 yasak: okuyan ve onaylayan eklemez; talep eden başkasının talebini görmez, taslaktan sonra eklemez; işlemsiz sahip hiçbir şey yapmaz', () => {
  assert.equal(cizimIzni(OKU, false, true, 'yaz'), false);
  assert.equal(cizimIzni(ONAY, true, true, 'yaz'), false);
  assert.equal(cizimIzni(TALEP, false, true, 'oku'), false);
  assert.equal(cizimIzni(TALEP, true, false, 'yaz'), false);
  assert.equal(cizimIzni([], true, true, 'oku'), false);
});

test('SAT-84 (3571 K-c): teklif isteğinden sonra talepten gelen çizim kaldırılmaz; satın almanın eklediği ve taslaktaki kaldırılır', () => {
  const taslak = { durum: 'taslak' as const, teklifIstekleri: [] };
  const gonderildi = { durum: 'teklif_isteniyor' as const, teklifIstekleri: [{ firmaId: 1, gonderim: '2026-11-22', sonTarih: null }] };
  assert.equal(talepCizimiKaldirmaReddi(taslak, true), null);
  assert.equal(talepCizimiKaldirmaReddi(gonderildi, false), null);
  assert.equal(talepCizimiKaldirmaReddi(gonderildi, true), ILETILER.cizimTeklifteKaldirilamaz);
  assert.equal(talepCizimiKaldirmaReddi({ durum: 'taslak', teklifIstekleri: gonderildi.teklifIstekleri }, true), ILETILER.cizimTeklifteKaldirilamaz);
});

test('SAT-84 talepten: açan, adına açılan ya da kaynak talepten taşınan; satın almanın eklediği değil', () => {
  const t = { acanKisiId: 1, talepEdenKisiId: 2 };
  assert.deepEqual([talepCizimiTaleptenMi(1, t, false), talepCizimiTaleptenMi(2, t, false), talepCizimiTaleptenMi(9, t, true), talepCizimiTaleptenMi(9, t, false)], [true, true, true, false]);
  assert.equal(merkezCizimiAdi('ORN-CZ Flans'), 'ORN-CZ Flans.pdf');
  assert.equal(merkezCizimiAdi(' ORN.PDF '), 'ORN.PDF');
});
