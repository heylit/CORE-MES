import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri, sekme } from './test-ekrani.ts';

const K1 = '00000000-0000-4000-8000-0000000000c1';
const QA = '00000000-0000-4000-8000-0000000000a1';
// Kişi ve tedarikçi uydurmadır.
const t: Talep = {
  id: '00000000-0000-4000-8000-000000000301', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'onayda', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: K1, katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '10', birim: 'adet', kategori: '' }],
  teklifIstekleri: [],
  teklifler: [{ id: QA, firmaId: 3, tedarikciAdi: 'Deneme A', teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
    nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: null,
    teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId: K1, birimFiyat: '100' }] }],
  karar: { mod: 'tek', teklifId: QA, bolunme: [], gerekce: '', kararVerenKisiId: 7, kararVerenAdi: 'Deneme Alıcı', kararTarihi: '2026-10-06', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
  onaylar: [], hareketler: [], senaryolar: [], surum: 2, olusturma: '2026-10-01T08:00:00.000Z', guncelleme: '2026-10-06T08:00:00.000Z',
};
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [t], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

async function ac(onaylayabilir: boolean): Promise<{ kok: HTMLElement; kapat: () => void }> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } })));
  const kok = document.createElement('div');
  document.body.append(kok);
  const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {}, onaylayabilir });
  await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
  talepSatiri(kok, t.id)!.click();
  await vi.waitFor(() => expect(kok.querySelector('[data-act="approval-form"]')).not.toBeNull());
  return { kok, kapat };
}

describe('TMI Ç5: Satın Alma ekranında onay düğmeleri yalnız onay işlemi olana', () => {
  it('onay işlemi olmayan satın almacı Onayla ve Reddet görmez; onayın kimde olduğu yazılır', async () => {
    const { kok, kapat } = await ac(false);
    expect(kok.querySelector('[data-act="approve"]')).toBeNull();
    expect(kok.querySelector('[data-act="reject"]')).toBeNull();
    expect(kok.textContent).toContain('Onay, onay yetkisi olan kişide');
    kapat();
  });
  it('onay işlemi olan kişi düğmeleri görür', async () => {
    const { kok, kapat } = await ac(true);
    expect(kok.querySelector('[data-act="approve"]')).not.toBeNull();
    expect(kok.querySelector('[data-act="reject"]')).not.toBeNull();
    kapat();
  });
});

describe('3431 a: e-postadaki Onayla ve Reddet talebi açıp ilgili denetime odaklanır', () => {
  afterEach(() => { window.history.replaceState(null, '', '/'); });
  for (const [eylem, secici] of [['onayla', '[data-act="approve"]'], ['reddet', '#ap-note']] as const) {
    it(`${eylem}: ${eylem === 'onayla' ? 'Onayla görünür alana alınır, odak almaz (tek Enter onaylamasın)' : 'ret notu odak alır'}; onay kendiliğinden verilmez`, async () => {
      const kaydir = vi.fn();
      Element.prototype.scrollIntoView = kaydir;
      const fetch = vi.fn(async (_yol: string, _secenek?: RequestInit) => new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } }));
      vi.stubGlobal('fetch', fetch);
      window.history.replaceState(null, '', `/satin-alma/onaylar?talep=${t.id}&eylem=${eylem}`);
      const kok = document.createElement('div');
      document.body.append(kok);
      const kapat = ekranliBagla(kok, { rol: 'approver', sayfa: 'dash', yol: '/satin-alma/onaylar', git: () => {}, onaylayabilir: true });
      if (eylem === 'reddet') await vi.waitFor(() => expect(document.activeElement).toBe(kok.querySelector(secici)));
      else {
        await vi.waitFor(() => expect(kaydir.mock.contexts).toContain(kok.querySelector(secici)));
        expect(document.activeElement).not.toBe(kok.querySelector(secici));
      }
      expect(fetch.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
      expect(new URLSearchParams(window.location.search).get('eylem')).toBeNull();
      expect(new URLSearchParams(window.location.search).get('talep')).toBe(t.id);
      kapat();
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    });
  }
});

