import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import { adimPaylari, fasonMu, payNedeni, type KokpitModeli } from './kurallar.ts';
import type { TaslakYazici } from './taslak.ts';

// Elle böl (3488 c): adımın adedi parçalara ayrılır, her parça adımın uygun bir tezgâhında ayrı iş (pay) olur. Komut kişinin taslağına yazılır ve
// önce etkisiyle gösterilir (etki.tsx, Adıma sorun bildir ile aynı akış). Parçaların yerini motor seçer; parça tahtadan ayrıca taşınabilir.
// Bölme yalnız plandadır, üretim emrini partiye bölmez. Kural ve sınırlar (toplam, tezgâh) sunucudadır; burada girilen sayının düzgünlüğü denetlenir.
// 3681: başlamış adım da bölünür. Çalışan tezgâhın payı 1. paydır; sayımı olan pay kilitlidir (tezgâhı sabit, adedi sayılandan az olamaz,
// silinemez). Eşit N ve "Kalanı yeniden böl" yalnız kalan adedi (adet - sayılan) paylaştırır.

export const PARCA_EN_COK = 6;
// sayilan: payın sayılmış adedi (başlamış adımda); ilk: payın kayıtlı adedi (fazla sayımdan sayılandan az kalmış payı kayıt aynen tutar).
export interface Parca { adet: string; tezgah: string; sayilan?: number; ilk?: number }
export interface BaslamisAdim { calisan: string; sayimlar: Readonly<Record<string, number>> }
export interface MevcutPay { m: string; adet: number; sayilan?: number }
const sayilanDe = (p: Parca): number => p.sayilan ?? 0;
// Başlamış adımda çalışan pay (ilk) ve sayımı olan pay kilitlidir.
export const kilitliPay = (l: readonly Parca[], i: number, baslamis: boolean): boolean => baslamis && (i === 0 || sayilanDe(l[i]!) > 0);
// Önerilen bölme: kayıtlı bölme varsa o; yoksa planda görünen paylar; yoksa adet ilk iki tezgâha yarı yarıya (kalan ilk parçaya).
// Başlamış adımda çalışan tezgâh 1. paydır ve yarı yarıya yalnız kalan adet paylaşılır (sayılan 1. payda kalır).
export function ilkParcalar(adet: number, tezgahlar: readonly string[], kayitli: readonly { adet: number; m: string }[] | null, baslamis: BaslamisAdim | null = null, mevcut: readonly MevcutPay[] = []): Parca[] {
  const kaynak = kayitli !== null && kayitli.length >= 2 ? kayitli.map((p) => ({ adet: p.adet, m: p.m })) : mevcut.length >= 2 ? mevcut.map((p) => ({ adet: p.adet, m: p.m })) : null;
  if (kaynak !== null) {
    const l = kaynak.map((p): Parca => {
      const sayilan = baslamis?.sayimlar[p.m] ?? 0;
      return { adet: String(p.adet), tezgah: p.m, ...(baslamis ? { sayilan, ilk: p.adet } : {}) };
    });
    const i = baslamis ? l.findIndex((p) => p.tezgah === baslamis.calisan) : -1;
    return i > 0 ? [l[i]!, ...l.filter((_, j) => j !== i)] : l;
  }
  if (baslamis !== null) {
    const s = baslamis.sayimlar[baslamis.calisan] ?? 0, kalan = Math.max(0, adet - s), a = Math.ceil(kalan / 2);
    const diger = tezgahlar.find((t) => t !== baslamis.calisan) ?? baslamis.calisan;
    return [{ adet: String(s + a), tezgah: baslamis.calisan, sayilan: s, ilk: s + a }, { adet: String(kalan - a), tezgah: diger, sayilan: 0 }];
  }
  const a = Math.ceil(adet / 2);
  return [{ adet: String(a), tezgah: tezgahlar[0] ?? '' }, { adet: String(adet - a), tezgah: tezgahlar[1] ?? tezgahlar[0] ?? '' }];
}
// Girilen parçalar: her adet pozitif tam sayı ve tezgâhı seçili olmalı; toplam adımın adedi olmalı; sayımı olan payın adedi sayılandan az olamaz.
// Hata yoksa komutun payları.
export function parcaDenetimi(l: readonly Parca[], adet: number): { paylar: { adet: number; tezgah: string }[] | null; toplam: number; hata: string | null } {
  const sayilar = l.map((p) => (/^\d+$/.test(p.adet.trim()) ? Number(p.adet.trim()) : NaN));
  const toplam = sayilar.reduce((t, n) => t + (Number.isFinite(n) ? n : 0), 0);
  if (l.length < 2) return { paylar: null, toplam, hata: 'En az iki parça girin.' };
  if (sayilar.some((n) => !Number.isInteger(n) || n < 1)) return { paylar: null, toplam, hata: 'Her parçanın adedi 1 ya da daha çok tam sayı olmalı.' };
  if (l.some((p) => p.tezgah === '')) return { paylar: null, toplam, hata: 'Her parçanın tezgâhını seçin.' };
  const az = l.findIndex((p, i) => sayilanDe(p) > sayilar[i]! && sayilar[i] !== p.ilk);
  if (az >= 0) return { paylar: null, toplam, hata: `Parça ${String(az + 1)} adedi sayılandan az (sayılan ${String(sayilanDe(l[az]!))}).` };
  if (toplam !== adet) return { paylar: null, toplam, hata: `Parçaların toplamı adımın adedi (${String(adet)}) olmalı.` };
  return { paylar: l.map((p, i) => ({ adet: sayilar[i]!, tezgah: p.tezgah })), toplam, hata: null };
}

