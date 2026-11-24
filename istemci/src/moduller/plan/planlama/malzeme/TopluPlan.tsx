import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlanOnTalep, TedarikTerminleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, Kart, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { EmirNo } from '../ortak/emir-no.ts';
import { gunYaz, kovaBasi, saatOku, sayiYaz, sonrakiKova, type PlanSatiri } from './kurallar.ts';
import type { ListeDurumu } from './liste.ts';
import { matrisDurumu, stokYeterGunu, stokYeterMetni, STOK_UFKU, ufukOzeti } from './matris.ts';
import {
  TOPLU_DUZENLER, acikTalepler, gunlukTuketim, isoGun, sutunHucresi, sutunlar, teslimler,
  type GunHucresi, type Sutun, type TopluDuzen, type TuketimSatiri,
} from './toplu-talep.ts';

// 3485 a, 3666: sayfanın asıl görünümü, malzeme x gün matrisi. Planın malzemesi gün gün; eksik gün kırmızı, sipariş gelen gün mavi; satırda durum,
// "Stok yeter" ve tek malzemeye "Talep". Seçili malzemelerin eksiği seçilen düzende kaleme döner ve Taleplerim'in yeni talep formu dolu açılır
// (TaleplerimSayfasi taslak). Plan sipariş vermez (222 a); talep satın almaya form gönderilince gider. Açık talep satın almanın termin takibinden
// okunur; okunamazsa düşülmez ve kart bunu söyler.

export const TALEP_YOLU = '/taleplerim?bolum=yeni';
const ESIK = 1e-9;
type Gosterim = 'tuketim' | 'kalan' | 'eksik';
const GOSTERIMLER: readonly [Gosterim, string][] = [['tuketim', 'Tüketim'], ['kalan', 'Kalan stok'], ['eksik', 'Eksik']];
type Kisayol = 'ufuk' | 'hafta' | 'ay' | null;
type Suzgec = 'hepsi' | 'eksik' | 'gecti' | 'gelen' | 'yeter';
const SUZGECLER: readonly [Suzgec, string][] = [['hepsi', 'Tümü'], ['eksik', 'Stok yetmeyen'], ['gecti', 'Sipariş günü geçti'], ['gelen', 'Siparişi gelen'], ['yeter', 'Yetiyor']];
const GUN_MS = 24;

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
  // Satın alma planından: malzemenin liste durumu, açık siparişlerinin geliş günleri ve en geç sipariş günü (saat); yoksa null.
  durum: (kod: string) => ListeDurumu | null;
  gelisler: (kod: string) => ReadonlyMap<number, number>;
  siparisGunu: (kod: string) => number | null;
  // Satırın ayrıntısı: Liste görünümünde açılımı açar.
  ayrinti: (kod: string) => void;
  // 1024 altı: durum ve Talep malzeme adının altına iner, sütun sayısı 7 gündür.
  orta: boolean;
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

export function useAcikTalepler(verilen: ReadonlyMap<string, number> | null | undefined): ReadonlyMap<string, number> | null | undefined {
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
  return verilen !== undefined ? verilen : m;
}

