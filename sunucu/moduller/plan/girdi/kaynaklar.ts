import type { Db } from '#cekirdek/db.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { birimMaliyetleri } from '../../finans/disari.ts';
import {
  aktifMakineler, isMerkezleri, istasyonlar, istasyonYetkinlikleri, kisiTezgahSinirlari, makineYetkinlikleri, planAyarlari,
} from '../../istasyonlar/disari.ts';
import { kisiGorevleri, kisiSecenekleri } from '../../kisiler/disari.ts';
import { KAYNAK_OKUMA } from '../../recete-rota/disari.ts';
import { kisiVardiyalari, takvimGunleri, vardiyaMatrisi, vardiyaTanimlari } from '../../vardiya/disari.ts';
import type { HaftaGunu, KaynakDilimiOkumasi } from './kaynaklar-kurallar.ts';

// Kaynak diliminin okuması (1716): yalnız sahibi modüllerin disari.ts'i. Kapsam eski yolun kaynak okumasıyla aynıdır (Reçete ve Rota'nın
// durumu ve planın kapasite okuması): istasyon, kişi ve maliyet dilimi çağıranın işlemiyle açılır, okunamayan dilim null'dır.
// İzinli günler çağıranın kapasite okumasından verilir (kapasitedenIzinler): planlama-servis.ts bu dosyayı ithal eder, tersi döngü olurdu.
const yetkili = (k: Kullanici, l: readonly Islem[]): boolean => l.some((i) => islemVarMi(k, i));
const sayi = (x: string | null | undefined): number | null => {
  if (x === null || x === undefined || x.trim() === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

export async function kaynakDilimiOku(db: Db, kullanici: Kullanici, izinler: KaynakDilimiOkumasi['izinler']): Promise<KaynakDilimiOkumasi> {
  const istasyonOkur = yetkili(kullanici, KAYNAK_OKUMA.istasyon);
  const kisiOkur = yetkili(kullanici, KAYNAK_OKUMA.kisi);

  const vardiyalar = (await vardiyaTanimlari(db)).filter((v) => v.aktif)
    .map((v) => ({ id: v.id, bas: v.baslangic, bit: v.bitis, molalar: v.molalar.map((m) => ({ bas: m.baslangic, bit: m.bitis })) }));
  const tatiller = (await takvimGunleri(db)).map((g) => g.tarih);

  let istasyon: KaynakDilimiOkumasi['istasyon'] = null;
  if (istasyonOkur) {
    const ayar = new Map((await planAyarlari(db)).map((a) => [a.istasyonId, a]));
    istasyon = {
      merkezler: (await isMerkezleri(db, { pasiflerDahil: false })).filter((m) => m.aktif).map((m) => ({ id: m.id })),
      // Plan ayarı satırı olmayan istasyon sahibinin kuralıyla verim %100, operatör 1 (istasyonlar/disari.ts planAyarlari).
      istasyonlar: (await istasyonlar(db, { pasiflerDahil: false })).filter((i) => i.aktif).map((i) => {
        const a = ayar.get(i.id);
        return { id: i.id, merkezId: i.isMerkeziId, verimYuzde: a === undefined ? 100 : sayi(a.verimYuzde), operatorOrani: a === undefined ? 1 : sayi(a.operatorIhtiyaci) };
      }),
      makineler: (await aktifMakineler(db)).filter((m) => m.aktif).map((m) => ({ id: m.id, ad: m.ad, istasyonId: m.istasyonId })),
    };
  }

  const takvim: KaynakDilimiOkumasi['takvim'] = {
    hafta: (await vardiyaMatrisi(db)).map((m) => ({ merkezId: m.isMerkeziId, gun: (m.gun === 7 ? 0 : m.gun) as HaftaGunu, vardiyaId: m.vardiyaId })),
    kisiVardiyasi: (await kisiVardiyalari(db)).map((k) => ({ kisiId: k.kisiId, vardiyaId: k.vardiyaId })),
  };

  // 69 a: yalnız TL maliyet; başka para birimindeki maliyet bilinmez sayılır.
  const istasyonMaliyeti = yetkili(kullanici, KAYNAK_OKUMA.maliyet)
    ? new Map([...await birimMaliyetleri(db, 'istasyon')].flatMap(([id, g]) => (g.paraBirimi === 'TRY' ? [[id, Number(g.birimMaliyet)] as const] : [])))
    : null;

  let kisiler: KaynakDilimiOkumasi['kisiler'] = null;
  if (kisiOkur) {
    const liste = await kisiSecenekleri(db);
    const gorev = await kisiGorevleri(db, liste.map((k) => k.id));
    const ekle = <T>(m: Map<number, T[]>, k: number, v: T): void => { m.set(k, [...(m.get(k) ?? []), v]); };
    const yetkinlik = new Map<number, number[]>();
    const makine = new Map<number, number[]>();
    const sinir = new Map<number, number>();
    if (istasyonOkur) {
      for (const y of await istasyonYetkinlikleri(db)) ekle(yetkinlik, y.kisiId, y.istasyonId);
      for (const y of await makineYetkinlikleri(db)) ekle(makine, y.kisiId, y.makineId);
      for (const t of await kisiTezgahSinirlari(db)) sinir.set(t.kisiId, t.enCok);
    }
    kisiler = liste.map((k) => ({
      id: k.id, ad: k.ad, gorev: gorev.get(k.id) ?? null, yetkinlikler: yetkinlik.get(k.id) ?? [], makineler: makine.get(k.id) ?? [], enCok: sinir.get(k.id) ?? null,
    }));
  }

  return { vardiyalar, tatiller, istasyon, takvim, istasyonMaliyeti, kisiler, izinler };
}
