import { sahteKopruAc } from './sahte-kopru.ts';

// Yerel deneme: node sunucu/moduller/logo/sahte-kopru-calistir.ts <port> <anahtar>. Yalnız 127.0.0.1'de dinler; sunucu bunu ithal etmez.
const port = Number(process.argv[2] ?? '4190');
const anahtar = process.argv[3] ?? 'deneme-anahtari';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port 1-65535 arası tam sayı olmalı');
const kopru = await sahteKopruAc({ port, anahtar });
console.log(`Sahte Logo köprüsü dinliyor: ${kopru.adres} (Ctrl+C ile durur)`);
process.on('SIGINT', () => { void kopru.kapat().then(() => process.exit(0)); });
