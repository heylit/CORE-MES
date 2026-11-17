// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseRequest } from '../merkez/tipler.ts';
import { pdfEkraniDurumu, pdfOkuAc, type PdfAktarimi, type PdfEkraniBaglami } from './ekran.ts';
import { KALEMLER, SAYFA } from './ornek-teklif.ts';

// PDF okuma (pdf.js, yazı tanıma) tarayıcı tuvali ister; burada okunmuş sayfa verilir, ekranın karar ve aktarım kuralı ölçülür.
vi.mock('./pdf-oku.ts', () => ({
  PdfOkumaHatasi: class extends Error {},
  pdfTeklifOku: vi.fn(async () => ({ sayfalar: [{ no: 1, w: 600, h: 260, resim: 'data:image/jpeg;base64,', ogeler: SAYFA, tanima: false }], parolali: false })),
}));

const talep = {
  id: 'r1', no: 'ORN-SAT-1', title: 'ORN çubuk alımı',
  items: KALEMLER.map((k) => ({ id: k.id, name: k.ad, spec: '', qty: k.miktar, unit: k.birim, karsilik: k.karsilik })),
} as unknown as PurchaseRequest;

let aktarilan: PdfAktarimi | null;
let baglam: PdfEkraniBaglami;
const yuklenen: Uint8Array[] = [];

beforeEach(() => {
  document.body.innerHTML = '<div class="sa-kok"><div id="modal-root"></div></div>';
  aktarilan = null; yuklenen.length = 0;
  baglam = {
    r: talep, firmalar: [{ id: 's1', ad: 'ORN-Ege Metal San. Tic.', vergiNo: '0000000001' }, { id: 's2', ad: 'ORN-Marmara Çelik', vergiNo: '' }],
    openModal: (html) => { document.getElementById('modal-root')!.innerHTML = `<div class="tc-pencere">${html}</div>`; },
    closeModal: () => { document.getElementById('modal-root')!.innerHTML = ''; },
    toast: () => {},
    dosyaYukle: async (v) => { yuklenen.push(v); return 'a'.repeat(64); },
    aktar: (a) => { aktarilan = a; },
  };
});
afterEach(() => { vi.restoreAllMocks(); });

const aktarDugmesi = () => document.querySelector<HTMLButtonElement>('[data-pa="aktar"]')!;
const tikla = (el: Element) => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

async function pdfSec(): Promise<void> {
  pdfOkuAc(baglam);
  const girdi = document.getElementById('pt-dosya') as HTMLInputElement;
  const icerik = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  // jsdom'un File'ında arrayBuffer yok; tarayıcıdaki gibi davranan küçük karşılık.
  const dosya = Object.assign(new File([icerik], 'ORN-teklif.pdf', { type: 'application/pdf' }), { arrayBuffer: async () => icerik.buffer });
  Object.defineProperty(girdi, 'files', { value: [dosya] });
  girdi.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => { expect(JSON.stringify(pdfEkraniDurumu()?.asama)).toContain('kontrol'); });
}

describe('3404: PDF tekliften oku ekranı', () => {
  it('okunan değer kendiliğinden aktarılmaz: tedarikçi onayı ve kararlar beklenir, bulunamayan fiyat boş kalır', async () => {
    const ag = vi.spyOn(globalThis, 'fetch');
    await pdfSec();
    expect(aktarDugmesi().disabled).toBe(true);
    expect(document.querySelector('#pt-alt')!.textContent).toMatch(/\d+ karar bekliyor/);
    // Vergi numarası tutan firma önerilir ama onaylatılır.
    expect((document.getElementById('pt-ted') as HTMLSelectElement).value).toBe('s1');
    expect(document.querySelector('[data-pa="ted-onay"]')).not.toBeNull();
    // PDF'te olmayan kalem: fiyat boş, sıfır yazılmaz.
    expect((document.getElementById('pt-f-k5') as HTMLInputElement).value).toBe('');
    // İskontoda varsayılan seçim yok.
    expect(document.querySelectorAll('[data-pa="iskonto"][aria-pressed="true"]')).toHaveLength(0);
    // PDF sayfasında okunan satırlar numaralı.
    expect(document.querySelectorAll('.pt-pdf [aria-label^="PDF satırı"]').length).toBeGreaterThanOrEqual(4);
    expect(ag).not.toHaveBeenCalled();
  });

  it('kararlar verilince aktarım açılır; PDF yüklenir, toplu tabloya taslak gider', async () => {
    await pdfSec();
    tikla(document.querySelector('[data-pa="iskonto"][data-v="ayrica"]')!);
    for (let i = 0; i < 30 && aktarDugmesi().disabled; i++) {
      const d = document.querySelector('[data-pa="ted-onay"], [data-pa="karar"], [data-pa="cevir"]');
      if (!d) break;
      tikla(d);
    }
    expect(aktarDugmesi().disabled).toBe(false);
    tikla(aktarDugmesi());
    await vi.waitFor(() => { expect(aktarilan).not.toBeNull(); });
    const a = aktarilan!;
    expect(yuklenen).toHaveLength(1);
    expect(a.supplierId).toBe('s1');
    expect(a.currency).toBe('EUR');
    expect(a.discountPct).toBe(3);
    expect(a.pdf).toEqual({ ozet: 'a'.repeat(64), ad: 'ORN-teklif.pdf' });
    expect(a.prices.k1).toBe(4.85);
    expect(a.prices.k4).toBe(2.1);
    // Kalem metre, PDF kg: çevrilen fiyat kalem birimindedir.
    expect(a.prices.k3).toBeCloseTo(17.5133, 3);
    expect('k5' in a.prices).toBe(false);
    expect(a.shipping).toBe(45);
    expect(a.leadDays).toBe(28);
    expect(document.getElementById('modal-root')!.innerHTML).toBe('');
  });

  it('para birimi silinirse aktarım yeniden kapanır; TRY varsayılmaz', async () => {
    await pdfSec();
    const pb = document.getElementById('pt-pb') as HTMLSelectElement;
    pb.value = ''; pb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(pdfEkraniDurumu()?.paraBirimi).toBeNull();
    expect(document.querySelector('#pt-alt')!.textContent).toMatch(/karar bekliyor/);
    expect(aktarDugmesi().disabled).toBe(true);
  });
});
