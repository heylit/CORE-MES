import type { DisBaglanti } from '#paylasilan/sozlesme/saglik.ts';

// Dış bağlantılar (3668 B): yalnız ilgili modülün `disari.ts` dosyasının bildirdiği kadarı. Açık/kapalı sorusu SmartES, Logo ve etiket
// yazıcısında vardır; tezgah okuma ve e-posta modülleri durum bildirmediği için "bilinmiyor" döner. Son başarı, son hata ve kayıt
// sayıları hiçbir modülden gelmez: null (ekranda "—"), uydurulmaz. Bunlar BASKA-MODUL-ISTEKLERI.md'dedir.
export interface DisBaglantiKaynagi {
  smartes: () => boolean | null;
  logo: () => boolean | null;
  etiketYazicisi: () => boolean | null;
}

// Modüller katı sağlığın üstündedir (ADR 0006): okumaları `kablolama.ts` bağlar. Bağlanmamış kaynak "bilinmiyor" sayılır.
const bagsiz = (): boolean | null => null;
let smartesOkuyucu: () => boolean | null = bagsiz;
let logoOkuyucu: () => boolean | null = bagsiz;
let yaziciOkuyucu: () => boolean | null = bagsiz;
export const smartesBaglantiOkuyucusuKaydet = (o: () => boolean): void => { smartesOkuyucu = o; };
export const logoBaglantiOkuyucusuKaydet = (o: () => boolean): void => { logoOkuyucu = o; };
export const yaziciBaglantiOkuyucusuKaydet = (o: () => boolean): void => { yaziciOkuyucu = o; };

export const SUREC_DIS_BAGLANTI_KAYNAGI: DisBaglantiKaynagi = {
  smartes: () => smartesOkuyucu(),
  logo: () => logoOkuyucu(),
  etiketYazicisi: () => yaziciOkuyucu(),
};

const olcumsuz = { sonBasari: null, sonHata: null, bekleyen: null, yenidenDenenen: null } as const;

export function disBaglantilar(k: DisBaglantiKaynagi): DisBaglanti[] {
  const durum = (acik: boolean | null): 'calisiyor' | 'kapali' | 'bilinmiyor' => (acik === null ? 'bilinmiyor' : acik ? 'calisiyor' : 'kapali');
  return [
    { anahtar: 'smartes', durum: durum(k.smartes()), ...olcumsuz },
    { anahtar: 'logo', durum: durum(k.logo()), ...olcumsuz },
    { anahtar: 'tezgah', durum: 'bilinmiyor', ...olcumsuz },
    { anahtar: 'eposta', durum: 'bilinmiyor', ...olcumsuz },
    { anahtar: 'etiket-yazicisi', durum: durum(k.etiketYazicisi()), ...olcumsuz },
  ];
}
