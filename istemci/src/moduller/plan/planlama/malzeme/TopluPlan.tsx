import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlanOnTalep, TedarikTerminleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, Kart, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { EmirNo } from '../ortak/emir-no.ts';
import { gunYaz, kovaBasi, saatOku, sayiYaz, sonrakiKova, type PlanSatiri } from './kurallar.ts';
import {
  TOPLU_DUZENLER, acikTalepler, gunlukTuketim, isoGun, sutunHucresi, sutunlar, teslimler,
  type GunHucresi, type TopluDuzen, type TuketimSatiri,
} from './toplu-talep.ts';

// 3485 a: "Günlük tüketim ve toplu plan" kartı. Planın malzemesi gün gün; seçili malzemenin eksiği seçilen düzende kaleme döner ve
// Taleplerim'in yeni talep formu dolu açılır (termin takibinin "Talep aç"ı gibi, TaleplerimSayfasi taslak). Plan sipariş vermez (222 a);
// talep satın almaya form gönderilince gider. Açık talep satın almanın termin takibinden okunur; okunamazsa düşülmez ve kart bunu söyler.

const TALEP_YOLU = '/taleplerim?bolum=yeni';
const ESIK = 1e-9;
type Gosterim = 'tuketim' | 'kalan' | 'eksik';
const GOSTERIMLER: readonly [Gosterim, string][] = [['tuketim', 'Tüketim'], ['kalan', 'Kalan stok'], ['eksik', 'Eksik']];
type Kisayol = 'hafta' | 'ay' | null;

export interface KartBilgisi { kod: string | null; birim: string | null }

export interface TopluPlanOzellikleri {
  satirlar: readonly PlanSatiri[];
  taban: number;
  simdi: number;
  dar: boolean;
  stok: (kod: string) => number | null;
  malzemeAdi: (kod: string) => string;
  birim: (kod: string) => string;
  kart: (kod: string) => KartBilgisi | null;
  emirNo: EmirNo;
  talepAcar: boolean;
  // Testler için: açık talepler (malzeme no -> miktar). Verilmezse termin takibinden okunur.
  talepler?: ReadonlyMap<string, number> | null;
}

function Segment<A extends string>({ etiket, secenekler, secili, sec }: { etiket: string; secenekler: readonly (readonly [A, string])[]; secili: A | null; sec: (a: A) => void }) {
  return (
    <div className="tc-pyz-seg" role="group" aria-label={etiket}>
      {secenekler.map(([k, ad]) => <button key={k} type="button" aria-pressed={secili === k} onClick={() => { sec(k); }}>{ad}</button>)}
    </div>
  );
}

function useAcikTalepler(verilen: ReadonlyMap<string, number> | null | undefined): ReadonlyMap<string, number> | null | undefined {
  const [m, mYaz] = useState<ReadonlyMap<string, number> | null | undefined>(verilen);
  useEffect(() => {
    if (verilen !== undefined) return undefined;
    let bitti = false;
    api.get<TedarikTerminleriCevabi>('/satin-alma-tedarik-terminleri').then(
      (c) => { if (!bitti) mYaz(acikTalepler(c.takip ?? [])); },
      () => { if (!bitti) mYaz(null); },
    );
    return () => { bitti = true; };
  }, [verilen]);
  return m;
}

