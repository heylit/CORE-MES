import type { Db } from '#cekirdek/db.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import { katalogKayitAra } from '../sorgular.ts';

const TUR_ADI: Record<string, string> = {
  hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet', ticari_mal: 'Ticari mal',
};
const ONAY_ADI: Record<string, string> = { taslak: 'taslak', onayda: 'onayda', pasif: 'pasif' };

// Genel aramanın (Ctrl K) malzeme kaynağı (kart #1244, 1233 sözleşmesi). Yetki okuma uçlarıyla aynı (`uclar.ts` OKUMA). Katalog
// çerçevesinde karta doğrudan açılan adres bugün yok: sonuç katalog sayfasını açar.
export const malzemeAramaKaynagi: KayitAramaKaynagi<Db> = {
  tur: 'malzeme',
  yetki: ['sayfa.malzemeler'],
  ara: async (db, istek) => (await katalogKayitAra(db, istek)).map((m) => ({
    anahtar: String(m.id),
    baslik: m.kod,
    aciklama: [m.ad, TUR_ADI[m.tur] ?? m.tur, ONAY_ADI[m.onayDurumu]].filter((p) => p !== undefined && p !== null).join(' · '),
    yol: '/malzemeler' as const,
  })),
};
