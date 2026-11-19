import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import { teklifDenemesi, type DenemeIstegi } from './teklif-denemesi.ts';

// Satış teklifi denemesi (Y4): kalemler acil sipariş olarak eklenir, satış taslakları kilitlidir, istenen termin yoksa plan dondurulur.
// İki tezgâh: 100 (ücret 750) ve 101 (ücreti girilmemiş); operatör gerekmez. Başlangıç 2026-10-19 Pazartesi, hafta içi 08:00-16:00. Veriler uydurmadır.

const tezgah = (id: string, grup: string, ucret: number | null): Record<string, unknown> => ({ id, ad: id, grup, ucret, verim: 1, vardiyalar: ['3'], opOran: 0 });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' },
    { id: '60', code: 'MM-2', name: 'Ornek burc', type: 'mamul' },
    { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 10, stock: 100, plan: { kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok: 100, birimFiyat: 10, tedarikGun: 5, muayeneGun: 0 } },
  ],
  opdefs: [{ id: '13', name: 'Tornalama' }, { id: '14', name: 'Taslama' }],
  // tezgâhın motor ayarları kaydın plan alt nesnesindedir (çerçeve rrDenemedenKur ile yazar)
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10', 750) }, { id: '101', code: 'S1', name: 'Taslama 1', stationId: '11', plan: tezgah('101', '11', null) }],
  routes: {
    50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [{ id: 'n1', itemId: 'H1', qty: 2 }] }] },
    60: { base: null, steps: [{ id: '60-o10', seq: 10, opNo: 10, opId: '14', stationId: '11', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] },
  },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-23', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 16, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' },
  ],
};
const D0 = {
  meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [],
  tezgahlar: [], personel: [], siparisler: [], ayarlar: {},
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [
      { id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true },
      { id: '11', code: 'TAS', name: 'Taslama', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true },
    ],
    machines: [
      { id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true },
      { id: '101', code: 'S1', name: 'Taslama 1', stationId: '11', status: 'aktif', aktif: true },
    ],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const calismaKur = (): Record<string, unknown> => ({
  D: D0, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
// Taban: aynı girdiyle kural tabanlı plan (çerçevede "sıfırdan çöz"ün ilk adımı).
// ters: taban terminleri yer değiştirmiş veriyle kurulur (O2 önce); kural bugün O1'i önce alırdı, dondurulmuş deneme sırayı korumalı.
function tabanli(ters = false): Record<string, unknown> {
  const c = calismaKur();
  const kayit = ters ? { ...KAYIT, orders: KAYIT.orders.map((o, i) => ({ ...o, due: KAYIT.orders[1 - i]!.due })) } : KAYIT;
  const g = planGirdisi({ calisma: c, kayit, kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  const p = motorYukle().schedule(g.st, 'dagit', null);
  return { ...c, plan: { ops: p.ops } };
}
const istek = (ek: Partial<DenemeIstegi>): DenemeIstegi => ({
  calisma: tabanli(), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19', kalemler: [{ id: 'TK-1', urun: '50', adet: 4 }], termin: null, taslaklar: [], haric: null, tamponGun: 2, ...ek,
});

describe('satış teklifi denemesi (Y4)', () => {
  test('3301: planın yönü geri olsa da arkaya ekleme kalemi mevcut yükün ardına koyar, ufkun sonuna itmez', async () => {
    const ileri = await teklifDenemesi(istek({}));
    const c = tabanli() as { w: Record<string, unknown> };
    c.w = { ...c.w, yon: 'geri' };
    const geri = await teklifDenemesi(istek({ calisma: c }));
    assert.ok(ileri && geri);
    assert.equal(geri.kalemler[0]!.bitis, ileri.kalemler[0]!.bitis);
    assert.equal(geri.kalemler[0]!.planTerminGun, ileri.kalemler[0]!.planTerminGun);
    assert.deepEqual(geri.kayan, []);
  });
  test('3301-4: arkaya ekleme tezgâhtaki ilk boşluğa girer; ileri tarihli iş teklifi ötelemez ve yerinden kaymaz', async () => {
    // T1'de O1 ve O2 ilk iki günde; O3'ün başlangıç tarihi dört hafta ileride. Arada tezgâh boştur.
    const kayit = { ...KAYIT, orders: [...KAYIT.orders, { id: 'O3', no: 'E-3', itemId: '50', qty: 4, start: '2026-11-16', due: '2026-11-20', priority: 2, status: 'serbest' }] };
    const c = calismaKur();
    const g = planGirdisi({ calisma: c, kayit, kaynak: KAYNAK, bugun: '2026-10-19' });
    assert.ok(g);
    const taban = motorYukle().schedule(g.st, 'dagit', null);
    const o3 = Object.values(taban.ops).find((o) => o['job'] === 'O3')!;
    const o2 = Object.values(taban.ops).find((o) => o['job'] === 'O2')!;
    assert.ok(o3.S > 24 * 20, 'O3 ileri tarihte');
    const r = await teklifDenemesi({ ...istek({}), calisma: { ...c, plan: { ops: taban.ops } }, kayit });
    assert.ok(r);
    assert.deepEqual(r.kayan, []);
    const k = r.kalemler[0]!;
    assert.equal(k.tamam, true);
    const is = k.islemler[0]!;
    assert.ok(is.S >= o2.C - 1e-6 && is.C <= o3.S + 1e-6, `kalem O2 ile O3 arasındaki boşlukta (S ${String(is.S)}, O3 ${String(o3.S)})`);
    assert.ok(k.planTerminGun !== null && k.planTerminGun < 10, `plan termini ilk haftalarda (${String(k.planTerminGun)})`);
  });

  test('3301: istenen terminle arkaya eklemede plan dondurulur, kimse kaymaz, yalnız yetişme ölçülür; terminden geriye kalemi termine yaslar', async () => {
    const arkasiz = await teklifDenemesi(istek({}));
    const yakinArka = await teklifDenemesi(istek({ termin: '2026-10-19 23:00', yerlesim: 'arkaya' }));
    assert.ok(arkasiz && yakinArka);
    assert.deepEqual(yakinArka.kayan, []);
    assert.equal(yakinArka.kalemler[0]?.bitis, arkasiz.kalemler[0]?.bitis);
    assert.equal(yakinArka.kalemler[0]?.ulasir, false);
    const uzakArka = await teklifDenemesi(istek({ termin: '2026-11-13 23:00', yerlesim: 'arkaya' }));
    assert.equal(uzakArka?.kalemler[0]?.ulasir, true);
    assert.equal(uzakArka?.kalemler[0]?.bitis, arkasiz.kalemler[0]?.bitis);
    // terminden geriye: kalem en geç başlamayla terminin önüne yaslanır, arkaya eklemeden çok sonra biter ama termini geçmez
    const geriye = await teklifDenemesi(istek({ termin: '2026-11-13 23:00', yerlesim: 'geriye' }));
    const bitis = geriye?.kalemler[0]?.bitis ?? null;
    assert.ok(bitis !== null && bitis > (arkasiz.kalemler[0]?.bitis ?? 0) + 24 * 7, `geriye bitiş ${String(bitis)}`);
    assert.equal(geriye?.kalemler[0]?.ulasir, true);
  });

  test('3326: seçilen günde başlatmada plan dondurulur, kimse kaymaz; kalem başlangıç gününden önce başlamaz', async () => {
    const arkasiz = await teklifDenemesi(istek({}));
    const bas = await teklifDenemesi(istek({ yerlesim: 'baslat', baslangic: '2026-10-28' }));
    assert.ok(arkasiz && bas);
    assert.deepEqual(bas.kayan, []);
    const ilk = Math.min(...(bas.kalemler[0]?.islemler ?? []).map((o) => o.S));
    // planın günü 0 = 2026-10-19; 28 Ekim dokuzuncu gündür
    assert.ok(ilk >= 9 * 24, `ilk işlem ${String(ilk)}`);
    assert.ok((bas.kalemler[0]?.bitis ?? 0) > (arkasiz.kalemler[0]?.bitis ?? 0), 'arkaya eklemeden sonra biter');
    // başlangıç günü yalnız baslat'ta okunur
    const yok = await teklifDenemesi(istek({ yerlesim: 'arkaya', baslangic: '2026-10-28' }));
    assert.equal(yok?.kalemler[0]?.bitis, arkasiz.kalemler[0]?.bitis);
  });

  test('3326: seçilen günde başlatmada istenen termin yalnız ölçülür: kalem ileri yerleşir, kimse kaymaz, taban işlemleri yerinde kalır', async () => {
    const bas = await teklifDenemesi(istek({ yerlesim: 'baslat', baslangic: '2026-10-21' }));
    const terminli = await teklifDenemesi(istek({ yerlesim: 'baslat', baslangic: '2026-10-21', termin: '2026-11-13 23:00' }));
    assert.ok(bas && terminli);
    assert.deepEqual(terminli.kayan, []);
    // ileri yerleşim: termin verilse de kalem başlangıç gününden ileri dizilir, termine geriye yaslanmaz
    assert.equal(terminli.kalemler[0]?.bitis, bas.kalemler[0]?.bitis);
    assert.equal(terminli.kalemler[0]?.ulasir, true);
    // şerit penceresi termine göre uzar; tabanın kısa penceredeki sipariş blokları uzun pencerede aynı yerdedir
    const siparis = (r: NonNullable<typeof bas>) => (r.plan?.bloklar ?? []).filter((b) => b.tur === 'siparis').map((b) => JSON.stringify(b));
    const uzun = new Set(siparis(terminli));
    assert.ok(siparis(bas).length > 0);
    assert.ok(siparis(bas).every((b) => uzun.has(b)), 'taban işlemleri yerinde');
  });

  test('istenen termin yoksa plan dondurulur: başka siparişin bitişi değişmez, kalem arkaya yerleşir ve plan termini çalışma gününe düşer', async () => {
    const r = await teklifDenemesi(istek({}));
    assert.ok(r);
    assert.equal(r.baslangic, '2026-10-19');
    assert.deepEqual(r.kayan, []);
    const k = r.kalemler[0]!;
    assert.equal(k.tamam, true);
    assert.ok(k.bitis !== null && k.planTerminGun !== null);
    // bitiş + 2 gün; Cumartesi ya da Pazar ise Pazartesi (günler başlangıçtan sıra, 0 = Pazartesi)
    const ham = Math.floor((k.bitis + 48) / 24);
    assert.equal(k.planTerminGun, [5, 6].includes(ham % 7) ? ham + (7 - (ham % 7)) : ham);
    assert.equal(k.islemler.length, 1);
    assert.equal(k.islemler[0]?.m, '100');
    assert.equal(k.islemler[0]?.tl, 4 * 0.5 * 750);
    assert.deepEqual(k.kilit, { 'TK-1.10': { m: '100', S: k.islemler[0]?.S } });
    const ters = await teklifDenemesi(istek({ calisma: tabanli(true) }));
    assert.deepEqual(ters?.kayan, []);
    // kısa iş: kural onu uzun işlerin önüne alırdı; dondurulmuş denemede yine arkadadır
    const kisa = await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '50', adet: 1 }] }));
    assert.deepEqual(kisa?.kayan, []);
    // aynı kalem yakın terminle istenince atölye yeniden dağıtır ve başka siparişler kayar: dondurma boş sınama değildir
    const yakin = await teklifDenemesi(istek({ termin: '2026-10-19 23:00' }));
    assert.ok((yakin?.kayan.length ?? 0) > 0);
    assert.equal(yakin?.kalemler[0]?.ulasir, true);
  });

  test('kilitli satış taslağı yerinde kalır; düzenlenen taslak denemeye girmez', async () => {
    const yer = { 'ST-1-1.10': { m: '100', S: 10 * 24 + 8 } };
    const taslak = { id: 'ST-1', kalemler: [{ id: 'ST-1-1', urun: '50', adet: 4, termin: '2026-11-06 23:00' }], yerlesim: yer };
    const r = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak] }));
    assert.ok(r);
    assert.deepEqual(r.taslakYeri, yer);
    const r2 = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak], haric: 'ST-1' }));
    assert.deepEqual(r2?.taslakYeri, {});
  });

  test('eksik hammaddeli kalem karttaki tedarik süresiyle farazi satın almayla yerleşir', async () => {
    // stok 100 kg; O1 ve O2 52 kg kullanır, 30 adetlik teklif 60 kg ister: 12 kg eksik, tedarik 5 gün
    const r = await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '50', adet: 30 }] }));
    const k = r?.kalemler[0];
    assert.ok(k?.tamam);
    assert.equal(k.satinalma.length, 1);
    assert.deepEqual({ ...k.satinalma[0], miktar: Math.round(k.satinalma[0]!.miktar) }, { kod: 'H1', birim: 'kg', miktar: 12, gelis: r!.simdi + 5 * 24, gun: 5 });
    assert.ok((k.islemler[0]?.S ?? 0) >= r!.simdi + 5 * 24);
  });

  test('3347: yerleşmeyen kalem adımı ve motorun nedeniyle döner; rotası planda olmayan ürün ayrıca yazılır; plan şeridi yine kurulur', async () => {
    // 70'in tek adımı tezgâhı olmayan istasyonda (12): motor 'aday' nedeniyle yerleştiremez; 80'in rotası yok
    const adimli = (istasyon: string) => ({ base: null, steps: [{ id: `o-${istasyon}`, seq: 10, opNo: 10, opId: '13', stationId: istasyon, setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] });
    // 90: önce tezgâhsız 12, sonra torna 10; ikinci adım öncülü yerleşmediği için düşer
    const iki = { base: null, steps: [adimli('12').steps[0]!, { ...adimli('10').steps[0]!, id: 'o-90-20', seq: 20, opNo: 20, opId: '14' }] };
    const kayit = {
      ...KAYIT,
      items: [...KAYIT.items, { id: '70', code: 'MM-3', name: 'Ornek pim', type: 'mamul' }, { id: '80', code: 'MM-4', name: 'Ornek kapak', type: 'mamul' }, { id: '90', code: 'MM-5', name: 'Ornek flans', type: 'mamul' }],
      routes: { ...KAYIT.routes, 70: adimli('12'), 90: iki },
    };
    const kaynak = { ...KAYNAK, durum: { ...KAYNAK.durum, stations: [...KAYNAK.durum.stations, { id: '12', code: 'FRZ', name: 'Freze', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }] } };
    const r = await teklifDenemesi(istek({ kayit, kaynak, kalemler: [{ id: 'TK-1', urun: '70', adet: 2 }, { id: 'TK-2', urun: '80', adet: 2 }, { id: 'TK-3', urun: '90', adet: 2 }], gecerlilik: '2026-10-30' }));
    const [a, b, c] = r?.kalemler ?? [];
    assert.equal(a?.tamam, false);
    assert.equal(a.planTerminGun, null);
    assert.deepEqual(a.eksik, ['OP 10 Tornalama: işi yapabilecek tezgâh ya da fasoncu yok (İstasyonlar > Makineler)']);
    assert.equal(b?.tamam, false);
    assert.deepEqual(b.eksik, ['ürünün planda rotası yok (Reçete ve Rota)']);
    assert.equal(c?.tamam, false);
    assert.deepEqual(c.eksik, ['OP 10 Tornalama: işi yapabilecek tezgâh ya da fasoncu yok (İstasyonlar > Makineler)', 'OP 20 Taslama: önceki adım (OP 10 Tornalama) yerleşmedi']);
    assert.ok(r?.plan);
  });

  test('3355: firması belirlenmemiş fason adım yerleşir, ardılı düşmez; kalem fason notunu taşır, süre motor ayarındandır', async () => {
    // 95: torna, firmasız fason, taşlama. Fason adım "Firma belirlenmedi" hattında motor ayarının süresiyle (w.fasonGun) döner.
    const rota = { base: null, steps: [
      { id: 'o-95-10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] },
      { id: 'o-95-20', seq: 20, opNo: 20, opId: '15', stationId: null, fason: true, fasonId: null, setup: 0, cycle: 0, alts: [], altTimes: {}, ins: [] },
      { id: 'o-95-30', seq: 30, opNo: 30, opId: '14', stationId: '11', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] },
    ] };
    const kayit = { ...KAYIT, opdefs: [...KAYIT.opdefs, { id: '15', name: 'Kaplama' }], items: [...KAYIT.items, { id: '95', code: 'MM-6', name: 'Ornek kanat', type: 'mamul' }], routes: { ...KAYIT.routes, 95: rota } };
    const kaynak = { ...KAYNAK, durum: { ...KAYNAK.durum, fasonFirms: [] } };
    const calisma = tabanli() as { w: Record<string, unknown> };
    calisma.w = { ...calisma.w, fasonGun: 3 };
    const r = await teklifDenemesi(istek({ calisma, kayit, kaynak, kalemler: [{ id: 'TK-1', urun: '95', adet: 2 }] }));
    const k = r?.kalemler[0];
    assert.equal(k?.tamam, true, JSON.stringify(k?.eksik));
    const f = k.islemler.find((x) => x.fason)!;
    assert.equal(f.m, '@~belirsiz');
    assert.equal(f.C - f.S, 3 * 24);
    assert.ok(k.islemler.find((x) => x.adim === '30')!.S >= f.C);
    assert.deepEqual(k.fasonNotu, ['OP 20 Kaplama: firma belirlenmedi; 3 gün ile (Motor ayarları > Fason süresi) hesaplandı']);
    assert.ok(r?.plan?.hatlar.some((h) => h.m === '@~belirsiz' && h.ad === 'Firma belirlenmedi' && h.fason));
  });

  test('3347, 3457-3 a (Risk D1): ufka taşan adımlı kalem tamam sayılmaz, ufuk sonundan termin verilmez; sığmayan saat yazılır', async () => {
    const r = await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '60', adet: 1_000_000 }] }));
    const k = r?.kalemler[0];
    assert.equal(k?.tamam, false);
    assert.equal(k.bitis, null);
    assert.equal(k.eksik.length, 1);
    assert.match(k.eksik[0] ?? '', /^OP 10 Taslama: planlama süresinin dışına taşıyor, \d+ sa sığmadı$/);
  });

  test('ücreti girilmemiş tezgâhta işlemin TL si null, eksik listesinde yazar; sıfır sayılmaz', async () => {
    const r = await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '60', adet: 2 }] }));
    const k = r?.kalemler[0];
    assert.ok(k?.tamam);
    assert.equal(k.islemler[0]?.m, '101');
    assert.equal(k.islemler[0]?.tl, null);
    assert.ok(k.eksik.includes('101 saat ücreti'));
    assert.ok(k.eksik.includes('reçetede hammadde yok'));
  });

  test('plan şeridi: pencere şimdiden max(termin, geçerlilik) + 2 günün sonuna; kapalı günler, tezgâhlar sırayla ve blok türleri döner', async () => {
    // termin yok: pencerenin sonu kalemin plan termini ile geçerliliğin büyüğü (2026-11-06 = gün 18) + 2 gün
    const r = await teklifDenemesi(istek({ gecerlilik: '2026-11-06' }));
    const k = r?.kalemler[0];
    assert.ok(r?.plan && k?.planTerminGun != null);
    assert.equal(r.plan.bas, r.simdi);
    assert.equal(r.plan.bit, (Math.max(18, k.planTerminGun) + 3) * 24);
    for (const g of ['2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01']) assert.ok(r.plan.kapaliGunler.includes(g), g);
    assert.ok(!r.plan.kapaliGunler.includes('2026-10-20'));
    assert.deepEqual(r.plan.hatlar.map((h) => [h.m, h.fason]), [['100', false], ['101', false]]);
    const teklif = r.plan.bloklar.filter((b) => b.tur === 'teklif');
    assert.deepEqual(teklif.map((b) => [b.is, b.kalem, b.adim, b.m, b.S, b.C]), [['teklif', 1, '10', '100', k.islemler[0]?.S, k.islemler[0]?.C]]);
    const siparis = r.plan.bloklar.filter((b) => b.tur === 'siparis');
    assert.deepEqual([...new Set(siparis.map((b) => b.is))].sort(), ['O1', 'O2']);
    assert.ok(siparis.every((b) => b.kalem === null && !b.gecikir));
    assert.ok(r.plan.bloklar.every((b) => b.C > r.plan!.bas && b.S < r.plan!.bit));
  });

  test('plan şeridi: pencere dışındaki blok verilmez; satış taslağı bloğu taslak kimliği ve kalem sırasıyla gelir', async () => {
    const yer = { 'ST-1-1.10': { m: '100', S: 10 * 24 + 8 } };
    const taslak = { id: 'ST-1', kalemler: [{ id: 'ST-1-1', urun: '50', adet: 4, termin: '2026-11-06 23:00' }], yerlesim: yer };
    // termin 2026-10-22 (gün 3), geçerlilik yok: pencere gün 5 sonunda biter, gün 10'daki taslak dışarıda kalır
    const kisa = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak] }));
    assert.equal(kisa?.plan?.bit, 6 * 24);
    assert.ok(!kisa.plan.bloklar.some((b) => b.tur === 'satis-taslagi'));
    const uzun = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak], gecerlilik: '2026-11-06' }));
    assert.deepEqual(uzun?.plan?.bloklar.filter((b) => b.tur === 'satis-taslagi').map((b) => [b.is, b.kalem, b.adim, b.m, b.S]), [['ST-1', 1, '10', '100', 10 * 24 + 8]]);
  });

  test('plan şeridi: termini geçen sipariş gecikir diye işaretlenir', async () => {
    // O1 başlangıç günü 17:00'de bitmeli ama 40 adet 20 saat işler: hiçbir yerleşim ona ulaşamaz
    const kayit = { ...KAYIT, orders: KAYIT.orders.map((o) => (o.id === 'O1' ? { ...o, qty: 40, due: '2026-10-19' } : o)) };
    const r = await teklifDenemesi(istek({ calisma: calismaKur(), kayit, gecerlilik: '2026-11-06' }));
    const bloklar = r?.plan?.bloklar ?? [];
    assert.ok(bloklar.some((b) => b.is === 'O1'));
    assert.ok(bloklar.filter((b) => b.is === 'O1').every((b) => b.gecikir));
    assert.ok(bloklar.filter((b) => b.is === 'O2').every((b) => !b.gecikir));
  });

  test('çalışma yoksa null; süre aşılırsa reddedilir', async () => {
    assert.equal(await teklifDenemesi(istek({ calisma: null })), null);
    await assert.rejects(teklifDenemesi(istek({}), 1), /ms içinde bitmedi/);
  });
});