export function TopluPlan({ satirlar, taban, simdi, dar, orta, stok, malzemeAdi, birim, kart, emirNo, durum, gelisler, siparisGunu, ayrinti, talepAcar, talepler: verilen }: TopluPlanOzellikleri) {
  const git = useNavigate();
  const talepler = useAcikTalepler(verilen);
  const bugun = kovaBasi(taban, 'gun', simdi);
  const gunSayisi = orta ? 7 : STOK_UFKU;
  const ufukSonu = bugun + (STOK_UFKU - 1) * GUN_MS;
  const haftaSonu = sonrakiKova(taban, 'hafta', kovaBasi(taban, 'hafta', simdi)) - 24;
  const aySonu = sonrakiKova(taban, 'ay', kovaBasi(taban, 'ay', simdi)) - 24;
  const [bas, basYaz] = useState(bugun);
  const [bit, bitYaz] = useState(bugun + (gunSayisi - 1) * GUN_MS);
  const [kisayol, kisayolYaz] = useState<Kisayol>('ufuk');
  const [goster, gosterYaz] = useState<Gosterim>('tuketim');
  const [duzen, duzenYaz] = useState<TopluDuzen>('gunluk');
  const [n, nYaz] = useState('3');
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [ara, araYaz] = useState('');
  const [secim, secimYaz] = useState<ReadonlySet<string> | null>(null);
  const [acik, acikYaz] = useState<ReadonlySet<string>>(new Set());

  const tablo = useMemo(() => gunlukTuketim({
    satirlar, taban, simdi, bas, bit: Math.max(bas, bit), stok, talep: (kod) => talepler?.get(kod) ?? 0,
  }), [satirlar, taban, simdi, bas, bit, stok, talepler]);
  // Durum ve "Stok yeter" seçilen aralıktan bağımsız, bugünden 14 günlük bakıştandır.
  const ufuk = useMemo(() => gunlukTuketim({
    satirlar, taban, simdi, bas: bugun, bit: ufukSonu, stok, talep: (kod) => talepler?.get(kod) ?? 0,
  }), [satirlar, taban, simdi, bugun, ufukSonu, stok, talepler]);
  const ufukSatiri = useMemo(() => new Map(ufuk.satirlar.map((s) => [s.kod, s])), [ufuk]);
  const { ilkEksikGunu } = ufukOzeti(ufuk.satirlar);
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

  const bilgi = (s: TuketimSatiri) => {
    const k = ufukSatiri.get(s.kod) ?? s;
    return { durum: matrisDurumu(durum(s.kod), k.eksik, k.talepte), yetmeyen: k.eksik + k.talepte > ESIK, yeter: stokYeterMetni(stokYeterGunu(ufukSatiri.get(s.kod), bugun), stok(s.kod) === null) };
  };
  const suzgeceUyar = (s: TuketimSatiri, z: Suzgec): boolean => {
    if (z === 'hepsi') return true;
    if (z === 'eksik') return bilgi(s).yetmeyen;
    if (z === 'gecti') return durum(s.kod) === 'gecti';
    if (z === 'gelen') return gelisler(s.kod).size > 0;
    return !bilgi(s).yetmeyen;
  };
  const aranan = ara.trim().toLocaleLowerCase('tr-TR');
  const aramaUyar = (s: TuketimSatiri): boolean => aranan === '' || `${malzemeAdi(s.kod)} ${kart(s.kod)?.kod ?? s.kod}`.toLocaleLowerCase('tr-TR').includes(aranan);
  const gorunen = tablo.satirlar.filter((s) => suzgeceUyar(s, suzgec) && aramaUyar(s));

  const uzunluk = Math.max(bas, bit) - bas;
  const pencere = (yeniBas: number): void => { const b = Math.max(bugun, yeniBas); basYaz(b); bitYaz(b + uzunluk); kisayolYaz(null); };
  const tarihGir = (v: string, yaz: (t: number) => void): void => {
    const t = saatOku(taban, v);
    if (t !== null) { yaz(kovaBasi(taban, 'gun', t)); kisayolYaz(null); }
  };
  const kisayolSec = (k: 'ufuk' | 'hafta' | 'ay'): void => {
    basYaz(bugun);
    bitYaz(k === 'ufuk' ? bugun + (gunSayisi - 1) * GUN_MS : k === 'hafta' ? haftaSonu : aySonu);
    kisayolYaz(k);
  };
  const isaretle = (kod: string, v: boolean): void => {
    const y = new Set(secili);
    if (v) y.add(kod); else y.delete(kod);
    secimYaz(y);
  };
  const ac = (kod: string): void => { acikYaz((a) => { const y = new Set(a); if (y.has(kod)) y.delete(kod); else y.add(kod); return y; }); };
  const miktar = (q: number, kod: string): string => `${sayiYaz(q, q < 10 ? 1 : 0)} ${birim(kod)}`.trim();

  const talepAc = (liste: readonly { s: TuketimSatiri; l: ReturnType<typeof teslimler> }[]): void => {
    const taslak: PlanOnTalep[] = liste.flatMap(({ s, l }) => {
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

  const gelenMiktar = (kod: string, c: Sutun): number => { const m = gelisler(kod); return c.gunler.reduce((a, g) => a + (m.get(g) ?? 0), 0); };
  const siparisGunuMu = (kod: string, c: Sutun): boolean => { const t = siparisGunu(kod); return t !== null && c.gunler.includes(kovaBasi(taban, 'gun', t)); };
  const hucre = (s: TuketimSatiri, h: GunHucresi | null, gel: number): { ana: ReactNode; alt: string; ton: 'hata' | 'bilgi' | undefined } => {
    const gelir = gel > ESIK ? `+${miktar(gel, s.kod)} gelir` : '';
    if (h === null) return { ana: <span className="tc-pyz-bos">·</span>, alt: gelir, ton: gelir ? 'bilgi' : undefined };
    const ton = h.eksik > ESIK ? 'hata' : h.siparisten > ESIK || gelir ? 'bilgi' : undefined;
    const alt = h.eksik > ESIK ? `eksik ${miktar(h.eksik, s.kod)}` : h.siparisten > ESIK ? `siparişten ${miktar(h.siparisten, s.kod)}` : gelir || (h.kalan === null ? '' : `kalan ${miktar(h.kalan, s.kod)}`);
    if (goster === 'kalan') return { ana: h.kalan === null ? '—' : miktar(h.kalan, s.kod), alt: h.eksik > ESIK ? alt : gelir, ton };
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
  const durumHucresi = (s: TuketimSatiri, eksikVar: boolean) => {
    const b = bilgi(s);
    return (
      <div className="tc-pyz-tp-durum">
        <Rozet ton={b.durum.ton} gorunum="cizgi">{b.durum.ad}</Rozet>
        {eksikVar && <span className="mono tc-pyz-kucuk">{`eksik ${miktar(s.eksik, s.kod)}`}</span>}
        {eksikVar && talepAcar && secilebilirMi(s.kod) && (
          <Dugme simge="plus" aria-label={`${malzemeAdi(s.kod) || s.kod} için talep aç`} onClick={() => { talepAc([{ s, l: teslimler(s, taban, duzen, nSayi, bas) }]); }}>Talep</Dugme>
        )}
      </div>
    );
  };

  return (
    <Kart baslikEki={<span className="tc-pyz-baslik"><Simge ad="grid" boyut="k" />Günlük tüketim<span className="tc-pyz-kucuk">plandaki işlerin malzemesi, gün gün</span></span>}>
      <div className="tc-pyz-ust">
        <Segment etiket="Süzgeç" secenekler={SUZGECLER.map(([k, ad]) => [k, `${ad} ${String(tablo.satirlar.filter((s) => suzgeceUyar(s, k)).length)}`] as const)} secili={suzgec} sec={suzgecYaz} />
        <input className="tc-alan-kutu tc-pyz-tp-ara" type="search" aria-label="Malzeme ara" placeholder="Malzeme ara" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
        <span className="tc-pyz-tp-grup"><span className="tc-pyz-kucuk">Göster</span><Segment etiket="Göster" secenekler={GOSTERIMLER} secili={goster} sec={gosterYaz} /></span>
      </div>
      <div className="tc-pyz-ust tc-pyz-tp-ust">
        <span className="tc-pyz-tp-grup" role="group" aria-label="Gün penceresi">
          <Dugme aria-label="Önceki gün" disabled={bas <= bugun} onClick={() => { pencere(bas - GUN_MS); }}>‹</Dugme>
          <Dugme aria-label="Sonraki gün" onClick={() => { pencere(bas + GUN_MS); }}>›</Dugme>
          <Dugme onClick={() => { pencere(bugun); }}>Bugün</Dugme>
          {!(ilkEksikGunu !== null && ilkEksikGunu <= bugun) && (
            <Dugme disabled={ilkEksikGunu === null} onClick={() => { if (ilkEksikGunu !== null) pencere(ilkEksikGunu - GUN_MS); }}>
              {ilkEksikGunu === null ? 'İlk eksik yok' : `İlk eksiğe git (${gunYaz(taban, ilkEksikGunu)})`}
            </Dugme>
          )}
        </span>
        <span className="tc-pyz-tp-grup">
          <span className="tc-pyz-kucuk">Aralık</span>
          <span className="tc-pyz-tp-tarihler">
            <input className="tc-alan-kutu" type="date" lang="tr" aria-label="Başlangıç" value={isoGun(taban, bas)} onChange={(e) => { tarihGir(e.target.value, basYaz); }} />
            <span aria-hidden="true">–</span>
            <input className="tc-alan-kutu" type="date" lang="tr" aria-label="Bitiş" value={isoGun(taban, bit)} onChange={(e) => { tarihGir(e.target.value, bitYaz); }} />
          </span>
          <Segment etiket="Aralık kısayolu" secenekler={[['ufuk', `${String(gunSayisi)} gün`], ['hafta', 'Bu hafta'], ['ay', 'Bu ay']] as const} secili={kisayol} sec={kisayolSec} />
        </span>
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
      {gorunen.length === 0
        ? <p className="tc-pyz-kucuk">{tablo.satirlar.length === 0 ? 'Bu aralıkta plandaki işlerin malzemesi yok.' : 'Bu süzgeçte malzeme yok.'}</p>
        : (
          <div className="tc-tablo-kap tc-pyz-tp-kap" data-kip={dar ? 'kart' : undefined} data-kaydir={dar ? undefined : ''}>
            <table className="tc-tablo tc-pyz-tablo tc-pyz-tp" aria-label="Günlük tüketim">
              <thead><tr>
                <th className="tc-tablo-sabit-sol tc-pyz-tp-ad">Malzeme</th>
                {kolonlar.map((c, i) => <th key={c.bas} data-bugun={c.gunler.includes(bugun) ? '' : undefined}>{kolonAdi(i)}</th>)}
                {!orta && <th className="tc-pyz-num">Toplam tüketim</th>}
                {!orta && <th className="tc-tablo-sabit-sag">Durum</th>}
              </tr></thead>
              <tbody>
                {gorunen.map((s) => {
                  const eksikVar = s.eksik > ESIK;
                  const st = stok(s.kod);
                  const b = bilgi(s);
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
                          <span className="tc-pyz-kucuk">{`Stokta ${st === null ? '—' : miktar(st, s.kod)} · Stok yeter: `}<b className="mono">{b.yeter}</b></span>
                          {orta && durumHucresi(s, eksikVar)}
                          <button type="button" className="tc-pyz-tp-ac" onClick={() => { ayrinti(s.kod); }}>Ayrıntı</button>
                        </span>
                        </div>
                      </td>
                      {kolonlar.map((c, i) => {
                        const h = sutunHucresi(s, c);
                        const gel = gelenMiktar(s.kod, c);
                        if (!butun && !(h && h.eksik > ESIK) && gel <= ESIK) return null;
                        const x = hucre(s, h, gel);
                        return (
                          <td key={c.bas} data-baslik={kolonAdi(i)} data-ton={x.ton} className="tc-pyz-tp-gun">
                            {x.ana}{siparisGunuMu(s.kod, c) && <span className="tc-pyz-tp-ps" role="img" aria-label="En geç sipariş günü" title="En geç sipariş günü"><Simge ad="clock" boyut="k" /></span>}
                            {x.alt && <small>{x.alt}</small>}
                          </td>
                        );
                      })}
                      {dar && (
                        <td data-baslik="">
                          <button type="button" className="tc-pyz-tp-ac" aria-expanded={acik.has(s.kod)} onClick={() => { ac(s.kod); }}>
                            {acik.has(s.kod) ? 'Yalnız eksik günler' : 'Bütün günler'}
                          </button>
                        </td>
                      )}
                      {!orta && <td data-baslik="Toplam" className="tc-pyz-num">{miktar(s.toplam, s.kod)}</td>}
                      {!orta && <td data-baslik="Durum" className="tc-tablo-sabit-sag">{durumHucresi(s, eksikVar)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {!dar && gorunen.length > 0 && <p className="tc-pyz-tp-not">{`Aralıkta ${String(kolonlar.length)} sütun var; sığmayanlar için tabloyu sağa kaydırın. "Toplam tüketim" ve satırdaki "eksik" toplamı, görünmeyen günleri de içeren bütün aralıktır.`}</p>}
      <p className="tc-pyz-tp-not">
        {talepler === null && <span data-ton="uyari">Açık talepler okunamadı (yetki yok ya da uç yanıt vermedi); eksikten düşülmedi. </span>}
        Eksik: stokla ve açık siparişle karşılanmayan, açık talep düşülmüş miktar; stok tarihe göre en erken işlere ayrılır, bu yüzden stoğu olan malzeme de erken günde eksik görünebilir. Saat simgesi en geç sipariş gününü gösterir. Süzgeç sayıları toplanmaz: bir malzeme birden çok süzgeçte
        sayılabilir. Talebi topla: seçili malzemelerin aralıktaki eksiği günlük, haftalık, aylık, her N günde bir ya da tek teslim olarak kaleme döner; teslim tarihi grubun ilk eksik günüdür;
        talep formu dolu açılır, gönderilene kadar satın almaya gitmez. {tablo.gunler.length > kolonlar.length ? 'Uzun aralıkta sütunlar haftalık toplanır.' : ''}
      </p>
      {talepAcar && secilenler.length > 0 && (
        <div className="tc-pyz-tp-serit" data-dar={dar ? '' : undefined} role="region" aria-label="Toplu talep">
          <span>{`${String(secilenler.length)} malzeme · ${String(kalemSayisi)} kalem (${TOPLU_DUZENLER.find((d) => d[0] === duzen)?.[1].toLocaleLowerCase('tr-TR') ?? ''})`}</span>
          <span className="tc-pyz-tp-grup">
            <Dugme onClick={() => { secimYaz(new Set()); }}>Seçimi kaldır</Dugme>
            <Dugme tur="birincil" simge="plus" onClick={() => { talepAc(plan); }}>{`Talep aç (${String(kalemSayisi)} kalem)`}</Dugme>
          </span>
        </div>
      )}
    </Kart>
  );
}
