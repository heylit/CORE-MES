import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'satin-alma-talep', sira: 10, baslik: 'Malzeme ya da hizmet lazım', aciklama: 'Satın alma talebi açın; durumunu Taleplerim\'de izleyin.', simge: 'edit', yol: '/taleplerim', islem: 'satin-alma.talep-ac' },
  { anahtar: 'satin-alma-is-kutusu', sira: 20, baslik: 'Teklif geldi ya da sipariş vereceğim', aciklama: 'İş kutusu: teklif girişi, karar ve sipariş bekleyen talepler.', simge: 'bell', yol: '/satin-alma', islem: 'satin-alma.yaz' },
  { anahtar: 'satin-alma-onay', sira: 30, baslik: 'Onayımı bekleyen talepler var', aciklama: 'Onay bekleyen kararları inceleyin, onaylayın ya da reddedin.', simge: 'check', yol: '/satin-alma/onaylar', islem: 'satin-alma.onayla' },
  { anahtar: 'satin-alma-dis-operasyon', sira: 40, baslik: 'Fasona iş gönderiyorum', aciklama: 'Dış operasyonlar: fason firmaya giden ve dönen işler.', simge: 'rotate', yol: '/satin-alma/dis-operasyonlar', islem: 'satin-alma.yaz' },
];
