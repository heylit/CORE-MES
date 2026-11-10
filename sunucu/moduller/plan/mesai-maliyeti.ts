import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { MesaiMaliyetiCevabi, MesaiSaatDegerleriCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { grupSaatMaliyetleri, kisilerinDepartmanlari } from '../ik/disari.ts';
import { istasyonKisiAtamalari } from '../istasyonlar/disari.ts';
import {
  aySonuGunu, grupMesaiSaatTL, istasyonSaatDegeri, mesaiAyarlari, mesaiGunTuru, mesaiToplami, mesaiTutari, varsayilanMaliyetAyi, type MesaiAyarlari,
} from './kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { planCozumKaynagi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// Tezgâhın grubu istasyon kimliğidir (Reçete ve Rota çevirisi); sayı olmayan grup istasyona bağlanmaz.
const istasyonNo = (grup: string | undefined): number | null => (grup !== undefined && /^\d+$/.test(grup) ? Number(grup) : null);

// 2653 S1, 2742: istasyonların ek mesai saat değeri, İK'nın ay için departman saat maliyetinden ve ayın son günü geçerli atamalardan.
// Plan değerlendirmesi, taslak toplamı (2653) ve yıllık plan ucu aynı değeri buradan okur. Küçük departman (2740 a, 2743 b) bilinmiyor
// sayılır; küçük grup havuzu hiçbir yoldan okunmaz. Değerler yalnız hesaba girer: cevaba, kayda ve günlüğe yazılmaz.
export async function istasyonSaatDegerleri(db: Db, ay: string, istasyonlar: ReadonlySet<number>): Promise<Map<number, number | null>> {
  if (istasyonlar.size === 0) return new Map();
  const atamalar = (await istasyonKisiAtamalari(db, { tarih: aySonuGunu(ay) })).filter((x) => istasyonlar.has(x.istasyonId));
  const departman = await kisilerinDepartmanlari(db, atamalar.map((x) => x.kisiId));
  const gruplar = atamalar.length > 0 ? await grupSaatMaliyetleri(db, ay) : new Map();
  const kisiDegeri = (kisiId: number): number | null => {
    const no = departman.get(kisiId) ?? null;
    const g = no === null ? undefined : gruplar.get(no);
    return g === undefined || g.kucuk ? null : g.saatMaliyeti;
  };
  return new Map([...istasyonlar].map((id) => [id, istasyonSaatDegeri(
    atamalar.filter((x) => x.istasyonId === id).map((x) => ({ yuzde: Number(x.yuzde), deger: kisiDegeri(x.kisiId) })),
  )] as const));
}

// Planlama çalışmasının (birleşmiş D) tezgâhlarına istasyon değeri; kişi bazlı değilse okunmaz.
async function tezgahSaatDegerleri(db: Db, a: MesaiAyarlari, ay: string, tezgahIdleri?: Iterable<string>): Promise<Map<string, number | null>> {
  const idler = [...(tezgahIdleri ?? a.tezgahlar.keys())];
  const istasyonlar = new Set(a.kisiBazli ? idler.flatMap((id) => { const n = istasyonNo(a.tezgahlar.get(id)?.grup); return n === null ? [] : [n]; }) : []);
  const deger = await istasyonSaatDegerleri(db, ay, istasyonlar);
  return new Map(idler.map((id) => { const n = istasyonNo(a.tezgahlar.get(id)?.grup); return [id, n === null ? null : deger.get(n) ?? null] as const; }));
}

// 2742 (2740 a, Maliyet C1): plan değerlendirmesinin ek mesai bedeli tezgâh başına bu değerle kurulur (motor degerlendir.js ymMesaiTL
// D.mesaiSaat[e.m]); null tezgâh yalın mesai ücretine düşer. Değer yalnız iş parçacığının girdisine yazılır; değerlendirmenin cevabı D taşımaz.
export async function mesaiSaatGirdisi(db: Db, D: unknown, an: Date = new Date()): Promise<Record<string, number | null>> {
  const a = mesaiAyarlari(D);
  if (!a.kisiBazli) return {};
  return Object.fromEntries(await tezgahSaatDegerleri(db, a, varsayilanMaliyetAyi(tesisGunu(an))));
}

// 2653 (2644 b): taslağın ek mesai tutarı sunucuda hesaplanır, cevapta yalnız toplam. Saat ve tezgâh istemciden alınmaz, taslağın
// kayıtlı ek vardiyalarından okunur (Güvenlik K1): saat alan uç tek satırla küçük grubun değerini soran bir sorgu makinesine dönerdi.
// Mesai ayarları (çarpanlar, kişi başı ek, mesai ücreti) ve tezgâhın operatör oranı ile istasyonu planlama sayfasının gördüğü birleşmiş
// çalışmadan, sunucu okuyucusuyla okunur (sayfa ile aynı değer). Yetkiyi uç denetler; okunan değerler cevaba, günlüğe girmez.
export async function mesaiMaliyeti(db: Db, taslakId: number, an: Date = new Date()): Promise<MesaiMaliyetiCevabi> {
  if ((await sorgular.senaryo(db, taslakId)) === null) throw bulunamadi('Taslak bulunamadı.');
  const ay = varsayilanMaliyetAyi(tesisGunu(an));
  const satirlar = await sorgular.ekMesailer(db, taslakId);
  if (satirlar.length === 0) return { ay, ...mesaiToplami([]) };

  const kaynak = await planCozumKaynagi(db, an.getTime());
  const a = mesaiAyarlari(planGirdisi({ ...kaynak, bugun: tesisGunu(an) }, an.getTime())?.S.D);
  const deger = await tezgahSaatDegerleri(db, a, ay, new Set(satirlar.map((s) => String(s.makineId))));
  return {
    ay,
    ...mesaiToplami(satirlar.map((s) => {
      const t = a.tezgahlar.get(String(s.makineId));
      return mesaiTutari({
        h: s.saat, kisiBazli: a.kisiBazli, op: t?.opOran, saatDegeri: a.kisiBazli ? deger.get(String(s.makineId)) ?? null : null,
        carpan: a.carp[mesaiGunTuru(s.gun, a)], kisiEk: a.kisiEk, ucret: a.ucret, mesaiCarpan: a.mesaiCarpan,
      });
    })),
  };
}

// 2742 (Mimar, Güvenlik Ek; 2745 a): yıllık planın grup başına ek mesai saat değeri. Parametresiz: grup ve tezgâh istemciden alınmaz,
// planlama çalışmasının tezgâhlarından okunur. Bilinmeyen grup (küçük, karışık, atamasız istasyon ya da kişi bazlı kapalı) null; yıllık
// plan o grupta ek mesai önermez. Yetkiyi (finans.maliyet-oku) uç denetler.
export async function mesaiSaatDegerleri(db: Db, an: Date = new Date()): Promise<MesaiSaatDegerleriCevabi> {
  const ay = varsayilanMaliyetAyi(tesisGunu(an));
  const kaynak = await planCozumKaynagi(db, an.getTime());
  const D = planGirdisi({ ...kaynak, bugun: tesisGunu(an) }, an.getTime())?.S.D;
  if (D === undefined) return { ay, gruplar: [] };
  const a = mesaiAyarlari(D);
  const deger = await tezgahSaatDegerleri(db, a, ay);
  const gruplar = new Map<string, { opOran: number | null | undefined; deger: number | null }[]>();
  for (const [id, t] of a.tezgahlar) if (t.grup !== '') gruplar.set(t.grup, [...(gruplar.get(t.grup) ?? []), { opOran: t.opOran, deger: deger.get(id) ?? null }]);
  return {
    ay,
    gruplar: [...gruplar].sort(([x], [y]) => x.localeCompare(y, 'tr')).map(([grup, tz]) => ({
      grup, saatTL: a.kisiBazli ? grupMesaiSaatTL(tz, a.carp.hi, a.kisiEk) : null,
    })),
  };
}