describe('3431 a: onay yetkili satın almacının karar sekmesinde (views.ts) e-postadaki eylem aynı denetimi bulur', () => {
  afterEach(() => { window.history.replaceState(null, '', '/'); Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });
  it('onayla: Onayla görünür alana alınır, odak almaz; reddet: not alanı odak alır; yazma yok, eylem adresten silinir', async () => {
    for (const eylem of ['onayla', 'reddet'] as const) {
      const kaydir = vi.fn();
      Element.prototype.scrollIntoView = kaydir;
      const fetch = vi.fn(async (_yol: string, _secenek?: RequestInit) => new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } }));
      vi.stubGlobal('fetch', fetch);
      window.history.replaceState(null, '', `/satin-alma/talepler?talep=${t.id}&eylem=${eylem}`);
      const kok = document.createElement('div');
      document.body.append(kok);
      const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {}, onaylayabilir: true });
      await vi.waitFor(() => expect(kok.querySelector('[data-act="approval-form"]')).not.toBeNull());
      const onayla = kok.querySelector('[data-act="approve"]');
      expect(onayla?.getAttribute('data-onay-eylemi')).toBe('onayla');
      if (eylem === 'onayla') {
        // Ekran yeniden çizilebilir; kaydırılan öğe aynı işaretli Onayla düğmesidir.
        await vi.waitFor(() => expect((kaydir.mock.contexts as Element[]).some((e) => e.id === 'ap-onayla' && e.getAttribute('data-onay-eylemi') === 'onayla')).toBe(true));
        expect(document.activeElement?.getAttribute('data-onay-eylemi')).not.toBe('onayla');
      } else await vi.waitFor(() => expect(document.activeElement).toBe(kok.querySelector('#ap-note')));
      expect(new URLSearchParams(window.location.search).get('eylem')).toBeNull();
      expect(fetch.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
      kapat();
      document.body.innerHTML = '';
    }
  });
});

describe('TMI Ç3: Talepler süzgecinde onaylanıp siparişi beklenen talep "Onayda" sayılmaz', () => {
  // Sekme sayısı sıfırken çizilmez.
  const sayi = (kok: HTMLElement, v: string) => { const s = sekme(kok, v); return s ? (s.querySelector('.tc-gizli-etiket')?.textContent?.match(/\d+/)?.[0] ?? '0') : undefined; };
  async function liste(onaylar: Talep['onaylar']): Promise<{ kok: HTMLElement; kapat: () => void }> {
    const veri: AcilisCevabi = { ...acilis, talepler: [{ ...t, onaylar }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(veri), { status: 200, headers: { 'content-type': 'application/json' } })));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
    return { kok, kapat };
  }
  it('onay bekleyen Onayda sayılır', async () => {
    const { kok, kapat } = await liste([]);
    expect(sayi(kok, 'approval')).toBe('1');
    kapat();
  });
  it('onaylanmış talep Onayda sayılmaz, Açık\'ta kalır; Onayda süzgeci boş listeler', async () => {
    const { kok, kapat } = await liste([{ id: '00000000-0000-4000-8000-0000000000d1', zaman: '2026-10-06T10:00:00.000Z', kisiId: 9, kisiAdi: 'Deneme Müdür', sonuc: 'onay', dortGozsuz: false, notlar: '' }]);
    // Açılış verisi bir kez yüklenir; ikinci bağlamada yenileme gelene kadar beklenir.
    await vi.waitFor(() => expect(sayi(kok, 'approval')).toBe('0'));
    expect(sayi(kok, 'open')).toBe('1');
    sekme(kok, 'approval')!.click();
    await vi.waitFor(() => expect(talepSatiri(kok, t.id)).toBeNull());
    kapat();
  });
});
