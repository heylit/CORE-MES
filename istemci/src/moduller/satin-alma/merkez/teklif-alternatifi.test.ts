import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, KalemZarflariCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri, sekme } from './test-ekrani.ts';
import { S } from './store.ts';
import { quoteModal } from './ui.ts';
import { sonucRozeti } from './alternatif.ts';

// 3437-3a: teklif formunda zarfı olan kalemin altında alternatif satırı; gövdeye yalnız ekranın tuttuğu alternatif gider, sonuç sunucudandır.
const K1 = '00000000-0000-4000-8000-0000000000c1';
const K2 = '00000000-0000-4000-8000-0000000000c2';
const QA = '00000000-0000-4000-8000-0000000000a1';
const talep: Talep = {
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'degerlendirme', iptalNedeni: '', agirliklar: null,
  kalemler: [
    { id: K1, katalogId: null, ad: 'Deneme çubuk', ozellik: '', miktar: '6', birim: 'adet', kategori: '' },
    { id: K2, katalogId: null, ad: 'Deneme eldiven', ozellik: '', miktar: '2', birim: 'çift', kategori: '' },
  ],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-11-19T08:00:00.000Z', guncelleme: '2026-11-19T08:00:00.000Z',
};
const teklif = (fiyat: Talep['teklifler'][number]['fiyatlar'][number]): Talep['teklifler'][number] => ({
  id: QA, firmaId: 41, tedarikciAdi: 'Örnek Firma', teklifTarihi: '2026-11-19', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', nakliye: '0',
  digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 0, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null,
  revizyon: 0, fiyatlar: [fiyat],
});
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [talep], tedarikciler: [], katalog: [], firmaKartlari: [{ id: 41, ad: 'Örnek Firma' }],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};
const ZARFLAR: KalemZarflariCevabi = { kalemler: [{
  kalemId: K1, malzemeNo: 21, kabul: null,
  zarf: {
    kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
    kalite: { istenen: '6082', acik: true, kaynak: null, secenekler: [{ deger: '6061', tur: 'tam', notu: null }], sinir: false },
    durum: { istenen: 'T6', acik: true, kaynak: null, secenekler: [], sinir: false },
    form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }], pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: null },
    boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null, enAz: null, enCok: null, sinirKaynak: null }, yuzey: { istenen: null, serbest: false, kaynak: null, secenekler: [], sinir: false },
  },
}] };

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

const govdeler: { yol: string; govde: Record<string, unknown> }[] = [];
const bildirim = { bildir: () => 1, kaldir: () => {} };
async function ac(teklifler: Talep['teklifler']): Promise<() => void> {
  const veri: AcilisCevabi = { ...acilis, talepler: [{ ...talep, teklifler }] };
  govdeler.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const json = (g: unknown) => new Response(JSON.stringify(g), { status: 200, headers: { 'content-type': 'application/json' } });
    if (adres.endsWith('/kalem-zarflari')) return json(ZARFLAR);
    if (i?.method === 'POST') {
      const govde = JSON.parse(String(i.body)) as Record<string, unknown>;
      govdeler.push({ yol: adres, govde });
      return json({ ...veri.talepler[0], ...govde, surum: 2 });
    }
    return json(veri);
  }));
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  const kok = document.createElement('div');
  document.body.append(kok);
  const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {}, bildirim });
  await vi.waitFor(() => expect(talepSatiri(kok, talep.id)).not.toBeNull());
  talepSatiri(kok, talep.id)!.click();
  await vi.waitFor(() => expect(sekme(kok, 'quotes')).not.toBeNull());
  sekme(kok, 'quotes')!.click();
  return kapat;
}
const q = <T extends Element = HTMLInputElement>(s: string) => document.querySelector<T>(s);
const yaz = (i: HTMLInputElement, v: string): void => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
const fiyatlar = () => ((govdeler.at(-1)!.govde.teklifler as { fiyatlar: Record<string, unknown>[] }[])[0]!.fiyatlar);

