import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlanOnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanVerisi } from '../tipler.ts';
import type { EmirNo } from '../ortak/emir-no.ts';
import { DURUM_ADI, gunYaz, kovaBasi, sayiYaz, tedarikTerminiSatirlari, tlYaz, type PlanSatiri } from './kurallar.ts';
import {
  LISTE_ADI, LISTE_DURUMLARI, LISTE_TONU, acilTalepler, aramaUyar, durumSayilari, gerekenGun, talepEdilebilir, talepEksigi,
  type ListeDurumu, type MalzemeListeSatiri,
} from './liste.ts';
import { TerminGirdisi } from './TedarikTermini.tsx';
import { TALEP_YOLU } from './TopluPlan.tsx';
import { gunlukTuketim, isoGun } from './toplu-talep.ts';

// 3537 a: malzeme satın alma planının Liste görünümü (Kokpit dili). Üstte süzgeç çipleri ve arama, malzeme başına tek satır, satırda tek
// eylem (Talep aç, Talepte ya da Termin gir); satır açılınca neden, açık siparişler, günlük tüketim ve termin. Şeritte tek birincil:
// günü geçen ve eksik malzemelerin talebi. Plan sipariş vermez (222 a): talep Taleplerim'in yeni talep formuna taslakla gider (3485 a).

const ESIK = 1e-9;
const ACILIM_GUNU = 14;
const OKUNUYOR = 'Açık talepler okunuyor; bitince açılır.';

export interface MalzemeListesiOzellikleri {
  satirlar: readonly MalzemeListeSatiri[];
  plan: readonly PlanSatiri[];
  D: PlanVerisi;
  taban: number;
  simdi: number;
  dar: boolean;
  fg: boolean;
  malzemeAdi: (kod: string) => string;
  birim: (kod: string) => string;
  kartKodu: (kod: string) => string | null;
  malzemeTedarikcisi: (kod: string) => string | null;
  tedarikci: (t: string) => string;
  fiyat: (kod: string, q: number) => number | null;
  stok: (kod: string) => number | null;
  emirNo: EmirNo;
  // Açık talepler (malzeme no -> miktar); okunamadıysa null, okunuyorsa undefined.
  talepler: ReadonlyMap<string, number> | null | undefined;
  talepAcar: boolean;
  terminYazar: boolean;
  yenile: () => void;
  // Emri Kokpit'te seçer; yoksa (Satın Alma) emir düğmesi pasif.
  goster?: (j: string) => void;
  // Görünüm seçici: şeridin başında durur.
  gorunum: ReactNode;
}

