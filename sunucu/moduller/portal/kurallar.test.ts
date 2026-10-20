import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  KURULUM_ISARETI, ODA_SURESI_MS, baslangicBelgeleri, bolumOkuyabilirMi, bolumYazabilirMi, kalemKodu, logoNiyetleri, ondalikMetni, portalRolu, portalUnvani, talepTeklifi, rolDegisiyorMu, canliEsler, derinBirlestir,
  durumYamala, erisebilirMi, talepKimligi, teklifDurumuBindir, fiyatGizle, gizliAlanlariKoru, islemOkuyabilirMi, esikleriBindir, siparisEsikleri, kilitAlinirMi, sorgula, sonParca, ustYolu, onayGeregi, onayGeregiKarsilaniyorMu, onayKarari, onayYazimiReddi, sonOnay,
} from './kurallar.ts';
import type { DepoBelgesi } from './kurallar.ts';

const belge = (kimlik: string, veri: Record<string, unknown>): DepoBelgesi => ({ yol: `k/${kimlik}`, kimlik, veri, surum: 1 });

describe('portal belge deposu kuralları', () => {
  test('BD-K1: yol üst koleksiyonuna ve kimliğine ayrılır', () => {
    assert.equal(ustYolu('channels/genel/msgs/m1'), 'channels/genel/msgs');
    assert.equal(sonParca('channels/genel/msgs/m1'), 'm1');
  });

  test('BD-K2: data/users/<kişi> yalnız o kişiye açık; data/users kimseye açık değil; öteki yollar herkese açık', () => {
    assert.equal(erisebilirMi('data/users/7/prefs', 7), true);
    assert.equal(erisebilirMi('data/users/7/prefs', 8), false);
    assert.equal(erisebilirMi('data/users/7', 7), true);
    assert.equal(erisebilirMi('data/users', 7), false);
    assert.equal(erisebilirMi('data/ayar', 7), true);
    assert.equal(erisebilirMi('orders/o1', 7), true);
  });

  test('BD-K3: birleştirme iç içe nesneleri birleştirir, diziyi ve düz değeri değiştirir, girdiyi değiştirmez', () => {
    const hedef = { a: { b: 1, c: 2 }, d: [1, 2], e: 'x' };
    const sonuc = derinBirlestir(hedef, { a: { c: 3 }, d: [9], f: true });
    assert.deepEqual(sonuc, { a: { b: 1, c: 3 }, d: [9], e: 'x', f: true });
    assert.deepEqual(hedef, { a: { b: 1, c: 2 }, d: [1, 2], e: 'x' });
  });

  test('BD-K4: sırasız sorgu kimliğe göre; sıralamada alanı olmayan sona düşer, eşitlikte kimlik belirler; sınır uygulanır', () => {
    const belgeler = [belge('c', { ts: 2 }), belge('a', { ts: 5 }), belge('b', {}), belge('d', { ts: 2 })];
    assert.deepEqual(sorgula(belgeler, {}).map((b) => b.kimlik), ['a', 'b', 'c', 'd']);
    assert.deepEqual(sorgula(belgeler, { sira: { alan: 'ts', yon: 'asc' } }).map((b) => b.kimlik), ['c', 'd', 'a', 'b']);
    assert.deepEqual(sorgula(belgeler, { sira: { alan: 'ts', yon: 'desc' }, sinir: 2 }).map((b) => b.kimlik), ['a', 'c']);
  });

  test('BD-K5: koşullar alanı olmayan belgeyi dışarıda bırakır; türler karışmaz', () => {
    const belgeler = [belge('a', { n: 1, t: ['x'] }), belge('b', { n: '1' }), belge('c', {}), belge('d', { n: 3 })];
    const kimlikler = (alan: string, islec: '==' | '!=' | '<' | '>=' | 'in' | 'not-in' | 'array-contains', deger: unknown) =>
      sorgula(belgeler, { filtreler: [{ alan, islec, deger }] }).map((b) => b.kimlik);
    assert.deepEqual(kimlikler('n', '==', 1), ['a']);
    assert.deepEqual(kimlikler('n', '!=', 1), ['b', 'd']);
    assert.deepEqual(kimlikler('n', '<', 3), ['a']);
    assert.deepEqual(kimlikler('n', '>=', 1), ['a', 'd']);
    assert.deepEqual(kimlikler('n', 'in', [3, '1']), ['b', 'd']);
    assert.deepEqual(kimlikler('n', 'not-in', [3]), ['a', 'b']);
    assert.deepEqual(kimlikler('t', 'array-contains', 'x'), ['a']);
  });

  test('BD-K6: kilit boşsa, süresi geçmişse ya da aynı sahibinse alınır; başkasının geçerli kilidi alınmaz', () => {
    assert.equal(kilitAlinirMi({ sahip: null, bitis: null }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's2', bitis: 100 }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's1', bitis: 500 }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's2', bitis: 500 }, 's1', 100), false);
  });

  test('BD-K7: oda durumu yamayla birleşir, null alanı siler; süresi geçen eş düşer', () => {
    assert.deepEqual(durumYamala({ a: 1, b: 2 }, { b: null, c: 3 }), { a: 1, c: 3 });
    const oda = new Map([[1, { durum: {}, guncellendi: 1000 }], [2, { durum: { yaziyor: 'genel' }, guncellendi: 1000 + ODA_SURESI_MS }]]);
    assert.deepEqual(canliEsler(oda, 1000 + ODA_SURESI_MS).map((e) => e.kisiId), [2]);
  });

  test('BD-K8: başlangıç belgeleri belge yoludur ve kurulum işareti varsa aralarındadır', () => {
    const belgeler = baslangicBelgeleri({ id: 5, ad: 'Deneme Kişi' }, 1_700_000_000_000, portalRolu(['portal.yonet']));
    for (const b of belgeler) assert.equal(b.yol.split('/').length % 2, 0, b.yol);
    if (KURULUM_ISARETI === null) assert.deepEqual(belgeler, []);
    else assert.equal(belgeler.some((b) => b.yol === KURULUM_ISARETI), true);
  });

  test('BD-K9: portal rolü TMI işlemlerinden; kurulum yetkisi tam, bölümler birleşir, bölümsüz kişi izinsiz', () => {
    assert.deepEqual(portalRolu(['portal.yonet', 'portal.satis']), { role: 'Genel müdür', tmiIzinler: ['*'], tmiRoller: ['Genel müdür'] });
    // Çok bölümlü kişi "Müdür" unvanıyla her bölümün onay rolünü taşır (demo bulgusu: dört bölümlü müdür "Satın alma müdürü" görünüyordu).
    const ikili = portalRolu(['portal.oku', 'portal.satis', 'portal.finans']);
    assert.deepEqual([ikili.role, ikili.tmiRoller], ['Müdür', ['Finans müdürü', 'Satış müdürü']]);
    for (const izin of ['sales', 'finance', 'approve']) assert.ok(ikili.tmiIzinler.includes(izin), izin);
    assert.deepEqual(portalRolu(['portal.kalite']).role, 'Kalite mühendisi');
    assert.deepEqual(portalRolu(['portal.oku', 'portal.yaz']), { role: 'Gözlemci', tmiIzinler: [], tmiRoller: [] });
  });

  test('BD-K9b: satın alma siparişini yalnız satın almada onay yetkisi olan onaylar (kullanıcı kararı 16.10.2026)', () => {
    const uzman = portalRolu(['portal.oku', 'portal.yaz', 'portal.satinalma']);
    assert.deepEqual([uzman.role, uzman.tmiRoller], ['Satın alma uzmanı', ['Satın alma uzmanı']]);
    assert.equal(uzman.tmiIzinler.includes('approve'), false);
    assert.equal(uzman.tmiIzinler.includes('purchase'), true);
    const onaylayan = portalRolu(['portal.oku', 'portal.yaz', 'portal.satinalma', 'satin-alma.onayla']);
    assert.deepEqual([onaylayan.role, onaylayan.tmiRoller], ['Satın alma müdürü', ['Satın alma müdürü']]);
    assert.equal(onaylayan.tmiIzinler.includes('approve'), true);
    // Satın almada onay yetkisi portal bölümü vermez: portal.satinalma olmadan onay rolü gelmez.
    assert.deepEqual(portalRolu(['satin-alma.onayla']).tmiRoller, []);
  });

  test('BD-K10: TMI kişisinin portal kullanıcısında rol ve izin değişikliği yakalanır; başka alan ve başka belge serbest', () => {
    const eski = { role: 'Genel müdür', tmiIzinler: ['*'], name: 'A' };
    assert.equal(rolDegisiyorMu('users/tmi-5', eski, { ...eski, role: 'Muhasebe' }), true);
    assert.equal(rolDegisiyorMu('users/tmi-5', eski, { ...eski, tmiIzinler: ['finance'] }), true);
    assert.equal(rolDegisiyorMu('users/tmi-5', null, { role: 'Muhasebe' }), true);
    assert.equal(rolDegisiyorMu('users/tmi-5', eski, { ...eski, name: 'B' }), false);
    assert.equal(rolDegisiyorMu('users/u-c1-1', eski, { ...eski, role: 'Muhasebe' }), false);
    assert.equal(rolDegisiyorMu('users/tmi-5', { ...eski, unvan: 'Fabrika müdürü' }, { ...eski, unvan: 'Genel müdür' }), true);
  });

  test('BD-K14: unvan kişi kartındaki görevdir; görev yoksa ya da boşsa portal rolü (kart #1163)', () => {
    const rol = portalRolu(['portal.satis', 'portal.finans']);
    assert.equal(portalUnvani('Fabrika müdürü', rol), 'Fabrika müdürü');
    assert.equal(portalUnvani('  ', rol), 'Müdür');
    assert.equal(portalUnvani(null, rol), 'Müdür');
  });
});

