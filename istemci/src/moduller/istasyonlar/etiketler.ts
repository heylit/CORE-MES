import type { BaglantiTuru, IstasyonTipi, KapasiteKaynagi, MakineDurumu, OperasyonGrubu } from '#paylasilan/sozlesme/istasyonlar.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

type MakineDurumuKodu = MakineDurumu['durum'];

// Sözleşme zod taşıdığı için istemci yalnız tip ithal eder; Record anahtarı sözleşmedeki değerleri eksiksiz ister.
export const TIP_ADLARI: Record<IstasyonTipi, string> = {
  talasli: 'Talaşlı imalat',
  kalite: 'Kalite kontrol',
  depo: 'Depo-toplama',
  markalama: 'Markalama',
  boya: 'Boya-kaplama',
  montaj: 'Montaj',
};

export const BAGLANTI_ADLARI: Record<BaglantiTuru, string> = {
  focas: 'FANUC FOCAS',
  opcua: 'OPC UA',
  mtconnect: 'MTConnect',
  modbus: 'Modbus TCP',
  dijital_giris: 'Dijital giriş',
};

export const TIP_SECENEKLERI = Object.entries(TIP_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));
export const BAGLANTI_SECENEKLERI = Object.entries(BAGLANTI_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

// Sıra ve adlar sözleşmedeki `OPERASYON_GRUP_ADLARI` ile aynıdır (malzemeler kataloğunun grupları).
export const OPERASYON_GRUP_ADLARI: Record<OperasyonGrubu, string> = {
  KES: 'Kesim', SKL: 'Şekillendirme', TAL: 'Talaşlı imalat', KYN: 'Kaynak', ISL: 'Isıl işlem', YZY: 'Yüzey hazırlık', KAP: 'Kaplama',
  BOY: 'Boya', MRK: 'Markalama', MON: 'Montaj', KAL: 'Kalite kontrol', PAK: 'Paketleme ve sevk', FAS: 'Fason',
};
export const OPERASYON_GRUP_SECENEKLERI = Object.entries(OPERASYON_GRUP_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

export const KAPASITE_KAYNAGI_ADLARI: Record<KapasiteKaynagi, string> = {
  makine: 'Makine saati',
  insan: 'İnsan saati',
};
export const KAPASITE_KAYNAGI_SECENEKLERI = Object.entries(KAPASITE_KAYNAGI_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

// Durum satırı olmayan makine "girilmemiş" gösterilir; plan onu çalışır sayar ama ekran uydurmaz.
export const MAKINE_DURUM_ADLARI: Record<MakineDurumuKodu, string> = { calisir: 'Çalışır', ariza: 'Arıza', bakim: 'Bakımda' };
export const MAKINE_DURUM_TONLARI: Record<MakineDurumuKodu, RozetTonu> = { calisir: 'tamam', ariza: 'hata', bakim: 'uyari' };
export const MAKINE_DURUM_SECENEKLERI = Object.entries(MAKINE_DURUM_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

// "60.00" yerine "%60", "12.50" yerine "%12,5".
export const yuzdeBicimi = (yuzde: string): string => `%${Number(yuzde).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

// Tesis saatiyle "GG.AA.GGGG SS:DD, ad".
export const degisimMetni = (ad: string | null, zaman: string): string => {
  const [gun = '', saat = ''] = tesisSaati(new Date(zaman)).split(' ');
  return `${gun.split('-').reverse().join('.')} ${saat}${ad ? `, ${ad}` : ''}`;
};
