import { useCallback, useEffect, useState } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { KUYRUK_BITTI_OLAYI, SAYIM_YENIDEN_YAZILDI_OLAYI, type BekleyenDurumu, type BekleyenKayit } from '../../../../../../arkon/web/src/data/biten-is.ts';
import { useArkon, useArkonDurumu } from '../veri/baglam.ts';
import './bekleyen-islemler.css';

// Bağlantı yokken yapılan üretim işlemi cihazda bekler; bağlantı gelince sistem kuralla kesinleştirir ya da "Karar bekliyor" olur (3154 a, 3158 a).
// Liste gönderim kuyruğundan okunur; yalnız oturumdaki kişinin işlemleri görünür.

export type CozumYolu = 'yeniden' | 'duzelt' | 'vazgec';
// "kesin": bu oturumda kesinleşip kuyruktan düşen işlem; cihazda tutulmaz, yalnız ekranda kalır.
export type Bekleyen = Omit<BekleyenKayit<number | string>, 'durum'> & { durum: BekleyenDurumu | 'kesin' };

const DURUM_ADLARI: Record<string, string> = {
  running: 'Başlatıldı', setup: 'Hazırlığa geçildi', paused: 'Duraklatıldı', stopped: 'Durduruldu', done: 'Bitirildi',
};

export function islemAdi(k: Pick<Bekleyen, 'tur' | 'satir'>): string {
  const s = k.satir;
  if (k.tur === 'counts' && typeof s['delta'] === 'number') {
    const d = s['delta'];
    return `${s['kind'] === 'scrap' ? 'Hurda' : 'İyi'} ${d < 0 ? '−' : '+'}${String(Math.abs(d))}`;
  }
  if (k.tur === 'events') return DURUM_ADLARI[String(s['state'])] ?? 'Durum değişikliği';
  return 'İşlem';
}

// Sistemin kaydettikten sonra reddettiği işlemden yalnız sayım yeniden denenir (3167 b); adet yalnız sayımda düzeltilir.
export function cozumYollari(k: Pick<Bekleyen, 'tur' | 'durum' | 'yenidenDenenir'>): CozumYolu[] {
  if (k.durum !== 'karar') return [];
  return [...(k.yenidenDenenir ? ['yeniden' as const] : []), ...(k.tur === 'counts' ? ['duzelt' as const] : []), 'vazgec'];
}

// Karar bekleyen satırda nedenin altındaki yol cümlesi; yalnız sunulan yollara göre (neden metni yorumlanmaz: ne yapılacağını sunucu nedeni söyler).
export function yolIpucu(k: Pick<Bekleyen, 'tur' | 'durum' | 'yenidenDenenir'>): string | null {
  if (k.durum !== 'karar') return null;
  if (k.yenidenDenenir) return 'Yeniden denerseniz kayıt emrin güncel hâline göre denetlenir.';
  if (k.tur === 'counts') return 'Gerçekte yaptığınız adedi yazıp gönderin ya da vazgeçin.';
  return 'Bu işlem buradan yeniden denenmez. İşi terminalden yeniden yapın ya da vazgeçin.';
}

export interface BekleyenSayilari { bekliyor: number; karar: number }
export const bekleyenSayilari = (l: readonly Pick<Bekleyen, 'durum'>[]): BekleyenSayilari => ({
  bekliyor: l.filter((x) => x.durum === 'bekliyor' || x.durum === 'gonderiliyor').length,
  karar: l.filter((x) => x.durum === 'karar').length,
});

// Kuyruk boşalınca tek seferlik özet; yalnız kesinleşen ya da karar bekleyen varsa.
export function kesinlesmeOzeti(o: { kesin: number; karar: number }): string | null {
  if (o.karar > 0) return o.kesin > 0 ? `${String(o.kesin)} işlem kesinleşti, ${String(o.karar)} işlem karar bekliyor` : `${String(o.karar)} işlem karar bekliyor`;
  return o.kesin > 0 ? `${String(o.kesin)} işlem kesinleşti` : null;
}