describe('portal Logo satış bağı kuralları (kart #941)', () => {
  test('LB-K1: yeni sürüm teklif, siparişe dönüşme tekliften sipariş, yeni satış siparişi sipariş niyeti verir; kabul ve satın alma vermez', () => {
    const v = (n: number) => ({ v: n });
    assert.deepEqual(logoNiyetleri('requests/q1', { versions: [v(1)] }, { versions: [v(1), v(2)] }), [{ tur: 'teklif', yol: 'requests/q1', surum: 2 }]);
    assert.deepEqual(logoNiyetleri('requests/q1', { versions: [v(1)], status: 'quoted' }, { versions: [v(1)], status: 'accepted', acceptedVersion: 1 }), []);
    assert.deepEqual(logoNiyetleri('requests/q1', { versions: [v(1)], status: 'accepted' }, { versions: [v(1)], status: 'ordered', acceptedVersion: 1, orderId: 'o9' }),
      [{ tur: 'tekliften-siparis', talepYol: 'requests/q1', surum: 1, siparisYol: 'orders/o9' }]);
    assert.deepEqual(logoNiyetleri('requests/q1', { versions: [v(1)], status: 'ordered' }, { versions: [v(1)], status: 'ordered', acceptedVersion: 1, orderId: 'o9' }), []);
    assert.deepEqual(logoNiyetleri('orders/o1', null, { type: 'sales', sourceNo: 'TKL-1' }), [{ tur: 'siparis', yol: 'orders/o1', kaynakNo: 'TKL-1' }]);
    assert.deepEqual(logoNiyetleri('orders/o1', { type: 'sales' }, { type: 'sales' }), []);
    assert.deepEqual(logoNiyetleri('orders/o1', null, { type: 'purchase' }), []);
    assert.deepEqual(logoNiyetleri('requests/q1/alt/x', null, { versions: [v(1)] }), []);
  });

  test('LB-K2: ondalık metin negatif ve sayı olmayanı reddeder, kayan nokta artığını atar', () => {
    assert.equal(ondalikMetni(12.5), '12.5');
    assert.equal(ondalikMetni(0.1 + 0.2), '0.3');
    assert.equal(ondalikMetni(-1), null);
    assert.equal(ondalikMetni('5'), null);
  });

  test('LB-K3: kalemin kodu yoksa yalnız o müşterinin satış listesinde tek eşleşen adın kodu alınır', () => {
    const kalem = { satirId: 1, kod: null, ad: 'Mil Ø20', miktar: '1', birim: 'adet', birimFiyat: '1', iskontoYuzdesi: null, termin: null };
    const katalog = [
      { side: 'sales', partyId: 'c1', name: 'mil ø20', code: 'K1' },
      { side: 'purchase', partyId: 'c1', name: 'Mil Ø20', code: 'K2' },
      { side: 'sales', partyId: 'c2', name: 'Mil Ø20', code: 'K3' },
    ];
    assert.equal(kalemKodu(kalem, 'c1', katalog), 'K1');
    assert.equal(kalemKodu(kalem, 'c3', katalog), null);
    assert.equal(kalemKodu({ ...kalem, kod: 'X' }, 'c1', katalog), 'X');
    assert.equal(kalemKodu(kalem, 'c1', [...katalog, { side: 'sales', partyId: 'c1', name: 'Mil Ø20', code: 'K4' }]), null);
  });

  test('LB-K4: teklif sürümü tesis gününe göre tarihlenir; termin teslim günüyle hesaplanır; sıfır iskonto gönderilmez', () => {
    const t = talepTeklifi({
      no: 'TKL-1', customerId: 'c1', currency: 'EUR', items: [{ name: 'A', qty: 3, unit: 'adet' }],
      versions: [{ v: 1, prices: [7], discount: 0, deliveryDays: 20, validUntil: '2026-12-31', createdAt: '2026-12-31T22:30:00.000Z' }],
    }, 1);
    assert.deepEqual(t, {
      no: 'TKL-1', tarih: '2027-01-01', gecerlilikBitis: '2026-12-31', paraBirimi: 'EUR', firmaKimligi: 'c1',
      kalemler: [{ satirId: 1, kod: null, ad: 'A', miktar: '3', birim: 'adet', birimFiyat: '7', iskontoYuzdesi: null, termin: '2027-01-21' }],
    });
    assert.equal(talepTeklifi({ no: 'TKL-1', versions: [] }, 1), null);
  });
});

