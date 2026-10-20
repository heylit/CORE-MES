import type { SmartesAyari } from './ayar.ts';
import { AZAMI_CEVAP_UZUNLUGU, skalerSonucuOku, soapIstegiKur, tabloSatirlariniOku, VARSAYILAN_SAAT_DILIMI, wsdlMetotlari } from './soap.ts';
import type { CevapYorumu, Parametreler, SkalerSonuc, TabloSatiri } from './soap.ts';

// SmartES ile yalnız bu dosya konuşur (kart #778). Adres ayardan gelir; hata metnine ve günlüğe girmez.
// Üretim kodunda bugün hiçbir iş ya da uç bu istemciyi kurmaz: bağlantı kararı (kart #778 karar 1) bekleniyor.

// Brief 2: tekil istek 30 sn, liste metotları 60 sn.
export const ISTEK_SURESI_MS = 30_000;
export const LISTE_SURESI_MS = 60_000;
// Brief 12: zaman aşımında 3 yeniden deneme (1 sn, 3 sn, 9 sn); başka ağ ya da sunucu hatasında 1.
export const ZAMAN_ASIMI_BEKLEMELERI_MS = [1_000, 3_000, 9_000] as const;
export const AG_HATASI_BEKLEMELERI_MS = [1_000] as const;

export type IstemciHatasi =
  // Cevap gelmedi; istek SmartES'e ulaşıp işlenmiş olabilir.
  | { tur: 'zaman-asimi'; ileti: string }
  // Bağlantı kurulamadı ya da koptu.
  | { tur: 'ag'; ileti: string }
  // HTTP hata kodu, gövdede SOAP Fault yok.
  | { tur: 'http'; durum: number; ileti: string }
  // SmartES SOAP Fault döndü (metot yok, parametre bozuk, sunucu istisnası).
  | { tur: 'fault'; ileti: string }
  // Cevap okunamadı (XML değil, beklenen öğe yok).
  | { tur: 'bozuk'; ileti: string };

export type IstemciSonucu<T> = { tur: 'basarili'; deger: T } | IstemciHatasi;

export interface CagriSecenegi {
  // Zaman aşımı ve ağ hatasında yeniden denensin mi. SmartES CreateUpdate metotları anahtarla (iş emri no, kod) günceller,
  // yinelenmesi kayıt çoğaltmaz (VARSAYIM, brief 8); yine de yazma çağıran tarafından açıkça istenir.
  yinele: boolean;
}

export interface SmartesIstemcisi {
  // Create/Update/Delete: AffectedRows + ErrorMessage.
  skaler(metot: string, parametreler: Parametreler, secenek: CagriSecenegi): Promise<IstemciSonucu<SkalerSonuc>>;
  // List metotları: DataSet satırları. Okuma olduğundan her zaman yinelenebilir.
  liste(metot: string, parametreler: Parametreler): Promise<IstemciSonucu<TabloSatiri[]>>;
  // Bağlantı kontrolü: `?WSDL` okunur, metot adları döner. Yalnız GET, yinelenmez.
  wsdl(): Promise<IstemciSonucu<string[]>>;
}

export interface IstemciSecenegi {
  // Testte değişir; sunucuda Node'un kendi fetch'i (yeni paket yok).
  fetch?: typeof fetch;
  istekSuresiMs?: number;
  listeSuresiMs?: number;
  // Testte saat beklememek için.
  bekle?: (ms: number) => Promise<void>;
  zamanAsimiBeklemeleriMs?: readonly number[];
  agHatasiBeklemeleriMs?: readonly number[];
  saatDilimi?: string;
}

const varsayilanBekle = (ms: number): Promise<void> => new Promise((coz) => setTimeout(coz, ms));

function hataTuru(hata: unknown): 'zaman-asimi' | 'ag' {
  const ad = hata instanceof Error ? hata.name : '';
  return ad === 'TimeoutError' || ad === 'AbortError' ? 'zaman-asimi' : 'ag';
}

const SABIT_ILETILER = {
  'zaman-asimi': 'SmartES süresinde cevap vermedi.',
  ag: 'SmartES servisine bağlanılamadı.',
} as const;

