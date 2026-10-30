import type { StokGrubu } from '#paylasilan/sozlesme/malzeme-izi.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

// Stok'un değer grupları (228 a); ad ve ton ekranda tek yerde.
export const GRUP: Record<StokGrubu, { ad: string; ton: RozetTonu }> = {
  kullanilabilir: { ad: 'Kullanılabilir', ton: 'tamam' },
  kalite: { ad: 'Kalite bekleyen / red', ton: 'uyari' },
  fason: { ad: 'Fasonda', ton: 'bilgi' },
  yolda: { ad: 'Yolda', ton: 'bilgi' },
  hurda: { ad: 'Hurda', ton: 'hata' },
  diger: { ad: 'Üretimde ve diğer', ton: 'pasif' },
};

export const TUR_ADI: Record<string, string> = {
  hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet', ticari_mal: 'Ticari mal',
};
export const ONAY_ADI: Record<string, { ad: string; ton: RozetTonu }> = {
  taslak: { ad: 'Taslak', ton: 'pasif' }, onayda: { ad: 'Onayda', ton: 'uyari' }, aktif: { ad: 'Onaylı', ton: 'tamam' }, pasif: { ad: 'Pasif', ton: 'pasif' }, iptal: { ad: 'İptal', ton: 'hata' },
};

const MIKTAR = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });
const PARA = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const TARIH = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const ZAMAN = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const miktarMetni = (m: string | number, birim: string | null): string => `${MIKTAR.format(Number(m))}${birim ? ` ${birim}` : ''}`;
// Fiyat yoksa "—": sıfır uydurulmaz.
export const paraMetni = (m: string | null, birim = 'TL'): string => (m === null ? '—' : `${PARA.format(Number(m))} ${birim}`);
// Tarih 'GGGG-AA-GG' gelir; saat dilimi kaymasın diye öğlen alınır.
export const tarihMetni = (t: string | null): string => (t === null ? 'Tarihsiz' : TARIH.format(new Date(`${t}T12:00:00`)));
export const zamanMetni = (z: string): string => ZAMAN.format(new Date(z));
