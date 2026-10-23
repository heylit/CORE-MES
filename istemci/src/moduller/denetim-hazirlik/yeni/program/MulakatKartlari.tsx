import { useEffect, useRef } from 'react';
import { Dugme, Kart } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { aktifSorular, puanHesapla } from '../kurallar/puan.ts';
import { Halka, IpucuKutusu, ProgramBandi, PSimge, useProgramEkrani } from './ortak.tsx';

const yaziAlaniMi = (h: EventTarget | null): boolean =>
  h instanceof HTMLElement && (h.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(h.tagName));

// Mülakat kartları (prototip vSorular): ölçüm değil prova; "hazırım" ve "tekrar" işaretleri kayda yazılır, kart ve çevrim ekran durumudur.
export function MulakatKartlari() {
  const d = useDenetim();
  const [e, ekranYaz] = useProgramEkrani();
  const kb = d.kb;
  const w = kb.calisma;
  const yaz = d.yetki.yazabilir;
  const depts = kb.pg.DEPTS;
  const dept = depts.find((x) => x.k === e.dept) ?? depts[0];
  const r = puanHesapla(aktifSorular(kb.pg, w.def), w.ans, kb.pg);
  const kartNo = dept ? Math.min(Math.max(0, e.card), dept.items.length - 1) : 0;

  let top = 0, hazir = 0, tekrar = 0;
  for (const x of depts) x.items.forEach((_, i) => { top++; const s = w.cards[x.k + String(i)]; if (s === 'ok') hazir++; if (s === 'again') tekrar++; });

  const kartaGit = (i: number) => { ekranYaz((p) => { p.card = i; p.flipped = false; }); };
  const cevir = () => { ekranYaz((p) => { p.flipped = !p.flipped; }); };
  const isaretle = (v: 'ok' | 'again') => {
    if (!dept || !yaz) return;
    const id = dept.k + String(kartNo);
    d.degistir(null, (t) => { const c = t.pw[d.program].cards; if (c[id] === v) delete c[id]; else c[id] = v; });
    if (w.cards[id] !== v && kartNo < dept.items.length - 1) kartaGit(kartNo + 1);
  };

  // Klavye (prototip): boşluk çevirir, oklar gezer, H "hazırım".
  const tusRef = useRef<(ev: KeyboardEvent) => void>(() => undefined);
  tusRef.current = (ev: KeyboardEvent) => {
    if (!dept || ev.ctrlKey || ev.metaKey || ev.altKey || yaziAlaniMi(ev.target)) return;
    const kartta = ev.target instanceof HTMLElement && ev.target.id === 'tc-dhp-kart';
    const bosta = ev.target === document.body || ev.target === document.documentElement;
    // Kart bir düğmedir: üzerindeyken boşluk ve Enter tıklama olarak zaten çevirir.
    if (kartta && (ev.key === ' ' || ev.key === 'Enter')) return;
    if (ev.key === ' ' && bosta) { ev.preventDefault(); cevir(); return; }
    if (ev.key === 'ArrowRight' && kartNo < dept.items.length - 1) kartaGit(kartNo + 1);
    else if (ev.key === 'ArrowLeft' && kartNo > 0) kartaGit(kartNo - 1);
    else if (ev.key === 'h' || ev.key === 'H') isaretle('ok');
  };
  useEffect(() => {
    const dinle = (ev: KeyboardEvent) => { tusRef.current(ev); };
    window.addEventListener('keydown', dinle);
    return () => { window.removeEventListener('keydown', dinle); };
  }, []);

  if (!dept) return null;
  const it = dept.items[kartNo];
  if (!it) return null;
  const durum = w.cards[dept.k + String(kartNo)];

  return (
    <div className="tc-dhp">
      <ProgramBandi r={r} />
      <p className="tc-dhy-ton-soluk">Çalışanlarınızı denetçinin soracağı sorulara hazırlayın: soruyu okuyun, cevabı çalışın. Burada puan verilmez; ölçüm Simülasyon'da yapılır.</p>
      <div className="tc-dhp-departmanlar" role="group" aria-label="Departman">
        {depts.map((x) => {
          const k = x.items.filter((_, i) => w.cards[x.k + String(i)] === 'ok').length;
          return (
            <button key={x.k} type="button" aria-pressed={x.k === dept.k} onClick={() => { ekranYaz((p) => { p.dept = x.k; p.card = 0; p.flipped = false; }); }}>
              <PSimge ad={x.ic} /><span><b>{x.n}</b><small>{`${String(k)}/${String(x.items.length)} hazır`}</small></span>
            </button>
          );
        })}
      </div>
      <div className="tc-dhp-kartlar">
        <div>
          <button
            id="tc-dhp-kart" type="button" className={`tc-dhp-kart${e.flipped ? ' tc-dhp-kart-cevrik' : ''}`} aria-label={e.flipped ? 'Kartı soruya çevir' : 'Kartı cevaba çevir'}
            aria-pressed={e.flipped} onClick={cevir}
          >
            {e.flipped ? (
              <span className="tc-dhp-kart-yuz">
                <span className="tc-dhp-ust-etiket"><PSimge ad="bulb" /> İyi cevap nasıl olmalı</span>
                <span className="tc-dhp-kart-metin">{it[1]}</span>
                <small className="tc-dhy-ton-soluk">{it[0]}</small>
              </span>
            ) : (
              <span className="tc-dhp-kart-yuz">
                <span className="tc-dhp-ust-etiket"><PSimge ad="user" /> {`${d.program === 'eydep' ? 'Heyet sorar' : 'Denetçi sorar'} · ${dept.n}`}</span>
                <q className="tc-dhp-kart-metin">{it[0]}</q>
                <small className="tc-dhy-ton-soluk">{`${String(kartNo + 1)} / ${String(dept.items.length)} · Cevap için çevirin`}</small>
              </span>
            )}
          </button>
          <div className="tc-dhp-alt">
            <Dugme simge="chev-left" disabled={kartNo === 0} onClick={() => { kartaGit(kartNo - 1); }}>Önceki</Dugme>
            <div className="tc-dhp-noktalar" role="group" aria-label="Kartlar">
              {dept.items.map((_, i) => {
                const s = w.cards[dept.k + String(i)];
                return <button key={String(i)} type="button" aria-label={`Kart ${String(i + 1)}${s === 'ok' ? ', hazır' : s === 'again' ? ', tekrar' : ''}`} aria-current={i === kartNo ? 'true' : undefined}
                  className={`tc-dhp-nokta${s === 'ok' ? ' tc-dhp-nokta-hazir' : s === 'again' ? ' tc-dhp-nokta-tekrar' : ''}`} onClick={() => { kartaGit(i); }} />;
              })}
            </div>
            <Dugme simge="chev-right" disabled={kartNo === dept.items.length - 1} onClick={() => { kartaGit(kartNo + 1); }}>Sonraki</Dugme>
          </div>
          {yaz && (
            <div className="tc-dhp-dugmeler tc-dhp-orta">
              <Dugme simge="rotate" tur={durum === 'again' ? 'birincil' : 'ikincil'} aria-pressed={durum === 'again'} onClick={() => { isaretle('again'); }}>Tekrar çalışmalıyım</Dugme>
              <Dugme simge="check" tur={durum === 'ok' ? 'birincil' : 'ikincil'} aria-pressed={durum === 'ok'} onClick={() => { isaretle('ok'); }}>Bu soruya hazırım</Dugme>
            </div>
          )}
        </div>
        <div className="tc-dhp-yan">
          <Kart baslik="İlerleme">
            <div className="tc-dhp-sim-puan">
              <Halka yuzde={top ? (hazir / top) * 100 : 0} ton="iyi" boyut="b" />
              <span><b>{`${String(hazir)}/${String(top)}`}</b><small>soruya hazır</small></span>
            </div>
            <dl className="tc-dhp-satirlar">
              <div><dt>Tekrar çalışılacak</dt><dd>{tekrar}</dd></div>
              <div><dt>Hiç bakılmamış</dt><dd>{top - hazir - tekrar}</dd></div>
            </dl>
          </Kart>
          <Kart baslik="Kısayollar"><p className="tc-dhy-ton-soluk">Boşluk çevir · ← → gezin · H hazırım</p></Kart>
          <IpucuKutusu simge="bulb">Kartları süreç sahipleriyle birlikte çalışın; biri denetçi olsun, diğeri cevaplasın.</IpucuKutusu>
        </div>
      </div>
    </div>
  );
}
