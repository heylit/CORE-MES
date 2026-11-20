import type { Db } from '#cekirdek/db.ts';
import { eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  ANAHTARLI_TURLER, BILDIRIM_TURLERI, type BildirimOlayAcikDegistirGovdesi, type BildirimOlayAciklariCevabi, type BildirimOlayTopluGovdesi, type BildirimTuru,
} from '#paylasilan/sozlesme/bildirim.ts';
import { ESKI_ACIK_KADEMELER, KADEME_KAYNAKLARI, KADEME_KAYNAK_ANAHTARLARI, type KademeKaynagiTanimi } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import { kaynakModulu } from './kurallar.ts';
import * as sk from './sorgular/kademe/sorgular.ts';
import * as so from './sorgular/olay/sorgular.ts';

// 3478 (3478-1 a, 3478-2 a): olay başına ana anahtar. Satırı olmayan olay kapalıdır; kapanmadan önceki kademe ayarı
// "Önceki hale dön" ile geri yazılır. Okuma ve yazma `ayarlar.yaz` ister (uçta).

export async function olayAnahtarlari(db: Db): Promise<BildirimOlayAciklariCevabi> {
  const satirlar = new Map((await so.anahtarSatirlari(db)).map((r) => [r.tur, r]));
  const hal = await so.oncekiHal(db);
  return {
    satirlar: ANAHTARLI_TURLER.map((tur) => {
      const t = BILDIRIM_TURLERI[tur];
      const r = satirlar.get(tur);
      return { tur, baslik: t.baslik, onem: t.onem, kaynakModul: kaynakModulu(tur), acik: r?.acik ?? false, surum: r?.surum ?? null };
    }),
    oncekiHal: { alindi: hal?.alindi ?? null, donuldu: hal?.donuldu ?? null },
  };
}

export async function olayAnahtariDegistir(db: Db, kullanici: Kullanici, tur: BildirimTuru, g: BildirimOlayAcikDegistirGovdesi): Promise<BildirimOlayAciklariCevabi> {
  if ((await so.anahtarYaz(db, tur, g.acik, g.surum, kullanici.id)) === null) throw eskiSurum();
  return olayAnahtarlari(db);
}

export async function olayAnahtarlariTopluDegistir(db: Db, kullanici: Kullanici, g: BildirimOlayTopluGovdesi): Promise<BildirimOlayAciklariCevabi> {
  await so.topluYaz(db, g.turler, g.acik, kullanici.id);
  return olayAnahtarlari(db);
}

// Bütün anahtarlı olaylar açılır (3478'den önce hepsi açıktı). Kademe ayarı saklanan satırlara döner; saklanan satırı olmayan
// kaynak, eski varsayılanı açıksa katalog değerleriyle açılır. Boş kurulumda saklanan liste boştur: eski varsayılanlar geçer.
// Testler de bunu çağırır: modül testleri 3478'den önceki gibi açık olaylarla çalışır, kapalılığı kendi testi ölçer.
export async function oncekiHaleDon(db: Db, kullanici: Kullanici): Promise<BildirimOlayAciklariCevabi> {
  await butunOlaylariVeEskiKademeleriAc(db, kullanici.id);
  return olayAnahtarlari(db);
}

export async function butunOlaylariVeEskiKademeleriAc(db: Db, kisiId: number | null): Promise<void> {
  const hal = await so.oncekiHal(db, true);
  await so.topluYaz(db, ANAHTARLI_TURLER, true, kisiId);
  const saklanan = new Map((hal?.kademe ?? []).map((k) => [k.kaynak, k.acik]));
  const satirli = new Set((await sk.ayarSatirlari(db)).map((r) => r.kaynak));
  for (const kaynak of KADEME_KAYNAK_ANAHTARLARI) {
    const acik = saklanan.get(kaynak) ?? (ESKI_ACIK_KADEMELER as readonly string[]).includes(kaynak);
    if (satirli.has(kaynak)) {
      await so.kademeAcikYaz(db, kaynak, acik, kisiId);
    } else if (acik) {
      const v = (KADEME_KAYNAKLARI[kaynak] as KademeKaynagiTanimi).varsayilan;
      await sk.ayarYaz(db, kaynak, {
        acik: true, k2Gun: v.k2Gun, k3Gun: v.k3Gun, k4Gun: v.k4Gun, k5Gun: v.k5Gun, epostaKademe: v.epostaKademe, serit: v.serit, kapatilamaz: v.kapatilamaz,
        yoneticiRolId: null, k3Birim: v.k3Birim,
      }, 1, kisiId);
    }
  }
  if (hal !== null && kisiId !== null) await so.donulduYaz(db, kisiId);
}
