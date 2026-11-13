import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as FareOlayi, type PointerEvent as ImlecOlayi } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { emirKuyrugu } from '../ortak/emir-no.ts';
import type { Derleme } from '../motor/kurallar.ts';
import {
  SAAT_ENI, aralikYuku, durumYazisi, satirKimligi, sureYaz, tasimaSaati, tasinabilir, uzakMi, yukSinifi, yukYuzdesi,
  type KokpitEmri, type KokpitIsi, type KokpitModeli, type KokpitOlcegi, type TurAdayi,
} from './kurallar.ts';

// Kokpit tahtası: tezgâh ya da emir başına bir satır, satırda saat eksenli işler. İş bir düğmedir; yeri CSS değişkeniyle verilir
// (satır içi stil yok), bu yüzden plan değişince işler yeni yerine akarak gider. Taşıma: iş tutulur (sağ tık menüsü, Space ya da çift tık),
// imleci izler, tıklanan yere bırakılır; Esc vazgeçer. Bırakılan yeri sunucu denetler (is-tasi-onizlemesi), tahta yalnız aday tezgâhı gösterir.
// Ay ve Yıl'da satırlar yük hücrelerine döner; hücre o güne iner.

export type TahtaGozu = 'T' | 'S';
export interface CanliYer { m: string; S: number; C: number }
export interface TahtaOzellikleri {
  m: KokpitModeli; cx: Derleme; goz: TahtaGozu; olcek: KokpitOlcegi;
  // Süzgeçten geçen emirler (sipariş gözünün satırları ve tepsi).
  emirler: readonly KokpitEmri[];
  uyar: (job: string) => boolean;
  secEmir: string | null; secIs: string | null;
  sec: (job: string | null, isId: string | null) => void;
  zaman: (t: number) => string;
  // Yazamayan kişide null: tutma kapalıdır.
  tasi: ((isId: string, tezgah: string, S: number) => void) | null;
  // Tepsiden tutulan plansız emrin bırakıldığı yer (ilk adımın tezgâhı ve saati); yazamayan kişide null.
  planaAl: ((emirId: string, tezgah: string, S: number) => void) | null;
  // Önce / sonra açıkken işlerin onaylı plandaki yerleri; iş orada çizilir, üstünde taslakta ne kadar kaydığı yazar.
  once: Record<string, CanliYer> | null;
  gunAc: (gun: number) => void;
  uyari: (ileti: string) => void;
  // Görünüme getirilecek iş (matristen, turdan, ayrıntıdan).
  goster: string | null;
  // Ölçek değişince görünüme gelecek saat (yük hücresinden güne inişte); null şimdidir.
  odak: number | null;
  // Turun öne çıkan hamlesi: işin gideceği yer kesik çerçeveyle gösterilir ve görünüme getirilir.
  oneri: TurAdayi | null;
}

const yerYaz = (el: HTMLElement | null, x: number, w?: number): void => {
  if (!el) return;
  el.style.setProperty('--x', `${String(Math.round(x * 10) / 10)}px`);
  if (w !== undefined) el.style.setProperty('--w', `${String(Math.max(6, Math.round(w * 10) / 10))}px`);
};
const FIS = 'fis:';
const yazimda = (): boolean => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');

// fis: tepsiden tutulan plansız emir; id o emrin ilk adımıdır (planda yeri yoktur).
interface Tasinan { id: string; tut: number; fis?: string }
// Plansız emrin süresi plana alınmadan bilinmez; bırakma çerçevesi bu genişlikte çizilir.
const FIS_SAATI = 2;
interface Hedef { satir: string; S: number; gecerli: boolean }