export function MalzemeListesi(o: MalzemeListesiOzellikleri) {
  const { satirlar, taban, simdi, dar, malzemeAdi, emirNo, talepler, talepAcar } = o;
  const git = useNavigate();
  const [suz, suzYaz] = useState<ListeDurumu | null>(null);
  const [ara, araYaz] = useState('');
  const [acik, acikYaz] = useState<string | null>(null);
  const talep = (kod: string): number => talepler?.get(kod) ?? 0;
  // Açık talepler okunurken talep açılmaz: taslak açık talep düşülmeden dolardı (3537-2 Risk).
  const okunuyor = talepler === undefined;
  const tedarikciOf = (x: MalzemeListeSatiri): string | null => (x.tedarikci === null ? o.malzemeTedarikcisi(x.kod) : o.tedarikci(x.tedarikci));
  const say = durumSayilari(satirlar);
  const gorunen = satirlar.filter((x) => (suz === null || x.durum === suz) && aramaUyar(x, ara, malzemeAdi, emirNo, tedarikciOf(x)));
  const acil = acilTalepler(satirlar, talep);
  const miktar = (q: number, kod: string): string => `${sayiYaz(q, q < 10 ? 1 : 0)} ${o.birim(kod)}`.trim();

  const talepAc = (xs: readonly MalzemeListeSatiri[]): void => {
    const taslak: PlanOnTalep[] = xs.flatMap((x) => {
      const q = talepEksigi(x, talep(x.kod));
      const g = gerekenGun(x);
      if (q <= 0 || !talepEdilebilir(x.kod)) return [];
      return [{
        kaynak: 'plan' as const, malzeme: { no: Number(x.kod), kod: o.kartKodu(x.kod) ?? x.kod, ad: malzemeAdi(x.kod) }, miktar: q, birim: o.birim(x.kod),
        gerekenTarih: isoGun(taban, g === null ? simdi : Math.max(kovaBasi(taban, 'gun', simdi), g)), emirler: [...new Set(x.isler.map(emirNo))],
        stokBilinmiyor: o.stok(x.kod) === null, hesap: { eksik: q, siparis: 0, talep: 0, yoksayilan: 0 },
      }];
    });
    void git(TALEP_YOLU, { state: { taslak } });
  };

  const eylem = (x: MalzemeListeSatiri): ReactNode => {
    const q = talepEksigi(x, talep(x.kod));
    if (talepAcar && talepEdilebilir(x.kod) && q > 0) {
      return <Dugme simge="plus" disabled={okunuyor} title={okunuyor ? OKUNUYOR : undefined} onClick={() => { talepAc([x]); }} aria-label={`${x.kod} için talep aç`}>Talep aç</Dugme>;
    }
    if (x.eksik > ESIK && talep(x.kod) > ESIK) {
      return <Link className="tc-pyz-l-bag" to="/taleplerim"><Simge ad="check" boyut="k" />{`Talepte ${miktar(talep(x.kod), x.kod)}`}</Link>;
    }
    if (o.terminYazar && talepEdilebilir(x.kod) && x.durum === 'terminsiz') {
      return <Dugme simge="clock" aria-expanded={acik === x.kod} onClick={() => { acikYaz(x.kod); }} aria-label={`${x.kod} için termin gir`}>Termin gir</Dugme>;
    }
    return null;
  };

  const tarih = (t: number | null): ReactNode => (t === null ? <span className="tc-pyz-bos">—</span> : <span className="mono">{gunYaz(taban, t)}</span>);
  const sutunSayisi = 7;

  return (
    <>
      <div className="tc-pyz-serit">
        {o.gorunum}
        <span className="tc-pyz-suzgec" role="group" aria-label="Durum süzgeci">
          {LISTE_DURUMLARI.filter(([d]) => say[d] > 0 || suz === d).map(([d, ad]) => (
            <button type="button" key={d} data-ton={LISTE_TONU[d]} aria-pressed={suz === d} onClick={() => { suzYaz(suz === d ? null : d); }}><b>{say[d]}</b>{ad}</button>
          ))}
        </span>
        <label className="tc-pyz-ara"><Simge ad="search" boyut="k" /><input type="search" value={ara} placeholder="Malzeme, emir, tedarikçi" aria-label="Ara" onChange={(e) => { araYaz(e.target.value); }} /></label>
        {talepAcar && acil.length > 0 && (
          <Dugme tur="birincil" simge="plus" className="tc-pyz-birincil" disabled={okunuyor} title={okunuyor ? OKUNUYOR : undefined} onClick={() => { talepAc(acil); }}>
            {`Talep aç: günü geçen ve eksik (${acil.length})`}
          </Dugme>
        )}
      </div>
      {talepler === null && <p className="tc-pyz-kucuk" data-ton="uyari">Açık talepler okunamadı (yetki yok ya da uç yanıt vermedi); eksikten düşülmedi.</p>}
      {satirlar.length > 0 && acil.length === 0 && say.gecti + say.eksik === 0 && (
        <p className="tc-pyz-l-iyi"><Simge ad="check" boyut="k" />Günü geçen ya da eksik malzeme yok.</p>
      )}
      <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
        <table className="tc-tablo tc-pyz-l" aria-label="Malzemeler">
          <thead><tr>
            <th>Malzeme</th><th>İlk ihtiyaç</th><th>En geç sipariş</th><th className="tc-pyz-num">Eksik (gelen düşülmüş)</th><th>Emirler</th><th>Tedarikçi</th><th><span className="tc-gizli-etiket">Eylem</span></th>
          </tr></thead>
          <tbody>
            {satirlar.length === 0 && <tr><td colSpan={sutunSayisi} className="tc-pyz-kucuk">Plandaki işlerin malzemesi tanımlı değil.</td></tr>}
            {satirlar.length > 0 && gorunen.length === 0 && (
              <tr><td colSpan={sutunSayisi} className="tc-pyz-kucuk">
                Süzgece uyan malzeme yok. <button type="button" className="tc-pyz-l-temizle" onClick={() => { suzYaz(null); araYaz(''); }}>Süzgeci temizle</button>
              </td></tr>
            )}
            {gorunen.map((x) => {
              const acikMi = acik === x.kod;
              const ted = tedarikciOf(x);
              return (
                <Fragment key={x.kod}>
                  <tr data-ton={LISTE_TONU[x.durum] === 'hata' ? 'hata' : undefined} data-acik={acikMi ? '' : undefined}>
                    <td data-baslik="" className="tc-pyz-l-ad tc-tablo-tam">
                      <button type="button" className="tc-pyz-l-ac" aria-expanded={acikMi} onClick={() => { acikYaz(acikMi ? null : x.kod); }}>
                        <Simge ad="chev-right" boyut="k" />
                        <span className="tc-pyz-l-kim">
                          <span><b className="mono">{x.kod}</b> <span className="tc-pyz-kucuk">{malzemeAdi(x.kod)}</span></span>
                          <Rozet ton={LISTE_TONU[x.durum]}>{LISTE_ADI[x.durum]}</Rozet>
                        </span>
                      </button>
                    </td>
                    <td data-baslik="İlk ihtiyaç">{tarih(x.ilkIhtiyac)}</td>
                    <td data-baslik="En geç sipariş" data-bos={x.enGecSiparis === null ? '' : undefined}>
                      {tarih(x.enGecSiparis)}{x.enGecSiparis !== null && x.enGecSiparis < simdi && <small className="tc-pyz-not" data-ton="hata">geçti</small>}
                    </td>
                    <td data-baslik="Eksik" className="tc-pyz-num" data-bos={x.eksik > ESIK || x.gelen > ESIK ? undefined : ''}>
                      {x.eksik > ESIK ? <b data-ton="hata">{miktar(Math.ceil(x.eksik), x.kod)}</b> : <span className="tc-pyz-bos">—</span>}
                      {x.gelen > ESIK && <small className="tc-pyz-not">{`${miktar(x.gelen, x.kod)} geliyor${x.ilkGelis === null ? '' : ` ${gunYaz(taban, x.ilkGelis).slice(0, 5)}`}`}</small>}
                    </td>
                    <td data-baslik="Emirler"><span className="tc-pyz-l-emir">{x.isler.length ? x.isler.map((j) => <span key={j} className="mono">{emirNo(j)}</span>) : '—'}</span></td>
                    <td data-baslik="Tedarikçi" data-bos={ted === null ? '' : undefined}>{ted ?? <span className="tc-pyz-bos">—</span>}</td>
                    <td data-baslik="" className="tc-pyz-l-eylem">{eylem(x)}</td>
                  </tr>
                  {acikMi && (
                    <tr className="tc-pyz-l-acilim">
                      <td colSpan={sutunSayisi} data-baslik="" className="tc-tablo-tam">
                        <Acilim x={x} o={o} miktar={miktar} talepte={talep(x.kod)} kapat={() => { acikYaz(null); }} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function neden(x: MalzemeListeSatiri, o: MalzemeListesiOzellikleri, miktar: (q: number, kod: string) => string): string {
  const g = (t: number | null): string => (t === null ? '—' : gunYaz(o.taban, t));
  const ilk = x.isler[0] ? o.emirNo(x.isler[0]) : null;
  const ihtiyac = `${ilk ? `${ilk} ` : ''}${g(x.ilkIhtiyac)} başlıyor`;
  const eksik = miktar(Math.ceil(x.eksik), x.kod);
  switch (x.durum) {
    case 'gecti': return `Sipariş verilmedi. ${ihtiyac} ve ${eksik} eksik; en geç sipariş günü ${g(x.enGecSiparis)} geçti. Talep açılmazsa Kokpit bu emri malzeme bekliyor diye işaretler.`;
    case 'eksik': {
      const sure = x.alimlar.some((r) => r.src === null && r.siparisGun === null) ? ' tedarik süresi tanımlı olmadığı için en geç sipariş günü hesaplanamadı.' : '';
      const gec = x.alimlar.some((r) => r.src !== null && r.durum === 'geciktirir') ? ` Açık sipariş işin en geç başlayabileceği günden sonra geliyor (planda geliş ${g(x.ilkGelis)}).` : '';
      return `${ihtiyac}${x.eksik > ESIK ? ` ve ${eksik} eksik` : ''};${sure || ' o gün malzeme yetmiyor.'}${gec}`;
    }
    case 'verilmeli': return `${ihtiyac} ve ${eksik} eksik; zamanında gelmesi için en geç ${g(x.enGecSiparis)} sipariş verilmeli.`;
    case 'terminsiz': return `${ihtiyac}; açık siparişin Satın Alma termini girilmedi, plan olması gereken tarihte gelmiş sayıyor.`;
    case 'geliyor': return `${ihtiyac}; açık sipariş ${g(x.ilkGelis)} geliyor ve işi karşılıyor.`;
    case 'stokta': return `${ihtiyac}; ihtiyaç stoktan karşılanıyor.`;
  }
}

function Acilim({ x, o, miktar, talepte, kapat }: {
  x: MalzemeListeSatiri; o: MalzemeListesiOzellikleri; miktar: (q: number, kod: string) => string; talepte: number; kapat: () => void;
}) {
  const { taban, simdi } = o;
  const bugun = kovaBasi(taban, 'gun', simdi);
  const tuketim = useMemo(() => gunlukTuketim({
    satirlar: o.plan.filter((s) => s.kod === x.kod), taban, simdi, bas: bugun, bit: bugun + (ACILIM_GUNU - 1) * 24, stok: o.stok, talep: () => talepte,
  }).satirlar[0] ?? null, [o.plan, o.stok, x.kod, taban, simdi, bugun, talepte]);
  const acik = x.alimlar.filter((r) => r.src !== null);
  const termin = o.terminYazar && talepEdilebilir(x.kod) ? tedarikTerminiSatirlari(o.D, x.alimlar)[0] ?? null : null;
  const tutar = o.fg && x.eksik > ESIK ? o.fiyat(x.kod, Math.ceil(x.eksik)) : null;
  return (
    <section className="tc-pyz-l-ic" aria-label={`${x.kod} · ${LISTE_ADI[x.durum]}`}>
      <p className="tc-pyz-l-neden">{neden(x, o, miktar)}{tutar !== null && ` Eksiğin tutarı ${tlYaz(tutar)}.`}</p>
      {tuketim && (
        <div>
          <h4 className="tc-pyz-alt"><Simge ad="grid" boyut="k" />Günlük tüketim</h4>
          <ul className="tc-pyz-l-gunler" aria-label={`${x.kod} günlük tüketim`}>
            {[...tuketim.gunler].sort(([a], [b]) => a - b).map(([gun, h]) => (
              <li key={gun} data-ton={h.eksik > ESIK ? 'hata' : undefined}>
                <span className="mono">{gunYaz(taban, gun).slice(0, 5)}</span><b className="mono">{miktar(h.tuketim, x.kod)}</b>
                {h.eksik > ESIK && <small>{`eksik ${miktar(h.eksik, x.kod)}`}</small>}
              </li>
            ))}
          </ul>
          <p className="tc-pyz-kucuk">Kırmızı gün stok ve gelen siparişle karşılanmıyor{talepte > ESIK ? `; açık talep (${miktar(talepte, x.kod)}) düşüldü` : ''}.</p>
        </div>
      )}
      {acik.length > 0 && (
        <div>
          <h4 className="tc-pyz-alt"><Simge ad="truck" boyut="k" />Açık siparişler</h4>
          <ul className="tc-pyz-l-siparisler">
            {acik.map((r) => (
              <li key={String(r.src)}>
                <span className="mono">{r.no ?? '—'}</span>
                <span>{miktar(r.miktar, x.kod)}</span>
                <span>{r.tedarikci === null ? '' : o.tedarikci(r.tedarikci)}</span>
                <span>{r.etkin === null ? 'termin bekleniyor' : `planda geliş ${gunYaz(taban, r.etkin)}`}</span>
                <Rozet ton={r.durum === 'geciktirir' ? 'hata' : r.tb ? 'uyari' : 'tamam'} gorunum="cizgi">{DURUM_ADI[r.durum]}</Rozet>
              </li>
            ))}
          </ul>
        </div>
      )}
      {termin && (
        <label className="tc-pyz-l-termin">
          <span className="tc-pyz-kucuk">Tedarik termini (Satın Alma'daki kayıtla aynı; malzeme başına)</span>
          <TerminGirdisi key={`${termin.kod}|${termin.surum ?? 0}|${termin.termin ?? ''}`} x={termin} yenile={o.yenile} />
        </label>
      )}
      <div className="tc-pyz-l-emirler">
        {/* Satın Alma'da Kokpit yoktur: pasif düğme yerine hiç çizilmez (3537-1 Arayüz önerisi b). */}
        {o.goster && x.isler.slice(0, 6).map((j) => (
          <Dugme key={j} simge="target" title="Bu malzemeyi bekleyen emri Kokpit'te seçer." onClick={() => { o.goster?.(j); }}>{`Kokpit'te aç · ${o.emirNo(j)}`}</Dugme>
        ))}
        <button type="button" className="tc-pyz-l-temizle" onClick={kapat}>Kapat</button>
      </div>
    </section>
  );
}
