import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// Sahte Logo köprüsü: YALNIZ test ve yerel deneme içindir (kart #207, kullanıcı kararı 3). Üretim kodu bunu ithal etmez;
// sunucu köprü adresini yalnız TMIV2_LOGO_KOPRU_ADRESI'nden alır. Yalnız 127.0.0.1'de dinler.
// Taklit edilen: GET /api/Material/exists/{kod}, POST /api/Material/AddRich, GET /api/Lookup/unitsets, GET /api/Lookup/warehouses ve
// { success, logicalRef, error, validate } cevabı. Cevap biçiminin bilinmeyen kısımları VARSAYIM'dır (LB8).
// Hizmet: POST /api/PurchaseService/AddRich ve /api/SalesService/AddRich (gövdede CODE). Hizmet "var mı" için sahte köprüdeki
// GET /sahte/hizmet-var-mi/{alinan|verilen}/{kod} yalnız test yoludur; gerçek yol kopru.ts HIZMET_VAR_MI_YOLU.
// Sipariş (not 2.3, 3b): GET /api/PurchaseOrder/find/{no} (yoksa 404), GET /api/PurchaseOrder/{no}/lines, POST /api/PurchaseOrder/AddRich
// (cevap order.lines[].logicalRef), POST /api/PurchaseOrder/{no}/cancel; GET /api/Arp/find/{kod}. Satır listesinin biçimi VARSAYIM.
// Düzenleme ve kapatma: POST /api/PurchaseOrder/UpdateRich (kayıtsız satır eklenir, gövdede olmayan satır kapanır ama listede kalır),
// POST /api/PurchaseOrder/{no}/close {lineRefs}. Talep: POST /api/DemandFiche/AddRich (cevap fiche.lines); karşılama: POST /api/DemandFiche/peg,
// GET ve DELETE /api/DemandFiche/peg/byOrder/{ref}. Kart güncelleme: POST /api/Material/UpdateRich, /api/{Purchase|Sales}Service/UpdateRich.
// Satış (not 2.6, 2.7): GET /api/SalesOffer/customer/{cari} (yoksa 404), POST /api/SalesOffer/AddRich (cevapta satır yok; satırlar
// GET /api/SalesOffer/{ref} ile okunur, biçimi VARSAYIM), POST /api/SalesOffer/{ref}/toOrder (cevap order.lines).
// Okuma: GET /api/PurchaseOrder/receipts?since=, GET /api/Arp/list, GET /api/PurchaseOrder/{no}/invoices (yoksa 404). Malzeme fişi: POST
// /api/MaterialSlip/AddConsumption ve AddProductionEntry, DELETE /api/MaterialSlip/{Consumption|ProductionEntry}/{no}. Hepsinin cevap biçimi VARSAYIM.

export type SahteSenaryo =
  // Kart açılır, numarası döner.
  | 'basari'
  // success=false ve validate dolu; kart açılmaz.
  | 'dogrulama'
  // Bütün istekler 401.
  | 'yetkisiz'
  // Açma isteği cevapsız kalır ve kart açılmaz (istemci zaman aşımına düşer).
  | 'zaman-asimi'
  // Açma isteği gecikmeMs bekler, sonra kartı açar ve cevap verir.
  | 'yavas'
  // Kart açılır, cevap yolda kaybolur (bağlantı koparılır).
  | 'cevap-kayboldu'
  // Açma isteği cevapsız kalır ama kart gecikmeMs sonra yine açılır (köprünün kuyruğunda bekleyen istek).
  | 'gec-islenen';

export interface SahteIstek {
  yontem: string;
  yol: string;
  anahtar: string | null;
  govde: unknown;
}