// Eşit N (3661): parça sayısını N'e getirir, adedi eşit paylaştırır (kalan ilk parçalara: 100/3 = 34+33+33). Var olan parçaların tezgâhı
// korunur, yeni parçalar sıradaki uygun tezgâhı alır; elle girilmiş adetlerin üstüne yazar. Toplam denetimi sunucudadır.
// 3681: sayımı olan pay N'e inmek için silinmez; paylaşılan yalnız kalandır (adet - toplam sayılan), her payın adedi sayılanı + payıdır.
export function esitParcalar(l: readonly Parca[], n: number, adet: number, tezgahlar: readonly string[]): Parca[] {
  const tutulan = l.filter((p, i) => i < n || sayilanDe(p) > 0);
  const hepsi: Parca[] = [...tutulan, ...Array.from({ length: Math.max(0, n - tutulan.length) }, (_, k) => ({ adet: '', tezgah: tezgahlar[(tutulan.length + k) % Math.max(tezgahlar.length, 1)] ?? '' }))];
  const sayilan = l.reduce((t, p) => t + sayilanDe(p), 0), kalan = Math.max(0, adet - sayilan), taban = Math.floor(kalan / hepsi.length), artan = kalan % hepsi.length;
  return hepsi.map((p, i) => ({ ...p, adet: String(sayilanDe(p) + taban + (i < artan ? 1 : 0)) }));
}
// Kalanı yeniden böl: parça sayısı aynı kalır, kalan adet bütün paylara (biten payın boşalan tezgâhı dahil) eşit dağıtılır.
export const kalaniYenidenBol = (l: readonly Parca[], adet: number, tezgahlar: readonly string[]): Parca[] => esitParcalar(l, l.length, adet, tezgahlar);
// Kalanı birleştir: kalan adet tek paya (hedef) verilir, öteki paylar sayılanlarında kapanır; sayımı olmayan ve çalışan olmayan pay kalkar.
export function kalaniBirlestir(l: readonly Parca[], hedef: number, adet: number): Parca[] {
  const kalan = Math.max(0, adet - l.reduce((t, p) => t + sayilanDe(p), 0));
  return l.flatMap((p, i): Parca[] => (i === hedef || i === 0 || sayilanDe(p) > 0 ? [{ ...p, adet: String(sayilanDe(p) + (i === hedef ? kalan : 0)) }] : []));
}
// Seçilen payları hedefte birleştirir: adetler toplanır, hedef kendi tezgâhında kalır. Sayımı olan ya da çalışan pay hedef değilse birleşmez.
export function secilenleriBirlestir(l: readonly Parca[], secili: readonly number[], hedef: number, baslamis: boolean): { l: Parca[]; hata: string | null } {
  if (secili.length < 2 || !secili.includes(hedef)) return { l: [...l], hata: 'En az iki pay seçin.' };
  const digerleri = secili.filter((i) => i !== hedef);
  if (digerleri.some((i) => kilitliPay(l, i, baslamis))) return { l: [...l], hata: 'Sayımı olan ya da çalışan pay hedef olmadan birleştirilemez; sayımı olan payı hedef seçin ya da "Kalanı birleştir" kullanın.' };
  const sayilar = secili.map((i) => (/^\d+$/.test(l[i]!.adet.trim()) ? Number(l[i]!.adet.trim()) : NaN));
  if (sayilar.some((n) => !Number.isFinite(n))) return { l: [...l], hata: 'Birleştirmeden önce seçili payların adedini tam sayı yazın.' };
  const toplam = sayilar.reduce((t, n) => t + n, 0);
  return { l: l.flatMap((p, i): Parca[] => (digerleri.includes(i) ? [] : i === hedef ? [{ ...p, adet: String(toplam) }] : [p])), hata: null };
}
// Adım neden bölünemez (sunucudaki elleBolAdimi ile aynı kapılar); bölünebiliyorsa null. Düğme pasif kalır, neden satırda yazılır.
// 3681: başlamış adım bölünür. Motor kayıtlı bölmeyi uygulayamazsa nedeni (KokpitModeli.bolme) panelde ayrıca yazılır; bölme yeniden düzenlenebilir.
export function bolunemezNedeni(x: { basladi: boolean; bitti?: boolean; fason: boolean } | undefined, adet: number): string | null {
  if (x?.bitti === true) return 'Bitmiş adım bölünmez';
  if (x?.fason === true) return 'Fason adım bölünmez';
  if (adet < 2) return 'Adedi bölmeye yetmiyor (en az 2)';
  return null;
}

