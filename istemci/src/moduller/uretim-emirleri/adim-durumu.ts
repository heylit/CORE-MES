import type { AdimStatusu, ElleYazilanStatu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Adım Durumu (2893): statünün ekrandaki adı, tonu ve simgesi. Terminal (D4) ve sayfa aynı tabloyu kullanır; metin her zaman yazılır,
// renk tek başına anlam taşımaz. Sıra sunucudaki öncelik sırasıdır (ADIM_STATULERI).
export interface StatuGorunumu { ad: string; ton: RozetTonu; simge: SimgeAdi }
export const STATU: Readonly<Record<AdimStatusu, StatuGorunumu>> = {
  bitti: { ad: 'Bitti', ton: 'tamam', simge: 'check' },
  uretimde: { ad: 'Üretimde', ton: 'bilgi', simge: 'play' },
  duraklatildi: { ad: 'Duraklatıldı', ton: 'uyari', simge: 'pause' },
  durdu: { ad: 'Durdu', ton: 'hata', simge: 'stop' },
  fasonda: { ad: 'Fasonda', ton: 'bilgi', simge: 'truck' },
  beklemede: { ad: 'Beklemede', ton: 'uyari', simge: 'pause' },
  program: { ad: 'Program hazır değil', ton: 'hata', simge: 'cpu' },
  cizim: { ad: 'Çizim revizyonu bekleniyor', ton: 'hata', simge: 'ruler' },
  yayin: { ad: 'Paket yayınlanmadı', ton: 'hata', simge: 'flag' },
  makine: { ad: 'Makine hazır değil', ton: 'uyari', simge: 'wrench' },
  talep: { ad: 'Talep bekliyor', ton: 'uyari', simge: 'list' },
  siparis: { ad: 'Sipariş bekliyor', ton: 'uyari', simge: 'cart' },
  malzeme: { ad: 'Malzeme bekliyor', ton: 'uyari', simge: 'box' },
  firma: { ad: 'Fason firma bekleniyor', ton: 'uyari', simge: 'truck' },
  baslayabilir: { ad: 'Başlayabilir', ton: 'tamam', simge: 'play' },
  onceki: { ad: 'Önceki adımı bekliyor', ton: 'pasif', simge: 'clock' },
  diger: { ad: 'Diğer', ton: 'pasif', simge: 'help' },
};

// Elle yazılabilen statüler; sunucu aynı listeyi sözleşmede zorlar (ElleYazilanStatu), burada yalnız seçenek sırasıdır.
export const ELLE_YAZILIR: readonly ElleYazilanStatu[] = ['program', 'cizim', 'yayin', 'makine', 'talep', 'siparis', 'malzeme', 'firma', 'fasonda', 'onceki', 'diger'];

export const ADIM_DURUMU_YAZ = 'uretim-emirleri.adim-durumu-yaz';
export const adimDurumuUcu = (emirId: number): string => `/adimli-emirler/${String(emirId)}/adim-durumu`;
export const isEmriKomutu = (emirId: number, isEmriId: number, komut: 'statu-yaz' | 'statu-kaldir' | 'hazirlik-onayla' | 'hazirlik-onay-kaldir' | 'liste-isaretle' | 'liste-ekle'): string =>
  `/adimli-emirler/${String(emirId)}/is-emirleri/${String(isEmriId)}/${komut}`;
