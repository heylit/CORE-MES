import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { EmirSecenegi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { Simge } from '../../../../ortak/arayuz/Simge.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { state, useCncSurum } from '../depo.ts';
import { D } from '../durum.ts';
import { fint, fmt, pad2 } from '../bicim.ts';
import { byId, holderIdFor, invKey, machine, material, stockOf, toolById, tools, type KalemStokOzeti } from '../secici.ts';
import { coolHint, cutData, holderOf } from '../hesap/kesme.ts';
import { openDefs, useGorunum, useTuslar } from '../gorunum.ts';
import { Sahne } from '../sahne/Sahne.tsx';
import type { Kalem } from '../veri/tipler.ts';
import { emirSec, emirler, hazirlikKaydi, kurulumTamam, seciliEmir, useCncYetkisi } from '../veri.ts';
import { carkBasildi, carkBirak, carkBirakildi, carkCikti, carkCiz, carkKaydi, sonKartaIn } from './cark.ts';
import { exportCSV, exportJSON, printSheet } from './disa-aktarim.ts';
import { onizlemeBirak, onizlemeCiz, onizlemeSurukle } from './onizleme.ts';
import {
  GENEL_ADIM, K, focusIdx, goRow, isSel, kurulumDinle, kurulumSifirla, kurulumYenile, metaYaz, moveOpt, rebuildAll, tezgahDuzelt, toggle, type CarkAdimi,
} from './satirlar.ts';
import { S, etiket, isaretle, isaretlemeyiKur, isaretler, kurulumKaydi, saat, tamamDurumu } from './secim.ts';
import { Kv, StokMetni, useOran } from './parcalar.tsx';
import './kurulum.css';

// Kurulum görünümü (prototip 738-785 HTML, 17664-17866 arayüz ve olaylar). Emir çubuğu, "seçildi" işaretleri ve "Kurulum tamam"
// bugün köprüde (cerceve-kopru.ts 239-836); burada görünümün parçasıdır. Görünüm ve metinler prototipteki gibidir.

export function useKurulumSurum(): number {
  const [n, artir] = useReducer((x: number) => x + 1, 0);
  useEffect(() => kurulumDinle(artir), []);
  return n + useCncSurum();
}

// Seçili kartın ayrıntısı (prototip detailHTML 17685-17719).
function Ayrinti({ def, opt }: { def: CarkAdimi; opt: Kalem }) {
  const m = machine(), mat = material();
  const [cep, cepYaz] = useState(''), [devir, devirYaz] = useState('');
  useEffect(() => { cepYaz(String((opt as { pockets?: number }).pockets ?? '')); devirYaz(String((opt as { rpm?: number }).rpm ?? '')); }, [opt]);
  let govde: ReactNode = null;
  if (def.key === 'machine') {
    const mm = opt as Kalem & { ctrl: string; taper: string; pockets: number; rpm: number; type: string };
    govde = (
      <>
        <Kv k="Kontrol">{mm.ctrl === 'heid' ? 'Heidenhain TNC (Preset)' : 'ISO / G-kod (G54…)'}</Kv>
        <Kv k="Takım bağlantısı">{mm.taper}</Kv>
        <Kv k={mm.type === 'lathe' ? 'Taret istasyonu' : 'Magazin'}>{mm.pockets} cep</Kv>
        <Kv k="Maks. devir">{fint(mm.rpm)} dev/dk</Kv>
        <div className="tc-ck-duzelt">
          <label>Cep sayısı<input type="number" min={1} max={120} value={cep} onChange={(e) => { cepYaz(e.target.value); }} onBlur={() => { tezgahDuzelt('pockets', cep); }} /></label>
          <label>Maks. devir<input type="number" min={100} max={60000} step={100} value={devir} onChange={(e) => { devirYaz(e.target.value); }} onBlur={() => { tezgahDuzelt('rpm', devir); }} /></label>
        </div>
        <p className="tc-ck-not">Değerler varsayılandır — kendi tezgâhınıza göre düzeltin.</p>
        <div className="tc-ck-dugmeler"><Dugme simge="gear" onClick={() => { openDefs('mach'); }}>Tezgâh tanımları · yeni tezgâh</Dugme></div>
      </>
    );
  } else if (def.isTool) {
    if (opt.kind === 'empty') govde = <p className="tc-ck-not">Bu cep boş kalacak. Sağ / sol ok ile takım seçin.</p>;
    else {
      const hid = holderIdFor(opt, m), cd = cutData(opt, mat, m);
      govde = (
        <>
          <Kv k="Tutucu">{holderOf(opt, m)}</Kv>
          <Kv k="Stok"><StokMetni s={stockOf(invKey(opt))} /></Kv>
          {hid && <Kv k="Tutucu stoğu"><StokMetni s={stockOf(hid)} /></Kv>}
          {opt.d ? <Kv k="Çap">Ø{fmt(opt.d)} mm</Kv> : null}
          {opt.z ? <Kv k="Ağız sayısı">Z{opt.z}</Kv> : null}
          {opt.tm && D.TM[opt.tm] ? <Kv k="Takım tipi">{D.TM[opt.tm]}</Kv> : null}
          {cd && (
            <>
              <div className="tc-ck-kesme">
                <div className="tc-ck-kesme-bas">Kesme verisi · <span className={`tc-ck-iso tc-ck-iso-${mat.iso}`}>{mat.name}</span></div>
                <div className="tc-ck-izgara">
                  {cd.vc ? <div><small>Vc</small><b>{cd.vc}</b><i>m/dk</i></div> : null}
                  {cd.n ? <div><small>n</small><b>{fint(cd.n)}</b><i>dev/dk</i></div> : null}
                  {cd.fz ? <div><small>fz</small><b>{fmt(cd.fz)}</b><i>mm/diş</i></div> : cd.f ? <div><small>f</small><b>{fmt(cd.f)}</b><i>mm/dev</i></div> : null}
                  {cd.F ? <div><small>F</small><b>{fint(cd.F)}</b><i>mm/dk</i></div> : cd.smax ? <div><small>S maks</small><b>{fint(cd.smax)}</b><i>dev/dk</i></div> : null}
                </div>
                {cd.mode && <div className="tc-ck-knot">{cd.mode}</div>}
                {cd.note && <div className="tc-ck-knot">{cd.note}</div>}
                {cd.warn && <div className="tc-ck-uyari">{cd.warn}</div>}
              </div>
              <p className="tc-ck-not">Başlangıç değerleridir; takım üreticisinin kataloğunu esas alın.</p>
            </>
          )}
        </>
      );
    }
  } else if (def.key === 'material') {
    const o = opt as Kalem & { iso: string; vcK: number; vcH: number | null; rho: number };
    govde = (
      <>
        <Kv k="ISO grubu"><span className={`tc-ck-isorozet tc-ck-iso-${o.iso}`}>{o.iso}</span></Kv>
        <Kv k="Vc karbür (ref.)">{o.vcK} m/dk</Kv>
        <Kv k="Vc HSS (ref.)">{o.vcH ? `${String(o.vcH)} m/dk` : 'önerilmez'}</Kv>
        <Kv k="Önerilen soğutma">{byId(D.COOL, coolHint(o as never))?.name}</Kv>
        <Kv k="Yoğunluk">{fmt(o.rho)} g/cm³</Kv>
        <div className="tc-ck-dugmeler"><Dugme simge="gear" onClick={() => { openDefs('mat'); }}>IsMalzemesi tanımları · yeni malzeme</Dugme></div>
      </>
    );
  } else if (def.key === 'coolant') {
    const rec = coolHint(mat);
    govde = (
      <>
        <Kv k="Seçili malzeme">{mat.name}</Kv>
        {rec === opt.id ? <div className="tc-ck-ok"><Simge ad="check" boyut="k" /> Bu malzeme için önerilen</div> : <Kv k="Öneri">{byId(D.COOL, rec)?.name}</Kv>}
      </>
    );
  } else if (def.type === 'multi') {
    const sec = isSel(def, opt);
    govde = (
      <>
        <div className={sec ? 'tc-ck-ok' : 'tc-ck-not'}>{sec ? <><Simge ad="check" boyut="k" /> Kurulum listesinde</> : 'Listede değil'}</div>
        <p className="tc-ck-not">Boşluk tuşu, kart tıklaması veya “Ekle” ile listeye ekle / çıkar.</p>
      </>
    );
  }
  return (
    <section className="tc-ck-ayrinti" aria-live="polite">
      <div className={`tc-ck-dcat tc-ck-renk-${def.col}`}>{def.cat}</div>
      <h3>{opt.name}</h3>
      <div className="tc-ck-dcode">{opt.code ?? ''}</div>
      {opt.desc && <p className="tc-ck-ddesc">{opt.desc}</p>}
      {govde}
    </section>
  );
}

// Kurulum kartı (prototip sheetHTML 17720-17746) ve "seçildi" işaretleri (cerceve-kopru.ts 428-439).
function KurulumKarti({ meta }: { meta: boolean }) {
  const m = machine(), mat = material(), arr = tools(), a = isaretler(), secili = (k: string) => (a[k] === true ? ' tc-ck-secildi' : '');
  const takip = useRef(true), aktif = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (takip.current) aktif.current?.scrollIntoView?.({ block: 'nearest' }); });
  const git = (i: number) => { takip.current = false; goRow(i); setTimeout(() => { takip.current = true; }, 400); };
  const loaded = arr.filter((id) => id !== 'empty').length, gi = GENEL_ADIM + arr.length;
  return (
    <section className="tc-ck-kart">
      {meta && (
        <div className="tc-ck-meta">
          <label>Parça No<input value={state.meta.part} onChange={(e) => { metaYaz('part', e.target.value); }} /></label>
          <label>Program No<input value={state.meta.prog} onChange={(e) => { metaYaz('prog', e.target.value); }} /></label>
          <label>Operatör<input value={state.meta.op} onChange={(e) => { metaYaz('op', e.target.value); }} /></label>
        </div>
      )}
      {state.meta.stock ? <div className="tc-ck-srow"><span>Hammadde</span><b>{state.meta.stock}</b></div> : null}
      <div className="tc-ck-sh">Genel</div>
      {K.defs.slice(0, GENEL_ADIM).map((d, i) => {
        const o = d.type === 'single' ? byId(d.options, d.get()) : null, on = i === K.active;
        return (
          <div key={d.key} ref={on ? aktif : undefined} className={`tc-ck-srow${on ? ' tc-ck-on' : ''}${secili(d.key)}`} onClick={() => { git(i); }}>
            <span>{d.title}</span><b>{o ? o.name : '—'}</b>
          </div>
        );
      })}
      <div className="tc-ck-sh">Takımlar <em>{loaded} / {m.pockets} dolu</em></div>
      <div className="tc-ck-tlist">
        {arr.map((id, p) => {
          const t = toolById(id), ri = GENEL_ADIM + p, on = ri === K.active;
          if (t.kind === 'empty' && !on) return null;
          const cd = cutData(t, mat, m), hk = holderIdFor(t, m);
          const eksik = t.kind !== 'empty' && (stockOf(invKey(t)).st === 'short' || (hk && stockOf(hk).st === 'short'));
          const sub = t.kind === 'empty' ? 'boş' : holderOf(t, m);
          const cdt = cd && !cd.warn ? `${cd.n ? `${fint(cd.n)} dev · ` : `Vc ${String(cd.vc)} · `}${cd.F ? `F${fint(cd.F)}` : `f${fmt(cd.f)}`}` : '';
          return (
            <div key={p} ref={on ? aktif : undefined} className={`tc-ck-trow${on ? ' tc-ck-on' : ''}${secili(`T${String(p + 1)}`)}`} onClick={() => { git(ri); }}>
              <span className="tc-ck-tn">T{pad2(p + 1)}</span>
              <span className="tc-ck-tt">{t.name}<small>{eksik && <><Simge ad="alert" boyut="k" /> stok yetersiz · </>}{sub}</small></span>
              <span className="tc-ck-tc">{cd?.warn ? <Simge ad="alert" boyut="k" /> : cdt}</span>
            </div>
          );
        })}
        {!loaded && <div className="tc-ck-not">Henüz takım seçilmedi.</div>}
      </div>
      {[0, 1].map((j) => {
        const d = K.defs[gi + j]; if (!d || d.type !== 'multi') return null;
        const list = d.list();
        return (
          <div key={d.key}>
            <div className={`tc-ck-sh${secili(d.key)}`}>{d.title} <em>{list.length}</em></div>
            <div className="tc-ck-chips" onClick={() => { git(gi + j); }}>
              {list.map((id) => { const o = byId(d.options, id); return o ? <span key={id}>{o.name}</span> : null; })}
              {!list.length && <span className="tc-ck-mut">—</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// Emir çubuğu ve "Kurulum tamam" (cerceve-kopru.ts 239-836).
function EmirCubugu({ tamamla, tur }: { tamamla: () => void; tur: boolean }) {
  const yetki = useCncYetkisi(), { bildir } = useBildirim();
  const [secenekler, seceneklerYaz] = useState<EmirSecenegi[] | null>(null), [listeHatasi, listeHatasiYaz] = useState(false);
  const [deger, degerYaz] = useState(''), [seciliyor, seciliyorYaz] = useState(false);
  const e = seciliEmir();
  const gorunen = useCallback(() => {
    if (e === null) return '';
    const acik = secenekler === null || secenekler.some((x) => x.id === e.id);
    return acik ? etiket(e) : `${etiket(e)} (açık değil)`;
  }, [e, secenekler]);
  useEffect(() => {
    if (!yetki.emirGorebilir) return;
    let iptal = false;
    emirler().then((l) => { if (!iptal) seceneklerYaz(l); }, () => { if (!iptal) { seceneklerYaz([]); listeHatasiYaz(true); } });
    return () => { iptal = true; };
  }, [yetki.emirGorebilir]);
  useEffect(() => { degerYaz(gorunen()); }, [gorunen]);
  const sec = (metin: string) => {
    const x = (secenekler ?? []).find((o) => etiket(o) === metin.trim());
    // Listede olmayan metin, boş alan ve aynı emir seçim değildir: alan önceki seçime döner. Emirsiz kuruluma dönülmez.
    if (seciliyor) return;
    if (x === undefined || x.id === e?.id) { degerYaz(gorunen()); return; }
    seciliyorYaz(true);
    degerYaz(`${etiket(x)} · açılıyor`);
    emirSec(x.id).catch((h: unknown) => {
      seciliyorYaz(false); degerYaz(gorunen());
      bildir('hata', h instanceof Error ? h.message : 'İşlem yapılamadı.');
    });
  };
  const td = tamamDurumu(), k = S.kurulum;
  const tamamSinifi = k?.gecerli === true ? 'tamam' : k !== null ? 'degisti' : td.hazir ? 'hazir' : '';
  const baslik = k?.gecerli === true ? `Kurulum tamam: ${k.kisi.ad} · ${saat(k.zaman)}`
    : k !== null ? 'Kurulum tamamlandıktan sonra seçimler değişti; yeniden onaylayın.'
      : e === null ? 'Önce üretim emrini seçin.' : td.hazir ? 'Seçimleri onaylayıp kurulumu tamamlayın.' : 'Bütün adımları sırayla seçin.';
  const yer = !yetki.emirGorebilir ? 'Emir listesini görme yetkiniz yok' : listeHatasi ? 'Emir listesi alınamadı'
    : secenekler?.length === 0 ? 'Açık üretim emri yok' : 'Emir no ya da parça no yazın';
  return (
    <div className="tc-ck-emir">
      <label>
        Üretim emri
        <input
          list="tc-ck-emirler" autoComplete="off" placeholder={yer} readOnly={!yetki.yazabilir || !yetki.emirGorebilir} disabled={seciliyor}
          value={deger} onChange={(o) => { degerYaz(o.target.value); if ((secenekler ?? []).some((x) => etiket(x) === o.target.value)) sec(o.target.value); }}
          onBlur={() => { sec(deger); }}
        />
        <datalist id="tc-ck-emirler">{(secenekler ?? []).map((x) => <option key={x.id} value={etiket(x)} />)}</datalist>
      </label>
      {S.isaretleyebilir && (
        <>
          <span className="tc-ck-kisi">{k === null ? '' : `${k.kisi.ad} · ${saat(k.zaman)}${k.gecerli ? '' : ' · değişti'}`}</span>
          <Dugme
            className={`tc-ck-tamam ${tamamSinifi ? `tc-ck-tamam-${tamamSinifi}` : ''}`} simge={k?.gecerli === true ? 'check' : 'clipboard-check'}
            disabled={tur || (!td.hazir && k?.gecerli !== true)} title={baslik} aria-label={baslik} onClick={tamamla}
          >
            <span className="tc-ck-tamam-ad">{k?.gecerli === true ? 'Kurulum tamam' : k !== null ? 'Yeniden onayla' : 'Kurulum tamam'}</span>
            <span className="tc-ck-tamam-kisa">{k?.gecerli === true ? 'Tamam' : k !== null ? 'Yeniden' : 'Tamam'}</span>
            {k?.gecerli !== true && <em>{td.secilen}/{td.toplam}</em>}
          </Dugme>
        </>
      )}
    </div>
  );
}

// Tur bitince çarkın ortasında çıkan onay kutusu (cerceve-kopru.ts 638-682).
function SonOnay({ kapat }: { kapat: () => void }) {
  const [bekliyor, bekliyorYaz] = useState(false), [hata, hataYaz] = useState<string | null>(null);
  const k = S.kurulum, tamam = k?.gecerli === true;
  const onayla = () => {
    bekliyorYaz(true); hataYaz(null);
    kurulumTamam().then((d) => { kurulumKaydi(d); bekliyorYaz(false); }, (h: unknown) => { bekliyorYaz(false); hataYaz(h instanceof Error ? h.message : 'İşlem yapılamadı.'); });
  };
  return (
    <div className="tc-ck-sononay" role="dialog" aria-label="Kurulum tamam">
      <span>{hata ?? (tamam && k ? `Kurulum tamam · ${k.kisi.ad} · ${saat(k.zaman)}` : `${String(tamamDurumu().toplam)} seçim kontrol edildi`)}</span>
      <Dugme onClick={kapat} disabled={bekliyor} data-ilk-odak={tamam || undefined}>{tamam ? 'Kapat' : 'Vazgeç'}</Dugme>
      {!tamam && <Dugme tur="birincil" onClick={onayla} yukleniyor={bekliyor}>Onayla</Dugme>}
    </div>
  );
}

export function Kurulum() {
  useKurulumSurum();
  const yetki = useCncYetkisi();
  const [sifirla, sifirlaYaz] = useState(false), [tur, turYaz] = useState(false), [sonda, sondaYaz] = useState(false);
  const [cekmece, cekmeceYaz] = useState(false);
  const sahne = useRef<HTMLDivElement | null>(null), onizleme = useRef<HTMLDivElement | null>(null);
  const turRef = useRef(false), sondaRef = useRef(false);
  turRef.current = tur; sondaRef.current = sonda;

  useEffect(() => {
    rebuildAll();
    isaretlemeyiKur(yetki.yazabilir && !yetki.saltOnay && seciliEmir() !== null);
    hazirlikKaydi().then((c) => { kurulumKaydi(c.kurulum); }, () => { /* kayıt alınamazsa durum boş kalır */ });
    return () => { carkBirak(); onizlemeBirak(); isaretlemeyiKur(false); };
  }, [yetki.yazabilir, yetki.saltOnay]);

  const sondanCik = useCallback(() => { if (!sondaRef.current) return; sondaYaz(false); sonKartaIn(false); }, []);
  // Son adımdan bir aşağı: çark başa döner, adım adım iner ve "Kurulum tamam" kartında durur (cerceve-kopru.ts 683-704).
  const sonaGit = useCallback(() => {
    if (turRef.current || sondaRef.current || seciliEmir() === null) return;
    const d = K.defs[K.active]; if (d) isaretle(d.key);
    if (!tamamDurumu().hazir && S.kurulum?.gecerli !== true) return;
    turYaz(true);
    const toplam = K.defs.length, aralik = Math.max(90, Math.min(240, 4200 / toplam));
    K.active = 0; kurulumYenile();
    let i = 0;
    const adimla = () => {
      i += 1;
      if (i < toplam) { K.active = i; kurulumYenile(); setTimeout(adimla, aralik); return; }
      turYaz(false); sondaYaz(true); sonKartaIn(true);
    };
    setTimeout(adimla, 700);
  }, []);

  const { burada } = useGorunum();
  const tus = useCallback((e: KeyboardEvent) => {
    const sonAdim = K.active === K.defs.length - 1;
    if (turRef.current) { e.preventDefault(); return; }
    if (sondaRef.current) { sondanCik(); if (e.key === 'Escape') e.preventDefault(); return; }
    const k = e.key; let h = true;
    if (S.isaretleyebilir && sonAdim && ['ArrowDown', 'Enter', 's', 'S'].includes(k)) { e.preventDefault(); sonaGit(); return; }
    if (k === 'ArrowDown' || k === 's' || k === 'S') goRow(K.active + 1);
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') goRow(K.active - 1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') moveOpt(1);
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') moveOpt(-1);
    else if (k === 'PageDown') goRow(K.active + 5); else if (k === 'PageUp') goRow(K.active - 5);
    else if (k === 'Home') goRow(0); else if (k === 'End') goRow(K.defs.length - 1);
    else if (k === 'Enter') goRow(K.active + 1);
    else if (k === ' ') toggle();
    else h = false;
    if (h) e.preventDefault();
  }, [sondanCik, sonaGit]);
  useTuslar(burada, tus);

  // Tekerlek: adım; Shift+tekerlek ya da yatay: seçim (prototip 17810-17818). Pasif olmayan dinleyici gerekir.
  useEffect(() => {
    const el = sahne.current; if (!el) return;
    let accX = 0, accY = 0, lastStep = 0;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      if (turRef.current) return;
      if (sondaRef.current) { sondanCik(); return; }
      let dx = e.deltaX, dy = e.deltaY; if (e.deltaMode === 1) { dx *= 33; dy *= 33; }
      if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) { dx = dy; dy = 0; }
      if (Math.abs(dx) > Math.abs(dy)) { accX += dx; accY = 0; } else { accY += dy; accX = 0; }
      const now = performance.now(); if (now - lastStep < 85) return;
      if (Math.abs(accY) >= 40) { goRow(K.active + (accY > 0 ? 1 : -1)); accY = 0; lastStep = now; }
      else if (Math.abs(accX) >= 40) { moveOpt(accX > 0 ? 1 : -1); accX = 0; lastStep = now; }
    };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => { el.removeEventListener('wheel', tekerlek); };
  }, [sondanCik]);

  const def = K.defs[K.active], k = focusIdx(K.active), opt = def?.options[k], m = machine();
  const ilerleme = useOran<HTMLSpanElement>(K.defs.length ? (K.active + 1) / K.defs.length : 0);
  if (!def || !opt) return null;
  const odak = `${opt.name}${def.type === 'multi' ? (isSel(def, opt) ? '  ✓ listede' : '  · listede değil') : ''}`;
  const onizlemeEtiketi = K.pTab === 'mag' ? `${m.type === 'lathe' ? 'Taret · ' : 'Magazin · '}${String(m.pockets)} cep${def.isTool ? ` · T${pad2((def.pocket ?? 0) + 1)}` : ''}` : opt.name;
  const asagi = () => { if (S.isaretleyebilir && K.active === K.defs.length - 1 && !sondaRef.current) sonaGit(); else goRow(K.active + 1); };

  return (
    <div className="tc-ck-kurulum">
      <div className="tc-ck-arac">
        <span className="tc-ck-tezgah">{m.name}</span>
        <span className="tc-ck-ilerleme" ref={ilerleme}><i /></span>
        <div className="tc-ck-arac-dugme">
          <Dugme simge="printer" onClick={printSheet}>Yazdır</Dugme>
          <Dugme simge="download" onClick={exportCSV}>CSV</Dugme>
          <Dugme simge="download" className="tc-ck-dar-gizle" onClick={exportJSON}>JSON</Dugme>
          {yetki.yazabilir && <Dugme simge="rotate" title="Kurulumu varsayılana dön" onClick={() => { sifirlaYaz(true); }}>Sıfırla</Dugme>}
        </div>
      </div>
      <EmirCubugu tamamla={sonaGit} tur={tur} />
      <div className="tc-ck-govde">
        <div
          ref={sahne} className={`tc-ck-sahne${tur ? ' tc-ck-turda' : ''}`}
          onPointerDown={(e) => { if (turRef.current || (e.target as HTMLElement).closest('button')) return; if (sondaRef.current && !(e.target as HTMLElement).closest('.tc-ck-sononay')) sondanCik(); carkBasildi(e.clientX, e.clientY); e.currentTarget.setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { carkKaydi(e.clientX, e.clientY); }}
          onPointerUp={(e) => { carkBirakildi(e.clientX, e.clientY, true); }}
          onPointerCancel={(e) => { carkBirakildi(e.clientX, e.clientY, false); }}
          onPointerLeave={carkCikti}
        >
          <Sahne ciz={carkCiz} sinif="tc-ck-tuval" />
          <div className="tc-ck-adim-bilgi">
            <div className="tc-ck-adim">ADIM <b>{K.active + 1}</b> / <span>{K.defs.length}</span>{isaretler()[def.key] === true && <span className="tc-ck-rozet"><Simge ad="check" boyut="k" /> seçildi</span>}</div>
            <div className="tc-ck-satir-adi">{def.title}</div>
            <div className="tc-ck-odak">{odak}</div>
          </div>
          <div className="tc-ck-kontroller">
            <button type="button" className="tc-ck-cbtn" title="Önceki seçenek" aria-label="Önceki seçenek" onClick={() => { moveOpt(-1); }}><Simge ad="chev-left" /></button>
            <div className="tc-ck-dikey">
              <button type="button" className="tc-ck-cbtn" title="Önceki adım" aria-label="Önceki adım" onClick={() => { goRow(K.active - 1); }}><Simge ad="up" /></button>
              <button type="button" className="tc-ck-cbtn" title="Sonraki adım" aria-label="Sonraki adım" onClick={asagi}><Simge ad="down" /></button>
            </div>
            <button type="button" className="tc-ck-cbtn" title="Sonraki seçenek" aria-label="Sonraki seçenek" onClick={() => { moveOpt(1); }}><Simge ad="chev-right" /></button>
            {def.type === 'multi' && <button type="button" className="tc-ck-cbtn tc-ck-genis" onClick={toggle}>{isSel(def, opt) ? 'Çıkar' : 'Ekle'}</button>}
          </div>
          <div className="tc-ck-ipucu">
            <kbd>Tekerlek</kbd> / <kbd>▲</kbd><kbd>▼</kbd> adım değiştir<br />
            <kbd>Shift+Tekerlek</kbd> / <kbd>◀</kbd><kbd>▶</kbd> seçim yap<br />
            <kbd>Enter</kbd> sonraki adım · <kbd>Boşluk</kbd> listeye ekle<br />
            Sürükle: çarkı çevir · Karta tıkla: seç
          </div>
          {sonda && <SonOnay kapat={sondanCik} />}
        </div>
        <aside className={`tc-ck-yan${cekmece ? ' tc-ck-acik' : ''}`}>
          <button type="button" className="tc-ck-cekmece" onClick={() => { cekmeceYaz(!cekmece); }}><Simge ad={cekmece ? 'down' : 'up'} boyut="k" /> Kurulum Kartı</button>
          <div className="tc-ck-yan-kaydir">
            <KurulumKarti meta />
          </div>
          <Ayrinti def={def} opt={opt} />
          <div
            ref={onizleme} className="tc-ck-onizleme"
            onPointerDown={(e) => { onizlemeSurukle(e.clientX); e.currentTarget.setPointerCapture?.(e.pointerId); }}
            onPointerMove={(e) => { if (e.buttons) onizlemeSurukle(e.clientX); }}
            onPointerUp={() => { onizlemeSurukle(null); }} onPointerCancel={() => { onizlemeSurukle(null); }}
          >
            <Sahne ciz={(c) => { onizlemeCiz(c, K.defs[K.active], K.defs[K.active]?.options[focusIdx(K.active)]); }} sinif="tc-ck-tuval" />
            <div className="tc-ck-sekme" role="tablist">
              <button type="button" role="tab" aria-selected={K.pTab === 'model'} className={K.pTab === 'model' ? 'tc-ck-on' : ''} onClick={() => { K.pTab = 'model'; K.pKey = ''; kurulumYenile(); }}>Model</button>
              <button type="button" role="tab" aria-selected={K.pTab === 'mag'} className={K.pTab === 'mag' ? 'tc-ck-on' : ''} onClick={() => { K.pTab = 'mag'; kurulumYenile(); }}>Magazin</button>
            </div>
            <div className="tc-ck-dondur">sürükle: döndür</div>
            <div className="tc-ck-onizleme-adi">{onizlemeEtiketi}</div>
          </div>
        </aside>
      </div>
      <OnayPenceresi
        acik={sifirla} baslik="Kurulumu sıfırla" onayMetni="Sıfırla" tehlikeli
        onayla={() => { sifirlaYaz(false); kurulumSifirla(); }} vazgec={() => { sifirlaYaz(false); }}
      >
        Kurulum seçimleri varsayılana dönsün mü? (Stok ve kütüphane kayıtları korunur)
      </OnayPenceresi>
    </div>
  );
}