export function smartesIstemcisiKur(ayar: SmartesAyari, secenek: IstemciSecenegi = {}): SmartesIstemcisi {
  const cagir = secenek.fetch ?? fetch;
  const bekle = secenek.bekle ?? varsayilanBekle;
  const saatDilimi = secenek.saatDilimi ?? VARSAYILAN_SAAT_DILIMI;
  const zamanAsimiBeklemeleri = secenek.zamanAsimiBeklemeleriMs ?? ZAMAN_ASIMI_BEKLEMELERI_MS;
  const agBeklemeleri = secenek.agHatasiBeklemeleriMs ?? AG_HATASI_BEKLEMELERI_MS;

  // Tek HTTP denemesi: ham cevap metni ya da ağ hatası.
  const tekDeneme = async (metot: string, parametreler: Parametreler, sureMs: number): Promise<{ durum: number; metin: string } | IstemciHatasi> => {
    const istek = soapIstegiKur(metot, ayar.adAlani, parametreler, saatDilimi);
    try {
      const cevap = await cagir(ayar.adres, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: istek.soapAction, Accept: 'text/xml' },
        body: istek.govde,
        signal: AbortSignal.timeout(sureMs),
        redirect: 'error',
      });
      const uzunluk = Number(cevap.headers.get('content-length') ?? '0');
      if (uzunluk > AZAMI_CEVAP_UZUNLUGU) {
        await cevap.body?.cancel();
        return { tur: 'bozuk', ileti: 'Cevap çok büyük.' };
      }
      return { durum: cevap.status, metin: await cevap.text() };
    } catch (hata) {
      const tur = hataTuru(hata);
      return { tur, ileti: SABIT_ILETILER[tur] };
    }
  };

  const yorumlaVeDene = async <T>(
    metot: string,
    parametreler: Parametreler,
    sureMs: number,
    yinele: boolean,
    oku: (metin: string, metot: string) => CevapYorumu<T>,
  ): Promise<IstemciSonucu<T>> => {
    let zamanAsimiSayisi = 0;
    let agSayisi = 0;
    for (;;) {
      const ham = await tekDeneme(metot, parametreler, sureMs);
      let sonuc: IstemciSonucu<T>;
      if ('tur' in ham) {
        sonuc = ham;
      } else {
        // ASMX hatayı 500 ile SOAP Fault olarak döner; önce gövde yorumlanır, Fault yoksa HTTP hatasıdır.
        const yorum = oku(ham.metin, metot);
        if (yorum.tur === 'fault') sonuc = yorum;
        else if (ham.durum < 200 || ham.durum >= 300) sonuc = { tur: 'http', durum: ham.durum, ileti: `SmartES HTTP ${ham.durum} döndü.` };
        else sonuc = yorum;
      }
      if (!yinele) return sonuc;
      if (sonuc.tur === 'zaman-asimi' && zamanAsimiSayisi < zamanAsimiBeklemeleri.length) {
        await bekle(zamanAsimiBeklemeleri[zamanAsimiSayisi++] ?? 0);
        continue;
      }
      const sunucuHatasi = sonuc.tur === 'ag' || (sonuc.tur === 'http' && sonuc.durum >= 500);
      if (sunucuHatasi && agSayisi < agBeklemeleri.length) {
        await bekle(agBeklemeleri[agSayisi++] ?? 0);
        continue;
      }
      return sonuc;
    }
  };

  return {
    skaler: (metot, parametreler, { yinele }) =>
      yorumlaVeDene(metot, parametreler, secenek.istekSuresiMs ?? ISTEK_SURESI_MS, yinele, skalerSonucuOku),
    liste: (metot, parametreler) =>
      yorumlaVeDene(metot, parametreler, secenek.listeSuresiMs ?? LISTE_SURESI_MS, true, tabloSatirlariniOku),
    async wsdl() {
      let cevap: Response;
      try {
        cevap = await cagir(`${ayar.adres}?WSDL`, {
          method: 'GET', headers: { Accept: 'text/xml' }, signal: AbortSignal.timeout(secenek.istekSuresiMs ?? ISTEK_SURESI_MS), redirect: 'error',
        });
      } catch (hata) {
        const tur = hataTuru(hata);
        return { tur, ileti: SABIT_ILETILER[tur] };
      }
      if (Number(cevap.headers.get('content-length') ?? '0') > AZAMI_CEVAP_UZUNLUGU) {
        await cevap.body?.cancel();
        return { tur: 'bozuk', ileti: 'Cevap çok büyük.' };
      }
      const metin = await cevap.text();
      if (cevap.status < 200 || cevap.status >= 300) return { tur: 'http', durum: cevap.status, ileti: `SmartES HTTP ${cevap.status} döndü.` };
      try {
        return { tur: 'basarili', deger: wsdlMetotlari(metin) };
      } catch {
        return { tur: 'bozuk', ileti: 'Servis tanımı (WSDL) okunamadı.' };
      }
    },
  };
}
