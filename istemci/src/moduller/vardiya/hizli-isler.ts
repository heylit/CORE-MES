import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'vardiya-fazla-mesai', sira: 10, baslik: 'Fazla mesai yazılacak', aciklama: 'Fazla mesai: gün, vardiya ve kişileri seçin.', simge: 'clock', yol: '/vardiya/fazla-mesai', islem: 'vardiya.yaz' },
  { anahtar: 'vardiya-durus', sira: 20, baslik: 'Planlı duruş olacak', aciklama: 'Planlı duruşlar: bakım, tatil ya da toplantı; kapasiteden düşer.', simge: 'pause', yol: '/vardiya/planli-duruslar', islem: 'vardiya.durus-yaz' },
];
