import type { Rastgele } from './tohum.ts';
import type { AdimTuru, Sonuc } from './sozlesme.ts';
import type { Hesap } from '../hesaplar.ts';

// Senaryo yazarının gördüğü tek arayüz. Senaryo uçları kara kutu olarak çağırır; SQL yazmaz, sunucu koduna bağlanmaz.
// Uç yolları ve gövdeleri modülün `npm run harita -- --modul <ad>` çıktısından okunur, tahmin edilmez.
export interface Cevap {
  durum: number;
  govde: unknown;
}

export interface RolIstemcisi {
  istek(yontem: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', yol: string, govde?: unknown): Promise<Cevap>;
}

export interface AdimCiktisi {
  sonuc?: Exclude<Sonuc, 'ara-sira'>;
  yontem?: string;
  yol?: string;
  beklenen?: string;
  gelen?: string;
  ileti?: string;
  ek?: string[];
}

export interface AdimSecenegi {
  tur?: AdimTuru;
  // Yalnız yan etkisiz adım (okuma, ekran açma) yeniden denenir; yazma iki kez gönderilmez.
  tekrarlanabilir?: boolean;
}

export interface SenaryoBaglami {
  gun: number;
  kopya: number;
  rastgele: Rastgele;
  rol(hesap: Hesap): RolIstemcisi;
  // Adım atar ya da sonuç döner; hata "düştü" sayılır, senaryo sonraki adıma geçmez.
  adim(rol: Hesap, ad: string, is: () => Promise<AdimCiktisi | undefined>, secenek?: AdimSecenegi): Promise<boolean>;
  // İstek atar, durumu karşılaştırır; gövdeyi döner (düşerse null).
  bekle(rol: Hesap, ad: string, yontem: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', yol: string, beklenen: number, govde?: unknown): Promise<unknown>;
  // Aşama 2'de bağlanacak adım: hata sayılmaz, ayrı sayılır.
  baglanmamis(rol: Hesap, ad: string, neden: string): void;
}

export interface Senaryo {
  ad: string;
  roller: readonly Hesap[];
  // Bir günde aynı anda koşan kopya sayısı (eşzamanlı kullanıcı). Varsayılan 1.
  kopya?: number;
  kos(b: SenaryoBaglami): Promise<void>;
}

export const senaryo = (s: Senaryo): Senaryo => s;
