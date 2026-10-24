import { Fragment, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { Dugme, Rozet, SayfaBasligi, Simge, type Secenek } from '../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { Sihirbaz, type SihirbazDegeri, type SihirbazTanimi } from '../ortak/sade/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { sayiGirdisi, sayiOku, type Ton } from './kurallar.ts';
import './maliyet.css';

// P3'ün dört görünümünün ortak düzeni bugünkü sayfanın ısı haritasıdır (cerceve/planlama/parca zz30-isi isSayfa): başlık ve durum satırı,
// satır × sütun ızgarası, seçilen hücrenin satırın altında açılan nedeni, dolu gelen adımlı formu (zz24-sade sdSihirbaz) ve en çok iki
// seçeneği; altta "Tüm satırlar".

// ---------- adımlı form ----------
export type Degerler = Record<string, string>;
export interface FormAlani {
  k: string; ad: string; tur: 'secim' | 'sayi' | 'metin' | 'tarih'; zorunlu?: boolean; min?: number; max?: number; ipucu?: string;
  secenek?: readonly Secenek[];
}
export interface FormTanimi {
  id: string; ad: string; simge: SimgeAdi; ne: string;
  alanlar: (d: Degerler) => FormAlani[];
  adimlar: { ad: string; ne?: string; k: string[] }[];
  ilk?: () => Degerler;
  // Adımdan çıkarken sonraki adımın şimdiki değerlerini doldurur (sayfanın `ileri`si).
  ileri?: (d: Degerler, i: number) => Degerler;
  // i: adım; -1 son denetim. Dönen metin formu durdurur ("Hiçbir şey değişmedi.").
  kontrol?: (d: Degerler, i: number) => string | null;
  sonuc: string;
  kaydet: (d: Degerler) => boolean;
  bitti: (d: Degerler) => string;
}
// ad: açılımda gösterilen ad ("T1 saat ücreti"); yoksa formun adı.
export interface FormCagrisi { tanim: FormTanimi; ad?: string; deg?: Degerler; adim?: number; etki?: string }

// Sayı alanının değeri: boş null; geçersizse null (denetim formda yapılır).
export function sayiAl(d: Degerler, k: string): number | null {
  const s = sayiGirdisi(d[k] ?? '', { min: -Infinity });
  return s.tamam ? s.deger : null;
}
// Kayıtlı değer ile formdaki metin aynı sayı mı (sayfanın sdmDegisti'si).
export const degisti = (eski: unknown, ham: string | undefined): boolean => sayiOku(eski) !== sayiAl({ x: ham ?? '' }, 'x');
export const metinYaz = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

// Formlar ortak sade sihirbazla açılır (ortak/sade Sihirbaz, eski zz24-sade sdSihirbaz). Sayı alanı alt sınır vermezse eksi değer almaz.
function sihirbazTanimi(t: FormTanimi, sonuc: { tamam: boolean }): SihirbazTanimi {
  const metin = (d: SihirbazDegeri): Degerler => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  return {
    id: t.id, ad: t.ad, simge: t.simge, ne: t.ne, adimlar: t.adimlar, sonuc: t.sonuc,
    alanlar: (d) => t.alanlar(metin(d)).map((a) => ({
      k: a.k, ad: a.ad, tur: a.tur, zorunlu: a.zorunlu, ipucu: a.ipucu, max: a.max,
      min: a.tur === 'sayi' ? a.min ?? 0 : a.min, secenekler: a.secenek?.map((x) => [x.deger, x.baslik] as const),
    })),
    ilk: () => t.ilk?.() ?? {},
    ileri: t.ileri ? (d, i) => t.ileri?.(metin(d), i) : undefined,
    kontrol: t.kontrol ? (d, i) => t.kontrol?.(metin(d), i) ?? null : undefined,
    kaydet: (d) => { sonuc.tamam = t.kaydet(metin(d)); },
    bitti: (d) => (sonuc.tamam ? t.bitti(metin(d)) : 'Kaydedilemedi.'),
  };
}

function FormAc({ cagri, vazgec, geriYok }: { cagri: FormCagrisi; vazgec: () => void; geriYok: boolean }) {
  const [S] = useState(() => { const sonuc = { tamam: false }; return { sonuc, tanim: sihirbazTanimi(cagri.tanim, sonuc) }; });
  const [bitti, bittiYaz] = useState<string | null>(null);
  if (bitti !== null) {
    return (
      <div className="tc-pyk-bitti" role="status">
        <p><Simge ad={S.sonuc.tamam ? 'check' : 'alert'} boyut="k" /><b>{bitti}</b></p>
        {S.sonuc.tamam && <p className="tc-pyk-soluk">Sonuç: {cagri.tanim.sonuc}</p>}
        <div className="tc-pyk-dugmeler"><Dugme simge="x" onClick={vazgec}>Kapat</Dugme></div>
      </div>
    );
  }
  return <Sihirbaz tanim={S.tanim} acilis={{ deg: cagri.deg, adim: cagri.adim, geriSiniri: geriYok }} vazgec={vazgec} bitti={bittiYaz} />;
}

// ---------- ısı haritası ----------
export interface Hucre { etiket: string; v?: string; kd?: number; sm?: SimgeAdi; iyi?: boolean; oneri?: boolean; tahmin?: string; kapali?: boolean }
export interface IsiSutunu { k: string; ad: string; alt?: string; bugun?: boolean }
export interface IsiSatiri<V> { k: string; ad: string; alt?: string; simge: SimgeAdi; ton?: Ton | ''; gizli?: boolean; h: Record<string, Hucre>; veri: V }
export interface Lejant { kdAd: Record<number, string>; iyi?: string; oneri?: string; tahmin?: string; simge?: [SimgeAdi, string][] }
export interface IsiVerisi<V> {
  baslik: string; satirAd: string; sutunlar: IsiSutunu[]; satirlar: IsiSatiri<V>[]; lejant: Lejant; not?: string; gizliAd?: string;
  ust: { ton: Ton | ''; simge: SimgeAdi; metin: string };
}
export interface IsiBos { bos: string; bosSimge?: SimgeAdi }

// Hücre birleştirme: sonraki işaret öncekinin kademesini düşürmez, etiketler eklenir (isHucre).
export function hucreKoy(h: Record<string, Hucre>, k: string, o: Hucre): void {
  const c = h[k];
  if (!c) { h[k] = { ...o }; return; }
  const kd = c.kd !== undefined && o.kd !== undefined ? Math.max(c.kd, o.kd) : o.kd ?? c.kd;
  h[k] = { ...c, ...o, kd, etiket: c.etiket ? `${c.etiket}, ${o.etiket}` : o.etiket };
}
export const kdOran = (x: number | null, e: readonly [number, number, number, number]): number | undefined =>
  x === null || !Number.isFinite(x) ? undefined : x < e[0] ? 0 : x < e[1] ? 1 : x < e[2] ? 2 : x < e[3] ? 3 : 4;

export interface AcilimSecenegi { ad: string; etki: string; simge: SimgeAdi; yap?: () => void; pasif?: string }
export interface Acilim {
  baslik: string; simge: SimgeAdi; ton?: Ton | ''; neden: string; bilgi?: [string, string][]; formlar: FormCagrisi[];
  secenekler?: AcilimSecenegi[];
  // Bu kalemi değiştirecek form var ama kişinin yetkisi yok.
  kilitli?: boolean;
}

function Lejanti({ L }: { L: Lejant }) {
  return (
    <p className="tc-pyk-lejant" aria-hidden="true">
      {Object.entries(L.kdAd).map(([k, ad]) => <span key={k}><i className="tc-pyk-l" data-kd={k} />{ad}</span>)}
      {L.iyi && <span><i className="tc-pyk-l" data-iyi="" />{L.iyi}</span>}
      {L.oneri && <span><i className="tc-pyk-l" data-oneri="" />{L.oneri}</span>}
      {L.tahmin && <span><i className="tc-pyk-l" data-tahmin="" />{L.tahmin}</span>}
      {(L.simge ?? []).map(([s, ad]) => <span key={ad}><Simge ad={s} boyut="k" />{ad}</span>)}
    </p>
  );
}

function HucreDugmesi({ r, c, h, secili, sec }: { r: IsiSatiri<unknown>; c: IsiSutunu; h: Hucre | undefined; secili: boolean; sec: () => void }) {
  const bugun = c.bugun ? '' : undefined;
  if (!h || (h.kd === undefined && !h.v && !h.sm && !h.iyi && !h.oneri)) {
    return <td className="tc-pyk-h" data-bos="" data-kapali={h?.kapali ? '' : undefined} data-bugun={bugun} aria-hidden="true" />;
  }
  const et = `${r.ad}, ${c.ad}${c.alt ? ` ${c.alt}` : ''}: ${h.etiket}${h.tahmin ? `, tahmini (${h.tahmin})` : ''}`;
  const uzun = h.v !== undefined && h.v.length > 2;
  return (
    <td className="tc-pyk-h" data-bugun={bugun}>
      <button
        type="button" className="tc-pyk-hd" aria-pressed={secili} aria-label={et} title={et} onClick={sec}
        data-kd={h.kd} data-iyi={h.iyi ? '' : undefined} data-oneri={h.oneri ? '' : undefined} data-tahmin={h.tahmin ? '' : undefined}
      >
        {h.sm && !uzun && <Simge ad={h.sm} boyut="k" />}
        {h.v !== undefined && h.v !== '' && <span>{h.v}</span>}
      </button>
    </td>
  );
}

function AcilimKutusu({ A, cagri, sec, formSec, kapat, geriYok }: {
  A: Acilim; cagri: FormCagrisi | null; sec: number; formSec: (i: number) => void; kapat: () => void; geriYok: boolean;
}) {
  const yada: AcilimSecenegi[] = [
    ...A.formlar.map((f, i) => ({ f, i })).filter((x) => x.i !== sec).map(({ f, i }) => ({ ad: f.ad ?? f.tanim.ad, etki: f.etki ?? f.tanim.ne, simge: f.tanim.simge, yap: () => { formSec(i); } })),
    ...(A.secenekler ?? []),
  ].slice(0, 2);
  const kacis = (o: KeyboardEvent) => { if (o.key === 'Escape') { o.stopPropagation(); kapat(); } };
  return (
    <section className="tc-pyk-ac" aria-label={A.baslik} data-ton={A.ton || undefined} onKeyDown={kacis}>
      <div className="tc-pyk-ac-ust">
        <b><Simge ad={A.simge} boyut="k" /><span>{A.baslik}</span></b>
        <button type="button" className="tc-pyk-kapat" aria-label="Kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </div>
      <div className="tc-pyk-ac-ic">
        <div className="tc-pyk-ac-sol">
          <p className="tc-pyk-neden">{A.neden}</p>
          {A.bilgi && A.bilgi.length > 0 && (
            <dl className="tc-pyk-ozet">{A.bilgi.map(([a, v]) => <div key={a}><dt>{a}</dt><dd>{v || '—'}</dd></div>)}</dl>
          )}
          {cagri && <FormAc key={`${cagri.tanim.id}-${String(sec)}`} cagri={cagri} vazgec={kapat} geriYok={geriYok} />}
          {!cagri && A.kilitli && <p className="tc-pyk-soluk"><Simge ad="lock" boyut="k" /> Bunu değiştirme yetkiniz yok.</p>}
        </div>
        {yada.length > 0 && (
          <div className="tc-pyk-yada">
            <span className="tc-pyk-yada-b">Ya da</span>
            {yada.map((s) => (
              <button key={s.ad} type="button" className="tc-pyk-secenek" onClick={s.yap} disabled={s.pasif !== undefined || !s.yap}>
                <Simge ad={s.simge} boyut="k" />
                <span><b>{s.ad}</b><small>{s.pasif ?? s.etki}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Isı haritalı görünümün tamamı (isSayfa): başlık, durum satırı ve satırdaki tek düğme, ızgara, "Tüm satırlar". Seçilen hücrede ilk izinli form
// kendiliğinden açılır (isIlkForm).
export function IsiSayfasi<V>({ ad, simge, veri, acilim, ustEylem, tum, uyari }: {
  ad: string; simge: SimgeAdi; veri: IsiVerisi<V> | IsiBos;
  acilim: (r: IsiSatiri<V>, ck: string) => Acilim | null;
  ustEylem?: ReactNode;
  tum?: ReactNode;
  uyari?: string | null;
}) {
  const [sec, secYaz] = useState<{ rk: string; ck: string; fi: number } | null>(null);
  const [hepsi, hepsiYaz] = useState(false);
  const [tumAcik, tumAcikYaz] = useState(false);
  const V = 'bos' in veri ? null : veri;
  const secSatir = V && sec ? V.satirlar.find((r) => r.k === sec.rk) ?? null : null;
  useEffect(() => { if (sec && V && !secSatir) secYaz(null); }, [sec, V, secSatir]);
  const A = secSatir && sec ? acilim(secSatir, sec.ck) : null;
  // Açık form seçim değişene kadar tutulur: kayıttan sonra çalışma değişip açılım yeniden kurulsa da bitti kartı kaybolmaz.
  const anahtar = sec ? `${sec.rk}|${sec.ck}|${String(sec.fi)}` : '';
  const [tut, tutYaz] = useState<{ anahtar: string; cagri: FormCagrisi | null }>({ anahtar: '', cagri: null });
  const yeni = A ? A.formlar[sec?.fi ?? 0] ?? null : null;
  if (tut.anahtar !== anahtar) tutYaz({ anahtar, cagri: yeni });
  const cagri = tut.anahtar === anahtar ? tut.cagri : yeni;

  const gor = V ? V.satirlar.filter((r) => hepsi || !r.gizli || r.k === sec?.rk) : [];
  const giz = V ? V.satirlar.length - gor.length : 0;
  const n = V ? V.sutunlar.length + 1 : 1;

  return (
    <div className="tc-pyk">
      <SayfaBasligi baslik={ad} simge={simge} alt={V ? V.baslik : undefined} />
      {V && (
        <p className="tc-pyk-durum" data-ton={V.ust.ton || undefined} role="status">
          <Simge ad={V.ust.simge} boyut="k" /><span>{V.ust.metin}</span>{ustEylem}
        </p>
      )}
      {uyari && <p className="tc-pyk-durum" data-ton="uyari"><Simge ad="rotate" boyut="k" /><span>{uyari}</span></p>}
      <section className="tc-pyk-ana" aria-label="Isı haritası">
        {!V && 'bos' in veri && (
          <div className="tc-pyk-bos"><Simge ad={veri.bosSimge ?? 'grid'} /><span>{veri.bos}</span></div>
        )}
        {V && (
          <>
            <Lejanti L={V.lejant} />
            <div className="tc-pyk-kap">
              <table className="tc-pyk-tablo" aria-label={V.baslik}>
                <thead>
                  <tr>
                    <th scope="col" className="tc-pyk-ad">{V.satirAd}</th>
                    {V.sutunlar.map((c) => (
                      <th key={c.k} scope="col" className="tc-pyk-sut" data-bugun={c.bugun ? '' : undefined}>
                        <b>{c.ad}</b>{c.alt && <small>{c.alt}</small>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gor.map((r) => (
                    <Fragment key={r.k}>
                      <tr data-secili={r.k === sec?.rk ? '' : undefined}>
                        <th scope="row" className="tc-pyk-ad" data-ton={r.ton || undefined}>
                          <div className="tc-pyk-adic">
                            <Simge ad={r.simge} boyut="k" />
                            <span><b className="tc-pyk-mono">{r.ad}</b>{r.alt && <small>{r.alt}</small>}</span>
                          </div>
                        </th>
                        {V.sutunlar.map((c) => (
                          <HucreDugmesi
                            key={c.k} r={r as IsiSatiri<unknown>} c={c} h={r.h[c.k]} secili={sec?.rk === r.k && sec.ck === c.k}
                            sec={() => { secYaz(sec?.rk === r.k && sec.ck === c.k ? null : { rk: r.k, ck: c.k, fi: 0 }); }}
                          />
                        ))}
                      </tr>
                      {A && sec && r.k === sec.rk && (
                        <tr className="tc-pyk-acsatir">
                          <td colSpan={n}>
                            <AcilimKutusu
                              A={A} cagri={cagri} sec={sec.fi} kapat={() => { secYaz(null); }} geriYok={sec.fi === 0}
                              formSec={(i) => { secYaz({ ...sec, fi: i }); }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {(giz > 0 || (hepsi && V.satirlar.some((r) => r.gizli))) && (
              <div className="tc-pyk-dugmeler">
                <Dugme simge={hepsi ? 'minus' : 'plus'} onClick={() => { hepsiYaz(!hepsi); }}>
                  {hepsi ? 'Yalnız bakılması gerekenler' : `${String(giz)} satır daha göster${V.gizliAd ? ` (${V.gizliAd})` : ''}`}
                </Dugme>
              </div>
            )}
            {V.not && <p className="tc-pyk-soluk tc-pyk-not">{V.not}</p>}
          </>
        )}
      </section>
      {tum && (
        <details className="tc-pyk-tum" open={tumAcik} onToggle={(o) => { tumAcikYaz(o.currentTarget.open); }}>
          <summary><Simge ad="list" boyut="k" />Tüm satırlar</summary>
          {tumAcik && <div className="tc-pyk-tum-ic">{tum}</div>}
        </details>
      )}
    </div>
  );
}

// ---------- yazma ----------
// Görünümün yazdığı her şey çalışmaya `komut.degistir` ile gider (221 c); komut yoksa ekran salt okunur.
export function yazici(komut: CalismaKomutu | null) {
  return (ne: string, ayrinti: string, fn: (t: PlanlamaCalismasi) => boolean | void, secenek: { planKoru?: boolean } = {}): boolean =>
    komut !== null && komut.degistir(ne, fn, { ayrinti, planKoru: secenek.planKoru });
}

export function TonRozeti({ ton, children }: { ton: Ton; children: ReactNode }) {
  return <Rozet ton={ton === 'tamam' ? 'tamam' : ton === 'uyari' ? 'uyari' : 'hata'}>{children}</Rozet>;
}
