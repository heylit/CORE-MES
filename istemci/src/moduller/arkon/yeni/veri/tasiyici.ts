import type { ArkonBenCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { api } from '../../../../ortak/veri/api.ts';
import {
  BASKA_SUNUCU, ONIZLEME_SALT_OKUR, SANAL_SUNUCU, anlikIletimKur, benOnbellekli, cevapla, kapaliIletim, makineDoluRetleri, reddiBildirimi,
  tekrarSuzgeci, tmiReddiBildirimleri, tmiUyarilari, type AnlikIletim, type Istemci, type MakineDoluRedi,
} from '../../baglanti.ts';

// Yeni ekranın istek taşıyıcısı: Arkon veri katmanının (store.ts) isteklerini pencerenin fetch'ine dokunmadan köprünün çevirisine
// (baglanti.ts cevapla) verir. Çerçevedeki köprünün (bagla) fetch kuralının aynısıdır; farkı yalnız sanal sunucudan başka adrese hiç
// gidilmemesidir: yeni ekranda Arkon'un sunucu adresi ayarı yoktur.

export interface TasiyiciSecenegi {
  // Sanal sunucunun kökü (pencerenin kökeni).
  koken: string;
  istemci?: Istemci;
  ben?: { cevap: ArkonBenCevabi; zaman: number };
  cikis?: () => void;
  reddedildi?: (ileti: string) => void;
  uyari?: (ileti: string) => void;
  makineDolu?: (red: MakineDoluRedi) => void;
  // Önizleme ("Operatör gözüyle") açıkken TMI yalnız okunur.
  saltOkunur?: () => boolean;
}

export interface Tasiyici {
  fetch: (adres: string, ayar?: RequestInit) => Promise<Response>;
  EventSource: new (adres: string) => EventSource;
  // Açık olay akışlarını kapatır: okuma döngüsü pencerede döner, ekran kapanınca kendiliğinden durmaz.
  kapat: () => void;
}

const jsonCevap = (govde: unknown, durum: number): Response =>
  new Response(JSON.stringify(govde ?? null), { status: durum, headers: { 'Content-Type': 'application/json' } });

export function tasiyiciYap(s: TasiyiciSecenegi): Tasiyici {
  const istemci = benOnbellekli(s.istemci ?? api, s.ben);
  const yeniRet = tekrarSuzgeci();
  const reddet = (ileti: string): void => { if (yeniRet(ileti)) s.reddedildi?.(ileti); };
  const sunucu = `${s.koken}${SANAL_SUNUCU}`;
  const acik = new Set<AnlikIletim>();

  const fetch = async (adres: string, ayar?: RequestInit): Promise<Response> => {
    if (!adres.startsWith(`${sunucu}/api/`)) {
      s.reddedildi?.(BASKA_SUNUCU);
      return jsonCevap({ error: BASKA_SUNUCU }, 403);
    }
    const url = new URL(adres);
    const yontem = (ayar?.method ?? 'GET').toUpperCase();
    const yol = url.pathname.slice(`${SANAL_SUNUCU}/api`.length);
    if (yontem !== 'GET' && s.saltOkunur?.()) return jsonCevap({ error: ONIZLEME_SALT_OKUR }, 403);
    const cevap = await cevapla(istemci, { yontem, yol, sorgu: url.searchParams, govde: ayar?.body ?? undefined }, s.cikis);
    const ret = reddiBildirimi(yontem, yol, cevap);
    if (ret !== null) reddet(ret);
    for (const ileti of tmiReddiBildirimleri(cevap, s.makineDolu !== undefined)) reddet(ileti);
    if (s.makineDolu !== undefined) for (const red of makineDoluRetleri(cevap)) s.makineDolu(red);
    for (const ileti of tmiUyarilari(cevap)) s.uyari?.(ileti);
    if (cevap.uyari !== undefined) s.uyari?.(cevap.uyari);
    if (cevap.ham) return new Response(cevap.ham, { status: cevap.durum, headers: { 'Content-Type': 'application/octet-stream' } });
    return jsonCevap(cevap.govde, cevap.durum);
  };

  function SanalEventSource(adres: string): AnlikIletim {
    if (!adres.startsWith(`${sunucu}/api/bus`)) {
      s.reddedildi?.(BASKA_SUNUCU);
      return kapaliIletim();
    }
    const iletim = anlikIletimKur(istemci, new URL(adres).searchParams.get('c') ?? 'tmi');
    const kapa = iletim.close.bind(iletim);
    iletim.close = () => { acik.delete(iletim); kapa(); };
    acik.add(iletim);
    return iletim;
  }

  return {
    fetch,
    EventSource: SanalEventSource as unknown as Tasiyici['EventSource'],
    kapat: () => { for (const iletim of [...acik]) iletim.close(); },
  };
}
