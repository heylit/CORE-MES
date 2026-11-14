import { useEffect, type RefObject } from 'react';
import type { TeklifFormuAlani, TeklifFormuDili } from '#paylasilan/sozlesme/siparisler.ts';

// Teklif formunun basılan metni (3245 d). Şablonun dili sabit etiketleri, sayı ve tarih biçimini seçer; tutarlar sunucudan metin gelir.
export const FORM_SOZLERI = {
  tr: {
    musteri: 'Müşteri', teklif: 'Teklif', no: 'Teklif no', surum: 'Sürüm', tarih: 'Tarih', gecerlilik: 'Geçerlilik', kalem: 'Kalem', miktar: 'Miktar',
    birimFiyat: 'Birim fiyat', iskontolu: 'İskontolu', tutar: 'Tutar', ara: 'Ara toplam', iskonto: 'İskonto', kdvHaric: 'Toplam (KDV hariç)', kdv: 'KDV',
    genel: 'Genel toplam', teslim: 'Teslim süresi', gun: 'gün', odeme: 'Ödeme', para: 'Para birimi', kosullar: 'Teslim ve ödeme', sartlar: 'Şartlar',
    tel: 'Tel', ilgili: 'İlgili', vergi: 'Vergi no', termin: 'Termin',
  },
  en: {
    musteri: 'Customer', teklif: 'Quotation', no: 'Quotation no', surum: 'Revision', tarih: 'Date', gecerlilik: 'Valid until', kalem: 'Item', miktar: 'Qty',
    birimFiyat: 'Unit price', iskontolu: 'Net price', tutar: 'Amount', ara: 'Subtotal', iskonto: 'Discount', kdvHaric: 'Total (excl. VAT)', kdv: 'VAT',
    genel: 'Grand total', teslim: 'Lead time', gun: 'days', odeme: 'Payment', para: 'Currency', kosullar: 'Delivery and payment', sartlar: 'Terms',
    tel: 'Tel', ilgili: 'Attn.', vergi: 'Tax no', termin: 'Due date',
  },
} as const satisfies Record<TeklifFormuDili, Record<string, string>>;

// Sözleşmedeki sınırların istemci kopyası (istemci paylasilan'dan değer almaz); asıl denetim sunucudadır.
export const FORM_ALANLARI = ['{MUSTERI}', '{YETKILI}', '{TEKLIF_NO}', '{GECERLILIK}', '{TESLIM_GUN}'] as const satisfies readonly TeklifFormuAlani[];
export const SART_EN_COK = 20;
const ORAN = /^\d{1,3}(\.\d{1,2})?$/;

// KDV oranı virgülle de yazılabilir; geçersizse null (sorgu atılmaz, kutu hatayı söyler).
export function kdvOraniOku(girdi: string): string | null {
  const t = girdi.trim().replace(',', '.');
  return ORAN.test(t) && Number(t) <= 100 ? t : null;
}

const binlik = (tam: string, ayrac: string): string => tam.replace(/\B(?=(\d{3})+(?!\d))/g, ayrac);

// Sunucunun ondalık metni ("1250.5000") biçimlenir; sayıya çevrilmez, yuvarlama sunucudadır. Fiyatta sondaki sıfırlar iki haneye kadar atılır.
export function formSayisi(t: string | null | undefined, dil: TeklifFormuDili, tur: 'tutar' | 'fiyat' | 'miktar' = 'tutar'): string {
  if (t === null || t === undefined) return '—';
  const isaret = t.startsWith('-') ? '-' : '';
  const [tam = '0', ondalik = ''] = t.replace(/^-/, '').split('.');
  const kesir = tur === 'tutar' ? ondalik.padEnd(2, '0').slice(0, 2)
    : tur === 'fiyat' ? ondalik.replace(/0+$/, '').padEnd(2, '0') : ondalik.replace(/0+$/, '');
  const [binA, ondA] = dil === 'en' ? [',', '.'] : ['.', ','];
  return `${isaret}${binlik(tam, binA)}${kesir === '' ? '' : `${ondA}${kesir}`}`;
}

export function formTarihi(t: string | null | undefined, dil: TeklifFormuDili): string {
  if (t === null || t === undefined) return '—';
  const [y, a, g] = t.slice(0, 10).split('-');
  return dil === 'en' ? `${g ?? ''}/${a ?? ''}/${y ?? ''}` : `${g ?? ''}.${a ?? ''}.${y ?? ''}`;
}

export interface AlanDegerleri { musteri: string; yetkili: string; teklifNo: string; gecerlilik: string; teslimGun: string }

// Metindeki alanlar ({MUSTERI} gibi) teklifin bilgisiyle dolar; bilinmeyen süslü parantez olduğu gibi kalır.
export function alanlariDoldur(metin: string, d: AlanDegerleri): string {
  return metin
    .replaceAll('{MUSTERI}', d.musteri).replaceAll('{YETKILI}', d.yetkili).replaceAll('{TEKLIF_NO}', d.teklifNo)
    .replaceAll('{GECERLILIK}', d.gecerlilik).replaceAll('{TESLIM_GUN}', d.teslimGun);
}

// İlgili kişi yazılmadıysa hitap firmaya yapılır (firma kartında ilgili kişi yok).
export function hitap(ilgili: string, firmaAd: string | null, dil: TeklifFormuDili): string {
  const temiz = ilgili.trim();
  if (temiz !== '') return temiz;
  if (firmaAd === null) return dil === 'en' ? 'Sir or Madam' : 'Yetkili';
  return dil === 'en' ? firmaAd : `${firmaAd} yetkilisi`;
}

// Kâğıt A4 genişliğinde çizilir (cizildi: kutu ve kâğıt DOM'da; yüklenince gözlem yeniden kurulur); kutu daha darsa kâğıt orantılı küçülür (Arayüz 3245 K1: 768'de taşma yok).
export function useKagitOlcegi(kutu: RefObject<HTMLElement | null>, kagit: RefObject<HTMLElement | null>, cizildi: boolean): void {
  useEffect(() => {
    const k = kutu.current;
    if (k === null) return undefined;
    const uygula = () => {
      const p = kagit.current;
      if (p === null) return;
      const olcek = Math.min(1, k.clientWidth / Math.max(1, p.offsetWidth));
      k.style.setProperty('--tf-olcek', String(olcek));
      k.style.setProperty('--tf-yukseklik', `${String(p.offsetHeight * olcek)}px`);
    };
    uygula();
    const g = new ResizeObserver(uygula);
    g.observe(k);
    if (kagit.current) g.observe(kagit.current);
    return () => { g.disconnect(); };
  }, [kutu, kagit, cizildi]);
}
