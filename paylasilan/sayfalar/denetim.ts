import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Sistem Ayarları Yönetim grubunun sonunda durur (kullanıcı kararı); denetim ondan önce gelir.
export const DENETIM_SAYFALARI = [
  { yol: '/denetim', islem: 'sayfa.denetim', baslik: 'Denetim Kaydı', simge: 'eye', grup: 'Yönetim', sira: 5 },
] as const satisfies readonly SayfaTanimi[];

// Tek bölüm; ikinci menü proje kuralı gereği veridir. Satır içeriği ayrıca `denetim.govde-oku` ister, ekran söyler.
export const DENETIM_IKINCI_MENU = {
  kok: '/denetim',
  baslik: 'Denetim Kaydı',
  simge: 'eye',
  gruplar: [
    { maddeler: [{ anahtar: 'kayitlar', baslik: 'Kayıtlar', yol: '/denetim', simge: 'list', islem: 'sayfa.denetim' }] },
  ],
} as const satisfies IkinciMenuTanimi;