export interface SahteKopru {
  adres: string;
  anahtar: string;
  senaryo: SahteSenaryo;
  gecikmeMs: number;
  // Logo'daki kartlar: kod -> logicalRef. Teste önceden kart konabilir ("kod zaten var").
  kartlar: Map<string, number>;
  // Kod başına açılan kart sayısı (çift açma ölçüsü).
  acilan: Map<string, number>;
  // Logo'daki hizmet kartları (ayrı tablo): kod -> logicalRef; kod başına açılan sayı.
  hizmetKartlari: Map<string, number>;
  hizmetAcilan: Map<string, number>;
  istekler: SahteIstek[];
  birimSetleri: { code: string; name: string }[];
  // Logo'daki siparişler: numara -> başlık ve satır kayıt numaraları; numara başına açılan sayı; iptal edilenler; Logo'daki cari kodları.
  siparisler: Map<string, { ref: number; satirlar: number[] }>;
  siparisAcilan: Map<string, number>;
  iptaller: Map<string, number>;
  cariler: Set<string>;
  // Doluyken AddRich ve satır okuması bu kadar satır kaydı döner (eşleme bozukluğu senaryosu).
  satirSayisiBoz: number | null;
  // Düzenleme sayısı ve kapanan satırlar (numara başına), talep fişleri, karşılamalar, güncellenen kart adları (kod -> ad).
  guncellemeler: Map<string, number>;
  kapananSatirlar: Map<string, number[]>;
  talepler: Map<string, { ref: number; satirlar: number[] }>;
  talepAcilan: Map<string, number>;
  karsilamalar: { ref: number; siparisRef: number; orderLineRef: number; demandLineRef: number; amount: number }[];
  adGuncellemeleri: Map<string, string>;
  // CRM satış müşterisi olan cari kodları; satış teklifleri (numara -> kayıt), açılan sayısı; tekliften açılan siparişler.
  satisMusterileri: Set<string>;
  satisTeklifleri: Map<string, { ref: number; satirlar: number[] }>;
  satisTeklifAcilan: Map<string, number>;
  satisSiparisleri: Map<string, { ref: number; teklifRef: number; satirlar: number[]; govde: unknown }>;
  // Okuma uçlarının verdiği listeler: mal kabul satırları ("zarf": { success, data }, aksi halde düz dizi), cari ve ambar listeleri,
  // sipariş no -> faturalar (olmayan sipariş 404). Malzeme fişleri: uç adı, fiş no, kayıt, gövde.
  malKabulSatirlari: Record<string, unknown>[];
  malKabulBicimi: 'dizi' | 'zarf' | 'bozuk';
  // Mal kabul isteklerinin since değerleri (istek sırasıyla).
  malKabulSince: number[];
  cariListesi: unknown;
  ambarlar: unknown;
  faturalar: Map<string, unknown[]>;
  malzemeFisleri: { uc: string; no: string; ref: number; govde: unknown }[];
  kapat(): Promise<void>;
}

function govdeOku(istek: IncomingMessage): Promise<unknown> {
  return new Promise((coz) => {
    const parcalar: Buffer[] = [];
    istek.on('data', (p: Buffer) => parcalar.push(p));
    istek.on('end', () => {
      const metin = Buffer.concat(parcalar).toString('utf8');
      try { coz(metin === '' ? null : JSON.parse(metin)); } catch { coz(metin); }
    });
  });
}

function json(cevap: ServerResponse, durum: number, govde: unknown): void {
  cevap.writeHead(durum, { 'Content-Type': 'application/json' });
  cevap.end(JSON.stringify(govde));
}

// Süreç boyunca artar: art arda açılan sahte köprüler aynı Logo kaydı numarasını iki karta vermez (gerçek Logo'daki gibi).
let sonRef = 1000;

