import { randomUUID } from 'node:crypto';
import temel from '../playwright.config.ts';
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

// Çerezsiz istemci: oturum isteyen ucun 401 verdiğini sınamak için. Rol istemcisiyle aynı biçimde gönderir (gövde JSON,
// yazmada istek kimliği); kök verilmezse robotun açtığı yerel arayüz. Adımı kayda yine bir rol adıyla düşer.
export function oturumsuzIstemci(kok: string | undefined = temel.use?.baseURL): RolIstemcisi {
  if (kok === undefined) throw new Error('Oturumsuz istemci için kök adres yok');
  return {
    async istek(yontem, yol, govde) {
      const c = await fetch(new URL(yol, kok), {
        method: yontem,
        headers: {
          ...(govde === undefined ? {} : { 'content-type': 'application/json' }),
          ...(yontem === 'GET' ? {} : { 'istek-kimligi': randomUUID() }),
        },
        ...(govde === undefined ? {} : { body: JSON.stringify(govde) }),
        signal: AbortSignal.timeout(30_000),
      });
      const metin = await c.text();
      let veri: unknown = metin;
      try { veri = JSON.parse(metin); } catch { /* düz metin cevap olduğu gibi kalır */ }
      return { durum: c.status, govde: veri };
    },
  };
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
