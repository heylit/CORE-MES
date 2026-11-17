import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// Yalnız test: tezgah servisinin yerine geçen yerel HTTP sunucusu. Cihaz adları ve değerler uydurmadır (ORN-); gerçek servis
// cevabı (cihaz adı, seri no, uuid) depoya girmez.
export interface SahteTezgah {
  ad: string;
  erisim?: string;
  calisma?: string;
  mod?: string;
  program?: string;
  sayac?: string;
  takim?: string;
  hiz?: string;
  yuk?: string;
  eksenYuku?: string;
  ilerleme?: string;
  // Koşul: [tür, hal, metin]
  kosullar?: readonly (readonly [string, 'Normal' | 'Warning' | 'Fault' | 'Unavailable', string])[];
}

export interface SahteMtconnect {
  adres: string;
  istekler: { yontem: string; yol: string }[];
  tezgahlar: SahteTezgah[];
  // Verilirse o yolun cevabı bununla değişir (durum, gövde, gecikme).
  ozel: Partial<Record<string, { durum?: number; govde?: string; gecikmeMs?: number; basliklar?: Record<string, string> }>>;
  kapat(): Promise<void>;
}

const kac = (m: string): string => m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ZAMAN = '2026-11-10T09:00:00Z';
const oge = (ad: string, kimlik: string, deger: string | undefined): string =>
  deger === undefined ? '' : `<${ad} dataItemId="${kimlik}" timestamp="${ZAMAN}" name="${kimlik}" sequence="1">${kac(deger)}</${ad}>`;

export function probeMetni(tezgahlar: readonly SahteTezgah[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><MTConnectDevices xmlns="urn:mtconnect.org:MTConnectDevices:1.2"><Header sender="ORN" version="1.2"/><Devices>${
    tezgahlar.map((t) => `<Device id="d-${kac(t.ad)}" name="${kac(t.ad)}" uuid="ORN-UUID"><DataItems><DataItem id="avail" type="AVAILABILITY" category="EVENT"/></DataItems></Device>`).join('')
  }</Devices></MTConnectDevices>`;
}

export function currentMetni(tezgahlar: readonly SahteTezgah[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.2"><Header sender="ORN" version="1.2"/><Streams>${
    tezgahlar.map((t) => `<DeviceStream name="${kac(t.ad)}" uuid="ORN-UUID">
<ComponentStream component="Device" name="${kac(t.ad)}" componentId="d"><Events>${oge('Availability', 'avail', t.erisim ?? 'AVAILABLE')}</Events></ComponentStream>
<ComponentStream component="Controller" name="controller" componentId="c"><Events>${oge('Execution', 'exec', t.calisma)}${oge('ControllerMode', 'mode', t.mod)}${oge('Program', 'pgm', t.program)}${oge('PartCount', 'pc', t.sayac)}${oge('ToolNumber', 'tool', t.takim)}</Events>
<Samples>${oge('PathFeedrate', 'feed', t.ilerleme)}</Samples>
<Condition>${(t.kosullar ?? []).map(([tur, hal, metin]) => `<${hal} dataItemId="k" timestamp="${ZAMAN}" type="${tur}">${kac(metin)}</${hal}>`).join('')}</Condition></ComponentStream>
<ComponentStream component="Linear" name="X" componentId="x"><Samples>${oge('Load', 'xload', t.eksenYuku)}</Samples></ComponentStream>
<ComponentStream component="Rotary" name="S" componentId="s"><Samples>${oge('SpindleSpeed', 'sspeed', t.hiz)}${oge('Load', 'sload', t.yuk)}</Samples></ComponentStream>
</DeviceStream>`).join('')
  }</Streams></MTConnectStreams>`;
}

export async function sahteMtconnectAc(tezgahlar: SahteTezgah[] = []): Promise<SahteMtconnect> {
  const sahte: SahteMtconnect = { adres: '', istekler: [], tezgahlar, ozel: {}, kapat: async () => undefined };
  const sunucu = createServer((istek, cevap) => {
    const yol = istek.url ?? '';
    sahte.istekler.push({ yontem: istek.method ?? '', yol });
    const ozel = sahte.ozel[yol];
    const yaz = (): void => {
      const govde = ozel?.govde ?? (yol === '/probe' ? probeMetni(sahte.tezgahlar) : yol === '/current' ? currentMetni(sahte.tezgahlar) : '');
      cevap.writeHead(ozel?.durum ?? (govde === '' ? 404 : 200), { 'Content-Type': 'text/xml', ...(ozel?.basliklar ?? {}) });
      cevap.end(govde);
    };
    if (ozel?.gecikmeMs !== undefined) setTimeout(yaz, ozel.gecikmeMs); else yaz();
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  sahte.adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  sahte.kapat = () => new Promise<void>((coz) => { sunucu.closeAllConnections(); sunucu.close(() => coz()); });
  return sahte;
}
