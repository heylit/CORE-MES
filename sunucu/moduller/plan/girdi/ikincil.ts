import type { Db } from '#cekirdek/db.ts';
import { takimOmruDurumlari } from '../../cnc-kurulum/disari.ts';
import { aparatKapasiteleri, istasyonlar as istasyonListesi } from '../../istasyonlar/disari.ts';
import { cncKimlikliMalzemeler, malzemeOzetleri } from '../../malzemeler/disari.ts';
import { isEmriKaynakIstekleri } from '../../rota/disari.ts';
import { ikincilKaynakKur, type IkincilEki, type IkincilOkuma } from './ikincil-kurallar.ts';

// 3199 (A + D): planın ikincil kaynak okuması. Kaynak tanımı İstasyonlar'ın aparat kapasitesi satırıdır (tür, adet, yer, kısıt, kesinti,
// ömür); kartın kodu ve adı Malzemeler'den; adımın isteği iş emrine kopyalanan ekipman listesinden (Rota). Özel takımın başlangıç ömrü
// CNC Kurulum'un takım yükünden (cebe yüklü, kartla aynı CNC kimliği); kayıt yoksa bilinmez (V13). Okunamayan dilim null'dır: girdi.betik
// o alanı açık çalışmadaki gibi bırakır. Çağıran yetkiyi verir (istasyon ve emir okuması).
export async function ikincilEkiOku(
  db: Db, yetki: { istasyon: boolean; emir: boolean }, isler: readonly { id: number; emirNo: string; opNo: number }[],
): Promise<IkincilEki> {
  const okuma: IkincilOkuma = { kaynaklar: null, kartlar: new Map(), istekler: null, takimlar: null };
  if (yetki.istasyon) {
    okuma.kaynaklar = await aparatKapasiteleri(db);
    const kartlar = [...new Set(okuma.kaynaklar.map((k) => k.aparatKartiId))];
    for (const [id, m] of await malzemeOzetleri(db, kartlar)) okuma.kartlar.set(id, { kod: m.kod, ad: m.ad });
    const takimKartlari = new Set(okuma.kaynaklar.filter((k) => k.tur === 'ozel_takim' && k.omur !== null).map((k) => k.aparatKartiId));
    if (takimKartlari.size > 0) {
      const kimlik = new Map([...await cncKimlikliMalzemeler(db)].filter(([, m]) => takimKartlari.has(m.malzemeId)).map(([k, m]) => [k, m.malzemeId]));
      // Ortak takım herhangi bir istasyonun cebinde olabilir: o durumda bütün aktif istasyonların yükü okunur.
      const ortakVar = okuma.kaynaklar.some((k) => takimKartlari.has(k.aparatKartiId) && k.istasyonId === null);
      const istasyonlar = ortakVar ? (await istasyonListesi(db, { pasiflerDahil: false })).map((i) => i.id)
        : [...new Set(okuma.kaynaklar.flatMap((k) => (k.istasyonId === null ? [] : [k.istasyonId])))];
      const yukler = kimlik.size === 0 || istasyonlar.length === 0 ? [] : await takimOmruDurumlari(db, istasyonlar);
      okuma.takimlar = yukler.flatMap((y) => {
        const kart = kimlik.get(y.takimKimligi);
        return kart === undefined ? [] : [{ kartId: kart, istasyonId: y.istasyonId, kalanPay: y.kalanPay }];
      });
    }
  }
  if (yetki.emir) {
    const istek = await isEmriKaynakIstekleri(db, isler.map((i) => i.id));
    okuma.istekler = isler.flatMap((i) => {
      const l = istek.get(i.id);
      return l === undefined ? [] : [{ anahtar: `${i.emirNo}|${String(i.opNo)}`, istekler: l }];
    });
  }
  return ikincilKaynakKur(okuma);
}

// 3199 (D): özel takımın şimdiki kalan ömrü, planın başlangıç ömrüyle aynı okuma (Kaynaklar > İkincil kaynaklar "Ömür" sütunu).
// Ömür birimi satırdakidir; CNC Kurulum'da yük kaydı yoksa null (ekran "bilinmiyor" yazar). Çağıran istasyon okumasını yetkiyle verir.
export async function takimKalanlari(db: Db): Promise<{ kapasiteId: number; kalan: number | null }[]> {
  const ek = await ikincilEkiOku(db, { istasyon: true, emir: false }, []);
  return (ek.kaynaklar ?? []).filter((k) => k.tur === 'ozel_takim' && k.omur !== null).map((k) => ({
    kapasiteId: Number(k.id), kalan: k.kalanPay === null || k.omur === null ? null : Math.round(k.omur * k.kalanPay * 100) / 100,
  }));
}
