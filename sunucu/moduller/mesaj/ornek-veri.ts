import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { ORNEK_KANAL, ornekYazimlar } from './kurallar.ts';
import { belgeYaz } from './servis.ts';
import { varOlanYollar } from './sorgular.ts';

// Yazarlar kisiler payının örnek hesaplarıdır; her yazım o kişinin oturumuyla servisten geçer (gönderen kuralı dahil).
// Başlangıç kanalları (kurulum) yazılmaz: gerçek kurulumun parçasıdır, yönetici ilk açılışta kurar (KD-066).
const YAZARLAR = { mudur: 'ornek.mudur', planlama: 'ornek.planlama' } as const;

async function ornekKullanicilar(db: Db): Promise<Record<keyof typeof YAZARLAR, Kullanici>> {
  const bul = async (kullaniciAdi: string): Promise<Kullanici> => {
    const id = await kisiNoKullaniciAdindan(db, kullaniciAdi);
    const kullanici = id === null ? null : await kullaniciYukle(db, id);
    if (kullanici === null) throw new Error(`Mesaj örnek verisi kisiler örnek hesabını bulamadı: ${kullaniciAdi}`);
    return kullanici;
  };
  return { mudur: await bul(YAZARLAR.mudur), planlama: await bul(YAZARLAR.planlama) };
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'mesaj',
  gerekir: ['kisiler'],
  yukluMu: async (db) => (await varOlanYollar(db, [ORNEK_KANAL])).length > 0,
  yukle: async (db, baglam) => {
    const k = await ornekKullanicilar(db);
    for (const y of ornekYazimlar({ mudur: String(k.mudur.id), planlama: String(k.planlama.id) }, baglam.an.getTime())) {
      await belgeYaz(db, k[y.yazar], { yol: y.yol, kip: y.kip, veri: y.veri });
    }
  },
});
