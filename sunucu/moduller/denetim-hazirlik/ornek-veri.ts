import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { ORTAK_KOK, sonParca, ustYolu } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Prototip bütün durumunu ortak yerel deposunda tek anahtarda tutar (kalite-denetim-v4: profiller ve denetim takvimi).
// Örnek, o kayda bir örnek profil olarak girer; eksik alanları prototip açılışta varsayılanla doldurur (fill).
export const ORNEK_YOL = `${ORTAK_KOK}/kalite-denetim-v4`;
export const ORNEK_PROFIL = 'ornek-profil';

const gunEkle = (gun: string, fark: number): string => {
  const t = new Date(`${gun}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + fark);
  return t.toISOString().slice(0, 10);
};

export function ornekDurum(gun: string, anMs: number): Record<string, unknown> {
  return {
    active: ORNEK_PROFIL,
    order: [ORNEK_PROFIL],
    lastBackup: 0,
    data: {
      [ORNEK_PROFIL]: {
        prog: 'iso9001',
        view: 'home',
        updated: anMs,
        profile: {
          firma: 'TMI',
          tesis: 'Örnek Tesis',
          kapsam: 'CNC talaşlı imalat ve montaj (örnek kapsam)',
          kurulus: 'Örnek Belgelendirme Kuruluşu',
          hazirlayan: 'Örnek Kaliteci',
        },
        audits: [
          {
            id: 'ornek-denetim-1', prog: 'iso9001', kind: 'audit', type: 'İç denetim / ön denetim', date: gunEkle(gun, -30),
            cb: '', note: 'Örnek iç denetim kaydı', status: 'done', res: { major: 0, minor: 2, obs: 3, score: 82, items: [] },
          },
          {
            id: 'ornek-denetim-2', prog: 'iso9001', kind: 'audit', type: '1. gözetim', date: gunEkle(gun, 45), end: gunEkle(gun, 46),
            cb: 'Örnek Belgelendirme Kuruluşu', note: 'Örnek gözetim denetimi', status: 'plan',
          },
        ],
      },
    },
  };
}

const ornekMi = (veri: Record<string, unknown> | undefined): boolean => {
  const deger = veri?.['deger'];
  if (typeof deger !== 'string') return false;
  try {
    const durum = JSON.parse(deger) as { data?: Record<string, unknown> };
    return durum.data?.[ORNEK_PROFIL] !== undefined;
  } catch {
    return false;
  }
};

export const ornekVeri = ornekVeriTanimi({
  modul: 'denetim-hazirlik',
  gerekir: ['kisiler'],
  yukluMu: async (db) => ornekMi((await sorgular.belgeGetir(db, ORNEK_YOL))?.veri),
  yukle: async (db, baglam) => {
    // Kurumun kendi durumu varsa üstüne yazılmaz (prototip hepsini tek kayıtta tutar).
    if (await sorgular.belgeGetir(db, ORNEK_YOL) !== null) return;
    const kisiId = await kisiNoKullaniciAdindan(db, 'ornek.kalite');
    if (kisiId === null) throw new Error('Örnek veri: ornek.kalite kişisi yok (kisiler örnek verisi önce yüklenmeli).');
    const deger = JSON.stringify(ornekDurum(baglam.gun, baglam.an.getTime()));
    await sorgular.belgeYaz(db, { yol: ORNEK_YOL, ust: ustYolu(ORNEK_YOL), kimlik: sonParca(ORNEK_YOL), veri: { deger }, kisiId });
  },
});
