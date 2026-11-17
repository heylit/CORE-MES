import { useEffect, useRef } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { kartOkununca } from '../../../../ortak/veri/kart-degistir.ts';
import { ETKINLIK_OLAYLARI } from '../../../../ortak/veri/bosta-cikis.ts';

// 3392 a madde 7: ortak cihazda açık kalan oturumla başka kişinin kaydı oturum sahibine yazılmasın. Bitir her seferinde kart ister
// (iş başına bir kez); ekrana 20 dakika dokunulmadıysa başlat, sürdür, duruş ve hurda da ister. Kartsız devam yok, Vazgeç kayıt yapmaz.
// Oturum kapanmaz (2226-3): kart yalnız kaydın kimin olduğunu doğrular. Sayım tuşları ve SmartES sayımı kart istemez.
export const KART_BOSLUGU_MS = 20 * 60 * 1000;
// Kart okutulduktan sonraki kısa süre aynı niyetin adımlarıdır (bitir penceresi, "Yine de bitir"): ikinci kez sorulmaz.
export const KART_GECERLI_MS = 60 * 1000;

export type GuvenceEylemi = 'start' | 'resume' | 'restart' | 'stop' | 'finish' | 'scrap';
const HER_SEFERINDE: ReadonlySet<GuvenceEylemi> = new Set(['finish']);
export const GUVENCE_EYLEMLERI: ReadonlySet<string> = new Set<GuvenceEylemi>(['start', 'resume', 'restart', 'stop', 'finish', 'scrap']);

export interface GuvenceDurumu { bosKaldi: boolean; sonKart: number }

export function kartGerekir(eylem: GuvenceEylemi, d: GuvenceDurumu, simdi: number): boolean {
  if (simdi - d.sonKart < KART_GECERLI_MS) return false;
  return HER_SEFERINDE.has(eylem) || d.bosKaldi;
}

// Bir dokunuştan öncekiyle arası 20 dakikayı aşınca cihaz "boş kaldı" sayılır; kart okutulana kadar öyle kalır (arada başka yere dokunmak
// kartı atlatmasın).
export function dokunmaIsle(d: GuvenceDurumu & { sonDokunma: number }, simdi: number): GuvenceDurumu & { sonDokunma: number } {
  return { ...d, bosKaldi: d.bosKaldi || simdi - d.sonDokunma >= KART_BOSLUGU_MS, sonDokunma: simdi };
}

export function useKisiGuvencesi(etkin: boolean) {
  const durum = useRef({ bosKaldi: false, sonKart: 0, sonDokunma: Date.now() });
  useEffect(() => {
    if (!etkin) return undefined;
    const dokundu = () => { durum.current = dokunmaIsle(durum.current, Date.now()); };
    for (const olay of ETKINLIK_OLAYLARI) window.addEventListener(olay, dokundu, { capture: true, passive: true });
    return () => { for (const olay of ETKINLIK_OLAYLARI) window.removeEventListener(olay, dokundu, { capture: true }); };
  }, [etkin]);
  return {
    gerekir: (eylem: GuvenceEylemi): boolean => etkin && kartGerekir(eylem, durum.current, Date.now()),
    onaylandi: () => { durum.current = { ...durum.current, bosKaldi: false, sonKart: Date.now() }; },
  };
}

const EYLEM_ADI: Record<GuvenceEylemi, string> = { start: 'Başlat', resume: 'Sürdür', restart: 'Yeniden başlat', stop: 'Duruş', finish: 'Bitir', scrap: 'Hurda' };

// Aynı kişinin kartı devam ettirir; başka kişinin kartı kişiyi değiştirir (1898 a, kabuk) ve ekran baştan kurulur.
export function KartIstePenceresi({ eylem, kisiId, kisiAdi, devam, kapat }: { eylem: GuvenceEylemi; kisiId: number | null; kisiAdi: string; devam: () => void; kapat: () => void }) {
  const ref = useRef({ devam, kapat, kisiId });
  ref.current = { devam, kapat, kisiId };
  useEffect(() => kartOkununca((k) => { if (k.id === ref.current.kisiId) ref.current.devam(); else ref.current.kapat(); }), []);
  return (
    <Pencere acik kapat={kapat} baslik="Kartınızı okutun" alt={<Dugme simge="x" onClick={kapat}>Vazgeç</Dugme>}>
      <div className="tc-ay1-kart-iste" role="status">
        <Simge ad="id-card" />
        <b>{EYLEM_ADI[eylem]} için kartını okut</b>
        <p>Kayıt <b>{kisiAdi || 'oturumdaki kişi'}</b> adına yazılır. Sen değilsen kendi kartını okut; kişi değişir, iş ve makine yerinde kalır.</p>
        <small>Vazgeç: kayıt yapılmaz, iş olduğu gibi kalır.</small>
      </div>
    </Pencere>
  );
}
