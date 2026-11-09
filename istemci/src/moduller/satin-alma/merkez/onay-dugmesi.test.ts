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
