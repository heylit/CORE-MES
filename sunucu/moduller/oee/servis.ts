import { kapsamdaMi, kisininKapsami } from '#cekirdek/kapsam.ts';
import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { OeeCevabi, OeeSorgusu } from '#paylasilan/sozlesme/oee.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { birimMaliyetleri } from '../finans/disari.ts';
import { isMerkezleri, istasyonlar, kisininIzinliIsMerkezleri, makineKisiAtamalari, makineler as makineListesi } from '../istasyonlar/disari.ts';
import { makineKullanimAraliklari, makineSayimAnlari } from '../uretim-emirleri/disari.ts';
import { calismaTakvimleri } from '../vardiya/disari.ts';
import {
  iscilikMaliyeti, kisiPayiToplami, kisiPaylari, makineMaliyeti, maliyetsiz, olcuHesapla, ortalamayaGirenler, penceredekiDakika, penceredekiSayimlar, topla,
  vardiyaIleAyir,
} from './kurallar.ts';
import type { Aralik, HamOlcu, Iscilik } from './kurallar.ts';

const GUN_MS = 86_400_000;
const gunEkle = (tarih: string, gun: number): string => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);

// Finans tutarı TRY değilse kur çevrimi burada yapılmaz: bilinmiyor sayılır.
async function saatMaliyetleri(db: Db, tur: 'istasyon' | 'kisi'): Promise<Map<number, number>> {
  const sonuc = new Map<number, number>();
  for (const [id, m] of await birimMaliyetleri(db, tur)) if (m.paraBirimi === 'TRY') sonuc.set(id, Number(m.birimMaliyet));
  return sonuc;
}

const aralikMs = (a: { baslangic: string; bitis: string }): Aralik => ({ bas: Date.parse(a.baslangic), bit: Date.parse(a.bitis) });

