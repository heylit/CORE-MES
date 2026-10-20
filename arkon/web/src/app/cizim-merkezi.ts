import { AKStore } from '../data/store';
import { merkezBagi, merkezKontrolIstegi, merkezUyarilari } from '../data/cizim-merkezi';
import { I, html, useEffect, useState } from './temel';

/* ══════════ Çizim Merkezi'nden dosya alma (kart #800) ══════════
   Yalnız TMI'ye bağlıyken vardır. Merkezde yayındaki PDF ve 3B modeller seçilir; dosya Arkon'un kendi deposuna kopyalanır. Arkon'da
   yüklenen dosya merkeze gitmez. Kayıtlı dosyanın merkezdeki yayındaki özeti değişirse "Yeni revizyon var" görünür. */
export const merkezVar = () => AKStore.status().mode === 'server';

const YENILEME_MS = 60000;

/** Paketteki merkez dosyalarının durumu: belge no -> 'yeni-revizyon' | 'yayindan-kalkti' (güncel olan yok sayılır). Hata sessizdir: rozet çıkmaz. */
export function useMerkezUyarilari(files) {
  const [uyari, setUyari] = useState<Record<number, string>>({});
  const istek = merkezVar() ? merkezKontrolIstegi(files || []) : [];
  const imza = istek.map(x => x.belgeId + ':' + x.ozet).join(',');
  useEffect(() => {
    if (!imza) { setUyari({}); return; }
    let canli = true;
    const sor = () => AKStore.Server.merkezKontrol(imza.split(',').map(c => { const [b, o] = c.split(':'); return { belgeId: Number(b), ozet: o }; }))
      .then(d => { if (canli) setUyari(merkezUyarilari(d)); }).catch(() => { if (canli) setUyari({}); });
    sor();
    const t = setInterval(sor, YENILEME_MS);
    return () => { canli = false; clearInterval(t); };
  }, [imza]);
  return uyari;
}

/** Dosya satırındaki merkez rozeti ve tek dokunuşluk güncelleme. */
export function MerkezRozeti({ f, uyari, mesgul, onGuncelle }) {
  if (!merkezBagi(f)) return null;
  const durum = uyari[f.merkez];
  if (durum === 'yeni-revizyon') {
    return html`<span className="chip" style=${{ '--c': 'var(--hazard)' }}><i></i>Yeni revizyon var</span><button className="btn pri" disabled=${mesgul} onClick=${() => onGuncelle(f)}><${I} n="rotate" s=${16} />Güncelle</button>`;
  }
  if (durum === 'yayindan-kalkti') return html`<span className="chip" style=${{ '--c': 'var(--idle)' }}><i></i>Merkezde yayından kalktı</span>`;
  return html`<span className="chip" style=${{ '--c': 'var(--done)' }}><i></i>Çizim Merkezi</span>`;
}

export function MerkezSecici({ onPick, onClose }) {
  const [q, setQ] = useState(''), [rows, setRows] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(0);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      AKStore.Server.merkezBelgeleri(q).then(r => { if (live) { setRows(r || []); setErr(''); } })
        .catch(e => { if (live) { setRows([]); setErr(e.message || 'Çizim Merkezi listesi alınamadı'); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  // Öteki pencerelerle aynı: Esc yalnız Kapat düğmesinin yaptığını yapar; kapanışı üst bileşen verir.
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const sec = async b => { setBusy(b.id); try { await onPick(b); } finally { setBusy(0); } };
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" role="dialog" aria-label="Çizim Merkezi'nden ekle" style=${{ width: 'min(720px, 100%)' }}>
    <div className="ov-h"><div><span className="over">Çizim Merkezi</span><h2>Yayındaki çizimler</h2><p>Yalnız yayındaki PDF ve 3B modeller listelenir. Seçilen dosya pakete kopyalanır.</p></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    <input value=${q} onChange=${e => setQ(e.target.value)} placeholder="Belge adı ile ara" aria-label="Belge ara" />
    <div className="lglist" style=${{ marginTop: 12 }}>${(rows || []).map(b => html`<button key=${b.id} className="lgrow" disabled=${busy !== 0} onClick=${() => sec(b)}>
      <div><b>${b.ad}</b><small>Rev ${b.harf} · ${b.dosyaAdi}</small></div><span className=${'dk ' + (b.tip === 'pdf' ? 'pdf' : 'step')}>${b.tip === 'pdf' ? 'PDF' : '3B'}</span><${I} n=${busy === b.id ? 'rotate' : 'plus'} s=${18} /></button>`)}
    ${err ? html`<small className="muted">${err}</small>` : rows === null ? html`<small className="muted">Yükleniyor…</small>` : !rows.length ? html`<small className="muted">Yayında uygun belge yok.</small>` : null}</div>
  </div></div>`;
}
