import { useEffect, type RefObject } from 'react';
import type {
  TeklifFormuAlanAnahtari, TeklifFormuAlanAyari, TeklifFormuAlanlari, TeklifFormuAlani, TeklifFormuDegerliAlan, TeklifFormuDili, TeklifFormuIcerigi,
} from '#paylasilan/sozlesme/siparisler.ts';

// Teklif formunun basılan metni (3245 d). Şablonun dili sabit etiketleri, sayı ve tarih biçimini seçer; tutarlar sunucudan metin gelir.
export const FORM_SOZLERI = {
  tr: {
    musteri: 'Müşteri', teklif: 'Teklif', no: 'Teklif no', surum: 'Sürüm', tarih: 'Tarih', gecerlilik: 'Geçerlilik', kalem: 'Kalem', miktar: 'Miktar',
    birimFiyat: 'Birim fiyat', iskontolu: 'İskontolu', tutar: 'Tutar', ara: 'Ara toplam', iskonto: 'İskonto', kdvHaric: 'Toplam (KDV hariç)', kdv: 'KDV',
    genel: 'Genel toplam', teslim: 'Teslim süresi', gun: 'gün', odeme: 'Ödeme', para: 'Para birimi', kosullar: 'Teslim ve ödeme', sartlar: 'Şartlar',
    tel: 'Tel', ilgili: 'İlgili', vergi: 'Vergi no', termin: 'Termin', unvan: 'Ünvan', adres: 'Adres', konu: 'Konu', kod: 'Kod', aciklama: 'Açıklama',
    birim: 'Birim', yerlilik: 'Yerlilik', dokumanNo: 'Doküman no', yayin: 'Yayın tarihi', revTarihi: 'Rev. tarihi', revNo: 'Rev. no', vergiDairesi: 'Vergi dairesi', tur: 'Tür',
    satisTeklifi: 'Satış teklifi', firmaOnayi: 'FİRMA ONAYI / COMPANY CONFIRMATION', musteriOnayi: 'MÜŞTERİ ONAYI / CUSTOMER CONFIRMATION',
  },
  en: {
    musteri: 'Customer', teklif: 'Quotation', no: 'Quotation no', surum: 'Revision', tarih: 'Date', gecerlilik: 'Valid until', kalem: 'Item', miktar: 'Qty',
    birimFiyat: 'Unit price', iskontolu: 'Net price', tutar: 'Amount', ara: 'Subtotal', iskonto: 'Discount', kdvHaric: 'Total (excl. VAT)', kdv: 'VAT',
    genel: 'Grand total', teslim: 'Lead time', gun: 'days', odeme: 'Payment', para: 'Currency', kosullar: 'Delivery and payment', sartlar: 'Terms',
    tel: 'Tel', ilgili: 'Attn.', vergi: 'Tax no', termin: 'Due date', unvan: 'Name', adres: 'Address', konu: 'Subject', kod: 'Code', aciklama: 'Description',
    birim: 'Unit', yerlilik: 'Local content', dokumanNo: 'Document no', yayin: 'Issue date', revTarihi: 'Rev. date', revNo: 'Rev. no', vergiDairesi: 'Tax office', tur: 'Type',
    satisTeklifi: 'Sales quotation', firmaOnayi: 'COMPANY CONFIRMATION', musteriOnayi: 'CUSTOMER CONFIRMATION',
  },
} as const satisfies Record<TeklifFormuDili, Record<string, string>>;

// Sözleşmedeki sınırların istemci kopyası (istemci paylasilan'dan değer almaz); asıl denetim sunucudadır.
export const FORM_ALANLARI = ['{MUSTERI}', '{YETKILI}', '{TEKLIF_NO}', '{GECERLILIK}', '{TESLIM_GUN}'] as const satisfies readonly TeklifFormuAlani[];
export const SART_EN_COK = 20;

type Soz = keyof (typeof FORM_SOZLERI)['tr'];
export type AlanBolumu = 'Müşteri' | 'Teklif' | 'Kalem sütunları' | 'Toplamlar' | 'Teslim ve ödeme' | 'İmzalar';
export interface AlanTanimi { anahtar: TeklifFormuAlanAnahtari; bolum: AlanBolumu; soz: Soz; kilitli: boolean; degerli: boolean; cokSatir?: boolean }
const a = (anahtar: TeklifFormuAlanAnahtari, bolum: AlanBolumu, soz: Soz, tur: 'kilitli' | 'degerli' | 'serbest' = 'kilitli', cokSatir = false): AlanTanimi =>
  ({ anahtar, bolum, soz, kilitli: tur === 'kilitli', degerli: tur === 'degerli', ...(cokSatir ? { cokSatir } : {}) });
