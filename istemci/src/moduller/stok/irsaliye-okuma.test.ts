import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { ayniNo, gecerliTarih, metinYeterli, okunanBilgiler, pdfSatirlari, sayfaCozunurlugu, sayfalariBirlestir } from './irsaliye-okuma.ts';
import { OKUMA_SURESI_MS, enCok, okuyucuAyarla, pdfMi, pdfOkumasi, sayfaOkumasi } from './irsaliye-okuyucu.ts';
import { irsaliyePdfi } from './irsaliye-pdf.ts';

// 3063 dilim 3: okunan irsaliye metninden öneri. Metinler uydurmadır (ORN-).
afterEach(() => { okuyucuAyarla(null); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('İrsaliye okuma kuralı (3063 dilim 3)', () => {
  it('etiketli irsaliye no, sipariş no ve tarih aynı satırdan ya da alt satırdan alınır', () => {
    const metin = [
      'ORN TEDARİK SANAYİ VE TİCARET A.Ş. SEVK İRSALİYESİ',
      'Örnek Mah. Deneme Cad. No:1 İrsaliye No: ORN-IRS-2026-0042',
      'Vergi Dairesi: ÖRNEK VKN: 0000000000 Düzenleme Tarihi: 12.11.2026',
      'Sipariş No',
      'ORN-SAS-0815',
    ].join('\n');
    expect(okunanBilgiler(metin)).toEqual({ irsaliyeNo: 'ORN-IRS-2026-0042', siparisNo: 'ORN-SAS-0815', tarih: '12.11.2026' });
  });

  it('OCR harf karışıklığı yalnız tarihte düzeltilir; geçersiz gün, rakamsız değer ve etiketsiz metin öneri vermez', () => {
    expect(okunanBilgiler('Sevk Tarihi : l2/O1/2026').tarih).toBe('12.01.2026');
    expect(okunanBilgiler('İrsaliye Tarihi 31.02.2026').tarih).toBeNull();
    expect(okunanBilgiler('IRSALIYE NO: DENEME').irsaliyeNo).toBeNull();
    expect(okunanBilgiler('Teslim eden: ORN-IRS-7')).toEqual({ irsaliyeNo: null, siparisNo: null, tarih: null });
    expect(gecerliTarih(29, 2, 2028)).toBe(true);
    expect(gecerliTarih(29, 2, 2027)).toBe(false);
  });

  it('etiket yoksa e-irsaliye biçimindeki numara önerilir; birden çok sayfada her bilgi ilk bulunduğu sayfadan gelir', () => {
    expect(okunanBilgiler('e-İrsaliye\nORN2026000000042 sayılı belge').irsaliyeNo).toBe('ORN2026000000042');
    expect(okunanBilgiler('Seri-Sıra No: ORN2026000000043').irsaliyeNo).toBe('ORN2026000000043');
    const b = sayfalariBirlestir([
      { irsaliyeNo: null, siparisNo: 'ORN-SAS-1', tarih: null },
      { irsaliyeNo: 'ORN-IRS-2', siparisNo: 'ORN-SAS-9', tarih: '01.11.2026' },
    ]);
    expect(b).toEqual({ irsaliyeNo: 'ORN-IRS-2', siparisNo: 'ORN-SAS-1', tarih: '01.11.2026' });
  });

  it('alandaki no okunanla boşluk ve harf büyüklüğü dışında aynıysa aynı sayılır; boş alan aynı değildir', () => {
    expect(ayniNo(' orn-irs-1 ', 'ORN-IRS-1')).toBe(true);
    expect(ayniNo('', 'ORN-IRS-1')).toBe(false);
    expect(ayniNo('ORN-IRS-2', 'ORN-IRS-1')).toBe(false);
  });

  it('okuyucu sayfasının uzun kenarı A4 uzun kenarıdır', () => {
    expect(sayfaCozunurlugu(1414, 2000)).toBe(171);
    expect(sayfaCozunurlugu(2000, 1414)).toBe(171);
  });
});

describe('Okunan sayfa PDF\'e aranabilir girer (3063 dilim 3)', () => {
  const resim = (): File => ({ name: 'foto.jpg', type: 'image/jpeg', size: 3 }) as unknown as File;
  const goruntu = async () => ({ veri: new Uint8Array([1, 2, 3]), en: 1414, boy: 2000 });

  it('okunan fotoğraf sayfası okuyucunun PDF sayfasıyla girer; sayfa bir kez okunur', async () => {
    const tek = await PDFDocument.create(); tek.addPage([421, 595]);
    const okuyucuPdf = await tek.save();
    let okuma = 0;
    okuyucuAyarla(async () => { okuma += 1; return { pdf: okuyucuPdf, metin: 'İrsaliye No: ORN-IRS-50' }; });
    const f = resim();
    expect((await sayfaOkumasi(f, goruntu))?.bilgiler.irsaliyeNo).toBe('ORN-IRS-50');
    const cikti = await PDFDocument.load(await irsaliyePdfi([f]));
    expect(cikti.getPages().map((s) => Math.round(s.getWidth()))).toEqual([421]);
    expect(okuma).toBe(1);
  });

  it('okuyucu sonuç veremezse ya da hata verirse okuma yok sayılır; PDF dosyası okunmaz', async () => {
    okuyucuAyarla(async () => null);
    expect(await sayfaOkumasi(resim(), goruntu)).toBeNull();
    okuyucuAyarla(async () => { throw new Error('motor yok'); });
    expect(await sayfaOkumasi(resim(), goruntu)).toBeNull();
    let cagrildi = false;
    okuyucuAyarla(async () => { cagrildi = true; return null; });
    expect(await sayfaOkumasi({ name: 'a.pdf', type: 'application/pdf' } as File, goruntu)).toBeNull();
    expect(cagrildi).toBe(false);
  });

  it('PDF yapılırken okuma sınırlı beklenir: süre dolunca boş, bitmiş okuma hemen gelir', async () => {
    vi.useFakeTimers();
    const asili = enCok(new Promise<number>(() => undefined), 8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await asili).toBeNull();
    expect(await enCok(Promise.resolve(7), 0)).toBe(7);
    expect(await enCok(new Promise<number>(() => undefined), 0)).toBeNull();
  });

  it('asılı kalan okuma süre dolunca çalışanı kapatır; sonraki sayfa yeni çalışanla okunur', async () => {
    vi.useFakeTimers();
    const calisanlar: { kapandi: boolean; mesaj: number }[] = [];
    vi.stubGlobal('Worker', class {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      kayit = { kapandi: false, mesaj: 0 };
      constructor() { calisanlar.push(this.kayit); }
      postMessage(m: { id: number }) {
        this.kayit.mesaj += 1;
        // İkinci çalışan cevap verir; ilki asılı kalır.
        if (calisanlar.length === 2) queueMicrotask(() => this.onmessage?.({ data: { id: m.id, pdf: new Uint8Array([1]), metin: 'Sipariş No: ORN-SAS-1' } }));
      }
      terminate() { this.kayit.kapandi = true; }
    });
    const ilk = sayfaOkumasi(resim(), goruntu);
    await vi.advanceTimersByTimeAsync(OKUMA_SURESI_MS);
    expect(await ilk).toBeNull();
    expect(calisanlar[0]?.kapandi).toBe(true);
    const ikinci = await sayfaOkumasi(resim(), goruntu);
    expect(ikinci?.bilgiler.siparisNo).toBe('ORN-SAS-1');
    expect(calisanlar).toHaveLength(2);
  });
});

describe('Seçilen PDF okunur (3063 dilim 3)', () => {
  const pdf = () => new File(['%PDF'], 'irsaliye.PDF', { type: '' });
  it('PDF metni aynı yükseklikte soldan sağa satır olur; üst satır önce gelir; az metinli sayfa taranmış sayılır', () => {
    const metin = pdfSatirlari([
      { str: 'ORN-IRS-2026-7', x: 300, y: 700.5 }, { str: 'İrsaliye No:', x: 200, y: 701 },
      { str: ' ', x: 10, y: 650 }, { str: 'Sipariş No: ORN-SAS-9', x: 200, y: 680 },
    ]);
    expect(metin).toBe('İrsaliye No: ORN-IRS-2026-7\nSipariş No: ORN-SAS-9');
    expect(okunanBilgiler(metin)).toMatchObject({ irsaliyeNo: 'ORN-IRS-2026-7', siparisNo: 'ORN-SAS-9' });
    expect(metinYeterli(metin)).toBe(true);
    expect(metinYeterli(' 1 / 1 ')).toBe(false);
    expect(pdfMi(pdf())).toBe(true);
    expect(pdfMi(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(false);
  });

  it('metinli sayfa doğrudan, taranmış sayfa cihaz okuyucusuyla okunur; bilgi ilk bulunan sayfadan; aynı dosya bir kez okunur', async () => {
    let okuma = 0;
    okuyucuAyarla(async () => { okuma += 1; return { pdf: new Uint8Array(), metin: 'Sevk Tarihi: 12.11.2026' }; });
    const f = pdf();
    let cagri = 0;
    const sayfalar = async () => { cagri += 1; return [{ metin: 'İrsaliye No: ORN-IRS-PDF-3' }, { goruntu: { veri: new Uint8Array([1]), en: 10, boy: 10 } }]; };
    expect(await pdfOkumasi(f, sayfalar)).toEqual({ irsaliyeNo: 'ORN-IRS-PDF-3', siparisNo: null, tarih: '12.11.2026' });
    await pdfOkumasi(f, sayfalar);
    expect([cagri, okuma]).toEqual([1, 1]);
  });

  it('PDF açılmazsa ya da taranmış sayfa okunamazsa sonuç boş döner, hata atılmaz', async () => {
    okuyucuAyarla(async () => null);
    expect(await pdfOkumasi(pdf(), async () => [{ goruntu: { veri: new Uint8Array([1]), en: 10, boy: 10 } }])).toBeNull();
    expect(await pdfOkumasi(pdf(), () => Promise.reject(new Error('şifreli')))).toBeNull();
  });
});