describe('portal bölüm izni (KD-063)', () => {
  test('BD-K11: koleksiyona yalnız ilgili bölüm yazar; tam yetki her yere; firma kullanıcısını yalnız tam yetki, kendini kişi yazar', () => {
    const satinalma = portalRolu(['portal.satinalma']).tmiIzinler;
    assert.equal(bolumYazabilirMi('rfqs/r1', 5, satinalma, null, {}), true);
    assert.equal(bolumYazabilirMi('requests/q1', 5, satinalma, null, {}), false);
    assert.equal(bolumYazabilirMi('payments/p1', 5, satinalma, null, {}), false);
    assert.equal(bolumYazabilirMi('settings/main', 5, satinalma, {}, {}), false);
    assert.equal(bolumYazabilirMi('settings/main', 5, ['*'], {}, {}), true);
    assert.equal(bolumYazabilirMi('notifs/n1', 5, [], null, {}), true);
    assert.equal(bolumYazabilirMi('users/tmi-5', 5, [], {}, {}), true);
    assert.equal(bolumYazabilirMi('users/tmi-6', 5, satinalma, { partyId: 'firm' }, { partyId: 'firm' }), false);
    assert.equal(bolumYazabilirMi('users/u1', 5, satinalma, null, { partyId: 'c1' }), true);
    assert.equal(bolumYazabilirMi('users/u1', 5, portalRolu(['portal.kalite']).tmiIzinler, { partyId: 'c1' }, { partyId: 'firm' }), false);
    assert.equal(bolumYazabilirMi('ncrs/n1', 5, portalRolu(['portal.kalite']).tmiIzinler, null, {}), true);
  });

  test('BD-K12: siparişi yalnız türünün bölümü açar; mal kabul ve finans var olan siparişe yazar ama tür değiştiremez', () => {
    const kalite = portalRolu(['portal.kalite']).tmiIzinler;
    const satis = portalRolu(['portal.satis']).tmiIzinler;
    assert.equal(bolumYazabilirMi('orders/o1', 5, kalite, null, { type: 'sales' }), false);
    assert.equal(bolumYazabilirMi('orders/o1', 5, kalite, null, { type: 'purchase' }), false);
    // Kalite var olan siparişe de yazmaz (kart #1162): teslim almayı satın alma, faturayı finans yazar; satış siparişine satın alma yazmaz.
    const satinalma = portalRolu(['portal.satinalma']).tmiIzinler;
    const finans = portalRolu(['portal.finans']).tmiIzinler;
    assert.equal(bolumYazabilirMi('orders/o1', 5, kalite, { type: 'purchase' }, { type: 'purchase', deliveries: [1] }), false);
    assert.equal(bolumYazabilirMi('orders/o1', 5, kalite, { type: 'sales' }, { type: 'sales', deliveries: [1] }), false);
    assert.equal(bolumYazabilirMi('orders/o1', 5, satinalma, { type: 'purchase' }, { type: 'purchase', deliveries: [1] }), true);
    assert.equal(bolumYazabilirMi('orders/o1', 5, satinalma, { type: 'sales' }, { type: 'sales', deliveries: [1] }), false);
    assert.equal(bolumYazabilirMi('orders/o1', 5, finans, { type: 'sales' }, { type: 'sales', invoices: [1] }), true);
    assert.equal(bolumYazabilirMi('orders/o1', 5, satis, { type: 'sales' }, { type: 'sales', deliveries: [1] }), true);
    assert.equal(bolumYazabilirMi('orders/o1', 5, kalite, { type: 'purchase' }, { type: 'sales' }), false);
    assert.equal(bolumYazabilirMi('orders/o1', 5, satis, null, { type: 'sales' }), true);
    assert.equal(bolumYazabilirMi('orders/o1', 5, satis, null, { type: 'purchase' }), false);
    assert.equal(bolumYazabilirMi('requests/q1', 5, kalite, null, {}), false);
  });

  test('BD-K13: satış ve satın alma kayıtlarını kalite okuyamaz; bölümü, finans ve tam yetki okur; kalite satın alma siparişini okur (kart #1162)', () => {
    const kalite = portalRolu(['portal.kalite']).tmiIzinler;
    assert.deepEqual(kalite, ['docs', 'partners', 'quality']);
    for (const yol of ['requests/q1', 'rfqs/r1', 'bids/b1', 'priceReqs/p1', 'catalog/c1']) assert.equal(bolumOkuyabilirMi(yol, kalite, {}), false, yol);
    assert.equal(bolumOkuyabilirMi('orders/o1', kalite, { type: 'sales' }), false);
    assert.equal(bolumOkuyabilirMi('orders/o1', kalite, { type: 'purchase' }), true);
    assert.equal(bolumOkuyabilirMi('ncrs/n1', kalite, {}), true);
    assert.equal(bolumOkuyabilirMi('parties/f1', kalite, {}), true);
    const satis = portalRolu(['portal.satis']).tmiIzinler;
    assert.equal(bolumOkuyabilirMi('requests/q1', satis, {}), true);
    assert.equal(bolumOkuyabilirMi('orders/o1', satis, { type: 'sales' }), true);
    assert.equal(bolumOkuyabilirMi('rfqs/r1', portalRolu(['portal.satinalma']).tmiIzinler, {}), true);
    assert.equal(bolumOkuyabilirMi('orders/o1', portalRolu(['portal.finans']).tmiIzinler, { type: 'sales' }), true);
    assert.equal(bolumOkuyabilirMi('requests/q1', ['*'], {}), true);
    assert.equal(bolumOkuyabilirMi('requests/q1', [], {}), false);
    assert.equal(bolumOkuyabilirMi('messages/m1', [], {}), true);
  });

  test('BD-K-ONAY: sipariş eşikleri satın alma limitlerinin 1. ve 2. basamağından gelir; eksik basamak alanı düşürür, eski değer geçmez', () => {
    const ayar = (rules: Record<string, unknown>): DepoBelgesi => ({ yol: 'settings/main', kimlik: 'main', veri: { rules, notify: { remindH: 24 } }, surum: 3 });
    const limit = (azamiTutar: string | null) => ({ azamiTutar });
    assert.deepEqual(siparisEsikleri([limit('50000.00'), limit('250000.00'), limit('1000000.00'), limit(null)]), { poMgr: 50000, poGM: 250000 });
    assert.deepEqual(siparisEsikleri([limit('50000.00')]), { poMgr: 50000 });
    assert.deepEqual(siparisEsikleri([limit(null), limit('250000')]), { poGM: 250000 });
    assert.deepEqual(siparisEsikleri([]), {});
    const bindi = esikleriBindir(ayar({ poMgr: 250000, poGM: 1000000, payFin: 150000 }), [limit('50000.00'), limit('250000.00')]);
    assert.deepEqual(bindi.veri, { rules: { payFin: 150000, poMgr: 50000, poGM: 250000 }, notify: { remindH: 24 } });
    assert.deepEqual(esikleriBindir(ayar({ poMgr: 250000, poGM: 1000000, payFin: 150000 }), []).veri['rules'], { payFin: 150000 });
    const baska: DepoBelgesi = { yol: 'settings/baska', kimlik: 'baska', veri: { rules: { poMgr: 1 } }, surum: 1 };
    assert.equal(esikleriBindir(baska, [limit('50000')]), baska);
    assert.equal(baslangicBelgeleri({ id: 1, ad: 'x' }, 0, portalRolu(['portal.yonet'])).some((b) => 'poMgr' in ((b.veri['rules'] ?? {}) as object)), false);
  });

  test('BD-K20: onay kararı sıradaki adımı kişinin rolüyle, sunucu kişi ve zamanıyla verir (kart #1583)', () => {
    const onay = { status: 'pending', requestedBy: 'tmi-1', steps: [{ role: 'Satış müdürü', status: 'pending' }, { role: 'Genel müdür', status: 'pending' }], history: [] };
    const an = '2026-10-16T12:00:00.000Z';
    const mudur = portalRolu(['portal.satis', 'portal.finans']);
    const ilk = onayKarari(onay, { onay: true, not: '', kendi: 'tmi-2', rol: mudur, an });
    assert.ok('veri' in ilk);
    assert.deepEqual(ilk.veri['steps'], [{ role: 'Satış müdürü', status: 'approved', u: 'tmi-2', at: an, note: '' }, { role: 'Genel müdür', status: 'pending' }]);
    assert.equal(ilk.veri['status'], 'pending');
    assert.deepEqual(ilk.veri['history'], [{ at: an, by: 'firm', u: 'tmi-2', text: 'Onaylandı (Müdür)' }]);
    // Genel müdür adımını müdür veremez; aynı onayda ikinci adımı da veremez. Genel müdür verir ve onay tamamlanır.
    assert.deepEqual(onayKarari(ilk.veri, { onay: true, not: '', kendi: 'tmi-3', rol: mudur, an }), { hata: 'yetki', ileti: 'Bu adımı yalnız Genel müdür onaylar.' });
    assert.equal((onayKarari(ilk.veri, { onay: true, not: '', kendi: 'tmi-2', rol: portalRolu(['portal.yonet']), an }) as { hata: string }).hata, 'yetki');
    const son = onayKarari(ilk.veri, { onay: true, not: '', kendi: 'tmi-4', rol: portalRolu(['portal.yonet']), an });
    assert.ok('veri' in son && son.veri['status'] === 'approved');
    assert.equal((onayKarari(onay, { onay: true, not: '', kendi: 'tmi-1', rol: mudur, an }) as { hata: string }).hata, 'yetki');
    assert.equal((onayKarari(onay, { onay: false, not: ' ', kendi: 'tmi-2', rol: mudur, an }) as { hata: string }).hata, 'dogrulama');
    // Onay yetkisi olmayan satın almacının portal rolü "Satın alma uzmanı"dır; müdür adımını veremez.
    const sa = { ...onay, steps: [{ role: 'Satın alma müdürü', status: 'pending' }] };
    assert.equal((onayKarari(sa, { onay: true, not: '', kendi: 'tmi-2', rol: portalRolu(['portal.satinalma']), an }) as { hata: string }).hata, 'yetki');
    assert.ok('veri' in onayKarari(sa, { onay: true, not: '', kendi: 'tmi-2', rol: portalRolu(['portal.satinalma', 'satin-alma.onayla']), an }));
  });

  test('BD-K21: genel yazma onay kaydının karar alanlarını ve bekleyen onaya bağlı durumu değiştiremez (kart #1583)', () => {
    const onay = { kind: 'po', refCol: 'orders', refId: 'o1', status: 'pending', requestedBy: 'tmi-1', steps: [{ role: 'Satın alma müdürü', status: 'pending' }] };
    assert.equal(onayYazimiReddi('approvals/a1', null, onay, 'tmi-1'), null);
    assert.notEqual(onayYazimiReddi('approvals/a1', null, onay, 'tmi-2'), null);
    assert.notEqual(onayYazimiReddi('approvals/a1', onay, { ...onay, status: 'approved' }, 'tmi-1'), null);
    assert.equal(onayYazimiReddi('approvals/a1', onay, { ...onay, title: 'yeni ad' }, 'tmi-1'), null);
    assert.notEqual(onayYazimiReddi('approvals/a1', onay, null, 'tmi-1'), null);
    assert.equal(onayYazimiReddi('approvals/a1/alt/b', null, { status: 'approved' }, 'tmi-1'), null);

    assert.deepEqual(onayGeregi('orders/o1', { approvalState: 'pending' }, { approvalState: 'approved' }), { refCol: 'orders', refId: 'o1', tur: 'po', sonuc: 'approved' });
    assert.ok('red' in (onayGeregi('orders/o1', { approvalState: 'pending' }, {}) ?? {}));
    assert.equal(onayGeregi('orders/o1', null, { approvalState: 'pending' }), null);
    assert.equal(onayGeregi('orders/o1', { approvalState: 'approved' }, { approvalState: 'approved', note: 'x' }), null);
    assert.deepEqual(onayGeregi('payments/p1', { status: 'awaiting' }, { status: 'sent' }), { refCol: 'payments', refId: 'p1', tur: 'payment', sonuc: 'approved' });
    assert.equal(onayGeregi('payments/p1', { status: 'sent' }, { status: 'confirmed' }), null);
    assert.deepEqual(onayGeregi('parties/s1', { bankChange: { status: 'pending' } }, { bankChange: { status: 'rejected' } }), { refCol: 'parties', refId: 's1', tur: 'iban', sonuc: 'rejected' });
    assert.deepEqual(onayGeregi('priceReqs/r1', { pendingApproval: 'a9', status: 'open' }, { pendingApproval: 'a9', status: 'approved' }), { onayKimligi: 'a9', sonuc: 'approved' });
    assert.deepEqual(onayGeregi('requests/q1', { pendingApproval: 'a9' }, { pendingApproval: null }), { onayKimligi: 'a9', sonuc: 'karar' });

    const onaylar = [
      { kind: 'po', refCol: 'orders', refId: 'o1', at: '2026-10-01T00:00:00Z', status: 'approved' },
      { kind: 'po', refCol: 'orders', refId: 'o1', at: '2026-10-02T00:00:00Z', status: 'pending' },
    ];
    assert.equal(sonOnay(onaylar, 'orders', 'o1', 'po')?.['status'], 'pending');
    assert.equal(onayGeregiKarsilaniyorMu(sonOnay(onaylar, 'orders', 'o1', 'po'), 'approved'), false);
    assert.equal(onayGeregiKarsilaniyorMu({ status: 'rejected' }, 'karar'), true);
    assert.equal(onayGeregiKarsilaniyorMu(null, 'karar'), false);
  });

  // Karar 180: fiyat ve maliyeti yalnız yönetici ve müdür görür. Fiyat siparisler.fiyat-oku, fatura, ödeme ve ceza finans.oku ister.
  const FIYAT = ['siparisler.fiyat-oku'];
  const FINANS = ['finans.oku'];
  test('BD-K30: sözleşme ve satış fiyat listesi fiyat işlemi, ödeme ve mutabakat finans işlemi ister; satın alma kataloğu ve öteki koleksiyonlar açık', () => {
    for (const yol of ['contracts/k1']) {
      assert.equal(islemOkuyabilirMi(yol, [], {}), false, yol);
      assert.equal(islemOkuyabilirMi(yol, FINANS, {}), false, yol);
      assert.equal(islemOkuyabilirMi(yol, FIYAT, {}), true, yol);
    }
    assert.equal(islemOkuyabilirMi('catalog/c1', [], { side: 'sales' }), false);
    assert.equal(islemOkuyabilirMi('catalog/c1', FIYAT, { side: 'sales' }), true);
    assert.equal(islemOkuyabilirMi('catalog/c2', [], { side: 'purchase' }), true);
    for (const yol of ['payments/p1', 'cheques/c1', 'recons/r1']) {
      assert.equal(islemOkuyabilirMi(yol, FIYAT, {}), false, yol);
      assert.equal(islemOkuyabilirMi(yol, FINANS, {}), true, yol);
    }
    for (const yol of ['orders/o1', 'requests/q1', 'parties/f1', 'messages/m1']) assert.equal(islemOkuyabilirMi(yol, [], {}), true, yol);
  });

  const satis = {
    type: 'sales', no: 'SS-1', items: [{ name: 'Mil', qty: 4, price: 30 }, { name: 'Pim', qty: 2, price: 5 }],
    invoices: [{ no: 'F1', amount: 144 }], penalties: [{ amount: 3 }], deliveries: [{ qtys: [4, 2] }],
  };
  test('BD-K31: satış siparişinde fiyat yalnız fiyat işlemiyle, fatura ve ceza yalnız finans işlemiyle görünür; satın alma siparişi değişmez', () => {
    const fiyatsiz = fiyatGizle('orders/o1', satis, FINANS);
    assert.deepEqual(fiyatsiz['items'], [{ name: 'Mil', qty: 4, price: null }, { name: 'Pim', qty: 2, price: null }]);
    assert.deepEqual(fiyatsiz['invoices'], satis.invoices);
    const finanssiz = fiyatGizle('orders/o1', satis, FIYAT);
    assert.deepEqual(finanssiz['items'], satis.items);
    assert.deepEqual([finanssiz['invoices'], finanssiz['penalties']], [[], []]);
    assert.deepEqual(fiyatGizle('orders/o1', satis, [...FIYAT, ...FINANS]), satis);
    assert.deepEqual(fiyatGizle('orders/o1', { ...satis, type: 'purchase' }, []), { ...satis, type: 'purchase' });
    assert.deepEqual(fiyatGizle('orders/o1', satis, [])['deliveries'], satis.deliveries);
    assert.equal(satis.items[0]?.price, 30, 'girdi değişmez');
  });

  test('BD-K32: fiyatı görmeyenin yazısı gizli alanları silemez ve değiştiremez; görenin yazısı olduğu gibi kalır', () => {
    const gizli = fiyatGizle('orders/o1', satis, []);
    const yazi = { ...gizli, deliveries: [{ qtys: [4, 2] }, { qtys: [1, 0] }] };
    const korunan = gizliAlanlariKoru('orders/o1', satis, yazi, []);
    assert.deepEqual(korunan['items'], satis.items);
    assert.deepEqual([korunan['invoices'], korunan['penalties']], [satis.invoices, satis.penalties]);
    assert.deepEqual(korunan['deliveries'], yazi.deliveries);
    const sahte = { ...satis, items: [{ name: 'Mil', qty: 4, price: 1 }, { name: 'Pim', qty: 2, price: 1 }] };
    assert.deepEqual(gizliAlanlariKoru('orders/o1', satis, sahte, [])['items'], satis.items);
    assert.deepEqual(gizliAlanlariKoru('orders/o1', satis, sahte, [...FIYAT, ...FINANS]), sahte);
    assert.deepEqual(gizliAlanlariKoru('orders/o1', null, satis, []), satis, 'yeni sipariş korunacak eski değer taşımaz');
  });

  test('BD-K33: teklif talebi sürüm fiyatları fiyat işlemi olmayana boş gider; yazısında var olan sürümün fiyatı korunur, yeni sürümünki yazandan gelir', () => {
    const talep = { no: 'TKL-1', items: [{ name: 'Mil' }, { name: 'Pim' }], versions: [{ v: 1, prices: [12, 4], discount: 5 }] };
    assert.deepEqual(fiyatGizle('requests/q1', talep, [])['versions'], [{ v: 1, prices: [null, null], discount: 5 }]);
    assert.deepEqual(fiyatGizle('requests/q1', talep, FIYAT), talep);
    const yazi = { ...fiyatGizle('requests/q1', talep, []), versions: [{ v: 1, prices: [null, null], discount: 5 }, { v: 2, prices: [11, 4] }] };
    assert.deepEqual(gizliAlanlariKoru('requests/q1', talep, yazi, [])['versions'], [{ v: 1, prices: [12, 4], discount: 5 }, { v: 2, prices: [11, 4] }]);
    assert.deepEqual(gizliAlanlariKoru('requests/q1', talep, yazi, FIYAT), yazi);
    assert.deepEqual(talep.versions[0]?.prices, [12, 4], 'girdi değişmez');
  });

  test('BD-K34: geçmiş metnindeki ve teklif notundaki tutar fiyat ve finans işlemi olmayana "—" gider; yazısında eski metin geri konur', () => {
    const siparis = {
      ...satis,
      history: [{ at: 't1', text: 'Fatura kesildi: F1, ₺1.234,50' }, { at: 't2', text: 'Gecikme cezası uygulandı: -€3,00' }, { at: 't3', text: 'Sevk edildi: 4 adet' }],
    };
    const gizli = fiyatGizle('orders/o1', siparis, []);
    assert.deepEqual(dizi(gizli['history']).map((h) => h['text']), ['Fatura kesildi: F1, —', 'Gecikme cezası uygulandı: —', 'Sevk edildi: 4 adet']);
    assert.deepEqual(dizi(fiyatGizle('orders/o1', siparis, FIYAT)['history']).map((h) => h['text'])[0], 'Fatura kesildi: F1, —');
    assert.deepEqual(fiyatGizle('orders/o1', siparis, [...FIYAT, ...FINANS])['history'], siparis.history);
    const yazi = { ...gizli, history: [...dizi(gizli['history']), { at: 't4', text: 'Teslim alındı' }] };
    assert.deepEqual(gizliAlanlariKoru('orders/o1', siparis, yazi, [])['history'], [...siparis.history, { at: 't4', text: 'Teslim alındı' }]);

    const talep = {
      items: [{ name: 'Mil' }],
      versions: [{ v: 1, prices: [12], note: 'Birim 12 TL, kaplama $40 ve 1.250,00 USD ayrıca.' }],
      history: [{ at: 't1', text: 'Sürüm 1 gönderildi: ₺12 bin' }, { at: 't2', text: 'Teklif talebi oluşturuldu' }],
    };
    const gizliTalep = fiyatGizle('requests/q1', talep, []);
    assert.deepEqual(dizi(gizliTalep['versions'])[0]?.['note'], 'Birim —, kaplama — ve — ayrıca.');
    assert.deepEqual(dizi(gizliTalep['history']).map((h) => h['text']), ['Sürüm 1 gönderildi: —', 'Teklif talebi oluşturuldu']);
    assert.deepEqual(fiyatGizle('requests/q1', talep, FIYAT), talep);
    const talepYazisi = { ...gizliTalep, versions: [...dizi(gizliTalep['versions']), { v: 2, prices: [11], note: 'yeni' }] };
    const korunan = gizliAlanlariKoru('requests/q1', talep, talepYazisi, []);
    assert.deepEqual(dizi(korunan['versions']).map((v) => v['note']), [talep.versions[0]?.note, 'yeni']);
    assert.deepEqual(korunan['history'], talep.history);
  });
});