// 3794: formun basılı alanları (sözleşmedeki listenin istemci kopyası; sunucu da denetler). Kilitli alanın değeri tekliften ya da sürümden gelir,
// yalnız gizlenir; değerli alanın değeri bu teklifin formuna yazılabilir; serbest alan (ilgili, açıklama, birim, imza) yalnız etiket ve görünüm taşır.
export const FORM_ALAN_TANIMLARI: readonly AlanTanimi[] = [
  a('musteriUnvan', 'Müşteri', 'unvan', 'degerli', true), a('musteriAdres', 'Müşteri', 'adres', 'degerli', true),
  a('musteriVergiDairesi', 'Müşteri', 'vergiDairesi', 'degerli'), a('musteriVergiNo', 'Müşteri', 'vergi', 'degerli'), a('musteriIlgili', 'Müşteri', 'ilgili', 'serbest'),
  a('teklifNo', 'Teklif', 'no'), a('teklifTur', 'Teklif', 'tur', 'degerli'), a('teklifSurum', 'Teklif', 'surum'), a('teklifTarih', 'Teklif', 'tarih'),
  a('teklifGecerlilik', 'Teklif', 'gecerlilik'), a('teklifKonu', 'Teklif', 'konu', 'degerli', true), a('teklifPara', 'Teklif', 'para'),
  a('sutunKod', 'Kalem sütunları', 'kod', 'serbest'), a('sutunAciklama', 'Kalem sütunları', 'aciklama', 'serbest'), a('sutunMiktar', 'Kalem sütunları', 'miktar'),
  a('sutunBirim', 'Kalem sütunları', 'birim', 'serbest'), a('sutunYerlilik', 'Kalem sütunları', 'yerlilik'), a('sutunBirimFiyat', 'Kalem sütunları', 'birimFiyat'),
  a('sutunIskontolu', 'Kalem sütunları', 'iskontolu'), a('sutunTutar', 'Kalem sütunları', 'tutar'),
  a('toplamAra', 'Toplamlar', 'ara'), a('toplamIskonto', 'Toplamlar', 'iskonto'), a('toplamKdvHaric', 'Toplamlar', 'kdvHaric'), a('toplamKdv', 'Toplamlar', 'kdv'),
  a('toplamGenel', 'Toplamlar', 'genel'),
  a('kosulTeslim', 'Teslim ve ödeme', 'teslim'), a('kosulTermin', 'Teslim ve ödeme', 'termin'), a('kosulOdeme', 'Teslim ve ödeme', 'odeme'), a('kosulGecerlilik', 'Teslim ve ödeme', 'gecerlilik'),
  a('imzaFirma', 'İmzalar', 'firmaOnayi', 'serbest'), a('imzaMusteri', 'İmzalar', 'musteriOnayi', 'serbest'),
];
export const FORM_ALAN_BOLUMLERI: readonly AlanBolumu[] = ['Müşteri', 'Teklif', 'Kalem sütunları', 'Toplamlar', 'Teslim ve ödeme', 'İmzalar'];
export const ALAN_ETIKETI_EN_COK = 60;
export const ALAN_DEGERI_EN_COK = 400;

export const alanAyari = (i: TeklifFormuIcerigi, k: TeklifFormuAlanAnahtari): TeklifFormuAlanAyari => i.alanlar?.[k] ?? {};
export const alanBasilir = (i: TeklifFormuIcerigi, k: TeklifFormuAlanAnahtari): boolean => alanAyari(i, k).durum === undefined;
export const alanEtiketi = (i: TeklifFormuIcerigi, k: TeklifFormuAlanAnahtari, dil: TeklifFormuDili): string => {
  const t = FORM_ALAN_TANIMLARI.find((x) => x.anahtar === k);
  return alanAyari(i, k).etiket ?? (t === undefined ? k : FORM_SOZLERI[dil][t.soz]);
};
// Bu forma yazılan değer kayıttakinin yerine basılır; yazılmadıysa kayıttaki (yoksa null).
export const alanDegeri = (i: TeklifFormuIcerigi, k: TeklifFormuDegerliAlan, kayit: string | null): string | null => alanAyari(i, k).deger ?? kayit;

// Ayar değişir; boş etiket ya da değer "dilin etiketi / kayıttaki değer" demektir ve saklanmaz, boş kalan ayar ve boş liste silinir.
export function alanDegistir(i: TeklifFormuIcerigi, k: TeklifFormuAlanAnahtari, parca: { durum?: TeklifFormuAlanAyari['durum'] | null; etiket?: string; deger?: string }): TeklifFormuAlanlari | undefined {
  const eski = alanAyari(i, k);
  const durum = parca.durum === undefined ? eski.durum : parca.durum ?? undefined;
  const etiket = parca.etiket === undefined ? eski.etiket : parca.etiket.trim() === '' ? undefined : parca.etiket;
  const deger = parca.deger === undefined ? eski.deger : parca.deger.trim() === '' ? undefined : parca.deger;
  const yeni: TeklifFormuAlanAyari = { ...(durum ? { durum } : {}), ...(etiket === undefined ? {} : { etiket }), ...(deger === undefined ? {} : { deger }) };
  const { [k]: _, ...geri } = i.alanlar ?? {};
  const sonuc: TeklifFormuAlanlari = Object.keys(yeni).length === 0 ? geri : { ...geri, [k]: yeni };
  return Object.keys(sonuc).length === 0 ? undefined : sonuc;
}
// Şablona yalnız etiket ve görünüm gider; değer teklifin kendi formundadır (sunucu da reddeder).
export function degersizAlanlar(alanlar: TeklifFormuAlanlari | undefined): TeklifFormuAlanlari | undefined {
  if (alanlar === undefined) return undefined;
  const sonuc = Object.fromEntries(Object.entries(alanlar).flatMap(([k, v]) => {
    if (v === undefined) return [];
    const { deger: _, ...geri } = v;
    return Object.keys(geri).length === 0 ? [] : [[k, geri]];
  })) as TeklifFormuAlanlari;
  return Object.keys(sonuc).length === 0 ? undefined : sonuc;
}
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
