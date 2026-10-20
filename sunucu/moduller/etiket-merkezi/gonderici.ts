import { Socket } from 'node:net';
import { YAZICI_KAPISI } from '#paylasilan/sozlesme/etiket-merkezi.ts';

// Yazıcıya tek yönlü ham gönderim; cevap okunmaz. Bu dosya dışında hiçbir yer yazıcıya bağlanmaz (98 evet).
export const GONDERIM_SURESI_MS = 5000;

export type Gonderici = (adres: string, komut: string) => Promise<void>;

export const tcpGonder: Gonderici = (adres, komut) => new Promise((coz, reddet) => {
  const soket = new Socket();
  let bitti = false;
  const bitir = (hata?: Error) => {
    if (bitti) return;
    bitti = true;
    soket.destroy();
    if (hata) reddet(hata); else coz();
  };
  soket.setTimeout(GONDERIM_SURESI_MS, () => bitir(new Error('zaman aşımı')));
  soket.once('error', (h) => bitir(h));
  soket.connect({ host: adres, port: YAZICI_KAPISI }, () => {
    soket.end(Buffer.from(komut, 'utf8'), () => bitir());
  });
});
