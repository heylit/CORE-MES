import { useMemo, useState } from 'react';
import type { KokpitModeli } from './kurallar.ts';
import type { BosYer } from './yerlestirme.ts';

// Operasyona odaklı tezgâh paneli (3318 a): seçili operasyonu yapabilen tezgâhlar kısa bir zaman çizgisinde durur; dolu işler, kapalı
// saatler ve duruşlar, boş yer ve satırda seçilen yer aynı satırda görünür. Boş yere basınca çağıran tablodaki satırı doldurur.
export interface OdakPaneliOzellikleri {
  m: KokpitModeli;
  // Operasyonun adı ve (plandaysa) işi; kendi işi panelde işaretlenir.
  ad: string;
  isId: string | null;
  // Operasyonu yapabilen tezgâhlar, rota sırasında.
  tezgahlar: readonly string[];
  // Aday tezgâhlardaki boş yerler; hesaplanırken null.
  yerler: readonly BosYer[] | null;
  // Satırda seçili tezgâh; yoksa null.
  secilen: string | null;
  zaman: (t: number) => string;
  fiil: 'Yerleştir' | 'Taşı';
  // Yazamayan kişide null: yerler görünür, basılamaz.
  sec: ((tezgah: string) => void) | null;
  // Panel dar ekranda seçili satırın altındadır; gün yazısı daha seyrek yazılır.
  dar?: boolean;
}

// Pencere şimdiden başlar; en az iki gün, en çok üç hafta: boş yerler ve operasyonun kendi işi (ileri tarihe yerleşmiş olsa da) içinde
// kalır. Gün yazıları üst üste binmesin diye en çok ETIKET (dar ekranda ETIKET_DAR) kadarı yazılır; çizgiler her gün için durur.
const EN_AZ = 48, EN_COK = 504, PAY = 4, ETIKET = 8, ETIKET_DAR = 4;
const konum = (el: HTMLElement | null, x: number, w?: number): void => {
  if (!el) return;
  el.style.setProperty('--x', `${String(Math.round(x * 100) / 100)}%`);
  if (w !== undefined) el.style.setProperty('--w', `${String(Math.round(w * 100) / 100)}%`);
};

