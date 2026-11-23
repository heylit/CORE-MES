import { describe, expect, it } from 'vitest';
import { antetBosMu, istekFormuHTML, istekMetniDoldur } from './istek-formu.ts';
import type { PurchaseRequest, Supplier } from './tipler.ts';

const R = { no: 'ST-2026-009', title: 'ORN- mil işleme', needDate: '2026-12-10', items: [{ id: 'k1', name: 'ORN- çubuk Ø50', spec: '', qty: 400, unit: 'kg' }] } as unknown as PurchaseRequest;
const T = { id: 't1', name: 'ORN- Tedarikçi A', contact: 'ORN- Yetkili' } as unknown as Supplier;
const ICERIK = { baslik: 'TEKLİF İSTEME FORMU', giris: 'Sayın {YETKILI},\nTalep {TALEP_NO} için teklifinizi rica ederiz.', istenenler: ['Birim fiyat', 'Termin'],
  kapanis: 'İhtiyaç {IHTIYAC}.\nSon tarih {SON_TARIH}.\nSaygılarımızla,', imza1: 'Satın alma', imza2: '', alt: '' };
const KURUM = { unvan: 'ORN- Atölye', adres: 'ORN- adres', telefon: '', eposta: '', vergi: '' };

describe('teklif isteme formu (3442-4)', () => {
  it('yer tutucular dolar; değeri olmayan alanın satırı basılmaz; tanınmayan yer tutucu kalır', () => {
    expect(istekMetniDoldur('Sayın {YETKILI},\nİhtiyaç {IHTIYAC}.\nNot {BILINMEYEN}', { YETKILI: 'ORN- Yetkili', IHTIYAC: '' })).toBe('Sayın ORN- Yetkili,\nNot {BILINMEYEN}');
  });
  it('kağıtta antet, kalem ve miktar, istenenler, tek imza; fiyat sütunu boş', () => {
    const html = istekFormuHTML({ ...R, needDate: '' } as PurchaseRequest, T, '2026-11-22', ICERIK, KURUM, '', '2026-11-19');
    const d = document.createElement('div'); d.innerHTML = html;
    expect(d.querySelector('.doc-co')?.textContent).toBe('ORN- Atölye');
    expect(d.querySelector('h2')?.textContent).toBe('TEKLİF İSTEME FORMU');
    expect(d.querySelector('.doc-t tbody tr')?.textContent).toContain('400 kg');
    expect([...d.querySelectorAll('.doc-liste li')].map((x) => x.textContent)).toEqual(['Birim fiyat', 'Termin']);
    expect(d.querySelectorAll('.sig')).toHaveLength(1);
    const metin = [...d.querySelectorAll('.doc-metin')].map((x) => x.textContent);
    expect(metin[0]).toBe('Sayın ORN- Yetkili,Talep ST-2026-009 için teklifinizi rica ederiz.');
    expect(metin[1]).toBe('Son tarih 22.11.2026.Saygılarımızla,');
    expect(html).not.toContain('{');
  });
  it('ilgili ve tedarikçi bilinmiyorsa kutu boş kalır (tire basılmaz); antet boşluğu ayrı söylenir', () => {
    const d = document.createElement('div');
    d.innerHTML = istekFormuHTML(R, undefined, '', ICERIK, { ...KURUM, unvan: '', adres: '' }, '', '2026-11-19');
    const kv = [...d.querySelectorAll('.doc-kv td')].map((x) => x.textContent);
    expect(kv[0]).toBe('');
    expect(kv[2]).toBe('');
    expect(antetBosMu({ unvan: ' ', adres: '', telefon: '', eposta: '', vergi: '' })).toBe(true);
    expect(antetBosMu(KURUM)).toBe(false);
  });
  it('her değer kaçışlı basılır: etiket ve olay özniteliği metin olarak görünür, öğe olarak çizilmez', () => {
    const kotu = '<b>x</b><img src=x onerror=1>';
    const html = istekFormuHTML(
      { ...R, title: kotu, items: [{ id: 'k1', name: kotu, spec: kotu, qty: 1, unit: kotu }] } as unknown as PurchaseRequest,
      { ...T, name: kotu, contact: kotu } as unknown as Supplier, '2026-11-22',
      { ...ICERIK, baslik: kotu, giris: kotu, istenenler: [kotu], kapanis: kotu, imza1: kotu, alt: kotu },
      { unvan: kotu, adres: kotu, telefon: kotu, eposta: kotu, vergi: kotu }, kotu, '2026-11-19');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;&lt;img src=x onerror=1&gt;');
    const d = document.createElement('div'); d.innerHTML = html;
    expect(d.querySelectorAll('img, b')).toHaveLength(0);
    expect(d.querySelector('.doc-liste li')?.textContent).toBe(kotu);
    expect(d.querySelector('.doc-t tbody tr')?.textContent).toContain(kotu);
  });
  it('3467: kurum logosu antetin solunda basılır; yoksa resim yok, değer öznitelikten taşamaz', () => {
    const d = document.createElement('div');
    d.innerHTML = istekFormuHTML(R, T, '', ICERIK, KURUM, '', '2026-11-19', 'data:image/png;base64,iVBORw0KGgo=');
    expect(d.querySelector('.doc-h .doc-h-sol > img.doc-logo')?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    d.innerHTML = istekFormuHTML(R, T, '', ICERIK, KURUM, '', '2026-11-19');
    expect(d.querySelector('img')).toBeNull();
    d.innerHTML = istekFormuHTML(R, T, '', ICERIK, KURUM, '', '2026-11-19', 'x" onerror="1');
    expect(d.querySelectorAll('img')).toHaveLength(1);
    expect(d.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });
});

describe('3593: teklif isteme formunda malzeme özellikleri ve kabul edilen alternatifler (KURGU 3.5, S9)', () => {
  const ITEM = {
    id: 'k1', name: 'ORN- çubuk Ø40', spec: '', qty: 12, unit: 'boy',
    malzeme: { kalite: 'EN AW-6082', durum: 'T6', islem: null, olcu: 'Ø40 × 3000', aciklama: null, ayrinti: [{ ad: 'Standart', deger: 'EN 754-2' }] },
    alternatifler: [
      { setId: 1, ad: 'ORN AK-1', tur: 'tam' as const, ozet: '6082 ya da 6061 · Ø 40–45 (−0/+5) · boy birebir 3000' },
      { setId: 2, ad: 'ORN AK-2', tur: 'sartli' as const, ozet: '7075 · Ø 40–50' },
    ],
  };
  const kagit = (a?: { yaz: boolean; sartli: boolean }, items: unknown[] = [ITEM]) => {
    const d = document.createElement('div');
    d.innerHTML = istekFormuHTML({ ...R, items } as unknown as PurchaseRequest, T, '', ICERIK, KURUM, '', '2026-11-23', null, a);
    return d;
  };
  it('varsayılan: özellikler ve yalnız şartlı olmayan kartlar yazılır, dipnot var; fiyat, firma ve kişi yok', () => {
    const d = kagit();
    const dd = [...d.querySelectorAll('.doc-kalem-oz dd')].map((x) => x.textContent);
    expect(dd[0]).toBe('EN AW-6082 · T6 · Ø40 × 3000 · Standart: EN 754-2');
    expect([...d.querySelectorAll('.doc-ak')].map((x) => x.textContent)).toEqual(['ORN AK-1 · tam · 6082 ya da 6061 · Ø 40–45 (−0/+5) · boy birebir 3000']);
    expect(d.querySelector('.doc-ak-dipnot')?.textContent).toContain('sınır dışı teklif kabul edilmez');
  });
  it('şartlılar açılınca şartlı kart da yazılır; alternatifler kapalıysa "Yazılmıyor", dipnot yok; kartsız kalemde blok yok', () => {
    expect(kagit({ yaz: true, sartli: true }).querySelectorAll('.doc-ak')).toHaveLength(2);
    const kapali = kagit({ yaz: false, sartli: true });
    expect([kapali.querySelectorAll('.doc-ak').length, kapali.querySelector('.doc-ak-dipnot'), [...kapali.querySelectorAll('.doc-kalem-oz dd')].at(-1)?.textContent]).toEqual([0, null, 'Yazılmıyor.']);
    const yok = kagit(undefined, [{ ...ITEM, alternatifler: [] }]);
    expect([...yok.querySelectorAll('.doc-kalem-oz dd')].at(-1)?.textContent).toBe('Yok; yalnız bu malzeme.');
    expect(kagit(undefined, [{ id: 'k2', name: 'ORN- vida', spec: '', qty: 3, unit: 'adet' }]).querySelector('.doc-kalem-oz')).toBeNull();
  });
});
