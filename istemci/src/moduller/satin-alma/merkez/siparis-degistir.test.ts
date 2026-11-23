import { afterEach, describe, expect, it, vi } from 'vitest';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, backend } from './store.ts';
import './ui.ts';
import { setOnaylayabilir } from './roles.ts';
import {
  degisiklikGecmisiHTML, degisiklikGovdesi, degisiklikHatalari, degisiklikOnerisiHTML, degisiklikTahmini, degisiklikTaslagiKur, siparisDegistirDugmesi, siparisDegistirHTML,
} from './siparis-degistir.ts';
import type { PurchaseRequest } from './tipler.ts';
import { poText } from './docs.ts';
import { awardOrders } from './calc.ts';

// 3574-2a: siparişi değiştir penceresi (tahmin, denetim, gövde), geçmiş ve onaylayan görünümü.
const talep = (): PurchaseRequest => ({
  id: 't-sd', no: 'ST-2026-009', title: 'Deneme', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'ordered',
  items: [{ id: 'k1', name: 'ORN kalem A', spec: '', qty: 10, unit: 'adet' }, { id: 'k2', name: 'ORN kalem B', spec: '', qty: 4, unit: 'adet' }],
  quotes: [{ id: 'qa', supplierId: '', supplierName: 'ORN Tedarikçi', date: '2026-10-05', currency: 'TRY', payDays: 30, prices: { k1: 10, k2: 5 } }],
  award: {
    mode: 'single', quoteId: 'qa', reason: '', by: '', decidedAt: '2026-10-06', approvals: [], orderNo: 'SA-0009',
    lines: [{ id: 1, itemId: 'k1', quoteId: 'qa', qty: 10, unit: 'adet', received: 3 }, { id: 2, itemId: 'k2', quoteId: 'qa', qty: 4, unit: 'adet', received: null }],
  },
  siparisGecmisi: { qa: { no: 1, kdvOrani: null, degisiklikler: [
    { id: 'd1', degisiklikNo: 1, sonuc: 'onaysiz', ozet: [{ alan: 'termin', kalemId: 'k1', kalemAdi: 'ORN kalem A', once: null, sonra: '2026-12-01', onayaDusurur: false }],
      onceTutar: '120', sonraTutar: '120', gerekce: 'ORN gerekçe', teyitKisi: 'ORN telefon', teyitTarihi: '2026-11-20', yapanKisiId: 1, yapanAdi: 'ORN Kişi', onaylayanKisiId: null, onaylayanAdi: null,
      kararNotu: '', dortGozsuz: false, zaman: '2026-11-20T09:00:00.000Z' },
  ] } },
  rfqs: [], log: [],
} as unknown as PurchaseRequest);

const oneriEkle = (r: PurchaseRequest, onerenId = 'u9'): PurchaseRequest => ({
  ...r, siparisOnerisi: {
    tur: 'siparis-degistir', paylar: [], basliklar: [], onayliTutar: 120, yeniTutar: 130, yeniFirmalar: [], gerekce: 'ORN artış', onerenId, onerenAdi: 'ORN Öneren', zaman: Date.parse('2026-11-23T08:00:00Z'),
    degisiklik: { teklifId: 'qa', ozet: [{ alan: 'miktar', kalemId: 'k2', kalemAdi: 'ORN kalem B', once: '4', sonra: '6', onayaDusurur: true }], onayNedenleri: ['Miktar artışı: ORN kalem B 4 → 6'], teyitKisi: '', teyitTarihi: null, degisiklikNo: 2 },
  },
} as unknown as PurchaseRequest);

afterEach(() => { vi.restoreAllMocks(); setOnaylayabilir(false); document.body.innerHTML = ''; });

