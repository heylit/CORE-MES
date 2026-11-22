import { useEffect, useMemo, useRef } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { Derleme } from '../motor/kurallar.ts';
import { durusAdi, type KokpitModeli } from './kurallar.ts';
import { acikDilimler, acikYazisi, gunCizelgesi, hucreOzeti, saatMetni, tarihMetni, tezgahGunleri } from './yogunluk.ts';

// Dilim 3c (G): doluluk hücresine basınca o tezgâhın o günü yan panelde küçük bir çizelge olarak açılır. İşe basmak emri tahtada seçer.
// Esc ya da Kapat paneli kapatır; odak açan hücreye döner (Kokpit).
export interface HucrePaneliOzellikleri {
  m: KokpitModeli;
  cx: Derleme;
  tezgah: string;
  a: number;
  zaman: (t: number) => string;
  emirNo: (id: string) => string;
  secIs: string | null;
  sec: (emirId: string, isId: string) => void;
  kapat: () => void;
}

const SAATLER = [0, 4, 8, 12, 16, 20, 24];
// Çubuğun içine başlangıç saati yalnız günün en az bu yüzdesi kadar genişse yazılır (süre eksenden okunur).
const SAAT_YAZI_EN = 18;
const buyukBasla = (y: string): string => y.charAt(0).toLocaleUpperCase('tr') + y.slice(1);
const yerYaz = (el: HTMLElement | null, sol: number, en: number): void => {
  el?.style.setProperty('--sol', `${String(Math.round(sol * 10) / 10)}%`);
  el?.style.setProperty('--en', `${String(Math.max(0.5, Math.round(en * 10) / 10))}%`);
};

export function HucrePaneli({ m, cx, tezgah, a, zaman, emirNo, secIs, sec, kapat }: HucrePaneliOzellikleri) {
  const baslik = useRef<HTMLHeadingElement | null>(null);
  const t = m.tezgahlar.find((x) => x.id === tezgah);
  const b = a + 24;
  const gun = useMemo(() => {
    const gec = new Set(m.emirler.filter((e) => e.durum === 'gec').map((e) => e.id));
    return tezgahGunleri(cx, m, tezgah, gec).find((g) => g.a === a) ?? null;
  }, [cx, m, tezgah, a]);
  const cizelge = useMemo(() => gunCizelgesi(Object.values(m.isler).filter((x) => x.m === tezgah), a, b), [m.isler, tezgah, a, b]);
  const gecEmir = useMemo(() => new Set(m.emirler.filter((e) => e.durum === 'gec').map((e) => e.id)), [m.emirler]);
  // Arayüz 3c Z6: yük yalnız açık saatte sayılır; kapalı saat eksende ve çubuklarda taralı, özet aynı pencereyi yazar.
  const acik = useMemo(() => acikDilimler(cx.M[tezgah]?.rw ?? [], a, b), [cx, tezgah, a, b]);
  const kapali = useMemo(() => {
    const l: { sol: number; en: number }[] = []; let x = 0;
    for (const d of acik) { if (d.sol > x) l.push({ sol: x, en: d.sol - x }); x = d.sol + d.en; }
    if (x < 100) l.push({ sol: x, en: 100 - x });
    return l;
  }, [acik]);
  useEffect(() => { baslik.current?.focus(); }, [tezgah, a]);
  if (!t) return null;
  const tarih = zaman(a).slice(0, 5);
  const kapaliKatman = kapali.map((k) => <i key={k.sol} className="tc-pyq-hpanel-kapali" aria-hidden="true" ref={(el) => { yerYaz(el, k.sol, k.en); }} />);
  return (
    <aside
      id="tc-pyq-hpanel" className="tc-pyq-hpanel" aria-labelledby="tc-pyq-hpanel-baslik" data-hucre-paneli={`${tezgah}|${String(Math.round((a - m.bas) / 24))}`}
      onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); kapat(); } }}
    >
      <header>
        <h3 id="tc-pyq-hpanel-baslik" tabIndex={-1} ref={baslik}><Simge ad="grid" boyut="k" /><b>{t.kod}</b><span>{t.ad} · {tarihMetni(zaman(a))}</span></h3>
        <button type="button" className="tc-pyq-ok" aria-label="Paneli kapat" title="Kapat (Esc)" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {gun && (
        <p className="tc-pyq-hpanel-ozet" data-panel-ozet="">
          {buyukBasla(hucreOzeti(gun))}. Açık saat {acikYazisi(acik)}{kapali.length > 0 ? '; taralı kısım kapalı saat, yüke sayılmaz' : ''}. İşe basınca emir tahtada seçilir.
        </p>
      )}
      <div className="tc-pyq-hpanel-cizelge">
        <div className="tc-pyq-hpanel-eksen" aria-hidden="true">
          <div>{kapaliKatman}{SAATLER.map((h) => <small key={h} ref={(el) => { el?.style.setProperty('--sol', `${String((h / 24) * 100)}%`); }}>{String(h).padStart(2, '0')}</small>)}</div>
        </div>
        <ul aria-label={`${t.kod} ${tarih} işleri ve duruşları`}>
          {(gun?.duruslar ?? []).map((d) => (
            <li key={`d${String(d.a)}`} data-durus={d.ariza ? 'ariza' : 'plan'}>
              <span><b>{durusAdi(d.neden, d.baslik)}</b><small>{zaman(d.a)} – {zaman(d.b)}</small></span>
              <div>{kapaliKatman}<i className="tc-pyq-hpanel-durus" ref={(el) => { const s = Math.max(a, d.a), c = Math.min(b, d.b); yerYaz(el, ((s - a) / 24) * 100, ((c - s) / 24) * 100); }} /></div>
            </li>
          ))}
          {cizelge.map(({ is: x, sol, en }) => {
            const no = emirNo(x.job);
            return (
              <li key={x.id}>
                <button
                  type="button" data-panel-is={x.id} aria-pressed={secIs === x.id} data-gec={gecEmir.has(x.job) ? '' : undefined}
                  aria-label={`${no} ${x.ad}, ${zaman(x.S)} – ${zaman(x.C)}${gecEmir.has(x.job) ? ', geç emir' : ''}`} onClick={() => { sec(x.job, x.id); }}
                >
                  <span><b>{no}</b><small>{x.ad}</small></span>
                  <div><i className="tc-pyq-hpanel-is" ref={(el) => { yerYaz(el, sol, en); }}>{en >= SAAT_YAZI_EN ? saatMetni(zaman(Math.max(a, x.S))) : null}</i>{kapaliKatman}</div>
                </button>
              </li>
            );
          })}
          {cizelge.length === 0 && <li className="tc-pyq-hpanel-bos">Bu gün bu tezgâhta planlı iş yok.</li>}
        </ul>
      </div>
    </aside>
  );
}
