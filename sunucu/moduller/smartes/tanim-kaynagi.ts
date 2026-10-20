import type { Db } from '#cekirdek/db.ts';
import { aktifIstasyonlar } from '../istasyonlar/disari.ts';
import { malzemeAra } from '../malzemeler/disari.ts';
import type { TanimKaydi } from './kurallar.ts';

// SmartES'e tanım olarak gidebilecek TMI kayıtlarının kaynağı. Sahibi modüllerin `disari.ts` işlevleriyle okur; kopya tutmaz.
// Arayüz, kaynağı testte ve ileride başka bir modül işleviyle değiştirmek içindir.
export interface TanimKaynagi {
  // Aktif istasyonlar (iş merkezi de aktif).
  istasyonlar(db: Db): Promise<TanimKaydi[]>;
  // Aktif stok kartları, sayfa 1'den; sonSayfa doluysa sonrası istenmez.
  stoklar(db: Db, sayfa: number): Promise<{ kayitlar: TanimKaydi[]; sonSayfa: boolean }>;
}

export const STOK_SAYFA_BOYU = 200;

// Fiziksel stok olabilecek kart türleri (VARSAYIM): hizmet, sarf, demirbaş ve ticari mal SmartES stok tanımı olarak gönderilmez.
const STOK_TURLERI = ['hammadde', 'yarimamul', 'mamul'] as const;

export const tanimKaynagi: TanimKaynagi = {
  async istasyonlar(db) {
    return (await aktifIstasyonlar(db)).map((i) => ({ tur: 'istasyon' as const, tmiId: i.id, kod: i.kod, ad: i.ad }));
  },
  async stoklar(db, sayfa) {
    const r = await malzemeAra(db, { metin: null, turler: STOK_TURLERI, yalnizAktif: true, sayfa, sayfaBoyu: STOK_SAYFA_BOYU });
    return {
      kayitlar: r.satirlar.filter((m) => m.onayDurumu === 'aktif').map((m) => ({ tur: 'stok' as const, tmiId: m.id, kod: m.kod, ad: m.ad ?? m.kod })),
      sonSayfa: r.satirlar.length < STOK_SAYFA_BOYU,
    };
  },
};
