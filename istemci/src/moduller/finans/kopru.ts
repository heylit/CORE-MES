import type { BeklenenOdemelerCevabi, SatisSevkleriCevabi, SatisSiparisleriCevabi } from '#paylasilan/sozlesme/finans.ts';
import type { FirmaAyrintiCevabi, FirmaCevabi, FirmaListesiCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { SirketAdiCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';

// Çerçevedeki prototipin istekleri (kanal "finans") TMI uçlarına çevrilir. Kural sunucudadır; köprü yalnız taşır ve
// yalnız bilinen istek türlerini geçirir. Her yazma ayrı uçtur; toplu durum yazan genel uç yoktur.
export type KopruIsleyici = (tip: string, veri: unknown) => Promise<unknown>;

export interface KopruHatasi { hata: string; alan: string | null; kod: string | null }

type Nesne = Record<string, unknown>;
const nesne = (v: unknown): Nesne => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Nesne : {});
const kimlik = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Geçersiz kimlik.');
  return n;
};
const LISTE_ALANLARI = ['ara', 'tur', 'aktif', 'fason', 'sayfa', 'sayfaBoyu', 'sirala', 'yon'] as const;

function sorguMetni(v: Nesne): string {
  const p = new URLSearchParams();
  for (const a of LISTE_ALANLARI) {
    const d = v[a];
    if (d !== undefined && d !== null && d !== '') p.set(a, String(d));
  }
  const m = p.toString();
  return m ? `?${m}` : '';
}

// Yazma istekleri: tür -> tek bir TMI ucu. Genel "durumu kaydet" ucu yoktur; her yazma kendi şemasıyla gider.
// Tekrar korumalı uçlarda istek kimliğini çerçeve, formu açarken üretir (aynı formdan yeniden gönderim tek kayıt açar).
type YazmaTanimi = { yol: (v: Nesne) => string; govde: (v: Nesne) => unknown; tekrar?: true | ((v: Nesne) => boolean) };
const id = (v: Nesne): number => kimlik(v['id']);
const govdesi = (v: Nesne): unknown => nesne(v['govde']);
const CEK_KOMUTLARI = new Set(['tahsile-ver', 'tahsil', 'odendi', 'ciro', 'karsiliksiz', 'geri-al', 'iptal']);
const YAZMALAR: Record<string, YazmaTanimi> = {
  'belge-ekle': { yol: () => '/finans/belgeler/ekle', govde: govdesi, tekrar: true },
  'belge-duzelt': { yol: (v) => `/finans/belgeler/${id(v)}/duzelt`, govde: govdesi },
  'belge-iptal': { yol: (v) => `/finans/belgeler/${id(v)}/iptal`, govde: govdesi },
  'odeme-ekle': { yol: () => '/finans/odemeler/ekle', govde: govdesi, tekrar: true },
  'odeme-dagit': { yol: (v) => `/finans/odemeler/${id(v)}/dagit`, govde: govdesi, tekrar: true },
  'odeme-iptal': { yol: (v) => `/finans/odemeler/${id(v)}/iptal`, govde: govdesi },
  'dagitim-iptal': { yol: (v) => `/finans/dagitimlar/${id(v)}/iptal`, govde: () => ({}) },
  'mahsup-ekle': { yol: () => '/finans/mahsuplar/ekle', govde: govdesi, tekrar: true },
  'mahsup-iptal': { yol: (v) => `/finans/mahsuplar/${id(v)}/iptal`, govde: govdesi },
  'cek-ekle': { yol: () => '/finans/cekler/ekle', govde: govdesi, tekrar: true },
  'cek-duzelt': { yol: (v) => `/finans/cekler/${id(v)}/duzelt`, govde: govdesi },
  'cek-komut': {
    yol: (v) => {
      const k = String(v['komut']);
      if (!CEK_KOMUTLARI.has(k)) throw new Error('Geçersiz çek işlemi.');
      return `/finans/cekler/${id(v)}/${k}`;
    },
    govde: govdesi,
    // Çek komutlarından yalnız ciro ödeme açar; sunucu onu tekrar korumalı ister.
    tekrar: (v) => v['komut'] === 'ciro',
  },
  'hesap-ekle': { yol: () => '/finans/hesaplar/ekle', govde: govdesi },
  'hesap-guncelle': { yol: (v) => `/finans/hesaplar/${id(v)}/guncelle`, govde: govdesi },
  'hesap-pasif': { yol: (v) => `/finans/hesaplar/${id(v)}/pasif`, govde: govdesi },
  'hesap-aktif': { yol: (v) => `/finans/hesaplar/${id(v)}/aktif`, govde: govdesi },
  'hesap-esitle': { yol: (v) => `/finans/hesaplar/${id(v)}/esitle`, govde: govdesi, tekrar: true },
  'virman-ekle': { yol: () => '/finans/virmanlar/ekle', govde: govdesi, tekrar: true },
  'virman-iptal': { yol: (v) => `/finans/virmanlar/${id(v)}/iptal`, govde: govdesi },
  'kur-ekle': { yol: () => '/finans/kurlar/ekle', govde: govdesi },
  'kur-guncelle': { yol: () => '/finans/kurlar/guncelle', govde: govdesi },
  'kdv-ekle': { yol: () => '/finans/kdv-oranlari/ekle', govde: govdesi },
  'faiz-ekle': { yol: () => '/finans/faizler/ekle', govde: govdesi, tekrar: true },
  'sabit-kiymet-ekle': { yol: () => '/finans/sabit-kiymetler/ekle', govde: govdesi, tekrar: true },
  'sabit-kiymet-pasif': { yol: (v) => `/finans/sabit-kiymetler/${id(v)}/pasif`, govde: govdesi },
  'kdv-kapat': { yol: () => '/finans/kdv-oranlari/kapat', govde: govdesi },
  'duzenli-ekle': { yol: () => '/finans/duzenli-odemeler/ekle', govde: govdesi, tekrar: true },
  'duzenli-guncelle': { yol: (v) => `/finans/duzenli-odemeler/${id(v)}/guncelle`, govde: govdesi },
  'duzenli-odendi': { yol: (v) => `/finans/duzenli-odemeler/${id(v)}/odendi`, govde: govdesi, tekrar: true },
  'butce-belirle': { yol: () => '/finans/butce/belirle', govde: govdesi },
  'ayar-guncelle': { yol: () => '/finans/ayar/guncelle', govde: govdesi },
  'toplu-aktar': { yol: () => '/finans/toplu-ice-aktar', govde: govdesi, tekrar: true },
  'oneri-durum': { yol: () => '/finans/oneriler/durum', govde: govdesi },
  'kapanis-isaretle': { yol: () => '/finans/kapanis/isaretle', govde: govdesi },
  'skor-kaydet': { yol: () => '/finans/skorlar/kaydet', govde: govdesi },
};
export const YAZMA_TURLERI = Object.keys(YAZMALAR);

