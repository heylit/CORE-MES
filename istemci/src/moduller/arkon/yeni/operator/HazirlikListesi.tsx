import { useCallback, useEffect, useState } from 'react';
import type { HazirlikCevabi, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { HAZIRLIK_MADDE_BILGISI, hazirlikHucreHali } from '../../../uretim-emirleri/disari.ts';
import { CAGRI_EKIPLERI } from '../cekirdek/sabitler.ts';
import './hazirlik-listesi.css';

// Üretim Terminali hazırlık listesi (2057 a, 2079-1 b): emir ayrıntısındaki matrisle aynı kaynak, yalnız ekrandaki iş emrinin satırı.
// Yalnız sistemin doğruladığı maddeler (2059 a). Terminal muaf tutmaz, muafiyeti gösterir (2068-1 a). Başlat'ı kapatmaz: eksikte
// sunucu reddeder (2079-1 b). Uyaran maddenin (2146-1 a) eksiği "Uyarı" görünür; iş başlar.
type Hal = HazirlikCevabi['maddeler'][number]['durum'];
export type Ton = 'hata' | 'uyari' | 'tamam' | 'pasif';
const HAL: Record<Hal, { ton: Ton; simge: SimgeAdi; ad: string }> = {
  eksik: { ton: 'hata', simge: 'x', ad: 'Eksik' }, muaf: { ton: 'uyari', simge: 'lock', ad: 'Muaf' }, bilinmiyor: { ton: 'pasif', simge: 'help', ad: 'Denetlenmiyor' },
  tamam: { ton: 'tamam', simge: 'check', ad: 'Tamam' }, gerekmez: { ton: 'pasif', simge: 'minus', ad: 'Gerekmez' },
};
const UYARI = { ton: 'uyari' as Ton, simge: 'alert' as SimgeAdi, ad: 'Uyarı' };
const SIRA: readonly (Hal | 'uyari')[] = ['eksik', 'uyari', 'muaf', 'bilinmiyor', 'tamam', 'gerekmez'];
const sira = (x: HazirlikSatiri) => SIRA.indexOf(x.hal === 'eksik' && x.uyarir ? 'uyari' : x.hal);
const gorunum = (x: HazirlikSatiri) => (x.hal === 'eksik' && x.uyarir ? UYARI : HAL[x.hal]);
// Eksik maddede çağrı her zaman vardiya amirine gider; amir ilgili ekibe yönlendirir (2095-1 b).
const EKIP: (typeof CAGRI_EKIPLERI)[number]['k'] = 'amir';

export interface HazirlikSatiri { madde: HazirlikMaddesi; hal: Hal; isEmriDuzeyi: boolean; muafTutulur: boolean; uyarir: boolean; muaf: HazirlikCevabi['muafiyetler'][number] | null }
export function hazirlikSatirlari(v: HazirlikCevabi, isEmriId: number | null): HazirlikSatiri[] {
  return v.maddeler.map((m) => {
    const hal = m.isEmriDuzeyi && isEmriId !== null ? hazirlikHucreHali(v, { madde: m.madde, isEmriId }) : m.durum;
    const muaf = hal === 'muaf' ? v.muafiyetler.find((x) => x.madde === m.madde && (x.isEmriId === null || x.isEmriId === isEmriId)) ?? null : null;
    return { madde: m.madde, hal, isEmriDuzeyi: m.isEmriDuzeyi, muafTutulur: m.muafTutulur, uyarir: HAZIRLIK_MADDE_BILGISI[m.madde].uyarir, muaf };
  }).sort((a, b) => sira(a) - sira(b));
}
// Başlama durumu Hazırlık matrisinin satır durumudur (2227e): durduran madde eksikse durur, yalnız uyaran eksikse uyarıyla başlar.
// Matris ve Hazırlık takip tablosu (3111) aynı hesabı kullanır; iki tablo aynı iş için farklı durum göstermesin.
export type BaslamaDurumu = 'durur' | 'uyari' | 'hazir';
export const BASLAMA_DURUMLARI: Readonly<Record<BaslamaDurumu, string>> = { durur: 'Durur', uyari: 'Uyarıyla başlar', hazir: 'Hazır' };
export function baslamaDurumu(l: readonly Pick<HazirlikSatiri, 'hal' | 'uyarir'>[]): BaslamaDurumu {
  const eksik = l.filter((x) => x.hal === 'eksik');
  return eksik.some((x) => !x.uyarir) ? 'durur' : eksik.length > 0 ? 'uyari' : 'hazir';
}
export function hazirlikOzeti(l: readonly HazirlikSatiri[]): { ton: Ton; simge: SimgeAdi; metin: string; eksik: number } {
  const eksik = l.filter((x) => x.hal === 'eksik' && !x.uyarir).length;
  const uyari = l.filter((x) => x.hal === 'eksik' && x.uyarir).length;
  if (eksik) return { ton: 'hata', simge: 'x', metin: `Hazırlık · ${String(eksik)} eksik`, eksik };
  if (uyari) return { ton: 'uyari', simge: 'alert', metin: `Hazır · ${String(uyari)} uyarı`, eksik };
  if (l.some((x) => x.hal === 'muaf')) return { ton: 'uyari', simge: 'lock', metin: 'Hazır · muafiyetle', eksik };
  return { ton: 'tamam', simge: 'check', metin: 'Hazır', eksik };
}

// Önizlemede ve emirsiz işte sorulmaz; okunamazsa liste çizilmez (başlatma denetimi sunucuda değişmeden durur).
export function useHazirlik(emirId: number | null, yenidenSor: unknown): { v: HazirlikCevabi | null; zaman: number | null; yenile: () => void } {
  const [d, dYaz] = useState<{ v: HazirlikCevabi; zaman: number } | null>(null);
  const [n, nYaz] = useState(0);
  useEffect(() => {
    dYaz(null);
    if (emirId === null) return;
    let canli = true;
    api.get<HazirlikCevabi>(`/adimli-emirler/${String(emirId)}/hazirlik`).then((v) => { if (canli) dYaz({ v, zaman: Date.now() }); }).catch(() => undefined);
    return () => { canli = false; };
  }, [emirId, yenidenSor, n]);
  const yenile = useCallback(() => nYaz((x) => x + 1), []);
  return { v: d?.v ?? null, zaman: d?.zaman ?? null, yenile };
}

export function HazirlikCipi({ satirlar, ac }: { satirlar: readonly HazirlikSatiri[]; ac: () => void }) {
  const o = hazirlikOzeti(satirlar);
  return (
    <button type="button" className="tc-ay1-hz-cip" data-ton={o.ton} onClick={ac} aria-label={`Hazırlık listesi: ${o.metin}`}>
      <Simge ad={o.simge} boyut="k" /><span>{o.metin}</span>
    </button>
  );
}

const saat = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const tarih = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function HazirlikListesi({ satirlar, baslik, zaman, yenile, cagir }: {
  satirlar: readonly HazirlikSatiri[]; baslik: string; zaman: number | null; yenile: () => void;
  cagir: ((ekip: (typeof CAGRI_EKIPLERI)[number], not: string) => void) | null;
}) {
  const o = hazirlikOzeti(satirlar);
  return (
    <section className="tc-ay1-hz" aria-label="Hazırlık">
      <div className="tc-ay1-hz-bas">
        <h3><Simge ad="flag" boyut="k" />Hazırlık · {baslik}</h3>
        <span className="tc-ay1-hz-cip" data-ton={o.ton} data-sakin=""><Simge ad={o.simge} boyut="k" /><span>{o.metin}</span></span>
      </div>
      <ul>
        {satirlar.map((x) => {
          const h = gorunum(x); const b = HAZIRLIK_MADDE_BILGISI[x.madde]; const ekip = CAGRI_EKIPLERI.find((e) => e.k === EKIP) ?? null;
          let ac: string | null = null;
          if (x.hal === 'eksik' && x.uyarir) ac = `Eksik, ama iş başlar; uyarıdır. Sorumlu: ${b.sahip}.`;
          else if (x.hal === 'eksik') ac = `Tamamlanmadan bu iş emri başlamaz${x.muafTutulur ? '; müdür emir ayrıntısında gerekçeyle muaf tutabilir' : ''}. Sorumlu: ${b.sahip}.`;
          if (x.hal === 'tamam') ac = `Sistem doğruladı · ${b.sahip}`;
          if (x.hal === 'gerekmez') ac = 'Bu iş emrinde gerekmiyor.';
          if (x.hal === 'bilinmiyor') ac = 'Sistem bu maddeyi henüz denetlemiyor; başlatmayı durdurmaz.';
          return (
            <li key={x.madde} data-ton={h.ton} data-hal={x.hal}>
              <Simge ad={h.simge} />
              <span className="tc-ay1-hz-ad"><b>{b.ad}</b><span className="tc-ay1-hz-hal">{h.ad}</span><small>{x.isEmriDuzeyi ? 'bu iş emri' : 'emir geneli'}</small></span>
              {ac ? <span className="tc-ay1-hz-ac">{ac}</span> : null}
              {x.muaf ? (
                <span className="tc-ay1-hz-muaf"><Simge ad="lock" boyut="k" />
                  <span>Müdür muaf tuttu · {x.muaf.kisiAdi ?? 'kişi okunamadı'} · {tarih(x.muaf.zaman)}<br />Gerekçe: {x.muaf.gerekce}</span>
                </span>
              ) : null}
              {x.hal === 'eksik' && cagir && ekip ? (
                <span className="tc-ay1-hz-eylem">
                  <button type="button" className="tc-ay1-hz-lnk" onClick={() => cagir(ekip, `Hazırlık eksik: ${b.ad}`)}><Simge ad="bell" boyut="k" />Sorumluya haber ver</button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="tc-ay1-hz-alt">
        <span>Yalnız sistemin doğruladığı maddeler · muafiyet emir ayrıntısında, yalnız müdür verir</span>
        <button type="button" className="tc-ay1-hz-lnk" onClick={yenile}><Simge ad="rotate" boyut="k" />Yenile{zaman ? ` · ${saat(zaman)}` : ''}</button>
      </div>
    </section>
  );
}