describe('3574-2a tahmin ve gövde', () => {
  it('fiyat düşürme, termin ve not onaysızdır; miktar artışı ve vade onaya gider; tutar sipariş para biriminde hesaplanır', () => {
    const t = degisiklikTaslagiKur(talep(), 'qa')!;
    expect([t.no, t.satirlar.map((s) => s.received)]).toEqual([1, [3, 0]]);
    t.satirlar[0]!.price = 9; t.satirlar[0]!.exp = '2026-12-05'; t.satirlar[1]!.note = 'ORN not';
    let x = degisiklikTahmini(t);
    expect(x.nedenler).toEqual([]);
    expect([x.once, x.sonra]).toEqual([120, 110]);
    t.satirlar[1]!.qty = 6; t.baslik.payDays = 45;
    x = degisiklikTahmini(t);
    expect(x.nedenler).toEqual(['Miktar artışı: ORN kalem B 4 → 6', 'Ödeme şartı: vade 30 → 45 gün']);
  });

  it('teslim altına inilmez, bütün satırlar iptal edilemez, gerekçe zorunlu; gövde bütün satırları taşır', () => {
    const t = degisiklikTaslagiKur(talep(), 'qa')!;
    t.satirlar[0]!.qty = 2;
    expect(degisiklikHatalari(t).map((h) => h.alan)).toEqual(['sd-m-0', 'sd-gerekce']);
    t.satirlar[0]!.qty = 10; t.satirlar.forEach((s) => { s.iptal = true; }); t.gerekce = 'ORN';
    expect(degisiklikHatalari(t).map((h) => h.alan)).toEqual(['sd-m-0']);
    t.satirlar[0]!.iptal = false;
    expect(degisiklikHatalari(t)).toEqual([]);
    const g = degisiklikGovdesi(t);
    expect(g.satirlar.map((s) => [s.kalemId, s.miktar, s.birimFiyat, s.iptal])).toEqual([['k1', '10', '10', false], ['k2', '4', '5', true]]);
    expect(g.baslik).toEqual({ vadeGun: 30, kdvOrani: null, teslimYeri: '', tedarikciNotu: '', icNot: '' });
  });
});

