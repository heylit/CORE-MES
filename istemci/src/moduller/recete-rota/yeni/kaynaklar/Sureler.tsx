import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { DurumKutusu, Dugme, Rozet, Sayfalama, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { sayi, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useSureler } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import {
  AZ_OLCUM, karsilastirmaTeorigi, ondalik, oranMetni, planTeoriktenFarkli, sapiyor, sapmaMetni, sapmaYuzdesi, SAPMA_ESIGI_YUZDE, sayiGirdisi,
  sureSuzgecindenGecer, virgullu, type SureSuzgeci,
} from './kurallar.ts';
import { SatirGirdisi, useR2Komutu } from './parcalar.tsx';

// Süreler (envanter 2.5): her ürünün yürürlükteki rotasının adımları; teorik süre, bekleyen ölçüm ve planın kullandığı süre rota
// modülünün süre görünümündendir (169 c, 171 a). Elle giriş ölçüm yazar, kabul ölçümü ürünün rota taslağına teorik süre olarak
// yazar; ikisi de rota.sure-kabul ister. Plan tabanı yalnız gösterilir (Soru 468/4, öneri a): plan teorik süreyi kullanır.
// Düzen eski ekranınkidir: tek tablo, grup başlıklı sütunlar (Adım, Teorik, Gerçekleşen, Plan); her ürün kendi satır grubudur.
type SureAdimi = SurelerCevabi['adimlar'][number];

// Eski ekrandaki gibi kaynak istasyonuyla yazılır: istasyon kodu, altında istasyon adı ve makine kodu; istasyonu olmayan kaynak kendi kodu ve adıyla.
function kaynakMetni(k: SureAdimi['kaynak']): React.ReactNode {
  if (k === null || k.id === null) return YOK;
  const ist = k.istasyon;
  if (ist === null || (k.tur === 'istasyon' && ist.id === k.id)) return <><b>{k.kod ?? k.ad}</b>{k.kod !== null && <small>{k.ad}</small>}</>;
  const alt = k.tur === 'makine' && k.kod !== null ? `${ist.ad} · ${k.kod}` : `${ist.ad} · ${k.ad}`;
  return <><b>{ist.kod}</b><small>{alt}</small></>;
}
// Hazırlık süresi rotadaki hazırlık ile ayarın toplamıdır (ayarSuresiDk, 1310 a); başlık bunu söyler (RR-9), adım panelindeki tek başına
// "Hazırlık" alanıyla karışmasın.
const TURLER = [['hazirlik', 'Hazırlık + ayar'], ['islem', 'İşlem'], ['degisim', 'Değişim']] as const;
type Tur = (typeof TURLER)[number][0];
const KAYNAK_ADI = { elle: 'Elle', terminal: 'Terminal' } as const;
const URUN_SAYFASI = 10;
const SUTUN_SAYISI = 12;
const SUZGECLER: ReadonlyArray<[SureSuzgeci, string]> = [
  ['', 'Bütün adımlar'], ['bekleyen', 'Bekleyen ölçümü olanlar'], ['sapan', `Teorikten %${String(SAPMA_ESIGI_YUZDE)}'ten fazla sapanlar`],
];

export const SURELER_ACIKLAMASI = 'Her rota adımının teorik süresi ve gerçekleşen ölçümü. Çevrim = işlem + değişim; Değişim % = değişim ÷ işlem × 100 '
  + '(işlem boş ya da 0 ise boş). Plan teorik süreyle hesaplanır. Gerçekleşen değer elle girilir ya da terminalden gelir ve ölçüm olarak bekler; '
  + 'kabul edilince ürünün rota taslağına teorik süre olarak yazılır, taslak yürürlüğe girince plan onu kullanır. Gerçekleşen hücresi son boşaltmadan '
  + `sonraki ölçümlerin ortancasını, sayısını ve aralığını gösterir; Kabul et ortancayı yazar. Sapma teorikten farktır, %${String(SAPMA_ESIGI_YUZDE)} üstü uyarıdır. `
  + 'Ortanca bütün makinelerin ölçümlerindendir. Plan sütunu yalnız plan teorikten farklı süre kullanıyorsa dolar.';

export function Sureler({ veri, yetki, git, kimlik }: EkranOzellikleri) {
  const { durum } = veri;
  const [arama, aramaYaz] = useState('');
  // 2559 a/3: Operasyonlar'daki "Kullanım: n adım" bu bölümü o operasyona süzülmüş açar (kimlik operasyon tipi kimliğidir); ayrı tablo yok.
  const [opId, opIdYaz] = useState(() => (kimlik !== null && durum.opdefs?.some((x) => x.id === kimlik) ? kimlik : ''));
  const [sayfa, sayfaYaz] = useState(1);
  const [suzgec, suzgecYaz] = useState<SureSuzgeci>('');
  // Plan sütunu (2564 a/4): görünen ürünlerden biri planda teorikten farklı süre kullanıyorsa açılır; ürünler kendi sürelerini ayrı okur.
  const [planFarki, planFarkiYaz] = useState<ReadonlySet<string>>(new Set());
  const planBildir = useCallback((urunId: string, farkli: boolean) => {
    planFarkiYaz((o) => {
      if (o.has(urunId) === farkli) return o;
      const y = new Set(o);
      if (farkli) y.add(urunId); else y.delete(urunId);
      return y;
    });
  }, []);

  const urunler = useMemo(() => {
    if (durum.routes === null || durum.routeRevs === null || durum.items === null) return null;
    const rotalar = durum.routes;
    const revler = durum.routeRevs;
    return durum.items
      .filter((i) => i.type !== 'ham' && rotalar[i.id] !== undefined)
      .sort((a, b) => a.code.localeCompare(b.code, 'tr'))
      .map((i) => ({ urun: i, rev: revler.find((r) => r.itemId === i.id && r.status === 'yururlukte') ?? null }))
      // Süzgeçte ürün, yürürlükteki revizyonunda (yoksa rotasında) o operasyonun adımı varsa kalır.
      .filter(({ urun, rev }) => !opId || (rev?.data.steps ?? rotalar[urun.id]?.steps ?? []).some((a) => a.opId === opId));
  }, [durum.routes, durum.routeRevs, durum.items, opId]);
  const kullanilan = useMemo(() => {
    const idler = new Set(Object.values(durum.routes ?? {}).flatMap((r) => r.steps.map((a) => a.opId)));
    return (durum.opdefs ?? []).filter((x) => idler.has(x.id) || x.id === opId).sort((a, b) => a.code.localeCompare(b.code, 'tr'));
  }, [durum.routes, durum.opdefs, opId]);

  if (urunler === null) {
    return (
      <div className="tc-rr2" data-parca="R2">
        <DurumKutusu durum="bos" mesaj="Ürün ya da rota okuma yetkiniz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." />
      </div>
    );
  }
  const q = arama.trim().toLocaleLowerCase('tr-TR');
  const suzulen = q ? urunler.filter((u) => `${u.urun.code} ${u.urun.name}`.toLocaleLowerCase('tr-TR').includes(q)) : urunler;
  const gorunen = suzulen.slice((sayfa - 1) * URUN_SAYFASI, sayfa * URUN_SAYFASI);
  const planAcik = gorunen.some((u) => planFarki.has(u.urun.id));

  return (
    <div className="tc-rr2" data-parca="R2">
      <div className="tc-rr2-arac">
        <input
          className="tc-alan-kutu tc-rr2-arama" type="search" value={arama} placeholder="Ürün kodu ya da adı ara…" aria-label="Ürün ara"
          onChange={(o) => { aramaYaz(o.target.value); sayfaYaz(1); }}
        />
        <select className="tc-alan-kutu tc-rr2-girdi" value={opId} aria-label="Operasyon" onChange={(o) => { opIdYaz(o.target.value); sayfaYaz(1); }}>
          <option value="">Tüm operasyonlar</option>
          {kullanilan.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
        </select>
        <select className="tc-alan-kutu tc-rr2-girdi" value={suzgec} aria-label="Ölçüm süzgeci" onChange={(o) => { suzgecYaz(o.target.value as SureSuzgeci); }}>
          {SUZGECLER.map(([d, e]) => <option key={d} value={d}>{e}</option>)}
        </select>
        <Dugme simge="route" onClick={() => git('schema')}>Ürün ve rotalar</Dugme>
        <Dugme simge="list" onClick={() => git('ops')}>Operasyonlar</Dugme>
      </div>
      {urunler.length === 0 && opId === '' && (
        <DurumKutusu durum="bos" mesaj="Rotası olan ürün yok. Ürün ve rotalar bölümünde rota oluşturunca adımlar burada görünür." />
      )}
      {urunler.length === 0 && opId !== '' && <DurumKutusu durum="bos" mesaj="Bu operasyonu kullanan yürürlükte rota adımı yok." />}
      {urunler.length > 0 && suzulen.length === 0 && <DurumKutusu durum="bos" mesaj="Aramaya uyan ürün yok." />}
      {gorunen.length > 0 && (
        <div className="tc-rr2-kaydir tc-rr2-kutu">
          <table className="tc-tablo tc-rr2-tablo tc-rr2-sure-tablo" aria-label="Süreler">
            <thead>
              <tr className="tc-rr2-tablo-grup">
                <th scope="colgroup" colSpan={5}>Adım</th>
                <th scope="colgroup" colSpan={4}>Teorik (dk)</th>
                <th scope="colgroup" colSpan={3}>Gerçekleşen (dk)</th>
                {planAcik && <th scope="colgroup">Plan</th>}
              </tr>
              <tr>
                <th scope="col">Ürün</th><th scope="col">Rev</th><th scope="col" className="tc-tablo-sag">Op no</th><th scope="col">Operasyon</th><th scope="col">Kaynak</th>
                {TURLER.map(([t, e]) => <th key={`t-${t}`} scope="col" className="tc-tablo-sag">{e}</th>)}
                <th scope="col" className="tc-tablo-sag">Değişim %</th>
                {TURLER.map(([t, e]) => <th key={`g-${t}`} scope="col" className="tc-tablo-sag">{e}</th>)}
                {planAcik && <th scope="col">Taban</th>}
              </tr>
            </thead>
            {gorunen.map(({ urun, rev }) => (
              <UrunSureleri
                key={urun.id} urunId={urun.id} kod={urun.code} ad={urun.name} revizyonId={rev ? Number(rev.id) : null} revNo={rev?.no ?? null}
                yetki={yetki} opId={opId || null} suzgec={suzgec} planAcik={planAcik} planBildir={planBildir}
              />
            ))}
          </table>
        </div>
      )}
      <Sayfalama sayfa={sayfa} sayfaBoyu={URUN_SAYFASI} toplam={suzulen.length} degistir={sayfaYaz} etiket="Ürün sayfaları" />
    </div>
  );
}

function UrunSureleri({ urunId, kod, ad, revizyonId, revNo, yetki, opId, suzgec, planAcik, planBildir }: {
  urunId: string; kod: string; ad: string; revizyonId: number | null; revNo: string | null; yetki: RrYetkisi; opId: string | null;
  suzgec: SureSuzgeci; planAcik: boolean; planBildir: (urunId: string, farkli: boolean) => void;
}) {
  const sureler = useSureler(revizyonId);
  const { calistir } = useR2Komutu();
  const { bildir } = useBildirim();
  const baslik = `${kod} ${ad}`;

  const elleYaz = async (a: SureAdimi, tur: Tur, ham: string): Promise<boolean> => {
    const g = sayiGirdisi(ham);
    if (!g.tamam) { bildir('hata', g.ileti); return false; }
    const hata = await calistir('rota-olcum-yaz', {
      adimId: a.adimId, tur, sureDk: g.deger, makineId: sureler.data?.makineId ?? null, okunanId: a.sonKayit[tur],
    }, { sureler: true });
    return hata === null;
  };
  const kabulEt = (a: SureAdimi, tur: Tur) => {
    const olcum = a.olcum[tur];
    if (!olcum) return;
    void calistir('rota-olcum-kabul', {
      adimId: a.adimId, tur, olcumId: olcum.id, deger: 'ortanca', makineId: sureler.data?.makineId ?? null, okunanId: a.sonKayit[tur],
    }, {
      sureler: true, basari: 'Ortanca kabul edildi; ürünün rota taslağına teorik süre olarak yazıldı. Taslak yürürlüğe girince plan bunu kullanır.',
      // ROT-4 ve 2564 a: taslak yürürlükteki revizyondan açılmadıysa ya da ortanca 3'ten az ölçümdense sahibi uyarı döner; kabul yapılmıştır.
      sonuc: (v) => { const u = (v as { uyari?: unknown } | null)?.uyari; if (typeof u === 'string' && u !== '') bildir('bilgi', u); },
    });
  };

  const sapma = (a: SureAdimi, tur: Tur): number | null => {
    const oz = a.ozet[tur];
    const teorik = { hazirlikDk: ondalik(a.teorik.hazirlikDk), islemDk: ondalik(a.teorik.islemDk), degisimDk: ondalik(a.teorik.degisimDk) };
    return oz ? sapmaYuzdesi(ondalik(oz.ortancaDk), karsilastirmaTeorigi(teorik, tur)) : null;
  };
  const gerceklesen = (a: SureAdimi, tur: Tur, etiket: string) => {
    const o = a.olcum[tur];
    const oz = a.ozet[tur];
    const ortanca = oz ? ondalik(oz.ortancaDk) : o ? ondalik(o.sureDk) : null;
    const s = sapma(a, tur);
    const ad = `${kod} OP ${String(a.opNo)}`;
    return (
      <span className="tc-rr2-olcum" data-tur={tur}>
        {yetki.rotaSureKabul
          ? <SatirGirdisi sayi deger={virgullu(ortanca)} etiket={`Gerçekleşen ${etiket.toLocaleLowerCase('tr-TR')} dakika, ${ad}`} kaydet={(v) => elleYaz(a, tur, v)} />
          : <span>{sayi(ortanca)}</span>}
        {s !== null && (
          <span title={`Ortancanın teorikten sapması; ±%${String(SAPMA_ESIGI_YUZDE)} üstü uyarıdır.`}><Rozet ton={sapiyor(s) ? 'uyari' : 'bilgi'} gorunum={sapiyor(s) ? 'dolu' : 'cizgi'}>{sapmaMetni(s)}</Rozet></span>
        )}
        {o && <span title="Son ölçümün kaynağı"><Rozet ton={o.kaynak === 'terminal' ? 'uyari' : 'bilgi'}>{KAYNAK_ADI[o.kaynak]}</Rozet></span>}
        {oz && (
          <small className="tc-rr2-olcum-ozet">
            {oz.n === 1 ? '1 ölçüm' : `${String(oz.n)} ölçüm · ${sayi(ondalik(oz.enAzDk))}–${sayi(ondalik(oz.enCokDk))}`}
            {oz.n < AZ_OLCUM && (
              <span className="tc-rr2-olcum-az" title={`Ortanca ${String(AZ_OLCUM)}'ten az ölçümden; kabul edilebilir ama güvenilirliği düşüktür.`}> · {String(AZ_OLCUM)}'ten az ölçüm</span>
            )}
          </small>
        )}
        {o && yetki.rotaSureKabul && (
          <Dugme simge="check" onClick={() => kabulEt(a, tur)} aria-label={`${etiket} ortancasını kabul et, ${ad}`}>Kabul et</Dugme>
        )}
      </span>
    );
  };
  const planFarkli = (a: SureAdimi): boolean => planTeoriktenFarkli(
    { hazirlikDk: ondalik(a.teorik.hazirlikDk), islemDk: ondalik(a.teorik.islemDk), degisimDk: ondalik(a.teorik.degisimDk) },
    { hazirlikDk: ondalik(a.etkin.hazirlikDk), birimSureDk: ondalik(a.etkin.birimSureDk), islemDk: ondalik(a.etkin.islemDk), degisimDk: ondalik(a.etkin.degisimDk) },
  );
  const farkVar = sureler.data?.adimlar.some(planFarkli) ?? false;
  useEffect(() => { planBildir(urunId, farkVar); }, [planBildir, urunId, farkVar]);
  useEffect(() => () => { planBildir(urunId, false); }, [planBildir, urunId]);
  const adimlar = sureler.data?.adimlar.filter((a) => (opId === null || String(a.operasyonTipi.id) === opId)
    && sureSuzgecindenGecer(suzgec, TURLER.some(([t]) => a.olcum[t] !== null), TURLER.map(([t]) => sapma(a, t))));
  const bilgi = (icerik: React.ReactNode) => <tr><td colSpan={SUTUN_SAYISI + (planAcik ? 1 : 0)}>{icerik}</td></tr>;
  const bosMetin = suzgec !== '' ? 'süzgece uyan adım yok.' : opId === null ? 'bu revizyonda adım yok.' : 'bu revizyonda bu operasyonun adımı yok.';

  return (
    <tbody aria-label={baslik}>
      {revizyonId === null && bilgi(<p className="tc-rr2-not">{baslik}: yürürlükteki rota revizyonu yok; süreler revizyon yürürlüğe girince görünür.</p>)}
      {sureler.isPending && revizyonId !== null && bilgi(<DurumKutusu durum="yukleniyor" />)}
      {sureler.isError && bilgi(
        <DurumKutusu durum="hata" mesaj={sureler.error.message || 'Süreler okunamadı.'} yenile={() => { void sureler.refetch(); }} />,
      )}
      {adimlar?.length === 0 && bilgi(<p className="tc-rr2-not">{baslik}: {bosMetin}</p>)}
      {adimlar?.map((a) => (
        <tr key={a.adimId} aria-label={`${kod} OP ${String(a.opNo)} süreleri`}>
          <td><span className="tc-rr2-iki"><b>{kod}</b><small>{ad}</small></span></td>
          <td><b>{revNo ?? YOK}</b></td>
          <td className="tc-tablo-sag"><b>{String(a.opNo)}</b></td>
          <td><small>{a.operasyonTipi.ad}</small></td>
          <td><span className="tc-rr2-iki">{a.fason ? 'Fason' : kaynakMetni(a.kaynak)}</span></td>
          {TURLER.map(([t]) => <td key={`t-${t}`} className="tc-tablo-sag"><b>{sayi(ondalik(a.teorik[`${t}Dk`]))}</b></td>)}
          <td className="tc-tablo-sag">{oranMetni(ondalik(a.teorik.degisimOraniYuzde))}</td>
          {TURLER.map(([t, e]) => <td key={`g-${t}`} className="tc-tablo-sag">{gerceklesen(a, t, e)}</td>)}
          {planAcik && (
            <td>
              {planFarkli(a) && (
                <span className="tc-rr2-iki">
                  <b>Teorikten farklı</b>
                  <small>Planda: hazırlık + ayar {sayi(ondalik(a.etkin.hazirlikDk))}, işlem {sayi(ondalik(a.etkin.islemDk))}, değişim {sayi(ondalik(a.etkin.degisimDk))} dk</small>
                </span>
              )}
            </td>
          )}
        </tr>
      ))}
    </tbody>
  );
}