export function Tahta(o: TahtaOzellikleri) {
  const { m, cx, goz, olcek, emirler, uyar, secEmir, secIs, sec, zaman, tasi, planaAl, once, gunAc, uyari, goster, odak, oneri } = o;
  const px = SAAT_ENI[olcek];
  const en = (m.son - m.bas) * px;
  const kap = useRef<HTMLDivElement | null>(null);
  const [tasinan, setTasinan] = useState<Tasinan | null>(null);
  const [hedef, setHedef] = useState<Hedef | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; tut: number; fis?: boolean } | null>(null);
  const imlecteki = useRef<string | null>(null);
  const emir = useMemo(() => new Map(m.emirler.map((e) => [e.id, e])), [m]);
  const adaylar = useCallback((x: KokpitIsi): string[] => emir.get(x.job)?.adimlar.find((a) => a.id === x.id)?.adaylar ?? [], [emir]);

  const tut = useCallback((id: string, tutma = 0): void => {
    const x = m.isler[id];
    if (!x || !tasi) return;
    const neden = tasinabilir(x);
    if (neden) { uyari(neden); return; }
    setMenu(null); setTasinan({ id, tut: tutma }); setHedef({ satir: goz === 'T' ? satirKimligi(x) : x.job, S: x.S, gecerli: true });
  }, [m, tasi, goz, uyari]);
  const fisAdaylari = useCallback((emirId: string): string[] => (emir.get(emirId)?.adimlar[0]?.adaylar ?? []).filter((t) => !t.startsWith('@')), [emir]);
  const tutFis = useCallback((emirId: string): void => {
    const e = emir.get(emirId), ilk = e?.adimlar[0];
    if (!e || !ilk || !planaAl) return;
    if (goz !== 'T') { uyari('Plana almak için Tezgâh görünümüne geçin'); return; }
    if (e.adimlar.some((a) => m.isler[a.id])) { uyari('Bu emrin bir adımı planda; öteki adımları plan yeniden dizilince yerleşir'); return; }
    if (!fisAdaylari(emirId).length) { uyari('Bu emrin ilk adımı tezgâhta yapılmıyor'); return; }
    setMenu(null); setTasinan({ id: ilk.id, tut: 0, fis: emirId }); setHedef(null);
  }, [emir, m, planaAl, goz, uyari, fisAdaylari]);
  const birak = useCallback((): void => {
    if (tasinan?.fis !== undefined) {
      if (!hedef) { uyari('Emri bir tezgâh satırına bırakın'); return; }
      if (!hedef.gecerli) { uyari('Bu emrin ilk adımı bu tezgâhta yapılamaz'); return; }
      const emirId = tasinan.fis;
      setTasinan(null); setHedef(null);
      planaAl?.(emirId, hedef.satir, hedef.S);
      return;
    }
    const x = tasinan ? m.isler[tasinan.id] : undefined;
    if (!x || !hedef || !tasi) { setTasinan(null); setHedef(null); return; }
    if (!hedef.gecerli) { uyari('Bu adım bu tezgâhta yapılamaz'); return; }
    const tezgah = goz === 'T' ? hedef.satir : x.m;
    setTasinan(null); setHedef(null);
    if (tezgah !== x.m || Math.abs(hedef.S - x.S) > 0.01) tasi(x.id, tezgah, hedef.S);
  }, [tasinan, hedef, m, tasi, planaAl, goz, uyari]);

  // Tutulan iş imleci izler: satır imlecin altındaki satırdır, saat imlecin yeri eksi tutulan noktadır (çeyrek saate oturur).
  const izle = (ev: ImlecOlayi<HTMLDivElement>): void => {
    if (!tasinan) return;
    const x = m.isler[tasinan.id];
    const satir = (ev.target as Element).closest<HTMLElement>('[data-satir]');
    const alan = satir?.querySelector<HTMLElement>('.tc-pyq-alan');
    if (tasinan.fis !== undefined) {
      if (!satir || !alan) { setHedef(null); return; }
      const t = satir.dataset.satir ?? '';
      setHedef({ satir: t, S: tasimaSaati(m.bas + (ev.clientX - alan.getBoundingClientRect().left) / px, m.simdi), gecerli: fisAdaylari(tasinan.fis).includes(t) });
      return;
    }
    if (!x || !satir || !alan) return;
    const kimlik = satir.dataset.satir ?? '';
    const S = tasimaSaati(m.bas + (ev.clientX - alan.getBoundingClientRect().left) / px - tasinan.tut, m.simdi);
    const gecerli = goz === 'T' ? adaylar(x).includes(kimlik) : kimlik === x.job;
    setHedef({ satir: goz === 'T' ? kimlik : x.job, S, gecerli });
  };

  useEffect(() => {
    const tus = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' && (tasinan || menu)) { ev.stopPropagation(); setTasinan(null); setHedef(null); setMenu(null); return; }
      if (yazimda() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (menu && (ev.key === '1' || ev.key === 'Enter')) { ev.preventDefault(); if (menu.fis) tutFis(menu.id); else tut(menu.id, menu.tut); return; }
      if (ev.key !== ' ' || uzakMi(olcek)) return;
      if (tasinan) { ev.preventDefault(); birak(); return; }
      // Odak başka bir düğmedeyken Space o düğmenindir; imleç bir işin üstündeyse iş tutulur.
      const odakDugme = /^(BUTTON|A|SUMMARY)$/.test(document.activeElement?.tagName ?? '') && !document.activeElement?.closest('.tc-pyq-is, .tc-pyq-fis');
      const id = imlecteki.current ?? (odakDugme ? null : secIs);
      if (id?.startsWith(FIS)) { ev.preventDefault(); tutFis(id.slice(FIS.length)); return; }
      if (id && m.isler[id]) { ev.preventDefault(); tut(id); return; }
      // Seçili plansız emir de Space ile tutulur.
      if (!id && !odakDugme && planaAl && secEmir && emir.get(secEmir)?.durum === 'plansiz') { ev.preventDefault(); tutFis(secEmir); }
    };
    document.addEventListener('keydown', tus, true);
    return () => { document.removeEventListener('keydown', tus, true); };
  }, [tasinan, menu, tut, tutFis, birak, secIs, secEmir, emir, planaAl, m, olcek]);

  // Açılışta şimdi görünür; istenen iş görünüme gelir.
  useEffect(() => {
    const k = kap.current; if (!k || typeof k.scrollTo !== 'function') return;
    k.scrollTo({ left: Math.max(0, ((odak ?? m.simdi) - m.bas) * px - 80) });
    // Ölçek değişince şimdiye (ya da istenen güne) dönülür; plan yenilenince kaydırma korunur.
  }, [px, odak]);
  useEffect(() => {
    const el = goster ? kap.current?.querySelector<HTMLElement>(`[data-is="${CSS.escape(goster)}"]`) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [goster, goz, olcek]);
  const oneriAnahtari = oneri ? `${oneri.isId}|${oneri.tezgah}|${String(oneri.baslangic)}` : null;
  useEffect(() => {
    const el = oneriAnahtari ? kap.current?.querySelector<HTMLElement>('[data-oneri]') : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [oneriAnahtari, goz, olcek]);

  const gunSayisi = Math.round((m.son - m.bas) / 24);
  const gunler = Array.from({ length: gunSayisi }, (_, g) => g);
  const eksen = (
    <div className="tc-pyq-satir tc-pyq-eksen">
      <div className="tc-pyq-bas">{goz === 'T' || uzakMi(olcek) ? 'Tezgâh' : 'Emir'}</div>
      <div className="tc-pyq-alan">
        {gunler.filter((g) => olcek !== 'Y' || g % 7 === 0).filter((g) => olcek !== 'A' || g % 7 === 0).map((g) => (
          <button
            type="button" key={g} className="tc-pyq-gun" ref={(el) => { yerYaz(el, g * 24 * px, (uzakMi(olcek) ? 7 : 1) * 24 * px); }}
            title="Bu güne yakınlaş" onDoubleClick={() => { gunAc(g); }} onClick={() => { if (uzakMi(olcek)) gunAc(g); }}
          >{zaman(m.bas + g * 24).slice(0, olcek === 'G' || olcek === '3' ? 9 : 5)}</button>
        ))}
        <span className="tc-pyq-simdi-et" ref={(el) => { yerYaz(el, (m.simdi - m.bas) * px); }}>Şimdi {zaman(m.simdi).slice(-5)}</span>
      </div>
    </div>
  );

  if (uzakMi(olcek)) {
    const adim = olcek === 'Y' ? 7 : 1, isler = Object.values(m.isler);
    const hucreler = gunler.filter((g) => g % adim === 0);
    return (
      <div className="tc-pyq-tahta" data-olcek={olcek} ref={kap}>
        <div className="tc-pyq-ic" ref={(el) => { el?.style.setProperty('--en', `${String(en)}px`); }}>
          {eksen}
          {m.tezgahlar.map((t) => (
            <div className="tc-pyq-satir" key={t.id} data-satir={t.id}>
              <div className="tc-pyq-bas"><b>{t.kod}</b><small>{t.ad}</small></div>
              <div className="tc-pyq-alan">
                {t.fason ? <span className="tc-pyq-not">fason · dış atölye, kapasite izlenmez</span> : hucreler.map((g) => {
                  const y = aralikYuku(cx, isler, t.id, m.bas + g * 24, m.bas + (g + adim) * 24), yuzde = yukYuzdesi(y);
                  const ad = `${t.kod} · ${zaman(m.bas + g * 24).slice(0, 9)}${adim > 1 ? ' haftası' : ''} · ${yuzde === null ? 'kapalı' : `%${String(yuzde)} dolu (${String(Math.round(y.plan))} / ${String(Math.round(y.acik))} sa)`}`;
                  return (
                    <button
                      type="button" key={g} className="tc-pyq-hucre" data-yuk={yukSinifi(y)} disabled={yuzde === null} title={ad} aria-label={ad}
                      ref={(el) => { yerYaz(el, g * 24 * px + 1, adim * 24 * px - 2); }} onClick={() => { gunAc(g); }}
                    ><i ref={(el) => { el?.style.setProperty('--oran', String(Math.min(1, yuzde === null ? 0 : yuzde / 100))); }} /></button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const satirlar: { kimlik: string; bas: string; alt: string; isler: KokpitIsi[]; durum?: string }[] = goz === 'T'
    ? m.tezgahlar.map((t) => ({ kimlik: t.id, bas: t.kod, alt: t.ad, isler: Object.values(m.isler).filter((x) => satirKimligi(x) === t.id) }))
    : emirler.filter((e) => e.durum !== 'plansiz').map((e) => ({ kimlik: e.id, bas: e.no, alt: `${e.urun} · ${durumYazisi(e)}`, isler: e.adimlar.flatMap((a) => m.isler[a.id] ?? []), durum: e.durum }));
  const plansiz = emirler.filter((e) => e.durum === 'plansiz');
  const tasinanIs = tasinan ? m.isler[tasinan.id] : undefined;
  const oneriIsi = oneri ? m.isler[oneri.isId] : undefined;
  const adaySatirlari = goz !== 'T' ? null : tasinan?.fis !== undefined ? new Set(fisAdaylari(tasinan.fis)) : tasinanIs ? new Set(adaylar(tasinanIs)) : null;
  const secili = secEmir ? emir.get(secEmir) : undefined;

  const isDugmesi = (x: KokpitIsi) => {
    const e = emir.get(x.job), canli = once?.[x.id];
    const S = canli ? canli.S : x.S, C = canli ? canli.C : x.C;
    const kayma = canli ? x.S - canli.S : 0;
    const neden = tasinabilir(x);
    const ad = `${e?.no ?? x.job} · ${x.ad} · ${zaman(x.S)} – ${zaman(x.C).slice(-5)}${e ? ` · ${durumYazisi(e)}` : ''}`;
    return (
      <button
        type="button" key={x.id} className="tc-pyq-is" data-is={x.id} data-d={e?.durum ?? 'iyi'} title={ad} aria-label={ad}
        aria-pressed={secIs === x.id} data-emir-secili={secEmir === x.job ? '' : undefined} data-sonuk={uyar(x.job) ? undefined : ''}
        data-sabit={neden ? '' : undefined} data-tasinan={tasinan?.id === x.id ? '' : undefined} data-kaydi={canli && Math.abs(kayma) > 0.25 ? '' : undefined}
        ref={(el) => { yerYaz(el, (S - m.bas) * px, (C - S) * px); }}
        onClick={() => { if (!tasinan) sec(x.job, x.id); }}
        onDoubleClick={(ev) => { ev.preventDefault(); tut(x.id, (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px); }}
        onContextMenu={(ev: FareOlayi<HTMLButtonElement>) => {
          if (!tasi || tasinan) return;
          ev.preventDefault();
          const k = kap.current?.getBoundingClientRect();
          setMenu({ id: x.id, x: ev.clientX - (k?.left ?? 0) + (kap.current?.scrollLeft ?? 0), y: ev.clientY - (k?.top ?? 0) + (kap.current?.scrollTop ?? 0), tut: (ev.clientX - ev.currentTarget.getBoundingClientRect().left) / px });
        }}
        onPointerEnter={() => { imlecteki.current = x.id; }} onPointerLeave={() => { if (imlecteki.current === x.id) imlecteki.current = null; }}
      >
        {x.kilitli && <Simge ad="lock" boyut="k" />}
        <b>{emirKuyrugu(e?.no ?? x.job)}</b><span>{canli && Math.abs(kayma) > 0.25 ? `${kayma > 0 ? '+' : '−'}${sureYaz(kayma)}` : x.ad}</span>
      </button>
    );
  };

  return (
    <div
      className="tc-pyq-tahta" data-olcek={olcek} data-tasima={tasinan ? '' : undefined} ref={kap}
      onPointerMove={izle} onClickCapture={(ev) => { if (tasinan) { ev.preventDefault(); ev.stopPropagation(); birak(); } else if (menu && !(ev.target as Element).closest('.tc-pyq-menu')) setMenu(null); }}
    >
      <div className="tc-pyq-ic" ref={(el) => { el?.style.setProperty('--en', `${String(en)}px`); el?.style.setProperty('--gun', `${String(24 * px)}px`); }}>
        {eksen}
        {plansiz.length > 0 && (
          <div className="tc-pyq-satir tc-pyq-tepsi">
            <div className="tc-pyq-bas"><b>Plana alınacak</b><small>{plansiz.length} emir{planaAl && goz === 'T' ? ' · sağ tık ya da Space ile tut' : ''}</small></div>
            <div className="tc-pyq-alan tc-pyq-fisler"><div>
              {plansiz.map((e) => (
                <button
                  type="button" key={e.id} className="tc-pyq-fis" data-fis={e.id} aria-pressed={secEmir === e.id} data-tasinan={tasinan?.fis === e.id ? '' : undefined}
                  onClick={() => { if (!tasinan) sec(e.id, null); }} onDoubleClick={(ev) => { ev.preventDefault(); tutFis(e.id); }}
                  onContextMenu={(ev: FareOlayi<HTMLButtonElement>) => {
                    if (!planaAl || tasinan || goz !== 'T') return;
                    ev.preventDefault();
                    const k = kap.current?.getBoundingClientRect();
                    setMenu({ id: e.id, fis: true, tut: 0, x: ev.clientX - (k?.left ?? 0) + (kap.current?.scrollLeft ?? 0), y: ev.clientY - (k?.top ?? 0) + (kap.current?.scrollTop ?? 0) });
                  }}
                  onPointerEnter={() => { imlecteki.current = FIS + e.id; }} onPointerLeave={() => { if (imlecteki.current === FIS + e.id) imlecteki.current = null; }}
                >
                  <b>{emirKuyrugu(e.no)}</b><span>{e.urun}</span><small>{e.termin === null ? 'termin yok' : `termin ${zaman(e.termin).slice(6)}`}</small>
                </button>
              ))}
            </div></div>
          </div>
        )}
        {satirlar.map((r) => (
          <div
            className="tc-pyq-satir" key={r.kimlik} data-satir={r.kimlik} data-d={r.durum}
            data-aday={adaySatirlari ? (adaySatirlari.has(r.kimlik) ? 'evet' : 'hayir') : undefined}
          >
            <div className="tc-pyq-bas" title={`${r.bas} · ${r.alt}`}><b>{r.bas}</b><small>{r.alt}</small></div>
            <div className="tc-pyq-alan">
              {r.isler.map(isDugmesi)}
              {oneriIsi && oneri && !tasinanIs && (goz === 'T' ? oneri.tezgah : oneriIsi.job) === r.kimlik && (
                <span className="tc-pyq-hayalet" data-oneri="" ref={(el) => { yerYaz(el, (oneri.baslangic - m.bas) * px, (oneriIsi.C - oneriIsi.S) * px); }}>
                  {goz === 'T' ? '' : `${m.tezgahlar.find((t) => t.id === oneri.tezgah)?.kod ?? ''} · `}{zaman(oneri.baslangic).slice(6)} · −{sureYaz(oneriIsi.S - oneri.baslangic)}
                </span>
              )}
              {oneri?.planaAl !== undefined && !tasinan && goz === 'T' && oneri.tezgah === r.kimlik && (
                <span className="tc-pyq-hayalet" data-oneri="" ref={(el) => { yerYaz(el, (oneri.baslangic - m.bas) * px, FIS_SAATI * px); }}>{zaman(oneri.baslangic).slice(6)} · plana al</span>
              )}
              {tasinan?.fis !== undefined && hedef?.satir === r.kimlik && (
                <span className="tc-pyq-hayalet" data-gecersiz={hedef.gecerli ? undefined : ''} ref={(el) => { yerYaz(el, (hedef.S - m.bas) * px, FIS_SAATI * px); }}>
                  {hedef.gecerli ? `${zaman(hedef.S).slice(6)} · plana al` : 'buraya olmaz'}
                </span>
              )}
              {tasinanIs && hedef?.satir === r.kimlik && (
                <span className="tc-pyq-hayalet" data-gecersiz={hedef.gecerli ? undefined : ''} ref={(el) => { yerYaz(el, (hedef.S - m.bas) * px, (tasinanIs.C - tasinanIs.S) * px); }}>
                  {hedef.gecerli ? `${zaman(hedef.S).slice(6)} · ${hedef.S === tasinanIs.S ? 'yerinde' : `${hedef.S > tasinanIs.S ? '+' : '−'}${sureYaz(hedef.S - tasinanIs.S)}`}` : 'buraya olmaz'}
                </span>
              )}
            </div>
          </div>
        ))}
        <div className="tc-pyq-simdi" ref={(el) => { yerYaz(el, (m.simdi - m.bas) * px); }} />
        {secili && secili.termin !== null && goz === 'T' && (
          <div className="tc-pyq-termin" ref={(el) => { yerYaz(el, (secili.termin! - m.bas) * px); }}><span>Termin {secili.no} · {zaman(secili.termin).slice(6)}</span></div>
        )}
        {menu && (
          <div className="tc-pyq-menu" role="menu" aria-label={emir.get(menu.fis ? menu.id : m.isler[menu.id]?.job ?? '')?.no ?? 'İş'} ref={(el) => { el?.style.setProperty('--x', `${String(menu.x)}px`); el?.style.setProperty('--y', `${String(menu.y)}px`); el?.querySelector('button')?.focus(); }}>
            <button type="button" role="menuitem" onClick={() => { if (menu.fis) tutFis(menu.id); else tut(menu.id, menu.tut); }}><Simge ad="expand" boyut="k" /><span>{menu.fis ? 'Tut ve tahtaya bırak' : 'Yapışarak tut'}<small>öteki işler yerinde kalır</small></span><kbd>1</kbd></button>
            <button type="button" role="menuitem" onClick={() => { const x = m.isler[menu.id]; setMenu(null); if (menu.fis) sec(menu.id, null); else if (x) sec(x.job, x.id); }}><Simge ad="list" boyut="k" /><span>Ayrıntı</span></button>
          </div>
        )}
      </div>
      {tasinan && <p className="tc-pyq-ipucu" role="status">Bırakmak için tıklayın ya da Space · Esc vazgeçer</p>}
      {once && <p className="tc-pyq-ipucu" role="status">Onaylı plan gösteriliyor · işlerin üzerinde taslakta ne kadar kaydığı yazar</p>}
    </div>
  );
}
