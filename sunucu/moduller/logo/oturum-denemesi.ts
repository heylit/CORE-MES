import { baglantiHatasiOzeti } from '#paylasilan/logo-baglanti-metni.ts';
import type { KopruIstemcisi } from './kopru.ts';
import { oturumAcildi, sonBaglantiHatasi } from './yardimci-baglanti.ts';

// 3698: yardımcının salt okunur GET /api/session/check ucu. Logo Objects oturumunu (Connect, UserLogin, CompanyLogin) dener; Logo'ya yazmaz.
// Yardımcı bekleme süresindeyken yeniden bağlanmaz, son hatayı ve kalan süreyi döner. Okumalar SQL'le yapıldığı için sürüm ucu oturumu göstermez.
export const OTURUM_DENEME_YOLU = '/api/session/check';
export const OTURUM_ADIMI_ADI = 'Logo oturumu (Connect, UserLogin, CompanyLogin)';
export const ESKI_YARDIMCI_OTURUM_ILETISI = 'Yardımcı eski, oturum denenemedi. Yardımcıyı güncelleyin (kurulum/logo-yardimcisi.md).';

export type OturumDenemesi =
  | { durum: 'acik'; ileti: string }
  | { durum: 'kapali'; ileti: string }
  | { durum: 'eski'; ileti: string }
  | { durum: 'denenemedi'; ileti: string };

export async function oturumuDene(kopru: KopruIstemcisi, simdi: () => Date = () => new Date()): Promise<OturumDenemesi> {
  const c = await kopru.kontrolOku(OTURUM_DENEME_YOLU);
  if ('tur' in c) return { durum: 'denenemedi', ileti: `Yardımcıya ulaşılamadı: ${c.ileti}` };
  if (c.durum === 404) return { durum: 'eski', ileti: ESKI_YARDIMCI_OTURUM_ILETISI };
  if (c.durum === 503) {
    const h = sonBaglantiHatasi();
    return { durum: 'kapali', ileti: `Logo oturumu açık değil${h === null ? '.' : `: ${baglantiHatasiOzeti(h, simdi())}`}` };
  }
  const g = c.govde !== null && typeof c.govde === 'object' && !Array.isArray(c.govde) ? (c.govde as Record<string, unknown>) : {};
  if (c.durum === 200 && g['oturum'] === 'acik') {
    oturumAcildi();
    const surum = typeof g['logoSurumu'] === 'string' && g['logoSurumu'].trim() !== '' ? ` (Logo Objects ${g['logoSurumu'].trim().slice(0, 40)})` : '';
    return { durum: 'acik', ileti: `Logo oturumu açık${surum}.` };
  }
  if (c.durum === 401 || c.durum === 403) return { durum: 'denenemedi', ileti: `Köprü anahtarı reddedildi (${c.durum}).` };
  return { durum: 'denenemedi', ileti: `Oturum denemesi okunamadı (${c.durum}).` };
}
