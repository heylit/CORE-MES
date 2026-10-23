import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PLAN_ONAY_KOMUTLARI, SENARYO_DURUMLARI, bedelAyariTaslakGovdesi, geriGonderGovdesi, onayaGonderGovdesi, senaryolarCevabi,
  siparisCarpaniTaslakGovdesi,
} from './plan.ts';

const gosterge = {
  emirSayisi: 0, isEmriSayisi: 0, yerlesen: 0, geciken: 0, zamanindaYuzde: null, ortAtolyeGun: null, darbogaz: null, enDoluKaynak: null, personelGun: null,
};
const senaryo = {
  id: 1, ad: 'Taslak', aciklama: null, durum: 'onayda', acan: 'Planlamacı', benim: true, acilma: '2026-10-23T10:00:00Z', surum: 2, tabanPlanSurumu: 5,
  canliDegisti: false, gostergeler: null, degisiklikler: [], etki: null, bekleyenler: [],
};

test('canlıya alma yalnız onaydaki senaryodan, onaya gönderme yalnız açık senaryodan geçer', () => {
  assert.equal(PLAN_ONAY_KOMUTLARI['onaya-gonder'].durumdan, 'acik');
  assert.equal(PLAN_ONAY_KOMUTLARI['onaya-gonder'].duruma, 'onayda');
  assert.equal(PLAN_ONAY_KOMUTLARI['canliya-al'].durumdan, 'onayda');
  for (const k of ['geri-gonder', 'onaydan-cek'] as const) assert.equal(PLAN_ONAY_KOMUTLARI[k].duruma, 'acik');
  for (const k of Object.values(PLAN_ONAY_KOMUTLARI)) {
    assert.ok(SENARYO_DURUMLARI.includes(k.durumdan) && SENARYO_DURUMLARI.includes(k.duruma));
    assert.match(k.yol, /^\/plan\/senaryolar\/:id\/[a-z-]+$/);
  }
});

test('gönderen stüdyo işlemiyle, onaylayan ve geri gönderen canlıya alma işlemiyle çalışır', () => {
  assert.equal(PLAN_ONAY_KOMUTLARI['onaya-gonder'].islem, 'plan.studyo');
  assert.equal(PLAN_ONAY_KOMUTLARI['onaydan-cek'].islem, 'plan.studyo');
  assert.equal(PLAN_ONAY_KOMUTLARI['geri-gonder'].islem, 'plan.canliya-al');
  assert.equal(PLAN_ONAY_KOMUTLARI['canliya-al'].islem, 'plan.canliya-al');
});

test('senaryo cevabı onayda durumunu taşır; onay alanları olmayan eski cevap da geçerlidir', () => {
  const cevap = { canli: gosterge, canliSurum: 5, senaryolar: [senaryo] };
  assert.equal(senaryolarCevabi.parse(cevap).senaryolar[0]!.yapabilir, undefined);
  const dolu = senaryolarCevabi.parse({ canli: gosterge, canliSurum: 5, senaryolar: [{
    ...senaryo,
    onay: { gonderen: 'Planlamacı', gonderme: '2026-10-23T11:00:00Z', not: null, geriGonderen: null, geriGonderme: null, geriNeden: null },
    yapabilir: { onayaGonder: false, onaydanCek: true, geriGonder: false, canliyaAl: false },
  }] });
  assert.equal(dolu.senaryolar[0]!.onay?.gonderen, 'Planlamacı');
  assert.equal(senaryolarCevabi.safeParse({ ...cevap, senaryolar: [{ ...senaryo, durum: 'bekliyor' }] }).success, false);
});

test('geri gönderme gerekçe ister, onaya gönderme notu isteğe bağlıdır; ikisi de okunan sürümü taşır', () => {
  assert.deepEqual(onayaGonderGovdesi.parse({ surum: 3 }), { surum: 3 });
  assert.equal(onayaGonderGovdesi.safeParse({ not: 'x' }).success, false);
  assert.equal(geriGonderGovdesi.safeParse({ surum: 3, neden: '   ' }).success, false);
  assert.equal(geriGonderGovdesi.safeParse({ surum: 3 }).success, false);
  assert.deepEqual(geriGonderGovdesi.parse({ surum: 3, neden: ' Teslim kayıyor ' }), { surum: 3, neden: 'Teslim kayıyor' });
});

test('bedel ayarı ve elle çarpan taslağa yazılırken taslak alanı zorunludur (yeni taslak için null)', () => {
  assert.equal(bedelAyariTaslakGovdesi.safeParse({
    tabanBedelSaat: 100, finansmanOraniGun: null, karRiskiOraniGun: 0.1, yuksekEsigi: 2, dusukEsigi: 0.5,
  }).success, false);
  assert.equal(bedelAyariTaslakGovdesi.safeParse({
    tabanBedelSaat: 100, finansmanOraniGun: null, karRiskiOraniGun: 0.1, yuksekEsigi: 2, dusukEsigi: 0.5, taslak: null,
  }).success, true);
  assert.equal(siparisCarpaniTaslakGovdesi.safeParse({ carpan: 1.5, gerekce: 'Acil', taslak: { id: 4, surum: 2 } }).success, true);
});