describe('3574-2a pencere ve görünümler', () => {
  it('Y1: önceki değer ekran okuyucuya "önce" ile okunur; şerit aria-live; dört göz kapalıysa onay yetkilisine doğrudan uygulanır yazılır', () => {
    const t = degisiklikTaslagiKur(talep(), 'qa')!;
    t.satirlar[1]!.qty = 6;
    const kutu = document.createElement('div');
    kutu.innerHTML = siparisDegistirHTML(t, [], { onayli: false, dortGoz: true });
    expect(kutu.querySelector('[data-sd-sinif]')!.getAttribute('data-sd-sinif')).toBe('onay');
    expect(kutu.querySelector('[data-sa-sd-serit]')!.getAttribute('aria-live')).toBe('polite');
    expect(kutu.querySelector('[data-sd-satir="1"]')!.textContent).toContain('önceki değer 4');
    kutu.innerHTML = siparisDegistirHTML(t, [], { onayli: true, dortGoz: false });
    expect(kutu.querySelector('[data-sd-sinif]')!.getAttribute('data-sd-sinif')).toBe('dogrudan');
    // Teslimli satırda alt sınır görünür.
    expect(kutu.querySelector('[data-sd-satir="0"]')!.textContent).toContain('en az 3');
  });

  it('pencere kaydette hatalı alana odaklanır, rol=alert hata yazar; geçerli değişiklik gönderilir, onaya gidince pencere kapanır', async () => {
    const r = talep();
    S.requests[r.id] = r; S.ready = true; V.page = 'request'; V.id = r.id;
    const gonder = vi.spyOn(backend, 'siparisDegistir').mockResolvedValue('onayda');
    document.body.innerHTML = '<div data-sa-merkez><div id="gres"><button data-act="order-change">Siparişi değiştir</button></div><div id="modal-root"></div></div>';
    document.querySelector<HTMLElement>('[data-act="order-change"]')!.click();
    const m = document.querySelector<HTMLInputElement>('#sd-m-1')!;
    m.value = '6';
    document.querySelector<HTMLElement>('[data-act="sd-kaydet"]')!.click();
    expect(gonder).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Gerekçe zorunlu');
    expect(document.activeElement?.id).toBe('sd-gerekce');
    document.querySelector<HTMLTextAreaElement>('#sd-gerekce')!.value = 'ORN gerekçe';
    document.querySelector<HTMLElement>('[data-act="sd-kaydet"]')!.click();
    expect(gonder).toHaveBeenCalledTimes(1);
    expect(gonder.mock.calls[0]![1].satirlar[1]!.miktar).toBe('6');
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('#modal-root')!.innerHTML).toBe('');
  });

  it('R4: bekleyen değişiklik varken giriş kapalı ve nedeni okunur; onaylayan önce/sonra görür, öneren yalnız geri alır', () => {
    const r = oneriEkle(talep());
    const kutu = document.createElement('div');
    kutu.innerHTML = siparisDegistirDugmesi(r);
    const d = kutu.querySelector('button')!;
    expect(d.getAttribute('aria-disabled')).toBe('true');
    expect(kutu.querySelector(`#${d.getAttribute('aria-describedby')}`)!.textContent).toContain('Önce bekleyen değişiklik sonuçlansın');
    kutu.innerHTML = degisiklikOnerisiHTML(r, true, false);
    expect(kutu.querySelector('[data-act="sp-oneri-onayla"]')!.textContent).toContain('+10');
    expect(kutu.querySelector('tbody')!.textContent).toContain('önce 4');
    expect(kutu.querySelector('#sd-oneri-not')).not.toBeNull();
    kutu.innerHTML = degisiklikOnerisiHTML(r, true, true);
    expect([kutu.querySelector('[data-act="sp-oneri-onayla"]'), kutu.querySelector('[data-act="sd-geri-al"]')?.textContent]).toEqual([null, 'Öneriyi geri al']);
  });

  it('ret notu boşsa gönderilmez ve alan hatalı işaretlenir', () => {
    const r = oneriEkle(talep());
    S.requests[r.id] = r; S.ready = true; V.page = 'request'; V.id = r.id;
    setOnaylayabilir(true);
    const karar = vi.spyOn(backend, 'siparisOnerisiKarari').mockResolvedValue(true);
    document.body.innerHTML = `<div data-sa-merkez><div id="gres">${degisiklikOnerisiHTML(r, true, false)}</div><div id="modal-root"></div></div>`;
    document.querySelector<HTMLElement>('[data-act="sp-oneri-reddet"]')!.click();
    expect(karar).not.toHaveBeenCalled();
    expect(document.querySelector('#sd-oneri-not')!.getAttribute('aria-invalid')).toBe('true');
    document.querySelector<HTMLTextAreaElement>('#sd-oneri-not')!.value = 'ORN ret';
    document.querySelector<HTMLElement>('[data-act="sp-oneri-reddet"]')!.click();
    expect(karar).toHaveBeenCalledWith(r.id, 'ret', 'ORN ret');
  });

  it('geçmiş en yeni üstte; bekleyen R2? ile, R0 en altta; teyit yazılır', () => {
    const kutu = document.createElement('div');
    kutu.innerHTML = degisiklikGecmisiHTML(oneriEkle(talep()), 'qa');
    expect([...kutu.querySelectorAll('li')].map((li) => li.getAttribute('data-sd-gecmis'))).toEqual(['bekliyor', 'onaysiz', 'r0']);
    expect(kutu.querySelector('li')!.textContent).toContain('R2?');
    expect(kutu.querySelector('[data-sd-gecmis="onaysiz"]')!.textContent).toContain('Teyit: ORN telefon');
    // Fiyat görmeyen okuyucuda geçmiş gelmez (S5): bölüm hiç çizilmez.
    const r = talep(); r.siparisGecmisi!.qa!.degisiklikler = null;
    expect(degisiklikGecmisiHTML(r, 'qa')).toBe('');
  });

  it('sipariş metni revizyon numarasıyla gider, son değişikliğin satırı işaretlidir; R0 siparişte işaret yok', () => {
    const r = talep();
    const metin = poText(r, awardOrders(r)[0]!);
    expect(metin).toContain('R1 (değişiklik)');
    expect(metin.split('\n').filter((x) => x.includes('[R1 değişti]')).map((x) => x.slice(0, 14))).toEqual(['1. ORN kalem A']);
    r.siparisGecmisi!.qa!.no = 0;
    expect(poText(r, awardOrders(r)[0]!)).not.toContain('değiş');
  });
});
