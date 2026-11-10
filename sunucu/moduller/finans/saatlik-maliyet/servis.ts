import type { Db } from '#cekirdek/db.ts';
import type { SaatlikMaliyetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { istasyonlar } from '../../istasyonlar/disari.ts';
import { maliyetHepsi } from '../sorgular.ts';
import { saatlikMaliyetListesi } from './kurallar.ts';

// 2593 (2589 b): Finans'ın istasyon saatlik maliyet ekranı. Kaynak adları istasyonlardan gelir; maliyet finanstadır.
export async function saatlikMaliyetler(db: Db, tur: 'istasyon'): Promise<SaatlikMaliyetSatiri[]> {
  const kaynaklar = (await istasyonlar(db, { pasiflerDahil: true })).map((i) => ({ anahtar: i.id, kod: i.kod, ad: i.ad, aktif: i.aktif }));
  return saatlikMaliyetListesi(kaynaklar, await maliyetHepsi(db, tur));
}
