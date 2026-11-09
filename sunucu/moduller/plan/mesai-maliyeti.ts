import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { MesaiMaliyetiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { grupSaatMaliyetleri, kisilerinDepartmanlari, kucukGrupHavuzuYalnizHesapIcin } from '../ik/disari.ts';
import { istasyonKisiAtamalari } from '../istasyonlar/disari.ts';
import {
  aySonuGunu, istasyonSaatDegeri, mesaiAyarlari, mesaiGunTuru, mesaiToplami, mesaiTutari, vardiyasizGun, varsayilanMaliyetAyi, type AtamaDegeri,
} from './kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { planCozumKaynagi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// 2653 (2644 b, 2657 a): taslağın ek mesai tutarı sunucuda hesaplanır, cevapta yalnız toplam. Saat ve tezgâh istemciden alınmaz, taslağın
// kayıtlı ek vardiyalarından okunur (Güvenlik K1): saat alan uç tek satırla küçük grubun değerini soran bir sorgu makinesine dönerdi.
// Mesai ayarları (çarpanlar, kişi başı ek, mesai ücreti) ve tezgâhın operatör oranı ile istasyonu planlama sayfasının gördüğü birleşmiş
// çalışmadan, sunucu okuyucusuyla okunur (sayfa ile aynı değer). Saat değeri İK'dandır: büyük departmanda ekran değeri, küçük departmanda
// küçük grup havuzu (yalnız bu toplamın içinde). Yetkiyi uç denetler; okunan değerler cevaba, günlüğe girmez.
export async function mesaiMaliyeti(db: Db, taslakId: number, an: Date = new Date()): Promise<MesaiMaliyetiCevabi> {
  if ((await sorgular.senaryo(db, taslakId)) === null) throw bulunamadi('Taslak bulunamadı.');
  const ay = varsayilanMaliyetAyi(tesisGunu(an));
  const satirlar = await sorgular.ekMesailer(db, taslakId);
  if (satirlar.length === 0) return { ay, ...mesaiToplami([]) };

  const kaynak = await planCozumKaynagi(db, an.getTime());
  const D = planGirdisi({ ...kaynak, bugun: tesisGunu(an) }, an.getTime())?.S.D;
  const a = mesaiAyarlari(D);

  const istasyonlar = new Set(satirlar.flatMap((s) => {
    const g = a.tezgahlar.get(String(s.makineId))?.grup ?? '';
    return /^\d+$/.test(g) ? [Number(g)] : [];
  }));
  const atamalar = a.kisiBazli && istasyonlar.size > 0
    ? (await istasyonKisiAtamalari(db, { tarih: aySonuGunu(ay) })).filter((x) => istasyonlar.has(x.istasyonId))
    : [];
  const departman = await kisilerinDepartmanlari(db, atamalar.map((x) => x.kisiId));
  const gruplar = atamalar.length > 0 ? await grupSaatMaliyetleri(db, ay) : new Map();
  const havuz = [...gruplar.values()].some((g) => g.kucuk) ? await kucukGrupHavuzuYalnizHesapIcin(db, ay) : null;
  const kisiDegeri = (kisiId: number): Omit<AtamaDegeri, 'yuzde'> => {
    const no = departman.get(kisiId) ?? null;
    const g = no === null ? undefined : gruplar.get(no);
    if (g === undefined) return { deger: null, havuz: false };
    return g.kucuk ? { deger: havuz?.deger ?? null, havuz: true } : { deger: g.saatMaliyeti, havuz: false };
  };
  const istasyonDegeri = new Map([...istasyonlar].map((id) => [id, istasyonSaatDegeri(
    atamalar.filter((x) => x.istasyonId === id).map((x) => ({ yuzde: Number(x.yuzde), ...kisiDegeri(x.kisiId) })),
  )] as const));

  return {
    ay,
    ...mesaiToplami(satirlar.map((s) => {
      const t = a.tezgahlar.get(String(s.makineId));
      const g = t?.grup ?? '';
      const sd = /^\d+$/.test(g) ? istasyonDegeri.get(Number(g)) ?? null : null;
      const saatDegeri = a.kisiBazli ? sd?.deger ?? null : null;
      return {
        tutar: mesaiTutari({
          h: s.saat, kisiBazli: a.kisiBazli, op: t?.opOran, saatDegeri, carpan: a.carp[mesaiGunTuru(s.gun, a)], kisiEk: a.kisiEk,
          ucret: a.ucret, vardiyasiz: vardiyasizGun(s.gun, a), mesaiCarpan: a.mesaiCarpan,
        }),
        havuz: saatDegeri !== null && sd!.havuz,
      };
    })),
  };
}
