import { useEffect, useRef, useState } from 'react';
import { CokSatir, Dugme, IsaretKutusu, Kart } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { CRIT, SCALE } from '../icerik/iso9001.ts';
import { aktifSorular, puanHesapla, puanOner } from '../kurallar/puan.ts';
import type { Cevap } from '../tipler.ts';
import { PUANLAMA_KURALI, puanlamaRehberi, puanTonu, simListesi } from './hesaplar.ts';
import { Halka, IpucuKutusu, ProgramBandi, PSimge, SatirOnayi, useProgramEkrani } from './ortak.tsx';
import { useHizliTur } from './paylasilan.tsx';

const ONERI: Record<string, string> = { '3': '3 · Tam uygun', '2': '2 · Uygun', '1': '1 · Kısmen', '0': '0 · Kanıt yok' };

const yaziAlaniMi = (h: EventTarget | null): boolean =>
  h instanceof HTMLElement && (h.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(h.tagName));

export function Simulasyon() {
  const d = useDenetim();
  const [e, ekranYaz] = useProgramEkrani();
  const hizliTur = useHizliTur();
  const [sifirlaAcik, sifirlaYaz] = useState(false);
  const kb = d.kb;
  const w = kb.calisma;
  const yaz = d.yetki.yazabilir;
  const hizli = e.mode === 'quick' && w.quick.length > 0;
  const liste = simListesi(kb, hizli ? 'quick' : 'full');
  const hepsi = aktifSorular(kb.pg, w.def);
  const cur = Math.max(0, Math.min(liste.length - 1, e.cur));
  const qx = liste[cur];
  const r = puanHesapla(hepsi, w.ans, kb.pg);
  const lr = puanHesapla(liste, w.ans, kb.pg);

  const puanVer = (v: Cevap) => {
    if (!qx || !yaz) return;
    d.degistir('Puan', (t) => {
      const tw = t.pw[d.program];
      if (tw.ans[qx.id] === v) delete tw.ans[qx.id]; else tw.ans[qx.id] = v;
      tw.example = false;
    }, { sessiz: true });
  };
  const gez = (yon: number) => {
    if (yon > 0 && cur === liste.length - 1) { d.git('rapor'); return; }
    ekranYaz((p) => { p.cur = Math.max(0, Math.min(liste.length - 1, cur + yon)); });
  };
  const kipSec = (kip: 'quick' | 'full') => {
    if (kip === 'quick' && w.quick.length === 0) { hizliTur(); return; }
    ekranYaz((p) => {
      if (p.mode === kip) return;
      if (p.mode === 'quick') p.curQ = p.cur; else p.curF = p.cur;
      p.mode = kip;
      p.cur = kip === 'quick' ? p.curQ : p.curF;
    });
  };
  const sifirla = () => {
    sifirlaYaz(false);
    d.degistir('Baştan başlatma', (t) => {
      const tw = t.pw[d.program];
      if (hizli) for (const x of liste) { delete tw.ans[x.id]; delete tw.ev[x.id]; }
      else { tw.ans = {}; tw.ev = {}; tw.done = {}; tw.exDone = {}; }
      tw.example = false;
    }, { bildirim: hizli ? 'Bu turun cevapları silindi' : 'Simülasyon sıfırlandı' });
    ekranYaz((p) => { p.cur = 0; });
  };
  const sifirlaSor = (metin: string) => (
    <SatirOnayi metin={metin} evet="Evet, sıfırla" onayla={sifirla} vazgec={() => { sifirlaYaz(false); }} />
  );

  // Klavye (prototip): 0-3 puan, N uygulanmaz, oklar gezinme. Yazı alanında çalışmaz.
  const tusRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  tusRef.current = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || yaziAlaniMi(ev.target) || sifirlaAcik) return;
    if (['0', '1', '2', '3'].includes(ev.key)) { puanVer(ev.key as Cevap); return; }
    if (ev.key === 'n' || ev.key === 'N') { puanVer('na'); return; }
    if (ev.key === 'ArrowRight') gez(1);
    else if (ev.key === 'ArrowLeft') gez(-1);
  };
  useEffect(() => {
    const dinle = (ev: KeyboardEvent) => { tusRef.current(ev); };
    window.addEventListener('keydown', dinle);
    return () => { window.removeEventListener('keydown', dinle); };
  }, []);

  if (!qx) return <div className="tc-dhp"><ProgramBandi r={r} /><p className="tc-dhy-ton-soluk">Bu programda soru yok.</p></div>;

  const a = w.ans[qx.id];
  const isaretler = w.ev[qx.id] ?? qx.ev.map(() => false);
  const oneri = puanOner(isaretler);
  const dokunuldu = isaretler.some(Boolean);
  const tamam = lr.answered === lr.total;
  const gruplar = kb.pg.GORDER.map((g) => ({ g, sorular: liste.map((x, i) => [x, i] as const).filter(([x]) => x.g === g) })).filter((x) => x.sorular.length);
  const kim = d.program === 'eydep' ? 'Değerlendirici' : 'Denetçi';
  const kanitDegis = (i: number, deger: boolean) => {
    d.degistir(null, (t) => {
      const tw = t.pw[d.program];
      const dizi = (tw.ev[qx.id] ?? qx.ev.map(() => false)).slice();
      dizi[i] = deger;
      tw.ev[qx.id] = dizi;
    });
  };

  return (
    <div className="tc-dhp">
      <ProgramBandi r={r} />
      <div className="tc-dhp-sim">
        <aside className="tc-dhp-sim-harita" aria-label="Soru haritası">
          <div className="tc-dhp-sim-puan">
            <Halka yuzde={r.pct} etiket={r.pct == null ? '–' : String(r.pct)} ton={puanTonu(r.pct)} boyut="b" />
            <span><small>Anlık puan</small><b>{r.verdict ? r.verdict.t : 'Henüz cevap yok'}</b><small>{`${String(r.answered)}/${String(r.total)} cevaplandı`}</small></span>
          </div>
          {hizli && (
            <IpucuKutusu simge="zap">
              {`Hızlı tur: kritikliğe göre seçilmiş ${String(liste.length)} soru.`}
              {yaz && <button type="button" className="tc-dhp-baglanti" onClick={hizliTur}>Yeni tur</button>}
            </IpucuKutusu>
          )}
          {gruplar.map(({ g, sorular }) => (
            <div key={g} className="tc-dhp-sim-grup">
              <div className="tc-dhp-sim-grup-ust">
                <span><PSimge ad={kb.pg.CL[g]?.ic ?? 'file'} /> {kb.pg.CL[g]?.s ?? g}</span>
                <span className="tc-dhy-ton-soluk">{`${String(sorular.filter(([x]) => w.ans[x.id] !== undefined).length)}/${String(sorular.length)}`}</span>
              </div>
              <div className="tc-dhp-hucreler">
                {sorular.map(([x, i]) => {
                  const v = w.ans[x.id];
                  return (
                    <button
                      key={x.id} type="button" title={`${x.c} · ${CRIT[x.w] ?? ''}: ${x.q}`} aria-label={`Soru ${String(i + 1)}, ${x.c}${v === undefined ? ', cevaplanmadı' : `, puan ${v === 'na' ? 'N/A' : v}`}`}
                      aria-current={i === cur ? 'true' : undefined} className={`tc-dhp-hucre${v !== undefined ? ` tc-dhp-p${v}` : ''}${i === cur ? ' tc-dhp-hucre-secili' : ''}`}
                      onClick={() => { ekranYaz((p) => { p.cur = i; }); }}
                    >{i + 1}</button>
                  );
                })}
              </div>
            </div>
          ))}
          {kb.pg.hasDef && (
            <div>
              <IsaretKutusu
                etiket="Savunma sanayi soruları" checked={w.def} disabled={!yaz}
                onChange={(ev) => {
                  const deger = ev.target.checked;
                  d.degistir(null, (t) => { const tw = t.pw[d.program]; tw.def = deger; if (hizli) tw.quick = []; });
                  ekranYaz((p) => { p.mode = 'full'; });
                }}
              />
              <small className="tc-dhy-ton-soluk">AS9100 / AQAP 2110 · ISO puanına katılmaz</small>
            </div>
          )}
          {yaz && (sifirlaAcik
            ? sifirlaSor(hizli ? 'Bu turun cevapları silinsin mi?' : 'Tüm simülasyon cevapları silinsin mi?')
            : <Dugme simge="rotate" title="Cevapları silip baştan başlar; geri alınabilir" onClick={() => { sifirlaYaz(true); }}>{hizli ? 'Turu sıfırla' : 'Simülasyonu sıfırla'}</Dugme>)}
        </aside>

        <div className="tc-dhp-sim-ana">
          <div className="tc-dhp-cubuk">
            <span><PSimge ad={hizli ? 'zap' : 'list'} /> {`${hizli ? 'Hızlı tur' : 'Tam denetim'} · ${String(lr.answered)}/${String(liste.length)} cevaplandı`}</span>
            {yaz && (
              <div className="tc-dhp-dugmeler">
                <Dugme simge="rotate" disabled={!d.geriAlinabilir} title="Son işlemi geri al (Ctrl Z)" onClick={d.geriAl}>Geri al</Dugme>
                {sifirlaAcik
                  ? sifirlaSor(hizli ? `Bu turdaki ${String(lr.answered)} cevap silinsin mi?` : 'Tüm simülasyon cevapları silinsin mi?')
                  : <Dugme simge="rotate" title="Cevapları silip baştan başlar; geri alınabilir" onClick={() => { sifirlaYaz(true); }}>{hizli ? 'Turu sıfırla' : 'Simülasyonu sıfırla'}</Dugme>}
                {hizli
                  ? <><Dugme simge="bolt" onClick={hizliTur}>Yeni tur</Dugme><Dugme simge="x" onClick={() => { kipSec('full'); }}>Hızlı turdan çık</Dugme></>
                  : <Dugme simge="bolt" onClick={() => { kipSec('quick'); }}>Hızlı tura geç</Dugme>}
              </div>
            )}
          </div>
          {w.example && <IpucuKutusu>Rapor ve genel bakışta örnek veri gösteriliyor. Burada kendi cevaplarınız var; puan verdiğinizde örnek kapanır.</IpucuKutusu>}
          {tamam && (
            <div className="tc-dhp-bitti" role="status">
              <PSimge ad="check" />
              <span><b>{hizli ? 'Hızlı tur tamamlandı' : 'Tüm sorular cevaplandı'}</b><small>{`${lr.pct != null ? `Bu turdaki puanınız %${String(lr.pct)}. ` : ''}Açıkları ve aksiyon planını raporda görün.`}</small></span>
              <div className="tc-dhp-dugmeler">
                {yaz && <Dugme simge="rotate" onClick={() => { sifirlaYaz(true); }}>Yeniden başla</Dugme>}
                <Dugme tur="birincil" simge="chart" onClick={() => { d.git('rapor'); }}>Raporu aç</Dugme>
              </div>
            </div>
          )}
          <div className="tc-dhp-balon">
            <div className="tc-dhp-balon-kim">
              <b>{kim}</b>
              <span className="tc-dhp-madde">{qx.c}</span>
              <span>{kb.pg.CL[qx.g]?.n ?? qx.g}</span>
              <span className={qx.w === 3 ? 'tc-dhy-ton-kotu' : qx.w === 2 ? 'tc-dhy-ton-uyari' : 'tc-dhy-ton-soluk'}>{CRIT[qx.w]}</span>
              <span className="tc-dhp-sag tc-dhy-ton-soluk">{`${String(cur + 1)}/${String(liste.length)}`}</span>
            </div>
            <q>{qx.q}</q>
          </div>
          <Kart>
            <div className="tc-dhp-kanit">
              <div className="tc-dhp-kanit-ust">
                <b><PSimge ad="clip" /> Hangi kanıtları gösterebilirsiniz?</b>
                {dokunuldu && oneri ? <span className="tc-dhy-ton-bilgi">{`Önerilen puan: ${ONERI[oneri] ?? oneri}`}</span> : <small className="tc-dhy-ton-soluk">Gösterebildiklerinizi işaretleyin</small>}
              </div>
              {qx.ev.map((k, i) => (
                <IsaretKutusu key={k} etiket={k} checked={!!isaretler[i]} disabled={!yaz} onChange={(ev) => { kanitDegis(i, ev.target.checked); }} />
              ))}
            </div>
            <div className="tc-dhp-olcek-baslik">Puanınız</div>
            <div className="tc-dhp-olcek" role="group" aria-label="Puan">
              {SCALE.map((s) => (
                <button
                  key={s.v} type="button" aria-pressed={a === s.v} disabled={!yaz}
                  className={`tc-dhp-olcek-dugme tc-dhp-p${s.v}${dokunuldu && oneri === s.v && a !== s.v ? ' tc-dhp-oneri' : ''}`}
                  onClick={() => { puanVer(s.v); }}
                >
                  <b>{s.v === 'na' ? '–' : s.v}</b><span>{s.t}</span><small>{s.d}</small>
                </button>
              ))}
            </div>
            <details className="tc-dhp-rehber">
              <summary><PSimge ad="info" /> Bu soruyu nasıl puanlarım? Örnekle</summary>
              <p><b>{qx.c}</b>{` · ${qx.q}`}</p>
              <dl>
                {puanlamaRehberi(qx).map((s) => (
                  <div key={s.v} className={`tc-dhp-p${s.v}`}><dt>{`${s.v === 'na' ? 'N/A' : s.v} · ${s.t}`}</dt><dd>{s.d}</dd></div>
                ))}
              </dl>
              <p><b>Puan düşükse:</b>{` ${qx.fix}`}{qx.w === 3 && <b> Kritik soru: 0 puan majör bulgu riski taşır.</b>}</p>
              <p className="tc-dhy-ton-soluk">{PUANLAMA_KURALI}</p>
            </details>
            {a !== undefined && a !== 'na' && a !== '3' && (
              <div className="tc-dhp-ipucu tc-dhp-yapilacak"><PSimge ad="bulb" /><span><b>Denetimden önce yapılacak</b> {qx.fix}</span></div>
            )}
            <CokSatir
              key={qx.id} etiket="Not · sorumlu, kanıtın yeri, termin" defaultValue={w.notes[qx.id] ?? ''} readOnly={!yaz}
              placeholder="Örn. Kalibrasyon listesi kalite klasöründe, 3 cihaz eksik, sorumlu Ahmet, 15 Ekim"
              onChange={(ev) => { const v = ev.target.value; d.degistir(null, (t) => { t.pw[d.program].notes[qx.id] = v; }); }}
            />
          </Kart>
          <div className="tc-dhp-alt">
            <small className="tc-dhy-ton-soluk"><kbd>0</kbd>–<kbd>3</kbd> puan <kbd>N</kbd> uygulanmaz <kbd>←</kbd><kbd>→</kbd> gezin</small>
            <div className="tc-dhp-dugmeler">
              <Dugme simge="chev-left" disabled={cur === 0} onClick={() => { gez(-1); }}>Önceki</Dugme>
              <Dugme tur="birincil" simge="chev-right" onClick={() => { gez(1); }}>{cur === liste.length - 1 ? 'Raporu gör' : 'Sonraki'}</Dugme>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