// Analiz bütün geçmişi ister: listeler sayfa sayfa okunur (sayfa boyu 200, sınır 500 sayfa).
const LISTELER = {
  belgeler: '/finans/belgeler', odemeler: '/finans/odemeler', dagitimlar: '/finans/dagitimlar', mahsuplar: '/finans/mahsuplar',
  cekler: '/finans/cekler', hesaplar: '/finans/hesaplar', virmanlar: '/finans/virmanlar', kurlar: '/finans/kurlar',
  kdvOranlari: '/finans/kdv-oranlari', faizler: '/finans/faizler', duzenliOdemeler: '/finans/duzenli-odemeler', butce: '/finans/butce',
  esitlemeler: '/finans/bakiye-esitlemeleri', oneriler: '/finans/oneri-durumlari', kapanis: '/finans/kapanis', skorlar: '/finans/skorlar',
  // Firma kartının sahibi musteri-tedarikci'dir (#1164); finansta firma listesi ucu yoktur.
  sabitKiymetler: '/finans/sabit-kiymetler', firmalar: '/musteri-tedarikci/firmalar',
} as const;
async function tumu(yol: string): Promise<unknown[]> {
  const satirlar: unknown[] = [];
  for (let sayfa = 1; sayfa <= 500; sayfa += 1) {
    const c = await api.get<{ satirlar: unknown[]; toplam: number | null; sayfaBoyu: number }>(`${yol}?sayfa=${sayfa}&sayfaBoyu=200`);
    satirlar.push(...c.satirlar);
    if (c.satirlar.length < c.sayfaBoyu || (c.toplam !== null && satirlar.length >= c.toplam)) break;
  }
  return satirlar;
}
async function hepsiniOku(): Promise<Record<string, unknown>> {
  const girdiler = Object.entries(LISTELER);
  const sonuc: Record<string, unknown> = {};
  await Promise.all(girdiler.map(async ([ad, yol]) => { sonuc[ad] = await tumu(yol); }));
  sonuc['ayar'] = (await api.get<{ ayar: unknown }>('/finans/ayar')).ayar;
  sonuc['amortisman'] = (await api.get<{ aylar: unknown[] }>('/finans/amortisman')).aylar;
  sonuc['kurOzeti'] = await api.get<unknown>('/finans/kur-ozeti');
  // Satın almanın siparişte girdiği ödeme planı (#1124); faturası bağlanınca listeden düşer, borç faturadadır.
  sonuc['beklenenOdemeler'] = (await api.get<BeklenenOdemelerCevabi>('/finans/beklenen-odemeler')).odemeler;
  // Şirket adının esası satın alma ayarıdır (A7, #514); finans sunucusu satın almayı ithal edemez (satın alma finansı ithal ediyor).
  sonuc['sirketAdi'] = (await api.get<SirketAdiCevabi>('/satin-alma-ayarlari/sirket-adi')).sirketAdi;
  return sonuc;
}

