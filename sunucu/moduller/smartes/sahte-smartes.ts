import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cocuk, SOAP_ZARF_AD_ALANI, xmlAyristir, xmlKacir } from './soap.ts';
import type { TabloSatiri } from './soap.ts';

// Sahte SmartES (SOAP/ASMX): YALNIZ test içindir (kart #778). Üretim kodu bunu ithal etmez; sunucu adresi yalnız
// TMIV2_SMARTES_ADRESI'nden alır. Yalnız 127.0.0.1'de dinler. Cevap biçimi brief 3.3'teki iki türü taklit eder
// (skaler AffectedRows/ErrorMessage, DataSet diffgram) ve GET ?WSDL; gerçek servisin alan adları ve ayrıntıları VARSAYIM'dır.

export type SahteCevap =
  | { tur: 'skaler'; etkilenen: number; hata?: string }
  | { tur: 'tablo'; satirlar: TabloSatiri[] }
  | { tur: 'fault'; ileti: string }
  | { tur: 'http'; durum: number; govde: string }
  // Cevap verilmez; istemci zaman aşımına düşer.
  | { tur: 'cevapsiz' }
  // Bağlantı cevap yazılmadan koparılır.
  | { tur: 'kopar' };

export interface SahteCagri {
  metot: string;
  soapAction: string | null;
  icerikTuru: string | null;
  parametreler: Record<string, string>;
}

export type SahteIsleyici = (parametreler: Record<string, string>, cagri: SahteCagri) => SahteCevap;

export interface SahteSmartes {
  // Tam servis adresi (127.0.0.1, rastgele port, .asmx yolu).
  adres: string;
  cagrilar: SahteCagri[];
  // Metot başına cevap; tanımsız metotta skaler 1 döner.
  isleyiciler: Map<string, SahteIsleyici>;
  // GET ?WSDL cevabındaki metot adları; null ise WSDL isteği 404 alır.
  wsdlMetotlari: string[] | null;
  // GET istekleri (WSDL); SOAP çağrıları `cagrilar`dadır.
  getIstekleri: number;
  // SOAP çağrısının cevabından önce beklenir: istemci o sırada cevabı bekliyordur (testte çağrı anındaki veritabanı durumu okunur).
  cagriOncesi: ((cagri: SahteCagri) => Promise<void>) | null;
  kapat(): Promise<void>;
}

function govdeOku(istek: IncomingMessage): Promise<string> {
  return new Promise((coz) => {
    const parcalar: Buffer[] = [];
    istek.on('data', (p: Buffer) => parcalar.push(p));
    istek.on('end', () => coz(Buffer.concat(parcalar).toString('utf8')));
  });
}

const zarf = (govde: string): string =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="${SOAP_ZARF_AD_ALANI}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
  `xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body>${govde}</soap:Body></soap:Envelope>`;

export function skalerCevapMetni(metot: string, etkilenen: number, hata = ''): string {
  return zarf(`<${metot}Response xmlns="http://tempuri.org/"><${metot}Result><AffectedRows>${etkilenen}</AffectedRows>` +
    `<ErrorMessage>${xmlKacir(hata)}</ErrorMessage></${metot}Result></${metot}Response>`);
}

export function tabloCevapMetni(metot: string, satirlar: readonly TabloSatiri[]): string {
  const govde = satirlar.map((s, i) =>
    `<Table diffgr:id="Table${i + 1}" msdata:rowOrder="${i}">${Object.entries(s).map(([a, d]) => `<${a}>${xmlKacir(d)}</${a}>`).join('')}</Table>`).join('');
  return zarf(`<${metot}Response xmlns="http://tempuri.org/"><${metot}Result>` +
    '<xs:schema id="NewDataSet" xmlns="" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:msdata="urn:schemas-microsoft-com:xml-msdata">' +
    '<xs:element name="NewDataSet" msdata:IsDataSet="true"/></xs:schema>' +
    '<diffgr:diffgram xmlns:msdata="urn:schemas-microsoft-com:xml-msdata" xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1">' +
    `<NewDataSet xmlns="">${govde}</NewDataSet></diffgr:diffgram></${metot}Result></${metot}Response>`);
}