describe('Siparişler teklif durumu (254 a)', () => {
  const talep: DepoBelgesi = { yol: 'requests/q1', kimlik: 'q1', surum: 3, veri: { status: 'quoted', versions: [{ v: 1, prices: [12] }] } };

  test('bağlı talebin durumu Siparişler\'den gelir; fiyat, sürüm ve öteki alanlar Portal\'ın kopyasından kalır', () => {
    const bindi = teklifDurumuBindir(talep, 'kabul');
    assert.deepEqual(bindi, { ...talep, veri: { ...talep.veri, status: 'accepted' } });
    assert.deepEqual(talep.veri['status'], 'quoted');
    const karsilik = { yeni: 'new', verildi: 'quoted', revizyon: 'revision', kabul: 'accepted', red: 'rejected', siparis: 'ordered' } as const;
    for (const [d, s] of Object.entries(karsilik)) assert.equal(teklifDurumuBindir(talep, d as keyof typeof karsilik).veri['status'], s);
  });

  test('bağı olmayan talep ve talep dışı belge değişmez', () => {
    assert.equal(teklifDurumuBindir(talep, undefined), talep);
    const siparis: DepoBelgesi = { yol: 'orders/o1', kimlik: 'o1', surum: 1, veri: { status: 'production' } };
    assert.equal(teklifDurumuBindir(siparis, 'red'), siparis);
    assert.equal(talepKimligi('requests/q1'), 'q1');
    assert.equal(talepKimligi('requests/q1/ek'), null);
    assert.equal(talepKimligi('orders/o1'), null);
  });
});

const dizi = (d: unknown): Record<string, unknown>[] => (Array.isArray(d) ? d as Record<string, unknown>[] : []);