export function OdakPaneli({ m, ad, isId, tezgahlar, yerler, secilen, zaman, fiil, sec, dar = false }: OdakPaneliOzellikleri) {
  const [hepsi, setHepsi] = useState(false);
  const kendi = isId !== null ? m.isler[isId] : undefined;
  const t0 = Math.floor(m.simdi);
  const t1 = useMemo(() => {
    const uc = Math.max(...(yerler ?? []).map((b) => b.C), kendi?.C ?? 0, 0);
    return t0 + Math.min(EN_COK, Math.max(EN_AZ, Math.ceil(uc - t0) + PAY));
  }, [yerler, kendi, t0]);
  const yuzde = (t: number): number => Math.min(100, Math.max(0, ((t - t0) / (t1 - t0)) * 100));
  const kesit = (a: number, b: number): [number, number] | null => (b <= t0 || a >= t1 ? null : [yuzde(a), yuzde(b) - yuzde(a)]);
  const uygun = new Set(tezgahlar);
  const satirlar = hepsi ? m.tezgahlar.filter((t) => !t.fason) : tezgahlar.flatMap((id) => m.tezgahlar.find((t) => t.id === id) ?? []);
  const isler = useMemo(() => Object.values(m.isler).filter((x) => !x.fason && x.C > t0 && x.S < t1), [m, t0, t1]);
  const emirNo = useMemo(() => new Map(m.emirler.map((e) => [e.id, e.no])), [m]);
  // Gün başları (planın ekseni gün başına hizalıdır): pencerenin içindeki her 00:00.
  const gunler: number[] = [];
  for (let g = m.bas + Math.ceil((t0 - m.bas) / 24) * 24; g < t1; g += 24) if (g > t0) gunler.push(g);
  // Tezgâhın kapalı saatleri: açık pencerelerin tümleyeni; penceresi bilinmeyen tezgâh hep açık sayılır.
  const kapali = (id: string): [number, number][] => {
    const acik = m.acik[id];
    if (!acik || acik.length === 0) return [];
    const l: [number, number][] = []; let son = t0;
    for (const [a, b] of acik) { if (b <= t0) continue; if (a >= t1) break; if (a > son + 0.01) l.push([son, Math.min(a, t1)]); son = Math.max(son, b); }
    if (son < t1 - 0.01) l.push([son, t1]);
    return l;
  };
  return (
    <aside className="tc-pyq-odak" aria-label={`${ad} için tezgâhlar`}>
      <div className="tc-pyq-odak-bas">
        <b>{ad}</b>
        <span className="tc-pyq-seg" role="group" aria-label="Paneldeki tezgâhlar">
          <button type="button" aria-pressed={!hepsi} onClick={() => { setHepsi(false); }}>Uygun tezgâhlar</button>
          <button type="button" aria-pressed={hepsi} onClick={() => { setHepsi(true); }}>Bütün tezgâhlar</button>
        </span>
      </div>
      <div className="tc-pyq-odak-eksen" aria-hidden="true">
        <span>{zaman(t0)}</span>
        {gunler.filter((_, i) => i % Math.ceil(gunler.length / (dar ? ETIKET_DAR : ETIKET)) === 0).map((g) => <i key={g} ref={(el) => { konum(el, yuzde(g)); }}>{zaman(g).slice(0, 5)}</i>)}
        <span>{zaman(t1)}</span>
      </div>
      <ul className="tc-pyq-odak-satirlar">
        {satirlar.map((t) => {
          const yer = uygun.has(t.id) ? yerler?.find((b) => b.tezgah === t.id) : undefined;
          const yk = yer ? kesit(yer.S, yer.C) : null;
          return (
            <li key={t.id} data-odak-satir={t.id} data-uygun={uygun.has(t.id) ? 'evet' : 'hayir'}>
              <b className="tc-pyq-mono">{t.kod}</b>
              <div className="tc-pyq-odak-serit">
                {gunler.map((g) => <i key={g} className="tc-pyq-odak-gun" ref={(el) => { konum(el, yuzde(g)); }} />)}
                {kapali(t.id).map(([a, b]) => { const k = kesit(a, b); return k && <i key={`k${String(a)}`} className="tc-pyq-odak-kapali" title="Kapalı" ref={(el) => { konum(el, k[0], k[1]); }} />; })}
                {(m.durus[t.id] ?? []).map((d) => { const k = kesit(d.a, d.b); return k && <i key={`d${String(d.a)}`} className="tc-pyq-odak-kapali" data-durus="" title={d.ariza ? 'Arıza' : 'Duruş'} ref={(el) => { konum(el, k[0], k[1]); }} />; })}
                {isler.filter((x) => x.m === t.id).map((x) => {
                  const k = kesit(x.S, x.C);
                  return k && (
                    <span key={x.id} className="tc-pyq-odak-is" data-kendi={x.id === isId ? '' : undefined} title={`${emirNo.get(x.job) ?? x.job} · ${x.ad} · ${zaman(x.S)} → ${zaman(x.C).slice(-5)}`} ref={(el) => { konum(el, k[0], k[1]); }}>
                      <small>{emirNo.get(x.job) ?? x.job}</small>
                    </span>
                  );
                })}
                {yer && yk && (
                  <button
                    type="button" className="tc-pyq-odak-yer" data-odak-yer={t.id} data-ilk={yer.enErken ? '' : undefined} aria-pressed={secilen === t.id} disabled={!sec}
                    aria-label={`${t.kod} · ${zaman(yer.S)} boş yer${yer.enErken ? ', en erken biten' : ''}: ${fiil === 'Taşı' ? 'buraya taşı' : 'satıra yaz'}`}
                    ref={(el) => { konum(el, yk[0], yk[1]); }} onClick={() => { sec?.(t.id); }}
                  ><small>{zaman(yer.S).slice(-5)}</small></button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {yerler === null ? <p className="tc-pyq-not" role="status">Boş yerler hesaplanıyor</p>
        : yerler.length === 0 ? <p className="tc-pyq-not" role="status">Bu tezgâhlarda boş yer yok.</p>
          : <p className="tc-pyq-not">{sec ? `Boş yere basın: ${fiil === 'Taşı' ? 'yeni yer satırda görünür, "Taşı" ile yazılır.' : 'tezgâh ve başlangıç satıra yazılır.'}` : 'Boş yerler yalnız gösterilir.'}</p>}
      <ul className="tc-pyq-odak-aciklama" aria-label="Açıklama">
        <li><i className="tc-pyq-odak-is" />Dolu</li>
        <li><i className="tc-pyq-odak-yer" />Boş yer</li>
        <li><i className="tc-pyq-odak-yer" data-secili="" />Seçilen yer</li>
        <li><i className="tc-pyq-odak-kapali" />Duruş ya da kapalı</li>
      </ul>
    </aside>
  );
}