// En küçük WSDL: yalnız portType/operation adları (kontrol bunları okur). Gerçek servisin WSDL'i çok daha geniştir.
export function wsdlMetni(metotlar: readonly string[]): string {
  return '<?xml version="1.0" encoding="utf-8"?><wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" targetNamespace="http://tempuri.org/">' +
    `<wsdl:portType name="SmartFactoryWebServiceSoap">${metotlar.map((m) => `<wsdl:operation name="${xmlKacir(m)}"/>`).join('')}</wsdl:portType>` +
    '</wsdl:definitions>';
}

export function faultMetni(ileti: string): string {
  return zarf(`<soap:Fault><faultcode>soap:Server</faultcode><faultstring>${xmlKacir(ileti)}</faultstring><detail/></soap:Fault>`);
}

export async function sahteSmartesAc(): Promise<SahteSmartes> {
  const bekleyenler = new Set<ServerResponse>();
  const sahte: SahteSmartes = {
    adres: '', cagrilar: [], isleyiciler: new Map(), kapat: async () => {}, getIstekleri: 0, cagriOncesi: null,
    wsdlMetotlari: [
      'ActiveMachinesList', 'AlarmsList', 'DownTimeStatusListWithoutWorkOrder', 'OperationCreateUpdate', 'SetErpOkRed', 'WorkOrdersCreateUpdate',
      'WorkOrdersStatusList',
      // İsteğe bağlı akışların metotları (kalite/ambar okuması, tanım gönderimi).
      'QualityControlStatusList', 'StockCreateUpdate', 'StocksList', 'WarehouseStatusList', 'WorkStationCreateUpdate', 'WorkStationList',
      'WsWorkordersRejectStatusList',
    ],
  };

  const sunucu = createServer((istek, cevap) => {
    void (async () => {
      if (istek.method === 'GET') {
        sahte.getIstekleri++;
        const wsdlMi = /\?wsdl$/i.test(istek.url ?? '');
        cevap.writeHead(wsdlMi && sahte.wsdlMetotlari !== null ? 200 : 404, { 'Content-Type': 'text/xml; charset=utf-8' });
        cevap.end(wsdlMi && sahte.wsdlMetotlari !== null ? wsdlMetni(sahte.wsdlMetotlari) : '');
        return;
      }
      const metin = await govdeOku(istek);
      let metot = '';
      const parametreler: Record<string, string> = {};
      try {
        const kok = xmlAyristir(metin);
        const oge = cocuk(kok, 'Body')?.cocuklar[0];
        if (oge) {
          metot = oge.ad;
          for (const c of oge.cocuklar) parametreler[c.ad] = c.metin;
        }
      } catch {
        cevap.writeHead(400, { 'Content-Type': 'text/xml; charset=utf-8' });
        cevap.end(faultMetni('Bozuk istek.'));
        return;
      }
      const cagri: SahteCagri = {
        metot, soapAction: istek.headers['soapaction']?.toString() ?? null, icerikTuru: istek.headers['content-type'] ?? null, parametreler,
      };
      sahte.cagrilar.push(cagri);
      if (sahte.cagriOncesi !== null) await sahte.cagriOncesi(cagri);
      const sonuc = sahte.isleyiciler.get(metot)?.(parametreler, cagri) ?? { tur: 'skaler', etkilenen: 1 };
      const yaz = (durum: number, govde: string): void => {
        cevap.writeHead(durum, { 'Content-Type': 'text/xml; charset=utf-8' });
        cevap.end(govde);
      };
      switch (sonuc.tur) {
        case 'skaler': return yaz(200, skalerCevapMetni(metot, sonuc.etkilenen, sonuc.hata));
        case 'tablo': return yaz(200, tabloCevapMetni(metot, sonuc.satirlar));
        case 'fault': return yaz(500, faultMetni(sonuc.ileti));
        case 'http': return yaz(sonuc.durum, sonuc.govde);
        case 'cevapsiz': bekleyenler.add(cevap); return;
        case 'kopar': istek.socket.destroy(); return;
      }
    })();
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  const { port } = sunucu.address() as AddressInfo;
  sahte.adres = `http://127.0.0.1:${port}/SmartFactoryWebService.asmx`;
  sahte.kapat = async () => {
    for (const c of bekleyenler) c.destroy();
    sunucu.closeAllConnections();
    await new Promise<void>((coz) => sunucu.close(() => coz()));
  };
  return sahte;
}