const KESIN_SATIR_SINIRI = 20;
// Kuyruktan karar beklemeden düşen kayıt kesinleşmiştir; vazgeçilen ya da düzeltilen iz olarak kuyrukta kalır.
export function kesinlesenleriKat(onceki: readonly Bekleyen[], yeni: readonly Bekleyen[]): Bekleyen[] {
  const kalan = new Set(yeni.map((k) => k.anahtar));
  const dusen = onceki.filter((k) => !kalan.has(k.anahtar) && k.durum !== 'vazgecildi' && k.durum !== 'duzeltildi');
  return [...dusen.slice(-KESIN_SATIR_SINIRI).map((k) => ({ ...k, durum: 'kesin' as const, neden: null, yenidenDenenir: false })), ...yeni];
}

export function useBekleyenIslemler(): { liste: readonly Bekleyen[]; kopuk: boolean; yenile: () => void } {
  const { depo } = useArkon();
  const d = useArkonDurumu();
  const sunucuda = d.mode === 'server';
  const [liste, listeYaz] = useState<readonly Bekleyen[]>([]);
  const yenile = useCallback(() => {
    if (!sunucuda) { listeYaz([]); return; }
    void depo.Log.bekleyenler().then((yeni) => { listeYaz((onceki) => kesinlesenleriKat(onceki, yeni)); }, () => undefined);
  }, [depo, sunucuda]);
  useEffect(() => { yenile(); }, [yenile, d.pending, d.online]);
  useEffect(() => {
    const olaylar = [KUYRUK_BITTI_OLAYI, SAYIM_YENIDEN_YAZILDI_OLAYI, 'arkon-rejected'];
    for (const o of olaylar) window.addEventListener(o, yenile);
    return () => { for (const o of olaylar) window.removeEventListener(o, yenile); };
  }, [yenile]);
  return { liste, kopuk: sunucuda && !d.online, yenile };
}

const DURUMLAR: Record<Bekleyen['durum'], { ad: string; simge: SimgeAdi; ton: string }> = {
  kesin: { ad: 'Kesinleşti', simge: 'check', ton: 'kesin' },
  bekliyor: { ad: 'Bekliyor', simge: 'clock', ton: 'bekliyor' },
  gonderiliyor: { ad: 'Kesinleşiyor', simge: 'rotate', ton: 'gonderiliyor' },
  karar: { ad: 'Karar bekliyor', simge: 'alert', ton: 'karar' },
  vazgecildi: { ad: 'Vazgeçildi', simge: 'x', ton: 'vazgecildi' },
  duzeltildi: { ad: 'Düzeltildi', simge: 'edit', ton: 'kesin' },
};

const saatMetni = (t: number | null) => (t === null ? '' : new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));

function Satir({ k, coz }: { k: Bekleyen; coz: (k: Bekleyen, y: CozumYolu, adet?: number) => Promise<void> }) {
  const [duzelt, duzeltYaz] = useState<number | null>(null);
  const [mesgul, mesgulYaz] = useState(false);
  const yollar = cozumYollari(k);
  const ipucu = yolIpucu(k);
  const durum = DURUMLAR[k.durum];
  const yap = (y: CozumYolu, adet?: number) => {
    mesgulYaz(true);
    void coz(k, y, adet).finally(() => { mesgulYaz(false); duzeltYaz(null); });
  };
  const is = typeof k.satir['orderNo'] === 'string' ? k.satir['orderNo'] : '';
  const delta = typeof k.satir['delta'] === 'number' ? Math.abs(k.satir['delta']) : 1;
  return (
    <li className="tc-bk-satir" data-ton={durum.ton}>
      <div className="tc-bk-satir-ust">
        <b>{islemAdi(k)}</b>
        <span className="tc-bk-soluk">{[is, saatMetni(k.zaman)].filter(Boolean).join(' · ')}</span>
        <span className="tc-bk-isaret"><Simge ad={durum.simge} boyut="k" /><span>{durum.ad}</span></span>
      </div>
      {k.durum === 'karar' && k.neden ? <p className="tc-bk-neden"><Simge ad="alert" boyut="k" />{k.neden}</p> : null}
      {ipucu ? <p className="tc-bk-soluk">{ipucu}</p> : null}
      {k.durum === 'karar' && duzelt !== null ? (
        <div className="tc-bk-duzelt">
          <label>Gönderilecek adet <input type="number" inputMode="numeric" min={0} value={duzelt} onChange={(e) => duzeltYaz(Math.max(0, Math.trunc(Number(e.target.value)) || 0))} /></label>
          <Dugme tur="birincil" simge="check" yukleniyor={mesgul} onClick={() => yap('duzelt', duzelt)}>Gönder</Dugme>
          <Dugme tur="ikincil" disabled={mesgul} onClick={() => duzeltYaz(null)}>Vazgeç</Dugme>
        </div>
      ) : yollar.length > 0 ? (
        <div className="tc-bk-yollar">
          {yollar.includes('yeniden') ? <Dugme tur="birincil" simge="rotate" yukleniyor={mesgul} onClick={() => yap('yeniden')}>Yeniden dene</Dugme> : null}
          {yollar.includes('duzelt') ? <Dugme tur={yollar.includes('yeniden') ? 'ikincil' : 'birincil'} simge="edit" disabled={mesgul} onClick={() => duzeltYaz(delta)}>Düzelterek gönder</Dugme> : null}
          <Dugme tur="ikincil" simge="x" disabled={mesgul} onClick={() => yap('vazgec')}>Vazgeç</Dugme>
        </div>
      ) : null}
    </li>
  );
}