// Makine, istasyon, iş merkezi ve tesis OEE'si tek okumada (kart #1330). Kişi iş merkezi kısıtlıysa yalnız kendi iş merkezlerinin
// makinelerini görür. Pencere bugün dahilse okuma anında biter: gelmemiş saat planlı süreye girmez.
export async function oee(db: Db, kullanici: Kullanici, sorgu: OeeSorgusu, simdi = Date.now()): Promise<OeeCevabi> {
  const bas = tesisGunBasi(sorgu.baslangic);
  const bit = Math.max(bas, Math.min(tesisGunBasi(gunEkle(sorgu.bitis, 1)), simdi));
  const basIso = new Date(bas).toISOString();
  const bitIso = new Date(bit).toISOString();
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const maliyetGorunur = kullanici.islemler.includes('finans.maliyet-oku');

  const merkezler = (await isMerkezleri(db, { pasiflerDahil: true })).filter((m) => kapsamdaMi(kapsam, m.id));
  const merkezIdleri = new Set(merkezler.map((m) => m.id));
  const istasyonListesi = (await istasyonlar(db, { pasiflerDahil: true })).filter((i) => merkezIdleri.has(i.isMerkeziId));
  const istasyonById = new Map(istasyonListesi.map((i) => [i.id, i]));
  const adaylar = (await makineListesi(db, { pasiflerDahil: true })).flatMap((m) => {
    const ist = m.istasyonId === null ? undefined : istasyonById.get(m.istasyonId);
    return ist ? [{ id: m.id, kod: m.kod, ad: m.ad, istasyonId: ist.id, isMerkeziId: ist.isMerkeziId, aktif: m.aktif }] : [];
  });
  const adayIdleri = adaylar.map((m) => m.id);
  const kullanimlar = await makineKullanimAraliklari(db, adayIdleri, basIso, bitIso);
  // Bitiş anındaki sayım da okunur (okuma bitişi hariç tutar); hangi pencereye düştüğüne OE-17 karar verir.
  const sayimlar = await makineSayimAnlari(db, adayIdleri, basIso, new Date(bit + 1).toISOString());
  // OE-18: pasif makine pencerede çalıştıysa ya da sayım aldıysa o dönemin makinesidir ve toplamlara girer; izi yoksa listelenmez.
  const makineler = adaylar.filter((m) => m.aktif || kullanimlar.has(m.id) || sayimlar.has(m.id));
  const makineIdleri = makineler.map((m) => m.id);

  // Atamalar pencerenin son gününde geçerli olanlardır (gelecek günse bugün).
  const atamaGunu = sorgu.bitis < tesisGunu(simdi) ? sorgu.bitis : tesisGunu(simdi);
  const makineSet = new Set(makineIdleri);
  const atamalar = (await makineKisiAtamalari(db, { tarih: atamaGunu })).filter((a) => makineSet.has(a.makineId));
  const paylar = kisiPaylari(atamalar.map((a) => ({ kisiId: a.kisiId, makineId: a.makineId, yuzde: Number(a.yuzde) })));
  const kisiIdleri = [...new Set(atamalar.map((a) => a.kisiId))];

  // Önceki gün de okunur: pencere başında biten vardiya (OE-17) ancak öyle görülür. Dakikalar pencereyle kırpıldığından planlı süre değişmez.
  const takvimAraligi = { baslangic: gunEkle(sorgu.baslangic, -1), bitis: gunEkle(sorgu.bitis, 1) };
  const takvimler = await calismaTakvimleri(db, [
    ...makineIdleri.map((id) => ({ tur: 'makine' as const, id })),
    ...kisiIdleri.map((id) => ({ tur: 'kisi' as const, id })),
  ], takvimAraligi);
  const planAraliklari = (anahtar: string): Aralik[] | null => {
    const t = takvimler.get(anahtar) ?? null;
    return t === null ? null : t.araliklar.map(aralikMs);
  };
  const pencereDk = (anahtar: string): number | null => {
    const plan = planAraliklari(anahtar);
    return plan === null ? null : penceredekiDakika(plan, bas, bit);
  };

  const istasyonMaliyeti = await saatMaliyetleri(db, 'istasyon');
  const kisiMaliyeti = await saatMaliyetleri(db, 'kisi');
  const kisiMesaisi = new Map(kisiIdleri.map((k) => [k, pencereDk(`kisi:${k}`)]));
  const takvimDk = (bit - bas) / 60_000;

  const hamlar = new Map<number, HamOlcu>(makineler.map((m) => {
    const planliDk = pencereDk(`makine:${m.id}`);
    const kisiler: Iscilik[] = (paylar.get(m.id) ?? []).map((p) => ({
      pay: p.pay, mesaiDk: kisiMesaisi.get(p.kisiId) ?? null, saatMaliyeti: kisiMaliyeti.get(p.kisiId) ?? null,
    }));
    const plan = planAraliklari(`makine:${m.id}`);
    const { ici, disi } = vardiyaIleAyir(
      plan,
      (kullanimlar.get(m.id) ?? []).map(aralikMs),
      penceredekiSayimlar(plan, (sayimlar.get(m.id) ?? []).map(({ zaman, ...a }) => ({ an: Date.parse(zaman), ...a })), bas, bit),
    );
    return [m.id, {
      planliDk,
      takvimDk,
      ...ici,
      vardiyaDisi: disi,
      kisiPayi: kisiPayiToplami(kisiler),
      makineMaliyeti: makineMaliyeti(planliDk, istasyonMaliyeti.get(m.istasyonId) ?? null),
      iscilikMaliyeti: iscilikMaliyeti(kisiler),
    }];
  }));

  const gizle = <O extends Parameters<typeof maliyetsiz>[0]>(o: O): O => (maliyetGorunur ? o : maliyetsiz(o));
  const olcu = (idler: readonly number[]) => gizle(olcuHesapla(topla(ortalamayaGirenler(idler.map((id) => hamlar.get(id)!)))));
  const makineIdleriNerede = (f: (m: (typeof makineler)[number]) => boolean) => makineler.filter(f).map((m) => m.id);
  const sirala = <S extends { kod: string }>(l: S[]) => l.sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));

  return {
    pencere: { baslangic: basIso, bitis: bitIso },
    maliyetGorunur,
    tesis: olcu(makineIdleri),
    isMerkezleri: sirala(merkezler.filter((m) => makineler.some((x) => x.isMerkeziId === m.id))
      .map((m) => ({ id: m.id, kod: m.kod, ad: m.ad, ...olcu(makineIdleriNerede((x) => x.isMerkeziId === m.id)) }))),
    istasyonlar: sirala(istasyonListesi.filter((i) => makineler.some((x) => x.istasyonId === i.id))
      .map((i) => ({ id: i.id, kod: i.kod, ad: i.ad, isMerkeziId: i.isMerkeziId, ...olcu(makineIdleriNerede((x) => x.istasyonId === i.id)) }))),
    makineler: sirala(makineler.map((m) => ({ ...m, ...gizle(olcuHesapla(hamlar.get(m.id)!)) }))),
  };
}
