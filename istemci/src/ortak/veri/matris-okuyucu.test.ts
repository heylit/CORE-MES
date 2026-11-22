import { beforeAll, describe, expect, it } from 'vitest';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { cm1Coz } from '#paylasilan/etiket-kodu.ts';
import { matrisOku, type Goruntu } from './matris-okuyucu.ts';
import { bwip, eskiQr, motoruHazirla } from './test-ortak.ts';

beforeAll(motoruHazirla);

const KODLAR = ['LOC:ORN-A01-02-3', 'MLZ:1002', 'LOT:ORN-LT-2041', 'UE:4512', 'RAF:ORN-R12', 'RP:37', 'CMD:KAYDET', 'CMD:MIKTAR:25', 'UE-004512', 'FIS:ORN-0007'];
const GENIS = 'CM1/LOT:ORN-LT-2041/TPN:ORN-TPN-77812/DKM:ORN-DKM-5531/SRT:ORN-SRT-310/SKT:270527/MK:ORN-MK-0045/GT:261118/TDR:ORN-TD-07/DRM:KBK/BT:261122';
const REFAKAT = 'CM1/UE:142/PRC:ORN-PRC-001/REV:B/RRV:3/LOT:ORN-LT-2041/ADT:120/TRM:261125/OPS:10+20+30+40+50+60+70+80+90+100+110+120+15K/KPY:1-2/BT:261122';

describe('matrisOku: uret-oku döngüsü', () => {
  it.each(KODLAR)('DataMatrix %s okunur', async (k) => { expect(await matrisOku(bwip('datamatrix', k))).toBe(k); });
  it.each(KODLAR)('QR %s okunur (bwip-js)', async (k) => { expect(await matrisOku(bwip('qrcode', k))).toBe(k); });
  it.each(KODLAR)('eski etiketlerin QR üreticisinin (qrcode-generator) kodu %s okunur', async (k) => { expect(await matrisOku(eskiQr(k))).toBe(k); });

  it('geniş CM1 içeriği DataMatrix olarak okunur ve ilk alanıyla çözülür', async () => {
    for (const metin of [GENIS, REFAKAT]) {
      const okunan = await matrisOku(bwip('datamatrix', metin));
      expect(okunan).toBe(metin);
      expect(cm1Coz(okunan!)).not.toBeNull();
    }
    expect(kodTuru((await matrisOku(bwip('datamatrix', GENIS)))!)).toEqual({ tur: 'lot', deger: 'ORN-LT-2041' });
  });

  it('döndürülmüş ve ters (açık zemin yerine koyu zemin) görüntü okunur', async () => {
    const g = bwip('datamatrix', GENIS);
    const d = new Uint8ClampedArray(g.data.length);
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const kaynak = (y * g.width + x) * 4;
      const hedef = (x * g.height + (g.height - 1 - y)) * 4;
      d[hedef] = d[hedef + 1] = d[hedef + 2] = 255 - g.data[kaynak]!; d[hedef + 3] = 255;
    }
    expect(await matrisOku({ data: d, width: g.height, height: g.width })).toBe(GENIS);
  });

  it('kodsuz görüntüde null döner', async () => {
    const bos: Goruntu = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
    expect(await matrisOku(bos)).toBeNull();
  });
});
