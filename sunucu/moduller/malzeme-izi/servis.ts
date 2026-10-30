import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { FiyatBilgisi, Malzeme360Cevabi, MalzemeAramaCevabi } from '#paylasilan/sozlesme/malzeme-izi.ts';
import { acikNcrPartileri } from '../kalite-merkezi/disari.ts';
import { malzemeAra, malzemeOzeti } from '../malzemeler/disari.ts';
import { malzemeGelisTarihleri, malzemeKgFiyatlari, ortalamaAlisFiyatlari, sonAlisFiyatlari } from '../satin-alma/disari.ts';
import { degerGrubuToplamlari, sonPartiler, stokMiktarlari } from '../stok/disari.ts';
import { grupDagilimi } from './kurallar.ts';

// Hizmet kartının stoğu ve partisi yoktur; 360 stoklanan kartlar içindir.
const STOKLANAN = ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'ticari_mal'] as const;
const PARTI_SINIRI = 20;

export async function malzemeleriAra(db: Db, g: { metin?: string | undefined; sayfa: number }): Promise<MalzemeAramaCevabi> {
  const l = await malzemeAra(db, { metin: g.metin ?? null, turler: STOKLANAN, sayfa: g.sayfa, sayfaBoyu: 50 });
  return { ...l, satirlar: l.satirlar.map((m) => ({ id: m.id, kod: m.kod, ad: m.ad, tur: m.tur, birim: m.birim })) };
}

async function fiyatlar(db: Db, id: number): Promise<FiyatBilgisi> {
  const o = (await ortalamaAlisFiyatlari(db, [id])).get(id);
  const s = (await sonAlisFiyatlari(db, [id])).get(id);
  const k = (await malzemeKgFiyatlari(db, [id])).get(id);
  return {
    ortalamaAlis: o ?? null,
    sonAlis: s ?? null,
    kg: k ? { kgFiyati: k.kgFiyati, paraBirimi: k.paraBirimi, tryKgFiyati: k.tryKgFiyati, tryBirimFiyati: k.tryBirimFiyati, gecerlilik: k.gecerlilik } : null,
  };
}

// Para yalnız finans.oku taşıyana okunur (stok panosuyla aynı kural, #680); öteki kişide fiyat sorgusu hiç atılmaz.
export async function malzeme360(db: Db, id: number, islemler: readonly string[]): Promise<Malzeme360Cevabi> {
  const kart = await malzemeOzeti(db, id);
  if (kart === null || kart.tur === 'hizmet') throw bulunamadi('Malzeme kartı bulunamadı.');
  const paraGorunur = islemler.includes('finans.oku');
  const miktarlar = await stokMiktarlari(db, [id]);
  const gruplar = await degerGrubuToplamlari(db);
  const gelisler = await malzemeGelisTarihleri(db, [id]);
  const partiler = await sonPartiler(db, id, PARTI_SINIRI);
  const para = paraGorunur ? await fiyatlar(db, id) : null;
  const ncr = await acikNcrPartileri(db, partiler.map((p) => p.partiId));
  const m = miktarlar.get(id);
  return {
    kart: { id: kart.id, kod: kart.kod, ad: kart.ad, tur: kart.tur, birim: kart.birim, onayDurumu: kart.onayDurumu },
    stok: m === undefined ? null : { toplam: m.toplam, kullanilabilir: m.kullanilabilir, gruplar: grupDagilimi(gruplar.filter((g) => g.malzemeId === id)) },
    gelecek: (gelisler.get(id) ?? []).map((x) => ({ siparisNo: x.siparisNo, tarih: x.tarih, miktar: x.miktar, birim: x.birim })),
    partiler: partiler.map((p) => ({ partiId: p.partiId, lotNo: p.lotNo, tedarikciPartiNo: p.tedarikciPartiNo, kayitZamani: p.kayitZamani, acikNcr: ncr.has(p.partiId) })),
    paraGorunur,
    para,
  };
}
