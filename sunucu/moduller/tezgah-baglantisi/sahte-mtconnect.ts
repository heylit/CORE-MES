import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// Yalnız test: tezgah servisinin yerine geçen yerel HTTP sunucusu. Cihaz adları ve değerler uydurmadır (ORN-); gerçek servis
// cevabı (cihaz adı, seri no, uuid) depoya girmez. /sample için sıra numaralı değişiklik günlüğü ve sınırlı tampon tutar.
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

export interface SahteVarlik {
  kimlik: string;
  takimNo: string;
  // [tür, güncel, başlangıç, uyarı, sınır]
  omurler?: readonly (readonly [string, number, number, number, number])[];
}

export interface SahteMtconnect {
  adres: string;
  istekler: { yontem: string; yol: string }[];
  tezgahlar: SahteTezgah[];
  // Verilirse o yolun cevabı bununla değişir (durum, gövde, gecikme). Anahtar, sorgusuz yoldur (ör. /sample).
  ozel: Partial<Record<string, { durum?: number; govde?: string; gecikmeMs?: number; basliklar?: Record<string, string> }>>;
  instanceId: number;
  // Tampondaki en çok kayıt sayısı; eskiler düşer.
  tamponBoyu: number;
  // /assets cevabı; undefined ise servis /assets vermez (404).
  varliklar: SahteVarlik[] | undefined;
  // Değişiklik zamanları bu saatten başlar (ms); her değişiklik bir saniye ilerletir.
  saatMs: number;
  // Tek alanı değiştirir ve günlüğe sıra numaralı kayıt ekler.
  degistir(i: number, alan: keyof Omit<SahteTezgah, 'ad' | 'kosullar'>, deger: string | undefined): void;
  kosulYaz(i: number, kosullar: SahteTezgah['kosullar']): void;
  // Servis yeniden başlar: instanceId değişir, günlük ve sıra sıfırlanır.
  yenidenBasla(): void;
  kapat(): Promise<void>;
}

const kac = (m: string): string => m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ZAMAN = '2026-11-10T09:00:00Z';

type Alan = keyof Omit<SahteTezgah, 'ad' | 'kosullar'>;
interface AlanBicimi { ad: string; kimlik: string; kap: 'Events' | 'Samples'; bilesen: string; bilesenAdi: string; kategori: 'EVENT' | 'SAMPLE'; birim?: string }
const ALANLAR: Record<Alan, AlanBicimi> = {
  erisim: { ad: 'Availability', kimlik: 'avail', kap: 'Events', bilesen: 'Device', bilesenAdi: '', kategori: 'EVENT' },
  calisma: { ad: 'Execution', kimlik: 'exec', kap: 'Events', bilesen: 'Controller', bilesenAdi: 'controller', kategori: 'EVENT' },
  mod: { ad: 'ControllerMode', kimlik: 'mode', kap: 'Events', bilesen: 'Controller', bilesenAdi: 'controller', kategori: 'EVENT' },
  program: { ad: 'Program', kimlik: 'pgm', kap: 'Events', bilesen: 'Controller', bilesenAdi: 'controller', kategori: 'EVENT' },
  sayac: { ad: 'PartCount', kimlik: 'pc', kap: 'Events', bilesen: 'Controller', bilesenAdi: 'controller', kategori: 'EVENT' },
  takim: { ad: 'ToolNumber', kimlik: 'tool', kap: 'Events', bilesen: 'Controller', bilesenAdi: 'controller', kategori: 'EVENT' },
  ilerleme: { ad: 'PathFeedrate', kimlik: 'feed', kap: 'Samples', bilesen: 'Controller', bilesenAdi: 'controller', kategori: 'SAMPLE', birim: 'MILLIMETER/SECOND' },
  eksenYuku: { ad: 'Load', kimlik: 'xload', kap: 'Samples', bilesen: 'Linear', bilesenAdi: 'X', kategori: 'SAMPLE', birim: 'PERCENT' },
  hiz: { ad: 'SpindleSpeed', kimlik: 'sspeed', kap: 'Samples', bilesen: 'Rotary', bilesenAdi: 'S', kategori: 'SAMPLE', birim: 'REVOLUTION/MINUTE' },
  yuk: { ad: 'Load', kimlik: 'sload', kap: 'Samples', bilesen: 'Rotary', bilesenAdi: 'S', kategori: 'SAMPLE', birim: 'PERCENT' },
};
// Erişim verilmediyse tezgah erişilebilirdir.
const alanDegeri = (t: SahteTezgah, a: Alan): string | undefined => (a === 'erisim' ? t.erisim ?? 'AVAILABLE' : t[a]);
const ALAN_ADLARI = Object.keys(ALANLAR) as Alan[];

