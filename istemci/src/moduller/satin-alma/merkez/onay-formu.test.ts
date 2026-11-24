import { afterEach, describe, expect, it } from 'vitest';
import type { Talep, Teklif } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { talepEkrana } from './tasiyici.ts';
import { approvalFormHTML } from './docs.ts';
import { evaluate } from './calc.ts';

const K1 = '00000000-0000-4000-8000-0000000000c1';
const K2 = '00000000-0000-4000-8000-0000000000c2';
const K3 = '00000000-0000-4000-8000-0000000000c3';
const QA = '00000000-0000-4000-8000-0000000000a1';
const QB = '00000000-0000-4000-8000-0000000000b1';
const teklif = (id: string, firmaId: number, ad: string, f1: string, f2: string): Teklif => ({
  id, firmaId, tedarikciAdi: ad, teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
  nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 0, avansYuzdesi: '0', garantiAy: 12,
  teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0,
  fiyatlar: [{ kalemId: K1, birimFiyat: f1 }, { kalemId: K2, birimFiyat: f2 }, { kalemId: K3, birimFiyat: f2 }],
});
const talep = (ek: Partial<Talep> = {}): Talep => ({
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'onayda', iptalNedeni: '', agirliklar: null,
  kalemler: [
    { id: K1, katalogId: null, ad: 'Deneme kalem 1', ozellik: '', miktar: '10', birim: 'adet', kategori: '' },
    { id: K2, katalogId: null, ad: 'Deneme kalem 2', ozellik: '', miktar: '4', birim: 'adet', kategori: '' },
    { id: K3, katalogId: null, ad: 'Deneme kalem 3', ozellik: '', miktar: '2', birim: 'adet', kategori: '' },
  ],
  teklifIstekleri: [], teklifler: [teklif(QA, 3, 'Deneme A', '10', '9'), teklif(QB, 4, 'Deneme B', '12', '5')],
  karar: { mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: K1, teklifId: QA }, { kalemId: K2, teklifId: QB }, { kalemId: K3, teklifId: QB }], gerekce: 'Deneme gerekçe', kararVerenKisiId: 7, kararVerenAdi: 'Deneme Alıcı', kararTarihi: '2026-10-12', ogrenilenler: '', sabitKurlar: [], siparisler: [], kurKilidi: null },
  onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
  ...ek,
});
const div = (h: string) => { const el = document.createElement('div'); el.innerHTML = h; return el; };

afterEach(() => { document.body.innerHTML = ''; });

describe('3590 Satın Alma Onay Formu', () => {
  it('kalemler tedarikçiye göre gruplanır, ara toplamlı; teklif ve ödeme tek tabloda, seçilen işaretli; gerekçe ağırlık adıyla; tek dipnot', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const el = div(approvalFormHTML(talepEkrana(talep())));
    const gruplar = [...el.querySelectorAll('tr.doc-grup')].map((x) => x.textContent?.trim());
    expect(gruplar).toEqual(['Deneme A', 'Deneme B']);
    expect([...el.querySelectorAll('tr.doc-ara')].map((x) => x.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Ara toplam: Deneme A'), expect.stringContaining('Ara toplam: Deneme B'),
    ]);
    const basliklar = [...el.querySelectorAll('h3')].map((x) => x.textContent);
    expect(basliklar).toContain('Değerlendirilen teklifler ve ödeme');
    expect(basliklar.filter((x) => /ödeme/i.test(x ?? ''))).toHaveLength(1);
    expect(el.querySelectorAll('tr.doc-sec')).toHaveLength(2);
    expect(el.querySelector('.doc-box')?.textContent).not.toContain('Kalan');
    expect(el.textContent).toContain('Değerlendirme ağırlığı:');
    expect(el.querySelectorAll('.doc-note')).toHaveLength(2); // dipnot ve onay seviyesi
    expect(el.querySelector('.sigs')?.querySelectorAll('.sig')).toHaveLength(3);
  });

  it('parçalı önizlemede toplam ve net maliyet yalnız karara giren kalemlerden (tam talep önce değerlendirilmiş olsa da)', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const r = talepEkrana(talep());
    evaluate(r);
    const tekA = { ...r.award!, mode: 'single' as const, quoteId: r.quotes.find((q) => q.supplierName === 'Deneme A' || q.id === QA)!.id, splits: undefined };
    const el = div(approvalFormHTML({ ...r, items: r.items.filter((it) => it.id === K1), award: tekA }, 2));
    const ayak = [...el.querySelectorAll('table.doc-t tfoot tr')].map((tr) => tr.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    // K1: 10 adet x 10 TL = 100 TL; dört kalemin toplamı değil.
    expect(ayak[0]).toMatch(/Toplam \(KDV hariç\)\s*100,00/);
    expect(ayak[1]).toMatch(/Net bugünkü maliyet.*100,00/);
    expect(el.querySelector('[data-doc-kalan]')?.textContent).toContain('Kalan 2 kalem');
  });

  it('parçalı kararda kalan kalem notu: sayı ve talep no, tutar yok', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const r = talepEkrana(talep());
    const once = div(approvalFormHTML(r, 2)).querySelector('[data-doc-kalan]')?.textContent ?? '';
    expect(once).toContain('Kalan 2 kalem');
    expect(once).not.toMatch(/₺|TL|\d+,\d{2}/);
    r.ayrilma = { ayrildigi: null, ayrilanlar: [{ id: '00000000-0000-4000-8000-000000000201', no: 'ST-2026-002', kalemSayisi: 2 }] };
    const sonra = div(approvalFormHTML(r)).querySelector('[data-doc-kalan]')?.textContent ?? '';
    expect(sonra).toBe('Kalan 2 kalem ST-2026-002 talebinde, ayrı onaya gelir.');
  });
});