export function kopruKur(): KopruIsleyici {
  return async (tip, veri) => {
    const v = nesne(veri);
    switch (tip) {
      case 'firma-liste':
        return api.get<FirmaListesiCevabi>(`/musteri-tedarikci/firmalar${sorguMetni(v)}`);
      case 'firma-getir':
        return api.get<FirmaAyrintiCevabi>(`/musteri-tedarikci/firmalar/${kimlik(v['id'])}`);
      case 'firma-ekle': {
        // Kimliği pencere açılırken çerçeve üretir: aynı pencereden yeniden gönderim ikinci firma açmaz.
        const istekKimligi = typeof v['istekKimligi'] === 'string' ? v['istekKimligi'] : yeniIstekKimligi();
        return tekrarKorumaliGonder(
          (deneme) => api.post<FirmaCevabi>('/musteri-tedarikci/firmalar/ekle', nesne(v['firma']), { istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}) }),
          { istekKimligi },
        );
      }
      case 'firma-guncelle':
        return api.post<FirmaCevabi>(`/musteri-tedarikci/firmalar/${kimlik(v['id'])}/guncelle`, nesne(v['firma']));
      case 'firma-durum': {
        const hedef = v['hedef'] === 'aktif' ? 'aktif' : v['hedef'] === 'pasif' ? 'pasif' : null;
        if (hedef === null) throw new Error('Geçersiz durum.');
        return api.post<FirmaCevabi>(`/finans/firmalar/${kimlik(v['id'])}/${hedef}`, { surum: v['surum'] });
      }
      case 'finans-yukle':
        return hepsiniOku();
      // 260 a: satış formunda firmanın faturalanabilecek siparişleri.
      case 'satis-siparisleri':
        return api.get<SatisSiparisleriCevabi>(`/finans/satis-siparisleri?firmaId=${kimlik(v['firmaId'])}`);
      // 302 a: seçilen siparişin faturaya bağlanabilecek sevkleri.
      case 'satis-sevkleri':
        return api.get<SatisSevkleriCevabi>(`/finans/satis-sevkleri?siparisId=${kimlik(v['siparisId'])}`);
      default: {
        const t = YAZMALAR[tip];
        if (!t) throw new Error(`Bilinmeyen istek: ${tip}`);
        const yol = t.yol(v);
        const govde = t.govde(v);
        if (!(typeof t.tekrar === 'function' ? t.tekrar(v) : t.tekrar)) return api.post(yol, govde);
        const istekKimligi = typeof v['istekKimligi'] === 'string' ? v['istekKimligi'] : yeniIstekKimligi();
        return tekrarKorumaliGonder(
          (deneme) => api.post(yol, govde, { istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}) }),
          { istekKimligi },
        );
      }
    }
  };
}

// Sunucu iletisi ve alanı çerçeveye taşınır; ağ hatasının tarayıcı metni gösterilmez.
export function kopruHatasi(hata: unknown): KopruHatasi {
  if (hata instanceof ApiHatasi) {
    return { hata: hata.sunucuIletisi ?? 'İşlem yapılamadı.', alan: hata.govde.alan ?? null, kod: hata.govde.kod };
  }
  if (hata instanceof Error && /^(Geçersiz|Bilinmeyen)/.test(hata.message)) return { hata: hata.message, alan: null, kod: null };
  return { hata: 'Sunucuya ulaşılamadı. Bağlantıyı denetleyip yeniden deneyin.', alan: null, kod: null };
}