const oge = (a: AlanBicimi, deger: string | undefined, sira: number, zaman: string): string =>
  deger === undefined ? '' : `<${a.ad} dataItemId="${a.kimlik}" timestamp="${zaman}" name="${a.kimlik}" sequence="${sira}">${kac(deger)}</${a.ad}>`;

const tipYazim = (ad: string): string => ad.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

// Tek tezgahın alan tanımı: bileşen ağacı Device > Components > (Controller | Linear | Rotary).
export function probeMetni(tezgahlar: readonly SahteTezgah[], instanceId = 1): string {
  const alan = (k: Alan): string => {
    const a = ALANLAR[k];
    return `<DataItem id="${a.kimlik}" name="${a.kimlik}" type="${tipYazim(a.ad)}" category="${a.kategori}"${a.birim === undefined ? '' : ` units="${a.birim}"`}/>`;
  };
  const bilesenler = (bilesen: string, ad: string, id: string, alanlar: Alan[], ek = ''): string =>
    `<${bilesen} id="${id}" name="${ad}"><DataItems>${alanlar.map(alan).join('')}${ek}</DataItems></${bilesen}>`;
  return `<?xml version="1.0" encoding="UTF-8"?><MTConnectDevices xmlns="urn:mtconnect.org:MTConnectDevices:1.2"><Header sender="ORN" version="1.2" instanceId="${instanceId}"/><Devices>${
    tezgahlar.map((t) => `<Device id="d-${kac(t.ad)}" name="${kac(t.ad)}" uuid="ORN-UUID"><DataItems>${alan('erisim')}</DataItems><Components>${
      bilesenler('Controller', 'controller', 'c', ['calisma', 'mod', 'program', 'sayac', 'takim', 'ilerleme'], '<DataItem id="k" type="SYSTEM" category="CONDITION"/>')
    }${bilesenler('Linear', 'X', 'x', ['eksenYuku'])}${bilesenler('Rotary', 'S', 's', ['hiz', 'yuk'])}</Components></Device>`).join('')
  }</Devices></MTConnectDevices>`;
}

interface Kayit { sira: number; cihaz: number; alan: Alan | 'kosul'; deger: string | undefined; zaman: string; kosullar?: SahteTezgah['kosullar'] }

interface Baslik { instanceId: number; ilk: number; son: number; sonraki: number }