describe('3437-3a: teklif formunda alternatif', () => {
  it('zarfı olan kalemde satır var, zarfsızda yok; işaretlenince nitelikler açılır, gövdeye alternatif gider', async () => {
    const kapat = await ac([]);
    quoteModal(S.requests[talep.id]!);
    await vi.waitFor(() => expect(q(`[data-alt-ac="${K1}"]`)).not.toBeNull());
    expect(q(`[data-alt-ac="${K2}"]`)).toBeNull();
    expect(q(`[data-alt="${K1}"]`)).toBeNull();
    q(`[data-alt-ac="${K1}"]`)!.click();
    await vi.waitFor(() => expect(q(`[data-alt="${K1}"][data-alt-f="kalite"]`)).not.toBeNull());
    expect(q(`[data-alt="${K1}"][data-alt-olcu="d"]`)!.placeholder).toBe('50');
    expect(q(`[data-alt="${K1}"][data-alt-f="yuzey"]`)).toBeNull();
    yaz(q(`[data-alt="${K1}"][data-alt-f="kalite"]`)!, '6061');
    yaz(q(`[data-alt="${K1}"][data-alt-olcu="d"]`)!, '52');
    const sec = q<HTMLSelectElement>('#q-sup')!;
    sec.value = '41';
    sec.dispatchEvent(new Event('change', { bubbles: true }));
    yaz(q(`[data-price="${K1}"]`)!, '10');
    yaz(q(`[data-price="${K2}"]`)!, '3');
    q<HTMLElement>('[data-act="save-quote"]')!.click();
    await vi.waitFor(() => expect(govdeler.length).toBeGreaterThan(0));
    expect(fiyatlar().map((f) => [f.kalemId, f.alternatif])).toEqual([
      [K1, { kalite: '6061', durum: null, yuzey: null, olcu: { d: 52 } }],
      [K2, undefined],
    ]);
    kapat();
  });

  it('kayıtlı alternatif ve sonucu formda görünür; işaret kaldırılınca gövdede null gider', async () => {
    const kapat = await ac([teklif({ kalemId: K1, birimFiyat: '10', alternatif: { kalite: '6061', durum: null, yuzey: null, olcu: {} },
      alternatifSonucu: { sonuc: 'sartli', nedenler: ['Kalite 6061'], izin: null } })]);
    await vi.waitFor(() => expect(S.requests[talep.id]?.quotes?.length).toBe(1));
    quoteModal(S.requests[talep.id]!, S.requests[talep.id]!.quotes![0]);
    await vi.waitFor(() => expect(q(`[data-alt="${K1}"][data-alt-f="kalite"]`)).not.toBeNull());
    expect(q(`[data-alt="${K1}"][data-alt-f="kalite"]`)!.value).toBe('6061');
    expect(q('[data-alt-sonuc="sartli"]')!.textContent).toBe('Şartlı, talep edenin onayı bekleniyor');
    // Alan değişince kayıtlı sonuç gösterilmez: kaydedilene kadar bilinmez.
    yaz(q(`[data-alt="${K1}"][data-alt-f="kalite"]`)!, '7075');
    expect(q('[data-alt-sonuc="sartli"]')).toBeNull();
    expect(q(`[data-alt-sonuc-kutu="${K1}"]`)!.textContent).toBe('Değişti; sonuç kaydedince yeniden hesaplanır.');
    q(`[data-alt-ac="${K1}"]`)!.click();
    await vi.waitFor(() => expect(q(`[data-alt="${K1}"]`)).toBeNull());
    q<HTMLElement>('[data-act="save-quote"]')!.click();
    await vi.waitFor(() => expect(govdeler.length).toBeGreaterThan(0));
    expect(fiyatlar()[0]!.alternatif).toBeNull();
    kapat();
  });
});

// T2 (3437-3a Test bakışı): dört sonuç ve şartlının dört izin durumu ayrı rozetle; ret seçilemez gibi okunur.
describe('3437-3b-1: alternatif sonuç rozeti', () => {
  it('her sonuç ve izin kendi metni ve tonuyla', () => {
    const r = (sonuc: 'ayni' | 'icinde' | 'sartli' | 'disi', izin: 'talep' | 'soru' | 'ret' | null = null) => {
      const d = document.createElement('div');
      d.innerHTML = sonucRozeti({ sonuc, nedenler: [], izin });
      const s = d.querySelector('[data-alt-sonuc]')!;
      return [s.textContent, s.className];
    };
    expect([r('ayni'), r('icinde'), r('disi')]).toEqual([
      ['İstenenle aynı', 'flag mute'], ['Sınır içinde', 'flag good'], ['Sınır dışı: seçilemez', 'flag bad']]);
    expect([r('sartli'), r('sartli', 'talep'), r('sartli', 'soru'), r('sartli', 'ret')]).toEqual([
      ['Şartlı, talep edenin onayı bekleniyor', 'flag warn'], ['Şartlı, talep eden kabul etti', 'flag warn'],
      ['Şartlı, talep eden onayladı', 'flag warn'], ['Şartlı, talep eden reddetti: seçilemez', 'flag bad']]);
    expect(sonucRozeti(undefined)).toBe('');
  });
});