// 3792: Etkisini gör sonrası bölünmüş plan tahtada taslak olarak görünür; panel gizlenir (değerleri durur) ve Kokpit bu isteği çizer.
// Vazgeç ve Düzenle bölme komutunu taslaktan geri alır, panel girilen değerlerle yeniden görünür.
export interface BolOnizlemeIstegi { isId: string; plan: Record<string, unknown>; uygula: () => void; vazgec: () => void }
// Sunucunun planında adım iki ya da daha çok paylıysa tahtada gösterilir; tek parçaya dönen bölme (Bölmeyi kaldır) panelde etkisiyle kalır.
export function plandaPayVar(plan: Record<string, unknown> | undefined, isId: string): boolean {
  const ops = plan?.['ops'];
  if (typeof ops !== 'object' || ops === null) return false;
  return Object.keys(ops).filter((k) => k === isId || k.startsWith(`${isId}~`)).length >= 2;
}

export interface ElleBolOzellikleri {
  c: PlanlamaCalismasi;
  m: Pick<KokpitModeli, 'emirler' | 'tezgahlar' | 'isler'> & Partial<Pick<KokpitModeli, 'bolme'>>;
  isId: string;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  kapat: () => void;
  onizleme?: ((o: BolOnizlemeIstegi | null) => void) | null;
}