function akisMetni(tezgahlar: readonly SahteTezgah[], kayitlar: readonly Kayit[], b: Baslik, kosulSirasi: (i: number) => number): string {
  const cihaz = (t: SahteTezgah, i: number): string => {
    const k = kayitlar.filter((r) => r.cihaz === i);
    const bul = (alan: Alan): Kayit[] => k.filter((r) => r.alan === alan);
    const grup = (alanlar: Alan[], kap: 'Events' | 'Samples'): string =>
      alanlar.filter((a) => ALANLAR[a].kap === kap).flatMap(bul).sort((x, y) => x.sira - y.sira).map((r) => oge(ALANLAR[r.alan as Alan], r.deger, r.sira, r.zaman)).join('');
    const kosul = k.filter((r) => r.alan === 'kosul').sort((x, y) => x.sira - y.sira).flatMap((r) => (r.kosullar ?? []).map(([tur, hal, metin]) =>
      `<${hal} dataItemId="k" timestamp="${r.zaman}" type="${tur}" sequence="${r.sira}">${kac(metin)}</${hal}>`)).join('');
    void kosulSirasi;
    return `<DeviceStream name="${kac(t.ad)}" uuid="ORN-UUID">
<ComponentStream component="Device" name="${kac(t.ad)}" componentId="d"><Events>${grup(['erisim'], 'Events')}</Events></ComponentStream>
<ComponentStream component="Controller" name="controller" componentId="c"><Events>${grup(['calisma', 'mod', 'program', 'sayac', 'takim'], 'Events')}</Events>
<Samples>${grup(['ilerleme'], 'Samples')}</Samples>
<Condition>${kosul}</Condition></ComponentStream>
<ComponentStream component="Linear" name="X" componentId="x"><Samples>${grup(['eksenYuku'], 'Samples')}</Samples></ComponentStream>
<ComponentStream component="Rotary" name="S" componentId="s"><Samples>${grup(['hiz', 'yuk'], 'Samples')}</Samples></ComponentStream>
</DeviceStream>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?><MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.2"><Header sender="ORN" version="1.2" instanceId="${b.instanceId}" firstSequence="${b.ilk}" lastSequence="${b.son}" nextSequence="${b.sonraki}"/><Streams>${
    tezgahlar.map(cihaz).join('')
  }</Streams></MTConnectStreams>`;
}

// Kurallar testleri için: her alanın anlık değeri, sıra 1 ile (günlüksüz).
export function currentMetni(tezgahlar: readonly SahteTezgah[]): string {
  const kayitlar: Kayit[] = [];
  tezgahlar.forEach((t, i) => {
    for (const a of ALAN_ADLARI) kayitlar.push({ sira: 1, cihaz: i, alan: a, deger: alanDegeri(t, a), zaman: ZAMAN });
    kayitlar.push({ sira: 1, cihaz: i, alan: 'kosul', deger: undefined, zaman: ZAMAN, kosullar: t.kosullar ?? [] });
  });
  return akisMetni(tezgahlar, kayitlar, { instanceId: 1, ilk: 1, son: 1, sonraki: 2 }, () => 1);
}

function varlikMetni(varliklar: readonly SahteVarlik[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><MTConnectAssets xmlns="urn:mtconnect.org:MTConnectAssets:1.2"><Header sender="ORN" version="1.2"/><Assets>${
    varliklar.map((v) => `<CuttingTool assetId="${kac(v.kimlik)}" timestamp="${ZAMAN}" toolId="${kac(v.takimNo)}"><CuttingToolLifeCycle><ProgramToolNumber>${kac(v.takimNo)}</ProgramToolNumber>${
      (v.omurler ?? []).map(([tur, deger, bas, uyari, sinir]) => `<ToolLife type="${tur}" countDirection="DOWN" initial="${bas}" warning="${uyari}" limit="${sinir}">${deger}</ToolLife>`).join('')
    }</CuttingToolLifeCycle></CuttingTool>`).join('')
  }</Assets></MTConnectAssets>`;
}

export async function sahteMtconnectAc(tezgahlar: SahteTezgah[] = [], saatMs: number = Date.parse(ZAMAN)): Promise<SahteMtconnect> {
  let gunluk: Kayit[] = [];
  let sonSira = 0;
  let snapshot: string[] = [];
  const sahte: SahteMtconnect = {
    adres: '', istekler: [], tezgahlar, ozel: {}, instanceId: 1, tamponBoyu: 100_000, varliklar: undefined, saatMs,
    degistir(i, alan, deger) { esitle(); const t = sahte.tezgahlar[i]; if (t) t[alan] = deger as never; esitle(); },
    kosulYaz(i, kosullar) { esitle(); const t = sahte.tezgahlar[i]; if (t) t.kosullar = kosullar; esitle(); },
    yenidenBasla() { sahte.instanceId += 1; gunluk = []; sonSira = 0; snapshot = []; esitle(); },
    kapat: async () => undefined,
  };
  const zaman = (): string => { sahte.saatMs += 1000; return new Date(sahte.saatMs).toISOString(); };
  const ekle = (r: Omit<Kayit, 'sira' | 'zaman'>): void => {
    sonSira += 1;
    gunluk.push({ ...r, sira: sonSira, zaman: zaman() });
    if (gunluk.length > sahte.tamponBoyu) gunluk = gunluk.slice(gunluk.length - sahte.tamponBoyu);
  };
  // Doğrudan `tezgahlar` üzerinde yapılan değişiklikler de günlüğe işlenir (istek ya da degistir çağrısında).
  function esitle(): void {
    sahte.tezgahlar.forEach((t, i) => {
      const onceki = snapshot[i] === undefined ? { ad: '' } as SahteTezgah : JSON.parse(snapshot[i] as string) as SahteTezgah;
      for (const a of ALAN_ADLARI) if (alanDegeri(t, a) !== alanDegeri(onceki, a) || snapshot[i] === undefined) ekle({ cihaz: i, alan: a, deger: alanDegeri(t, a) });
      if (JSON.stringify(t.kosullar ?? []) !== JSON.stringify(onceki.kosullar ?? []) || snapshot[i] === undefined) ekle({ cihaz: i, alan: 'kosul', deger: undefined, kosullar: t.kosullar ?? [] });
    });
    snapshot = sahte.tezgahlar.map((t) => JSON.stringify(t));
  }
  esitle();
  const baslik = (): Baslik => ({ instanceId: sahte.instanceId, ilk: gunluk[0]?.sira ?? sonSira + 1, son: sonSira, sonraki: sonSira + 1 });
  const anlik = (): Kayit[] => {
    // /current: her alanın son kaydı.
    const son = new Map<string, Kayit>();
    for (const r of gunluk) son.set(`${r.cihaz}|${r.alan}`, r);
    return [...son.values()];
  };

  const sunucu = createServer((istek, cevap) => {
    const tam = istek.url ?? '';
    const [yol = '', sorgu = ''] = tam.split('?');
    sahte.istekler.push({ yontem: istek.method ?? '', yol: tam });
    esitle();
    const ozel = sahte.ozel[yol];
    const yaz = (): void => {
      let govde = ozel?.govde;
      let durum = ozel?.durum;
      if (govde === undefined) {
        if (yol === '/probe') govde = probeMetni(sahte.tezgahlar, sahte.instanceId);
        else if (yol === '/current') govde = akisMetni(sahte.tezgahlar, anlik(), baslik(), () => 1);
        else if (yol === '/assets') govde = sahte.varliklar === undefined ? '' : varlikMetni(sahte.varliklar);
        else if (yol === '/sample') {
          const p = new URLSearchParams(sorgu);
          const from = Number(p.get('from') ?? '0');
          const count = Number(p.get('count') ?? '100');
          const b = baslik();
          if (from < b.ilk) {
            durum = 404;
            govde = '<?xml version="1.0"?><MTConnectError><Header sender="ORN" version="1.2"/><Errors><Error errorCode="OUT_OF_RANGE">ORN aralık dışı</Error></Errors></MTConnectError>';
          } else {
            const secilen = gunluk.filter((r) => r.sira >= from).slice(0, count);
            const sonraki = secilen.length === 0 ? b.sonraki : (secilen[secilen.length - 1]?.sira ?? 0) + 1;
            govde = akisMetni(sahte.tezgahlar, secilen, { ...b, sonraki }, () => 1);
          }
        } else govde = '';
      }
      cevap.writeHead(durum ?? (govde === '' ? 404 : 200), { 'Content-Type': 'text/xml', ...(ozel?.basliklar ?? {}) });
      cevap.end(govde);
    };
    if (ozel?.gecikmeMs !== undefined) setTimeout(yaz, ozel.gecikmeMs); else yaz();
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  sahte.adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  sahte.kapat = () => new Promise<void>((coz) => { sunucu.closeAllConnections(); sunucu.close(() => coz()); });
  return sahte;
}