export async function sahteKopruAc(secenek: { anahtar?: string; port?: number } = {}): Promise<SahteKopru> {
  const bekleyenler = new Set<ServerResponse>();
  const saatler = new Set<NodeJS.Timeout>();
  const sonra = (ms: number, is: () => void): void => {
    const saat = setTimeout(() => { saatler.delete(saat); is(); }, ms);
    saatler.add(saat);
  };

  const kopru: SahteKopru = {
    adres: '',
    anahtar: secenek.anahtar ?? 'sahte-anahtar',
    senaryo: 'basari',
    gecikmeMs: 0,
    kartlar: new Map(),
    acilan: new Map(),
    hizmetKartlari: new Map(),
    hizmetAcilan: new Map(),
    siparisler: new Map(),
    siparisAcilan: new Map(),
    iptaller: new Map(),
    cariler: new Set(),
    satirSayisiBoz: null,
    guncellemeler: new Map(),
    kapananSatirlar: new Map(),
    talepler: new Map(),
    talepAcilan: new Map(),
    karsilamalar: [],
    adGuncellemeleri: new Map(),
    satisMusterileri: new Set(),
    satisTeklifleri: new Map(),
    satisTeklifAcilan: new Map(),
    satisSiparisleri: new Map(),
    malKabulSatirlari: [],
    malKabulBicimi: 'dizi',
    malKabulSince: [],
    cariListesi: [],
    ambarlar: [{ nr: 0, name: 'Merkez' }],
    faturalar: new Map(),
    malzemeFisleri: [],
    istekler: [],
    birimSetleri: [
      { code: '05', name: 'ADET' }, { code: '06', name: 'KG' }, { code: '07', name: 'M' },
      { code: '08', name: 'SET' }, { code: '10', name: 'LT' }, { code: '12', name: 'M2' },
    ],
    kapat: async () => undefined,
  };
  const ac = (kartlar: Map<string, number>, acilan: Map<string, number>, kod: string): number => {
    const ref = (sonRef += 1);
    kartlar.set(kod, ref);
    acilan.set(kod, (acilan.get(kod) ?? 0) + 1);
    return ref;
  };

  const siparisAc = (no: string, satirSayisi: number): { ref: number; satirlar: number[] } => {
    const kayit = { ref: (sonRef += 1), satirlar: Array.from({ length: satirSayisi }, () => (sonRef += 1)) };
    kopru.siparisler.set(no, kayit);
    kopru.siparisAcilan.set(no, (kopru.siparisAcilan.get(no) ?? 0) + 1);
    return kayit;
  };
  const satirCevabi = (satirlar: number[]) => satirlar.slice(0, kopru.satirSayisiBoz ?? satirlar.length).map((ref, i) => ({ logicalRef: ref, lineNo: i + 1 }));

  const sunucu = createServer((istek, cevap) => {
    void (async () => {
      const yol = decodeURI((istek.url ?? '').split('?')[0] ?? '');
      const anahtar = typeof istek.headers['x-api-key'] === 'string' ? istek.headers['x-api-key'] : null;
      const govde = await govdeOku(istek);
      kopru.istekler.push({ yontem: istek.method ?? '', yol, anahtar, govde });
      if (kopru.senaryo === 'yetkisiz' || anahtar !== kopru.anahtar) {
        json(cevap, 401, { success: false, logicalRef: 0, error: 'Unauthorized', validate: null });
        return;
      }
      const varMi = /^\/api\/Material\/exists\/(.+)$/.exec(yol);
      if (istek.method === 'GET' && varMi) {
        const ref = kopru.kartlar.get(varMi[1] ?? '') ?? 0;
        json(cevap, 200, { success: true, logicalRef: ref, error: null, validate: null });
        return;
      }
      const hizmetVarMi = /^\/sahte\/hizmet-var-mi\/(alinan|verilen)\/(.+)$/.exec(yol);
      if (istek.method === 'GET' && hizmetVarMi) {
        const ref = kopru.hizmetKartlari.get(hizmetVarMi[2] ?? '') ?? 0;
        json(cevap, 200, { success: true, logicalRef: ref, error: null, validate: null });
        return;
      }
      if (istek.method === 'GET' && yol === '/api/Lookup/unitsets') {
        json(cevap, 200, kopru.birimSetleri);
        return;
      }
      // Bağlantı kontrolünün ilk adımı; ambar listesinin biçimi VARSAYIM (kontrol yalnız 2xx'e bakar).
      if (istek.method === 'GET' && yol === '/api/Lookup/warehouses') {
        json(cevap, 200, kopru.ambarlar);
        return;
      }
      // Okuma uçları (biçimleri VARSAYIM): mal kabul since'ten büyük satır kayıtlarını verir; cari listesi; sipariş faturaları (yoksa 404).
      if (istek.method === 'GET' && yol === '/api/PurchaseOrder/receipts') {
        const since = Number(new URL(istek.url ?? '', 'http://sahte').searchParams.get('since') ?? 0);
        kopru.malKabulSince.push(since);
        const liste = kopru.malKabulSatirlari.filter((x) => typeof x['logicalRef'] !== 'number' || x['logicalRef'] > since);
        json(cevap, 200, kopru.malKabulBicimi === 'bozuk' ? { success: true } : kopru.malKabulBicimi === 'zarf' ? { success: true, data: liste } : liste);
        return;
      }
      if (istek.method === 'GET' && yol === '/api/Arp/list') {
        json(cevap, 200, kopru.cariListesi);
        return;
      }
      const faturalar = /^\/api\/PurchaseOrder\/(.+)\/invoices$/.exec(yol);
      if (istek.method === 'GET' && faturalar) {
        const liste = kopru.faturalar.get(faturalar[1] ?? '');
        if (liste) json(cevap, 200, liste);
        else json(cevap, 404, { success: false, logicalRef: 0, error: 'Order not found', validate: null });
        return;
      }
      // Malzeme fişi: sarf (12) ve üretimden giriş (13); fişi numarayla arama ucu yok. Aynı numara tekrar gelirse yine açar (kalkanın Logo'ya güvenmediği görünsün).
      const fis = /^\/api\/MaterialSlip\/(AddConsumption|AddProductionEntry)$/.exec(yol);
      if (istek.method === 'POST' && fis) {
        if (kopru.senaryo === 'dogrulama') { json(cevap, 200, { success: false, logicalRef: 0, error: 'Validation failed', validate: ['ITEM_CODE gecersiz'] }); return; }
        if (kopru.senaryo === 'zaman-asimi') { bekleyenler.add(cevap); return; }
        const fisNo = typeof (govde as Record<string, unknown> | null)?.['NUMBER'] === 'string' ? String((govde as Record<string, unknown>)['NUMBER']) : '';
        const ref = (sonRef += 1);
        kopru.malzemeFisleri.push({ uc: fis[1] ?? '', no: fisNo, ref, govde });
        if (kopru.senaryo === 'cevap-kayboldu') { istek.socket.destroy(); return; }
        json(cevap, 200, { success: true, logicalRef: ref, error: null, validate: null });
        return;
      }
      // 233: fişi numarasıyla silme; yoksa 404. Doğrulama senaryosunda Logo silmeyi reddeder.
      const fisSil = /^\/api\/MaterialSlip\/(Consumption|ProductionEntry)\/(.+)$/.exec(yol);
      if (istek.method === 'DELETE' && fisSil) {
        if (kopru.senaryo === 'dogrulama') { json(cevap, 200, { success: false, logicalRef: 0, error: 'Delete false', validate: null }); return; }
        const uc = fisSil[1] === 'Consumption' ? 'AddConsumption' : 'AddProductionEntry';
        const no = decodeURIComponent(fisSil[2] ?? '');
        const i = kopru.malzemeFisleri.findIndex((f) => f.uc === uc && f.no === no);
        const silinen = i < 0 ? undefined : kopru.malzemeFisleri.splice(i, 1)[0];
        if (silinen) json(cevap, 200, { success: true, logicalRef: silinen.ref, error: null, validate: null });
        else json(cevap, 404, { success: false, logicalRef: 0, error: 'Slip not found', validate: null });
        return;
      }
      const siparisBul = /^\/api\/PurchaseOrder\/find\/(.+)$/.exec(yol);
      if (istek.method === 'GET' && siparisBul) {
        const kayit = kopru.siparisler.get(siparisBul[1] ?? '');
        if (kayit) json(cevap, 200, { success: true, logicalRef: kayit.ref, error: null, validate: null });
        else json(cevap, 404, { success: false, logicalRef: 0, error: 'Order not found', validate: null });
        return;
      }
      const siparisSatirlari = /^\/api\/PurchaseOrder\/(.+)\/lines$/.exec(yol);
      if (istek.method === 'GET' && siparisSatirlari) {
        const kayit = kopru.siparisler.get(siparisSatirlari[1] ?? '');
        if (kayit) json(cevap, 200, satirCevabi(kayit.satirlar));
        else json(cevap, 404, { success: false, logicalRef: 0, error: 'Order not found', validate: null });
        return;
      }
      const iptal = /^\/api\/PurchaseOrder\/(.+)\/cancel$/.exec(yol);
      if (istek.method === 'POST' && iptal) {
        const no = iptal[1] ?? '';
        const kayit = kopru.siparisler.get(no);
        if (!kayit) json(cevap, 200, { success: false, logicalRef: 0, error: 'Order not found', validate: null });
        else if (kopru.senaryo === 'dogrulama') json(cevap, 200, { success: false, logicalRef: 0, error: 'Irsaliye bagli', validate: null });
        else {
          kopru.iptaller.set(no, (kopru.iptaller.get(no) ?? 0) + 1);
          json(cevap, 200, { success: true, logicalRef: kayit.ref, error: null, validate: null });
        }
        return;
      }
      const cari = /^\/api\/Arp\/find\/(.+)$/.exec(yol);
      if (istek.method === 'GET' && cari) {
        if (kopru.cariler.has(cari[1] ?? '')) json(cevap, 200, { success: true, logicalRef: 77, error: null, validate: null });
        else json(cevap, 404, { success: false, logicalRef: 0, error: 'Arp not found', validate: null });
        return;
      }
      const nesne = govde !== null && typeof govde === 'object' ? (govde as Record<string, unknown>) : {};
      const ret = (): void => json(cevap, 200, { success: false, logicalRef: 0, error: 'Validation failed', validate: ['Kayit kilitli'] });
      const basari = (ref: number, ek: Record<string, unknown> = {}): void => json(cevap, 200, { success: true, logicalRef: ref, error: null, validate: null, ...ek });
      if (istek.method === 'POST' && yol === '/api/PurchaseOrder/UpdateRich') {
        const kayit = [...kopru.siparisler.entries()].find(([, k]) => k.ref === nesne['logicalRef']);
        if (!kayit) { json(cevap, 200, { success: false, logicalRef: 0, error: 'Order not found', validate: null }); return; }
        if (kopru.senaryo === 'dogrulama') { ret(); return; }
        const [no, k] = kayit;
        const satirlar = Array.isArray(nesne['lines']) ? (nesne['lines'] as Record<string, unknown>[]) : [];
        for (const x of satirlar) if (typeof x['logicalRef'] !== 'number') k.satirlar.push((sonRef += 1));
        kopru.guncellemeler.set(no, (kopru.guncellemeler.get(no) ?? 0) + 1);
        if (kopru.senaryo === 'cevap-kayboldu') { istek.socket.destroy(); return; }
        basari(k.ref);
        return;
      }
      const kapat = /^\/api\/PurchaseOrder\/(.+)\/close$/.exec(yol);
      if (istek.method === 'POST' && kapat) {
        const no = kapat[1] ?? '';
        const kayit = kopru.siparisler.get(no);
        if (!kayit) { json(cevap, 200, { success: false, logicalRef: 0, error: 'Order not found', validate: null }); return; }
        if (kopru.senaryo === 'dogrulama') { ret(); return; }
        const refler = Array.isArray(nesne['lineRefs']) ? (nesne['lineRefs'] as number[]) : [];
        kopru.kapananSatirlar.set(no, [...(kopru.kapananSatirlar.get(no) ?? []), ...refler]);
        basari(kayit.ref);
        return;
      }
      if (istek.method === 'POST' && yol === '/api/DemandFiche/AddRich') {
        if (kopru.senaryo === 'dogrulama') { ret(); return; }
        const no = typeof nesne['number'] === 'string' ? nesne['number'] : '';
        const sayi = Array.isArray(nesne['lines']) ? nesne['lines'].length : 0;
        const k = { ref: (sonRef += 1), satirlar: Array.from({ length: sayi }, () => (sonRef += 1)) };
        kopru.talepler.set(no, k);
        kopru.talepAcilan.set(no, (kopru.talepAcilan.get(no) ?? 0) + 1);
        if (kopru.senaryo === 'cevap-kayboldu') { istek.socket.destroy(); return; }
        basari(k.ref, { fiche: { logicalRef: k.ref, number: no, lines: satirCevabi(k.satirlar) } });
        return;
      }
      if (istek.method === 'POST' && yol === '/api/DemandFiche/peg') {
        const satir = Number(nesne['orderLineRef']);
        const siparis = [...kopru.siparisler.values()].find((k) => k.satirlar.includes(satir));
        if (!siparis || kopru.senaryo === 'dogrulama') { ret(); return; }
        const ref = (sonRef += 1);
        kopru.karsilamalar.push({ ref, siparisRef: siparis.ref, orderLineRef: satir, demandLineRef: Number(nesne['demandLineRef']), amount: Number(nesne['amount']) });
        if (kopru.senaryo === 'cevap-kayboldu') { istek.socket.destroy(); return; }
        basari(ref);
        return;
      }
      const karsilama = /^\/api\/DemandFiche\/peg\/byOrder\/(\d+)$/.exec(yol);
      if (karsilama && (istek.method === 'GET' || istek.method === 'DELETE')) {
        const ref = Number(karsilama[1]);
        const olan = kopru.karsilamalar.filter((k) => k.siparisRef === ref);
        if (istek.method === 'GET') {
          json(cevap, 200, olan.map((k) => ({ logicalRef: k.ref, orderLineRef: k.orderLineRef, demandLineRef: k.demandLineRef, amount: k.amount })));
          return;
        }
        if (olan.length === 0) { json(cevap, 404, { success: false, logicalRef: 0, error: 'No pegging', validate: null }); return; }
        kopru.karsilamalar = kopru.karsilamalar.filter((k) => k.siparisRef !== ref);
        basari(ref);
        return;
      }
      const satisMusterisi = /^\/api\/SalesOffer\/customer\/(.+)$/.exec(yol);
      if (istek.method === 'GET' && satisMusterisi) {
        if (kopru.satisMusterileri.has(satisMusterisi[1] ?? '')) basari(88);
        else json(cevap, 404, { success: false, logicalRef: 0, error: 'Customer not found', validate: null });
        return;
      }
      if (istek.method === 'POST' && yol === '/api/SalesOffer/AddRich') {
        if (kopru.senaryo === 'dogrulama') { ret(); return; }
        const no = typeof nesne['number'] === 'string' ? nesne['number'] : '';
        const sayi = Array.isArray(nesne['lines']) ? nesne['lines'].length : 0;
        const k = { ref: (sonRef += 1), satirlar: Array.from({ length: sayi }, () => (sonRef += 1)) };
        kopru.satisTeklifleri.set(no, k);
        kopru.satisTeklifAcilan.set(no, (kopru.satisTeklifAcilan.get(no) ?? 0) + 1);
        if (kopru.senaryo === 'cevap-kayboldu') { istek.socket.destroy(); return; }
        basari(k.ref);
        return;
      }
      const satisTeklifi = /^\/api\/SalesOffer\/(\d+)$/.exec(yol);
      if (istek.method === 'GET' && satisTeklifi) {
        const k = [...kopru.satisTeklifleri.values()].find((x) => x.ref === Number(satisTeklifi[1]));
        if (k) json(cevap, 200, { success: true, logicalRef: k.ref, offer: { logicalRef: k.ref, lines: satirCevabi(k.satirlar) } });
        else json(cevap, 404, { success: false, logicalRef: 0, error: 'Offer not found', validate: null });
        return;
      }
      const tekliftenSiparis = /^\/api\/SalesOffer\/(\d+)\/toOrder$/.exec(yol);
      if (istek.method === 'POST' && tekliftenSiparis) {
        const teklifRef = Number(tekliftenSiparis[1]);
        const teklif = [...kopru.satisTeklifleri.values()].find((x) => x.ref === teklifRef);
        if (!teklif) { json(cevap, 200, { success: false, logicalRef: 0, error: 'Offer not found', validate: null }); return; }
        if (kopru.senaryo === 'dogrulama') { ret(); return; }
        const no = typeof nesne['number'] === 'string' ? nesne['number'] : '';
        const sayi = Array.isArray(nesne['lines']) ? nesne['lines'].length : 0;
        const k = { ref: (sonRef += 1), teklifRef, satirlar: Array.from({ length: sayi }, () => (sonRef += 1)), govde };
        kopru.satisSiparisleri.set(no, k);
        if (kopru.senaryo === 'cevap-kayboldu') { istek.socket.destroy(); return; }
        basari(k.ref, { order: { logicalRef: k.ref, number: no, lines: satirCevabi(k.satirlar) } });
        return;
      }
      const kartGuncelle = /^\/api\/(Material|PurchaseService|SalesService)\/UpdateRich$/.exec(yol);
      if (istek.method === 'POST' && kartGuncelle) {
        const malzeme = kartGuncelle[1] === 'Material';
        const kod = String(nesne[malzeme ? 'code' : 'CODE'] ?? '');
        const ref = (malzeme ? kopru.kartlar : kopru.hizmetKartlari).get(kod);
        if (ref === undefined) { json(cevap, 200, { success: false, logicalRef: 0, error: 'Card not found', validate: null }); return; }
        if (kopru.senaryo === 'dogrulama') { ret(); return; }
        kopru.adGuncellemeleri.set(kod, String(nesne[malzeme ? 'name' : 'DESCRIPTION'] ?? ''));
        basari(ref);
        return;
      }
      const hizmet = yol === '/api/PurchaseService/AddRich' || yol === '/api/SalesService/AddRich';
      const siparis = yol === '/api/PurchaseOrder/AddRich';
      if (istek.method !== 'POST' || (yol !== '/api/Material/AddRich' && !hizmet && !siparis)) {
        json(cevap, 404, { success: false, logicalRef: 0, error: 'Not found', validate: null });
        return;
      }
      const alan = hizmet ? 'CODE' : siparis ? 'number' : 'code';
      const deger = nesne[alan];
      const kod = typeof deger === 'string' ? deger : '';
      const satirSayisi = Array.isArray(nesne['lines']) ? nesne['lines'].length : 0;
      const kartAc = (k: string): number => (hizmet ? ac(kopru.hizmetKartlari, kopru.hizmetAcilan, k) : ac(kopru.kartlar, kopru.acilan, k));
      // Açar ve başarı cevabını kurar: siparişte order.lines da döner (not 3b).
      const acCevap = (): Record<string, unknown> => {
        if (!siparis) return { success: true, logicalRef: kartAc(kod), error: null, validate: null };
        const k = siparisAc(kod, satirSayisi);
        return { success: true, logicalRef: k.ref, error: null, validate: null, order: { logicalRef: k.ref, number: kod, lines: satirCevabi(k.satirlar) } };
      };
      const sessizAc = (): void => { if (siparis) siparisAc(kod, satirSayisi); else kartAc(kod); };
      switch (kopru.senaryo) {
        case 'dogrulama':
          json(cevap, 200, { success: false, logicalRef: 0, error: 'Validation failed', validate: ['NAME alani zorunlu', 'UNITSETCODE gecersiz'] });
          return;
        case 'zaman-asimi':
          bekleyenler.add(cevap);
          return;
        case 'gec-islenen':
          bekleyenler.add(cevap);
          sonra(kopru.gecikmeMs, sessizAc);
          return;
        case 'cevap-kayboldu':
          sessizAc();
          istek.socket.destroy();
          return;
        case 'yavas':
          sonra(kopru.gecikmeMs, () => { json(cevap, 200, acCevap()); });
          return;
        default: {
          // Logo davranışı bilinmiyor (LB8): sahte köprü aynı kodu ikinci kez açar; kalkanın Logo'ya güvenmediği böyle görünür.
          json(cevap, 200, acCevap());
        }
      }
    })();
  });
  await new Promise<void>((coz) => sunucu.listen(secenek.port ?? 0, '127.0.0.1', coz));
  kopru.adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  kopru.kapat = async () => {
    for (const saat of saatler) clearTimeout(saat);
    for (const c of bekleyenler) c.destroy();
    sunucu.closeAllConnections();
    await new Promise<void>((coz) => sunucu.close(() => coz()));
  };
  return kopru;
}