export function ElleBol({ c, m, isId, taslak, yazabilir, kapat, onizleme = null }: ElleBolOzellikleri) {
  const e = m.emirler.find((x) => x.adimlar.some((a) => a.id === isId));
  const a = e?.adimlar.find((x) => x.id === isId);
  const tezgahlar = (a?.adaylar ?? []).filter((t) => !fasonMu(t));
  // Tek paylı kayıt bölme değil, birleştirmedir (motor adımı bölmez).
  const kayit = (c as unknown as { elleBol?: Record<string, { adet: number; m: string }[]> }).elleBol?.[isId] ?? null;
  const kayitli = kayit !== null && kayit.length >= 2 ? kayit : null;
  const adet = e?.adet ?? 0;
  const x = m.isler[isId], baslamis = x?.basladi === true && x.bitti !== true;
  const paylar0 = adimPaylari(m, isId);
  const [ilk] = useState(() => {
    const sayimlar: Record<string, number> = {};
    if (x !== undefined) for (const y of paylar0) sayimlar[y.m] = y.pay?.sayilan ?? (paylar0.length === 1 ? y.sayilan ?? 0 : 0);
    const bilgi: BaslamisAdim | null = baslamis && x !== undefined ? { calisan: x.m, sayimlar } : null;
    const mevcut = paylar0.map((y): MevcutPay => ({ m: y.m, adet: y.pay?.adet ?? 0, sayilan: y.pay?.sayilan ?? 0 }));
    return ilkParcalar(adet, tezgahlar, kayitli, bilgi, mevcut);
  });
  const [l, setL] = useState<Parca[]>(ilk);
  const [esitti, setEsitti] = useState(false);
  const [secili, setSecili] = useState<number[]>([]);
  const [hedef, setHedef] = useState(0);
  const [ham, setHam] = useState<string | null>(null);
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: (s) => { if (s === 'uygulandi' && onizleme !== null) kapat(); } });
  const etkideki = durum.tur === 'etki' ? durum.e : null;
  const tahtada = onizleme !== null && etkideki !== null && plandaPayVar(etkideki.plan, isId);
  const son = useRef({ uygula, vazgec });
  son.current = { uygula, vazgec };
  const tahtadaRef = useRef(false);
  tahtadaRef.current = tahtada;
  const taslakRef = useRef(taslak);
  taslakRef.current = taslak;
  useEffect(() => {
    if (onizleme === null || !tahtada || etkideki === null || etkideki.plan === undefined) return;
    const plan = etkideki.plan;
    onizleme({ isId, plan, uygula: () => { void son.current.uygula(etkideki); }, vazgec: () => { void son.current.vazgec(); } });
    return () => { onizleme(null); };
  }, [onizleme, tahtada, etkideki, isId]);
  // Panel başka bir yerden kapanırsa (öteki panel açılırsa) görünmeyen bölme taslakta kalmasın.
  useEffect(() => () => { if (tahtadaRef.current) void taslakRef.current?.geriAl(false, false); }, []);
  const gizliydi = useRef(false);
  useEffect(() => {
    if (gizliydi.current && !tahtada) kok.current?.querySelector<HTMLElement>('input')?.focus();
    gizliydi.current = tahtada;
  }, [tahtada]);
  const kilitli = !yazabilir || taslak === null || taslak.mesgul || durum.tur === 'hesap' || durum.tur === 'etki';
  const d = parcaDenetimi(l, adet);
  const tek = l.length === 1;
  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  const kok = useRef<HTMLElement>(null);
  useEffect(() => { kok.current?.scrollIntoView?.({ block: 'start' }); }, []);
  const sifirla = (yeni: Parca[], n = false): void => { setEsitti(n); setSecili([]); setHedef(0); setHam(null); setL(yeni); };
  const yaz = (i: number, p: Partial<Parca>): void => { setEsitti(false); setHam(null); setL((o) => o.map((q, j) => (j === i ? { ...q, ...p } : q))); };
  const esitle = (n: number): void => { sifirla(esitParcalar(l, n, adet, tezgahlar), true); };
  const yok = bolunemezNedeni(x, adet);
  const motorNedeni = m.bolme?.[isId]?.metin ?? null;
  const kilitliAdim = x?.kilitli === true;
  const toplamSayilan = l.reduce((t, p) => t + sayilanDe(p), 0), kalan = Math.max(0, adet - toplamSayilan);
  const gonder = (ev: FormEvent): void => {
    ev.preventDefault();
    if (!e) return;
    if (tek) { void dene({ tur: 'elle-bol-sil', isId } satisfies TaslakKomutu, [e.id]); return; }
    if (d.paylar === null) return;
    void dene({ tur: 'elle-bol', isId, paylar: d.paylar } satisfies TaslakKomutu, [e.id]);
  };
  const kaldir = (): void => { if (e) void dene({ tur: 'elle-bol-sil', isId } satisfies TaslakKomutu, [e.id]); };
  const birlestir = (): void => {
    const r = secilenleriBirlestir(l, secili, hedef, baslamis);
    if (r.hata !== null) { setHam(r.hata); return; }
    const yeniHedef = r.l.findIndex((p) => p.tezgah === l[hedef]?.tezgah);
    sifirla(r.l); setHedef(Math.max(0, yeniHedef));
  };
  const ileti = durum.tur === 'hata' ? durum.ileti : ham ?? (tek ? null : d.hata);
  const hataKimligi = useId();
  const secimAc = (i: number): void => {
    setHam(null);
    setSecili((o) => { const yeni = o.includes(i) ? o.filter((q) => q !== i) : [...o, i].sort((p, q) => p - q); if (!yeni.includes(hedef)) setHedef(yeni[0] ?? 0); return yeni; });
  };
  const adi = (i: number): string => `Parça ${String(i + 1)} · ${kod(l[i]!.tezgah)}`;
  const kalacak = l.length - Math.max(0, secili.length - 1);
  const birlestirNotu = secili.length < 2
    ? 'En az 2 pay seçin.'
    : `${secili.map((q) => `Parça ${String(q + 1)}`).join(' + ')} → ${String(secili.reduce((t, q) => t + (Number(l[q]!.adet) || 0), 0))} adet, ${kod(l[hedef]?.tezgah ?? '')} tezgâhında kalır; ${kalacak >= 2 ? `${String(kalacak)} pay kalır, bölme sürer` : 'tek pay kalır, bölme kalkar'}.`;
  const sayimliPay = l.findIndex((p, i) => i > 0 && sayilanDe(p) > 0);

  return (
    <aside ref={kok} className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-elle-bol" aria-label="Planda böl" hidden={tahtada}>
      <header>
        <div><b>Planda böl{a ? ` · ${a.ad}` : ''}</b>{e && <small>{e.no} · {adet} adet</small>}</div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Planda bölmeyi kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!e || !a ? <p className="tc-pyq-not">Adım bulunamadı; plan değişmiş olabilir.</p> : (
        <>
          <p className="tc-pyq-not">Adet parçalara ayrılır, her parça ayrı tezgâhta yapılır. Bölme yalnız bu plandadır: üretim emri ve sayım değişmez, partiyi bölmek değildir.</p>
          <dl className="tc-pyq-adim-ozet">
            <div><dt>Kayıtlı bölme</dt><dd data-kayitli-bolme={kayitli === null ? 'yok' : ''}>{kayitli === null ? (paylar0.length >= 2 ? `yok (planda ${payNedeni(paylar0[0]!) ?? 'bölünmüş'})` : 'yok') : kayitli.map((p) => `${kod(p.m)} ${String(p.adet)}`).join(', ')}</dd></div>
            {baslamis && <div><dt>Sayılan / kalan</dt><dd data-sayilan-ozet="">sayılan {toplamSayilan}, kalan {kalan}</dd></div>}
          </dl>
          {!yazabilir && <p className="tc-pyq-not">Adımı yalnız planı yazabilen kişi böler.</p>}
          {yok !== null && <p className="tc-pyq-not" data-bolunemez={yok}>{yok}.</p>}
          {motorNedeni !== null && <p className="tc-pyq-ayar-hata" role="status" data-bolme-neden="">Kayıtlı bölme planda uygulanamadı: {motorNedeni}.</p>}
          {kilitliAdim && yok === null && <p className="tc-pyq-not" data-kilit-kalkar="">Uygulayınca adımın kilidi kalkar; parçaların yerini sistem seçer.</p>}
          {baslamis && yok === null && <p className="tc-pyq-not" data-baslamis-not="">Adım başladı: çalışan tezgâh 1. paydır, yaptığı iş yerinde kalır. Sayımı olan payın tezgâhı sabittir, adedi sayılandan az olamaz; yalnız kalan {kalan} adet paylaştırılır.</p>}
          {tezgahlar.length < 1 && <p className="tc-pyq-not">Bu adımın uygun tezgâhı yok; bölünemez.</p>}
          {durum.tur === 'etki' && !tahtada ? <EtkiBolumu ad="Bölmenin etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} /> : yazabilir && yok === null && tezgahlar.length > 0 && (
            <form className="tc-pyq-ayar-etki" noValidate aria-label="Parçalar" onSubmit={gonder}>
              {l.map((p, i) => {
                const kil = kilitliPay(l, i, baslamis), sayilan = sayilanDe(p);
                return (
                  <fieldset key={i} className="tc-pyq-elle-parca" data-parca={i + 1} data-kilitli={kil ? '' : undefined}>
                    <legend>
                      <span>Parça {i + 1}</span>
                      {kil && <span className="tc-pyq-elle-kilit" role="img" aria-label="Kilitli pay"><Simge ad="lock" boyut="k" /></span>}
                    </legend>
                    {l.length >= 2 && (
                      <label className="tc-pyq-elle-sec">
                        <input type="checkbox" checked={secili.includes(i)} disabled={kilitli} aria-label={`${adi(i)} birleştirmek için seç`} onChange={() => { secimAc(i); }} />
                        <span>Birleştirmek için seç</span>
                      </label>
                    )}
                    <label className="tc-pyq-ayar-alan">
                      <span>Adet</span>
                      <input className="tc-alan-kutu" inputMode="numeric" autoComplete="off" value={p.adet} disabled={kilitli} aria-invalid={ileti !== null ? true : undefined} aria-describedby={ileti !== null ? hataKimligi : undefined} onChange={(ev) => { yaz(i, { adet: ev.target.value }); }} />
                    </label>
                    <label className="tc-pyq-ayar-alan">
                      <span>Tezgâh</span>
                      <select className="tc-alan-kutu" value={p.tezgah} disabled={kilitli || kil} title={kil ? 'Başlamış payın tezgâhı sabittir' : undefined} onChange={(ev) => { yaz(i, { tezgah: ev.target.value }); }}>
                        {p.tezgah === '' && <option value="">Seçin</option>}
                        {[...new Set([...tezgahlar, p.tezgah].filter((t) => t !== ''))].map((t) => <option key={t} value={t}>{kod(t)}</option>)}
                      </select>
                    </label>
                    {baslamis && (
                      <small className="tc-pyq-elle-sayilan" data-sayilan={sayilan}>
                        {i === 0 ? 'Çalışıyor · ' : ''}sayılan {sayilan}{sayilan === (Number(p.adet) || 0) && sayilan > 0 ? ' · bitti' : ''}
                        {kil ? ` · tezgâh sabit, silinemez${sayilan > 0 ? `, adet en az ${String(sayilan)}` : ''}` : ''}
                      </small>
                    )}
                    <Dugme tur="ikincil" simge="trash" aria-label={`Parça ${String(i + 1)}'i sil`} disabled={kilitli || l.length <= 2 || kil} title={kil ? (i === 0 ? 'Çalışan pay silinemez' : 'Sayımı olan pay silinemez') : undefined} onClick={() => { sifirla(l.filter((_, j) => j !== i)); }}>Sil</Dugme>
                  </fieldset>
                );
              })}
              <div className="tc-pyq-elle-grup" role="group" aria-label="Böl">
                <h4>Böl{baslamis ? <small> · yalnız kalan {kalan} adet paylaşılır</small> : null}</h4>
                <div className="tc-pyq-elle-sayi">
                  {adet >= 2 && <Dugme tur="ikincil" simge="layers" disabled={kilitli || kalan < 2} onClick={() => { esitle(2); }}>Eşit 2</Dugme>}
                  {adet >= 3 && PARCA_EN_COK >= 3 && <Dugme tur="ikincil" simge="layers" disabled={kilitli || kalan < 3} onClick={() => { esitle(3); }}>Eşit 3</Dugme>}
                  <Dugme tur="ikincil" simge="plus" disabled={kilitli || l.length >= PARCA_EN_COK} title={l.length >= PARCA_EN_COK ? `En çok ${String(PARCA_EN_COK)} parça` : undefined} onClick={() => { sifirla([...l, { adet: '', tezgah: tezgahlar[l.length % tezgahlar.length] ?? '', ...(baslamis ? { sayilan: 0 } : {}) }]); }}>Parça ekle</Dugme>
                  {baslamis && l.length >= 2 && <Dugme tur="ikincil" simge="rotate" disabled={kilitli || kalan < l.length} title={kalan < l.length ? 'Kalan adet paylara yetmiyor' : 'Kalan adedi, biten payın boşalan tezgâhı dahil, bütün paylara eşit dağıtır'} onClick={() => { sifirla(kalaniYenidenBol(l, adet, tezgahlar), true); }}>Kalanı yeniden böl</Dugme>}
                </div>
                {baslamis && l.length >= 2 && <small className="tc-pyq-not" data-yeniden-bol-not="">Kalanı yeniden böl: kalan {kalan} adet, biten payın boşalan tezgâhı dahil bütün paylara eşit dağıtılır; sayılanlar korunur.</small>}
              </div>
              {l.length >= 2 && (
                <div className="tc-pyq-elle-grup" role="group" aria-label="Birleştir">
                  <h4>Birleştir</h4>
                  <div className="tc-pyq-elle-sayi">
                    {secili.length >= 2 && (
                      <label className="tc-pyq-ayar-alan">
                        <span>Hedef pay (tezgâhı kalır)</span>
                        <select className="tc-alan-kutu" value={String(hedef)} disabled={kilitli} onChange={(ev) => { setHedef(Number(ev.target.value)); }}>
                          {secili.map((q) => <option key={q} value={String(q)}>{adi(q)}</option>)}
                        </select>
                      </label>
                    )}
                    <Dugme tur="ikincil" simge="fit" disabled={kilitli || secili.length < 2} onClick={birlestir}>Seçilenleri birleştir</Dugme>
                    {baslamis && <Dugme tur="ikincil" simge="fit" disabled={kilitli || kalan < 1} title="Kalan adet tek paya verilir, öteki paylar sayılanlarında kapanır" onClick={() => { sifirla(kalaniBirlestir(l, secili.length >= 1 ? hedef : 0, adet)); }}>Kalanı birleştir</Dugme>}
                  </div>
                  <small className="tc-pyq-not" data-birlestir-not="">{birlestirNotu}</small>
                  {baslamis && <small className="tc-pyq-not" data-kalan-birlestir-not="">Kalanı birleştir: kalan {kalan} adet tek paya ({kod(l[secili.length >= 1 ? hedef : 0]?.tezgah ?? '')}) verilir, öteki paylar sayılanlarında kapanır; sayımı olmayan pay kalkar.</small>}
                </div>
              )}
              <p className="tc-pyq-not">{tek ? 'Tek pay kaldı: bölme kalkar, adım tek parça olur ve yerini sistem seçer.' : 'Parçaların yerini sistem seçer; bir parçayı sonra tahtadan taşıyabilirsiniz. Sonraki adım bütün parçaları bekler.'}</p>
              {kayitli !== null && (
                <div className="tc-pyq-elle-kaldir">
                  <Dugme tur="ikincil" simge="x" disabled={kilitli || sayimliPay >= 0} onClick={kaldir}>Bölmeyi kaldır</Dugme>
                  <small className="tc-pyq-not" data-kaldir-not="">{sayimliPay >= 0 ? `Sayımı olan pay var (${kod(l[sayimliPay]!.tezgah)}); önce kalanı birleştirin.` : baslamis ? 'Çalışan payın sayımı korunur: bölme kalkar, adım çalışan tezgâhta tek parça kalır.' : 'Kayıtlı bölme silinir; adım tek parça olur ve yerini sistem seçer.'}</small>
                </div>
              )}
              <div className="tc-pyq-ayar-dugmeler">
                <p className="tc-pyq-not" data-toplam={d.toplam} role="status">Toplam {d.toplam} / {adet} adet{esitti ? (baslamis ? ' · kalan eşit dağıtıldı' : ' · eşit dağıtıldı') : ''}.</p>
                {ileti !== null && <p className="tc-pyq-ayar-hata" role="alert" id={hataKimligi}>{ileti}</p>}
                <small className="tc-pyq-not">Önce etkisini görürsünüz; Uygula demeden plan değişmez.</small>
                <Dugme type="submit" tur="birincil" simge="clock" disabled={kilitli || (!tek && d.paylar === null)} yukleniyor={durum.tur === 'hesap'}>{durum.tur === 'hesap' ? 'Hesaplanıyor' : 'Etkisini gör'}</Dugme>
              </div>
            </form>
          )}
        </>
      )}
    </aside>
  );
}
