import type { Durum } from './kalibrasyon.ts';

// zod taşımaz: istemci değer olarak ithal eder (eslint.config.js ZODSUZ).
export interface KalibrasyonDurumGirdisi {
  kullanimDisi: boolean;
  sonTarih: string | null;
  // Ölçü aletleri periyodu gün, Kalite Merkezi ve Denetim Hazırlığı ay tutar; ikisinden biri verilir.
  periyotGun?: number;
  periyotAy?: number;
  // Elle girilmiş sonraki kalibrasyon tarihi hesaplananın yerine geçer (Denetim Hazırlığı).
  vade?: string | null;
  bugun: string;
}

export interface KalibrasyonDurumu {
  vade: string | null;
  kalanGun: number | null;
  durum: Durum;
}

// Kalibrasyon vadesi ve durumunun tek kuralı: Ölçü aletleri, Kalite Merkezi ve Denetim Hazırlığı bunu kullanır.
// Vadesine 30 gün ya da daha az kalan (vadesi bugün olan dahil) yaklaşandır. Çerçevelere metni gömüldüğü için
// işlev kendi içinde kapalıdır: dışarıdan ad kullanmaz.
// Sıra anlamlıdır: kullanım dışı her şeyi bastırır; kaydı olmayanın vadesi bilinmez, sıfır uydurulmaz.
export function kalibrasyonDurumu(g: KalibrasyonDurumGirdisi): KalibrasyonDurumu {
  const YAKLASAN_ESIK_GUN = 30;
  const GUN_MS = 86_400_000;
  const gun = (t: string): number => Date.parse(`${t}T00:00:00Z`) / GUN_MS;
  const tarih = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  let vade: string | null = g.vade ? g.vade : null;
  if (vade === null && g.sonTarih) {
    if (g.periyotAy !== undefined) {
      // Ay sonu kısalır: 31 Ağustos + 1 ay = 30 Eylül.
      const [y = 0, a = 1, d = 1] = g.sonTarih.split('-').map(Number);
      const hedefAy = a - 1 + Math.trunc(Number(g.periyotAy));
      const ayinSonGunu = new Date(Date.UTC(y, hedefAy + 1, 0)).getUTCDate();
      vade = tarih(Date.UTC(y, hedefAy, Math.min(d, ayinSonGunu)));
    } else {
      vade = tarih((gun(g.sonTarih) + Number(g.periyotGun ?? 0)) * GUN_MS);
    }
  }
  const kalanGun = vade === null ? null : Math.round(gun(vade) - gun(g.bugun));
  if (g.kullanimDisi) return { vade, kalanGun, durum: 'kullanim-disi' };
  if (vade === null || kalanGun === null) return { vade, kalanGun, durum: 'kayit-yok' };
  if (kalanGun < 0) return { vade, kalanGun, durum: 'gecmis' };
  if (kalanGun <= YAKLASAN_ESIK_GUN) return { vade, kalanGun, durum: 'yaklasan' };
  return { vade, kalanGun, durum: 'gecerli' };
}