export function TopluPlan({ satirlar, taban, simdi, dar, stok, malzemeAdi, birim, kart, emirNo, talepAcar, talepler: verilen }: TopluPlanOzellikleri) {
  const git = useNavigate();
  const talepler = useAcikTalepler(verilen);
  const bugun = kovaBasi(taban, 'gun', simdi);
  const haftaSonu = sonrakiKova(taban, 'hafta', kovaBasi(taban, 'hafta', simdi)) - 24;
  const aySonu = sonrakiKova(taban, 'ay', kovaBasi(taban, 'ay', simdi)) - 24;
  const [bas, basYaz] = useState(bugun);
  const [bit, bitYaz] = useState(haftaSonu);
  const [kisayol, kisayolYaz] = useState<Kisayol>('hafta');
  const [goster, gosterYaz] = useState<Gosterim>('tuketim');
  const [duzen, duzenYaz] = useState<TopluDuzen>('gunluk');
  const [n, nYaz] = useState('3');
  const [secim, secimYaz] = useState<ReadonlySet<string> | null>(null);
  const [acik, acikYaz] = useState<ReadonlySet<string>>(new Set());

  const tablo = useMemo(() => gunlukTuketim({
    satirlar, taban, simdi, bas, bit: Math.max(bas, bit), stok, talep: (kod) => talepler?.get(kod) ?? 0,
  }), [satirlar, taban, simdi, bas, bit, stok, talepler]);
  const kolonlar = sutunlar(taban, tablo.gunler);
  const eksikler = tablo.satirlar.filter((s) => s.eksik > ESIK);
  // Talep kalemi malzeme no ister; no'su sayı olmayan malzeme seçilemez.
  const secilebilir = eksikler.filter((s) => Number.isSafeInteger(Number(s.kod)));
  const secilebilirMi = (kod: string): boolean => secilebilir.some((s) => s.kod === kod);
  // Varsayılan seçim eksiği olan malzemelerdir; kullanıcı değiştirince onunki geçer.
  const secili = secim ?? new Set(secilebilir.map((s) => s.kod));
  const nSayi = Math.max(1, Math.min(366, Math.floor(Number(n)) || 1));
  const secilenler = secilebilir.filter((s) => secili.has(s.kod));
  const plan = secilenler.map((s) => ({ s, l: teslimler(s, taban, duzen, nSayi, bas) }));
  const kalemSayisi = plan.reduce((a, p) => a + p.l.length, 0);
  const ilkEksik = eksikler.flatMap((s) => [...s.gunler].filter(([, h]) => h.eksik > ESIK).map(([g]) => g)).sort((a, b) => a - b)[0] ?? null;

  const tarihGir = (v: string, yaz: (t: number) => void): void => {
    const t = saatOku(taban, v);
    if (t !== null) { yaz(kovaBasi(taban, 'gun', t)); kisayolYaz(null); }
  };
  const kisayolSec = (k: 'hafta' | 'ay'): void => { basYaz(bugun); bitYaz(k === 'hafta' ? haftaSonu : aySonu); kisayolYaz(k); };
  const isaretle = (kod: string, v: boolean): void => {
    const y = new Set(secili);
    if (v) y.add(kod); else y.delete(kod);
    secimYaz(y);
  };
  const ac = (kod: string): void => { acikYaz((a) => { const y = new Set(a); if (y.has(kod)) y.delete(kod); else y.add(kod); return y; }); };
  const miktar = (q: number, kod: string): string => `${sayiYaz(q, q < 10 ? 1 : 0)} ${birim(kod)}`.trim();

  const talepAc = (): void => {
    const taslak: PlanOnTalep[] = plan.flatMap(({ s, l }) => {
      const k = kart(s.kod);
      const b = k?.birim ?? birim(s.kod);
      return l.map((t) => ({
        kaynak: 'plan' as const, malzeme: { no: Number(s.kod), kod: k?.kod ?? s.kod, ad: malzemeAdi(s.kod) }, miktar: t.miktar, birim: b,
        gerekenTarih: isoGun(taban, t.gun), emirler: [...new Set(t.isler.map(emirNo))], stokBilinmiyor: stok(s.kod) === null,
        hesap: { eksik: t.miktar, siparis: 0, talep: 0, yoksayilan: 0 },
      }));
    });
    void git(TALEP_YOLU, { state: { taslak } });
  };

  const hucre = (s: TuketimSatiri, h: GunHucresi | null): { ana: ReactNode; alt: string; ton: 'hata' | 'bilgi' | undefined } => {
    if (h === null) return { ana: <span className="tc-pyz-bos">·</span>, alt: '', ton: undefined };
    const ton = h.eksik > ESIK ? 'hata' : h.siparisten > ESIK ? 'bilgi' : undefined;
    const alt = h.eksik > ESIK ? `eksik ${miktar(h.eksik, s.kod)}` : h.siparisten > ESIK ? `siparişten ${miktar(h.siparisten, s.kod)}` : h.kalan === null ? '' : `kalan ${miktar(h.kalan, s.kod)}`;
    if (goster === 'kalan') return { ana: h.kalan === null ? '—' : miktar(h.kalan, s.kod), alt: h.eksik > ESIK ? alt : '', ton };
    if (goster === 'eksik') return { ana: h.eksik > ESIK ? miktar(h.eksik, s.kod) : <span className="tc-pyz-bos">·</span>, alt: '', ton };
    return { ana: miktar(h.tuketim, s.kod), alt, ton };
  };
  const kolonAdi = (i: number): string => {
    const c = kolonlar[i]!;
    return c.gunler.length > 1 ? `${gunYaz(taban, c.bas).slice(0, 5)}–${gunYaz(taban, c.gunler[c.gunler.length - 1]!).slice(0, 5)}` : gunYaz(taban, c.bas);
  };

  const duzenSecici = dar
    ? (
      <select className="tc-alan-kutu tc-pyz-tp-sec" aria-label="Talebi topla" value={duzen} onChange={(e) => { duzenYaz(e.target.value as TopluDuzen); }}>
        {TOPLU_DUZENLER.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
      </select>
    )
    : <Segment etiket="Talebi topla" secenekler={TOPLU_DUZENLER} secili={duzen} sec={duzenYaz} />;

  return (
    <Kart baslikEki={<span className="tc-pyz-baslik"><Simge ad="grid" boyut="k" />Günlük tüketim ve toplu plan<span className="tc-pyz-kucuk">plandaki işlerin malzemesi, gün gün</span></span>}>
      <div className="tc-pyz-ust tc-pyz-tp-ust">
        <span className="tc-pyz-tp-grup">
          <span className="tc-pyz-kucuk">Aralık</span>
          <span className="tc-pyz-tp-tarihler">
            <input className="tc-alan-kutu" type="date" aria-label="Başlangıç" value={isoGun(taban, bas)} onChange={(e) => { tarihGir(e.target.value, basYaz); }} />
            <span aria-hidden="true">–</span>
            <input className="tc-alan-kutu" type="date" aria-label="Bitiş" value={isoGun(taban, bit)} onChange={(e) => { tarihGir(e.target.value, bitYaz); }} />
          </span>
          <Segment etiket="Aralık kısayolu" secenekler={[['hafta', 'Bu hafta'], ['ay', 'Bu ay']] as const} secili={kisayol} sec={kisayolSec} />
        </span>
        <span className="tc-pyz-tp-grup"><span className="tc-pyz-kucuk">Göster</span><Segment etiket="Göster" secenekler={GOSTERIMLER} secili={goster} sec={gosterYaz} /></span>
        <span className="tc-pyz-tp-grup">
          <span className="tc-pyz-kucuk">Talebi topla</span>{duzenSecici}
          {duzen === 'herN' && (
            <label className="tc-pyz-tp-grup">
              <input className="tc-alan-kutu tc-pyz-tp-n" type="number" min={1} max={366} aria-label="Gün sayısı" value={n} onChange={(e) => { nYaz(e.target.value); }} />
              <span className="tc-pyz-kucuk">günde bir</span>
            </label>
          )}
        </span>
      </div>
      <div className="tc-pyz-kpi tc-pyz-tp-kpi">
        <div><small><Simge ad="box" boyut="k" />Planda tüketilen</small><b className="mono">{tablo.satirlar.length} malzeme</b><span>seçili aralıkta</span></div>
        <div data-ton={eksikler.length ? 'hata' : 'tamam'}><small><Simge ad="alert" boyut="k" />Stok yetmeyen</small><b className="mono">{eksikler.length} malzeme</b><span>açık sipariş ve talep düşülmüş</span></div>
        <div><small><Simge ad="clock" boyut="k" />İlk eksik gün</small><b className="mono">{ilkEksik === null ? '—' : gunYaz(taban, ilkEksik)}</b><span>en erken gerekli geliş</span></div>
        <div data-ton={kalemSayisi ? 'uyari' : undefined}><small><Simge ad="layers" boyut="k" />Talebe girecek</small><b className="mono">{kalemSayisi} kalem</b><span>{secilenler.length} malzeme</span></div>
      </div>
      {tablo.satirlar.length === 0
        ? <p className="tc-pyz-kucuk">Bu aralıkta plandaki işlerin malzemesi yok.</p>
        : (
          <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined} data-kaydir={dar ? undefined : ''}>
            <table className="tc-tablo tc-pyz-tablo tc-pyz-tp" aria-label="Günlük tüketim">
              <thead><tr>
                <th className="tc-tablo-sabit-sol tc-pyz-tp-ad">Malzeme</th><th className="tc-pyz-num">Stok</th>
                {kolonlar.map((c, i) => <th key={c.bas}>{kolonAdi(i)}</th>)}
                <th className="tc-pyz-num">Toplam tüketim</th><th className="tc-pyz-num tc-tablo-sabit-sag">Eksik</th>
              </tr></thead>
              <tbody>
                {tablo.satirlar.map((s) => {
                  const eksikVar = s.eksik > ESIK;
                  const st = stok(s.kod);
                  const butun = !dar || acik.has(s.kod);
                  return (
                    <tr key={s.kod} data-tp-secili={eksikVar && secili.has(s.kod) ? '' : undefined}>
                      <td data-baslik="" className="tc-tablo-sabit-sol tc-pyz-tp-ad">
                        <div className="tc-pyz-tp-ad-ic">
                        {talepAcar && secilebilirMi(s.kod)
                          ? <input type="checkbox" className="tc-pyz-tp-kutu" aria-label={`${malzemeAdi(s.kod) || s.kod} seç`} checked={secili.has(s.kod)} onChange={(e) => { isaretle(s.kod, e.target.checked); }} />
                          : <span className="tc-pyz-tp-kutu-yer" aria-hidden="true" />}
                        <span className="tc-pyz-tp-kim">
                          <b>{malzemeAdi(s.kod) || s.kod}</b>
                          <span><span className="mono tc-pyz-kucuk tc-pyz-tp-kod">{kart(s.kod)?.kod ?? s.kod}</span>
                            {s.talepte > ESIK && <> <Rozet ton="bilgi" gorunum="cizgi">{`talepte ${miktar(s.talepte, s.kod)}`}</Rozet></>}</span>
                        </span>
                        </div>
                      </td>
                      <td data-baslik="Stok" className="tc-pyz-num">{st === null ? '—' : miktar(st, s.kod)}</td>
                      {kolonlar.map((c, i) => {
                        const h = sutunHucresi(s, c);
                        if (!butun && !(h && h.eksik > ESIK)) return null;
                        const x = hucre(s, h);
                        return <td key={c.bas} data-baslik={kolonAdi(i)} data-ton={x.ton} className="tc-pyz-tp-gun">{x.ana}{x.alt && <small>{x.alt}</small>}</td>;
                      })}
                      {dar && (
                        <td data-baslik="">
                          <button type="button" className="tc-pyz-tp-ac" aria-expanded={acik.has(s.kod)} onClick={() => { ac(s.kod); }}>
                            {acik.has(s.kod) ? 'Yalnız eksik günler' : 'Bütün günler'}
                          </button>
                        </td>
                      )}
                      <td data-baslik="Toplam" className="tc-pyz-num">{miktar(s.toplam, s.kod)}</td>
                      <td data-baslik="Eksik" className="tc-pyz-num tc-tablo-sabit-sag">{eksikVar ? <b data-ton="hata">{miktar(s.eksik, s.kod)}</b> : <Rozet ton="tamam" gorunum="cizgi">yetiyor</Rozet>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <p className="tc-pyz-kucuk">
        {talepler === null && <span data-ton="uyari">Açık talepler okunamadı (yetki yok ya da uç yanıt vermedi); eksikten düşülmedi. </span>}
        Eksik: stokla ve açık siparişle karşılanmayan, açık talep düşülmüş miktar. Talebi topla: seçili malzemelerin aralıktaki eksiği günlük, haftalık,
        aylık, her N günde bir ya da tek teslim olarak kaleme döner; teslim tarihi grubun ilk eksik günüdür. {tablo.gunler.length > kolonlar.length ? 'Uzun aralıkta sütunlar haftalık toplanır.' : ''}
      </p>
      {talepAcar && secilenler.length > 0 && (
        <div className="tc-pyz-tp-serit" data-dar={dar ? '' : undefined} role="region" aria-label="Toplu talep">
          <span>{dar ? `${kalemSayisi} kalem` : `${secilenler.length} malzeme · ${kalemSayisi} kalem (${TOPLU_DUZENLER.find((d) => d[0] === duzen)?.[1].toLocaleLowerCase('tr-TR') ?? ''})`}</span>
          <span className="tc-pyz-tp-grup">
            {dar
              ? <button type="button" className="tc-pyz-tp-ac" onClick={() => { secimYaz(new Set()); }}>Seçimi kaldır</button>
              : <Dugme onClick={() => { secimYaz(new Set()); }}>Seçimi kaldır</Dugme>}
            <Dugme tur="birincil" simge="plus" onClick={talepAc}>{dar ? 'Talep aç' : `Talep aç (${kalemSayisi} kalem)`}</Dugme>
          </span>
        </div>
      )}
    </Kart>
  );
}