// Terminaldeki pencere: bu cihazda bu kişinin bekleyen ve karar bekleyen işlemleri.
export function BekleyenPenceresi({ acik, kapat, liste, kopuk, coz }: {
  acik: boolean; kapat: () => void; liste: readonly Bekleyen[]; kopuk: boolean; coz: (k: Bekleyen, y: CozumYolu, adet?: number) => Promise<void>;
}) {
  const s = bekleyenSayilari(liste);
  const gorunen = liste.filter((x) => x.durum !== 'vazgecildi' && x.durum !== 'duzeltildi').slice().reverse();
  return (
    <Pencere acik={acik} kapat={kapat} baslik="Bekleyen işlemlerim" tur="yan">
      <p className="tc-bk-ozet">
        {kopuk ? <><Simge ad="clock" boyut="k" /> Bağlantı yok. Yaptıklarınız bu cihazda tutuluyor; bağlantı gelince sistem kurallarla kesinleştirir. Yeniden girmeyin.</>
          : s.karar > 0 ? <><Simge ad="alert" boyut="k" /> {s.karar} işlem kesinleşmedi.</>
            : s.bekliyor > 0 ? <><Simge ad="rotate" boyut="k" /> Bağlantı geldi, işlemler kesinleşiyor.</>
              : <><Simge ad="check" boyut="k" /> Bütün işlemler kesinleşti.</>}
      </p>
      <p className="tc-bk-soluk">Bekleyen işlem stoğa, panolara ve raporlara girmez; yalnız burada görünür.</p>
      {gorunen.length === 0 ? <p className="tc-bk-soluk">Bekleyen işlem yok.</p>
        : <ol className="tc-bk-liste">{gorunen.map((k) => <Satir key={String(k.anahtar)} k={k} coz={coz} />)}</ol>}
    </Pencere>
  );
}

// Sayacın üstünde tek çip (3158 a): yalnız bekleyen ya da karar bekleyen işlem varken görünür.
export function SayacCipi({ liste, kopuk, ac, kisa = false }: { liste: readonly Bekleyen[]; kopuk: boolean; ac: () => void; kisa?: boolean }) {
  const s = bekleyenSayilari(liste);
  if (s.karar > 0) {
    return (
      <button type="button" className="tc-bk-cip" data-ton="karar" onClick={ac} aria-label={`${String(s.karar)} işlem karar bekliyor`}>
        <Simge ad="alert" boyut="k" /><b>{kisa ? `${String(s.karar)} karar` : `${String(s.karar)} işlem karar bekliyor`}</b>{kisa ? null : <span>Aç ›</span>}
      </button>
    );
  }
  if (s.bekliyor === 0) return null;
  return (
    <button type="button" className="tc-bk-cip" data-ton={kopuk ? 'bekliyor' : 'gonderiliyor'} onClick={ac} aria-label={`${String(s.bekliyor)} işlem bekliyor`}>
      <Simge ad={kopuk ? 'clock' : 'rotate'} boyut="k" />
      <b>{kisa ? `${String(s.bekliyor)} bekliyor` : kopuk ? `${String(s.bekliyor)} işlem bekliyor` : `Kesinleşiyor · ${String(s.bekliyor)}`}</b>
      {kisa ? null : <span>Liste ›</span>}
    </button>
  );
}
