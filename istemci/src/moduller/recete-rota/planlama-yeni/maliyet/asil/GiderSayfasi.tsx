import { useState, type FormEvent } from 'react';
import { Dugme, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaGorunumu } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  aktifSiparisler, birimMaliyet, dolayliAylik, gecikmeBedeli, kalemTutari, maliyetSistemi, malzemeler, mesaiSistemi, MS_ANAHTAR, MS_TUR, sayi,
  sayiGirdisi, sgkKatsayisi, tl, tlSaat, ymAyar, type GenelGiderHesabi, type TezgahGideri,
} from '../kurallar.ts';
import {
  dolayliEkleYaz, dolayliSilYaz, dolayliYaz, giderKipYaz, kalemEkleYaz, kalemSilYaz, kalemYaz, kwhYaz, makineyeYaz, tezGiderYaz, verimYaz, type Yaz,
} from '../yazmalar.ts';
import { Alan, AltNot, AsilKart, Kilit, Kpi, MetinGir, Not, SayiGir, SecimGir, Segment } from './girdi.tsx';

// Genel gider sayfasının "Tüm satırlar"ı: bugünkü sayfanın kartları (zz6 sGenelGider, msVeriDurum). Yazma planı eskitmez (msDeg).

type Y = (f: (z: Yaz) => boolean) => boolean;
const SAYFA: Partial<Record<string, [PlanlamaGorunumu, string]>> = {
  giderler: ['giderler', 'Genel gider'], maliyet: ['maliyet', 'Maliyetler'], mesaiplan: ['mesaiplan', 'Ek mesai planı'], ysiparis: ['ysiparis', 'Siparişler'],
};

export function GiderSayfasi({ c, G, para, yaz, git }: { c: PlanlamaCalismasi; G: GenelGiderHesabi | null; para: boolean; yaz: Yaz | null; git: (g: PlanlamaGorunumu) => void }) {
  if (!para) return <Kilit ad="Genel gider ve amortisman" />;
  if (!G) return <AsilKart simge="layers" baslik="Genel gider"><Not>Plan verisi derlenemedi.</Not></AsilKart>;
  const D = c.D;
  const M = maliyetSistemi(D);
  const kapali = !yaz;
  const y: Y = (f) => (yaz ? f(yaz) : false);
  const gg = ymAyar(D).genelGider ?? 0;
  return (
    <div className="tc-pyk-ms">
      <VeriDurumu c={c} git={git} />
      <AsilKart simge="layers" baslik="Genel gider nasıl hesaplanır">
        <div className="tc-pyk-sira">
          <Segment ad="Genel gider hesabı" secenek={[['kalem', 'Kalemlerden'], ['tek', 'Tek oran']]} deger={M.kip} kapali={kapali} sec={(v) => { y((z) => giderKipYaz(z, v === 'tek' ? 'tek' : 'kalem')); }} />
          <Alan ad="Verim %"><SayiGir deger={M.verim} ad="Pratik kapasite verimi" min={10} max={100} bosOlmaz kapali={kapali} yaz={(v) => v !== null && y((z) => verimYaz(z, D, v))} /></Alan>
          <Alan ad="Elektrik TL/kWh"><SayiGir deger={M.kwh} ad="Elektrik birim fiyatı" max={100} bosOlmaz kapali={kapali} yaz={(v) => v !== null && y((z) => kwhYaz(z, D, v))} /></Alan>
        </div>
        <Kpi l={[
          ['layers', 'Aylık genel gider', tl(G.aylik), `kalemler ${tl(G.kalemTop)} + amortisman ${tl(G.amort)}`],
          ['clock', 'Pratik kapasite', `${sayi(G.kap, 0)} sa`, `30 gün, verim %${sayi(M.verim, 0)}`],
          ['lira', 'Ortalama oran', G.ort === null ? '—' : tlSaat(G.ort), M.kip === 'kalem' ? 'maliyette kullanılıyor' : `kullanılan: tek oran ${tlSaat(gg)}`],
          ['gauge', 'Plan doluluğu', G.kap ? `%${sayi(Math.min(100, (G.mesgul / G.kap) * 100), 0)}` : '—', `${sayi(G.mesgul, 0)} sa planlı`],
          ['alert', 'Atıl kapasite gideri', tl(G.atil), 'ürüne yüklenmez, dönem gideri', G.atil !== null && G.atil > G.aylik * 0.3 ? 'uyari' : ''],
        ]} />
        <Not>Her kalem aylık tutardır ve seçilen anahtarla tezgâhlara dağılır; amortisman tezgâhın kendisine yazılır. Tezgâhın oranı = (pay + amortisman) / pratik kapasite saati. Normal kapasiteyle dağıtıldığı için boş kalan saatin gideri ürüne yüklenmez, atıl kapasite olarak ayrı görünür. Genel gider plan amacına girmez (5 b); ürün maliyetinde, teklifte ve proje maliyetinde kullanılır.</Not>
      </AsilKart>
      <KalemKarti c={c} kapali={kapali} y={y} />
      <DolayliKarti c={c} kapali={kapali} y={y} />
      <TezgahGiderKarti c={c} G={G} kapali={kapali} y={y} />
      <GrupKarti G={G} />
    </div>
  );
}

function VeriDurumu({ c, git }: { c: PlanlamaCalismasi; git: (g: PlanlamaGorunumu) => void }) {
  const D = c.D;
  const M = maliyetSistemi(D), m = mesaiSistemi(D);
  const P = D.personel ?? [];
  const ml = malzemeler(D);
  const S = D.siparisler;
  const tz = (k: (x: TezgahGideri | undefined) => boolean) => D.tezgahlar.filter((t) => k(M.tez[t.id])).length;
  const l: [Parameters<typeof Simge>[0]['ad'], string, number, number, string][] = [
    ['cpu', 'Tezgâh alış bedeli ya da ömrü', tz((x) => !((x?.bedel ?? 0) > 0 && (x?.omur ?? 0) > 0)), D.tezgahlar.length, 'giderler'],
    ['bolt', 'Tezgâh kurulu gücü', tz((x) => !((x?.kw ?? 0) > 0)), D.tezgahlar.length, 'giderler'],
    ['lira', 'Tezgâh makine saat maliyeti', D.tezgahlar.filter((t) => t.ucret === null || t.ucret === undefined).length, D.tezgahlar.length, 'maliyet'],
    ['user', 'Kişi brüt ücreti', P.filter((p) => !((m.ucret[p.id]?.brut ?? 0) > 0)).length, P.length, 'mesaiplan'],
    ['box', 'Malzeme kg fiyatı', ml.filter((x) => birimMaliyet(D, x) === null).length, ml.length, 'maliyet'],
    ['flag', 'Sipariş tutarı', S.filter((x) => x.gelir === null || x.gelir === undefined).length, S.length, 'ysiparis'],
    ['alert', 'Gecikme ceza oranı (sipariş ya da müşteri)', aktifSiparisler(D).filter((x) => gecikmeBedeli(c, x).eksik.includes('ceza oranı')).length, S.length, 'oncelik'],
  ];
  const eksik = l.filter((x) => x[2]).length;
  return (
    <AsilKart simge="scan" baslik="Maliyet verisi">
      <ul className="tc-pyk-veri">
        {l.map(([sm, ad, n, top, g]) => {
          const s = SAYFA[g];
          return (
            <li key={ad} data-eksik={n ? '' : undefined}>
              <Simge ad={sm} boyut="k" /><span>{ad}</span><b className="tc-pyk-mono">{n ? `${String(n)}/${String(top)} eksik` : 'tam'}</b>
              {s && <button type="button" className="tc-pyk-bag" onClick={() => { git(s[0]); }}>{s[1]}</button>}
            </li>
          );
        })}
      </ul>
      <Not>{eksik ? 'Eksik alan maliyeti eksik gösterir ya da varsayılana düşer; uygulamada bu alanlar sahibi modülde girilir.' : 'Maliyetin dayandığı girdiler tam.'}</Not>
    </AsilKart>
  );
}

function KalemKarti({ c, kapali, y }: { c: PlanlamaCalismasi; kapali: boolean; y: Y }) {
  const D = c.D;
  const M = maliyetSistemi(D), m = mesaiSistemi(D);
  const gruplar = [...new Set(D.tezgahlar.map((t) => t.grup ?? ''))].filter(Boolean);
  return (
    <AsilKart simge="list" baslik="Gider kalemleri">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Kalem</th><th>Tür</th><th className="tc-pyk-num">Aylık TL</th><th>Dağıtım</th><th>Kapsam</th><th><span className="tc-gizli-etiket">İşlem</span></th></tr></thead>
          <tbody>
            {M.kalemler.map((k) => {
              const hes = k.tur === 'personel' && k.aylik === null;
              return (
                <tr key={k.id}>
                  <td><MetinGir deger={k.ad} ad="Kalem adı" kapali={kapali} yaz={(v) => y((z) => kalemYaz(z, D, k.id, 'ad', v))} /></td>
                  <td><SecimGir deger={k.tur} ad="Tür" secenek={MS_TUR} kapali={kapali} yaz={(v) => { y((z) => kalemYaz(z, D, k.id, 'tur', v)); }} /></td>
                  <td className="tc-pyk-num">
                    {hes ? <><b>{tl(dolayliAylik(M, m))}</b><AltNot>dolaylı personelden</AltNot></>
                      : <SayiGir deger={k.aylik} ad={`${k.ad} aylık tutarı`} kapali={kapali} yaz={(v) => y((z) => kalemYaz(z, D, k.id, 'aylik', v))} />}
                  </td>
                  <td><SecimGir deger={k.anahtar} ad="Dağıtım anahtarı" secenek={MS_ANAHTAR} kapali={kapali} yaz={(v) => { y((z) => kalemYaz(z, D, k.id, 'anahtar', v)); }} /></td>
                  <td><SecimGir deger={k.kapsam} ad={`${k.ad} kapsamı`} secenek={[['', 'Bütün atölye'], ...gruplar.map((g) => [g, g] as const)]} kapali={kapali} yaz={(v) => { y((z) => kalemYaz(z, D, k.id, 'kapsam', v)); }} /></td>
                  <td>{!kapali && <Dugme simge="trash" aria-label="Kalemi sil" className="tc-pyk-ikon" onClick={() => { y((z) => kalemSilYaz(z, D, k.id)); }} />}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><th>Toplam</th><td /><td className="tc-pyk-num"><b>{tl(M.kalemler.reduce((a, k) => a + kalemTutari(k, M, m), 0))}</b></td><td colSpan={3} /></tr></tfoot>
        </table>
      </div>
      {!kapali && <KalemFormu y={y} />}
      <Not>Anahtar seçimi gerçek tüketimi izlemelidir: kira ve ısınma alanla, genel enerji kurulu güçle, su ve yemek kişiyle, bakım sözleşmesi ve sigorta makine saatiyle. Bir grubun kendi gideri (ör. ölçüm odasının kalibrasyonu) kapsamı o grup seçilerek yalnız ona yazılır.</Not>
    </AsilKart>
  );
}

function deger(f: HTMLFormElement, k: string): string { return (f.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''; }

function KalemFormu({ y }: { y: Y }) {
  const [hata, hataYaz] = useState<string | null>(null);
  const gonder = (o: FormEvent<HTMLFormElement>) => {
    o.preventDefault();
    const f = o.currentTarget;
    const ad = deger(f, 'ad').trim(); const t = sayiGirdisi(deger(f, 'aylik'));
    if (!ad || !t.tamam || t.deger === null) { hataYaz('Kalem adı ve aylık tutar girin.'); return; }
    const a = t.deger;
    if (y((z) => kalemEkleYaz(z, { ad, tur: deger(f, 'tur'), aylik: a, anahtar: deger(f, 'anahtar') }))) { hataYaz(null); f.reset(); }
  };
  return (
    <form className="tc-pyk-yeni" noValidate onSubmit={gonder} aria-label="Gider kalemi ekle">
      <input className="tc-alan-kutu" name="ad" placeholder="Kalem adı" aria-label="Kalem adı" required />
      <select className="tc-alan-kutu" name="tur" aria-label="Tür">{MS_TUR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <input className="tc-alan-kutu" name="aylik" inputMode="decimal" placeholder="Aylık TL" aria-label="Aylık TL" required />
      <select className="tc-alan-kutu" name="anahtar" aria-label="Dağıtım">{MS_ANAHTAR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <Dugme type="submit" tur="birincil" simge="plus">Ekle</Dugme>
      {hata && <p className="tc-pyk-ileti" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
    </form>
  );
}

function DolayliKarti({ c, kapali, y }: { c: PlanlamaCalismasi; kapali: boolean; y: Y }) {
  const D = c.D;
  const M = maliyetSistemi(D), m = mesaiSistemi(D);
  const kat = sgkKatsayisi(m);
  const [hata, hataYaz] = useState<string | null>(null);
  const gonder = (o: FormEvent<HTMLFormElement>) => {
    o.preventDefault();
    const f = o.currentTarget;
    const g = deger(f, 'gorev').trim(); const b = sayiGirdisi(deger(f, 'brut'));
    if (!g || !b.tamam || b.deger === null || !(b.deger > 0)) { hataYaz('Görev ve brüt ücret girin.'); return; }
    const v = b.deger;
    if (y((z) => dolayliEkleYaz(z, g, v))) { hataYaz(null); f.reset(); }
  };
  return (
    <AsilKart simge="user" baslik="Dolaylı personel">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Görev</th><th className="tc-pyk-num">Brüt aylık</th><th className="tc-pyk-num">İşverene maliyet</th><th><span className="tc-gizli-etiket">İşlem</span></th></tr></thead>
          <tbody>
            {M.dolayli.map((g) => (
              <tr key={g.id}>
                <td><MetinGir deger={g.gorev} ad="Görev" kapali={kapali} yaz={(v) => y((z) => dolayliYaz(z, D, g.id, 'gorev', v))} /></td>
                <td className="tc-pyk-num"><SayiGir deger={g.brut} ad={`${g.gorev} brüt ücreti`} kapali={kapali} yaz={(v) => y((z) => dolayliYaz(z, D, g.id, 'brut', v))} /></td>
                <td className="tc-pyk-num"><b>{tl((g.brut ?? 0) * kat)}</b></td>
                <td>{!kapali && <Dugme simge="trash" aria-label="Sil" className="tc-pyk-ikon" onClick={() => { y((z) => dolayliSilYaz(z, D, g.id)); }} />}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th>Toplam</th><td /><td className="tc-pyk-num"><b>{tl(dolayliAylik(M, m))}</b></td><td /></tr></tfoot>
        </table>
      </div>
      {!kapali && (
        <form className="tc-pyk-yeni" noValidate onSubmit={gonder} aria-label="Dolaylı personel ekle">
          <input className="tc-alan-kutu" name="gorev" placeholder="Görev" aria-label="Görev" required />
          <input className="tc-alan-kutu" name="brut" inputMode="decimal" placeholder="Brüt aylık TL" aria-label="Brüt aylık" required />
          <Dugme type="submit" tur="birincil" simge="plus">Ekle</Dugme>
          {hata && <p className="tc-pyk-ileti" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
        </form>
      )}
      <Not>Üretimde doğrudan çalışmayan kişiler genel gidere girer; operatör ve ayarcı ücretleri doğrudan işçiliktir (Ek mesai planı &gt; Kişi ücretleri). İşverene maliyet = brüt × (1 + SGK işveren payı %{sayi(m.sgk, 2)} + yan hak %{sayi(m.yanHak, 1)}).</Not>
    </AsilKart>
  );
}

const TEZ_ALAN: [keyof TezgahGideri, string, string, { min?: number; max?: number }][] = [
  ['bedel', 'Alış bedeli', 'alış bedeli', {}], ['omur', 'Ömür yıl', 'faydalı ömür', { min: 1, max: 50 }], ['hurda', 'Hurda %', 'hurda değeri', { max: 100 }],
  ['kw', 'kW', 'kurulu güç', {}], ['yuk', 'Yük', 'ortalama yük oranı', { max: 1 }], ['alan', 'm²', 'alan', {}],
  ['sarf', 'Takım, sarf TL/sa', 'takım ve sarf', {}], ['bakim', 'Bakım TL/sa', 'bakım', {}],
];

function TezgahGiderKarti({ c, G, kapali, y }: { c: PlanlamaCalismasi; G: GenelGiderHesabi; kapali: boolean; y: Y }) {
  const D = c.D;
  const oneri = (l: GenelGiderHesabi['tez']) => l.map((z) => ({ id: z.tezgah.id, eski: z.tezgah.ucret ?? null, yeni: Math.round(z.dogTop) }));
  return (
    <AsilKart
      simge="cpu" baslik="Tezgâh: amortisman, enerji, takım ve bakım"
      eylem={!kapali && <Dugme simge="check" onClick={() => { y((z) => makineyeYaz(z, oneri(G.tez))); }}>Hepsini makine maliyetine yaz</Dugme>}
    >
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead>
            <tr>
              <th>Tezgâh</th>{TEZ_ALAN.map(([k, b]) => <th key={k} className="tc-pyk-num">{b}</th>)}
              <th className="tc-pyk-num">Amortisman/ay</th><th className="tc-pyk-num">Genel gider TL/sa</th><th className="tc-pyk-num">Doğrudan TL/sa</th><th className="tc-pyk-num">Makine TL/sa şimdi</th><th><span className="tc-gizli-etiket">İşlem</span></th>
            </tr>
          </thead>
          <tbody>
            {G.tez.map((z) => {
              const t = z.tezgah;
              const fark = t.ucret === null || t.ucret === undefined ? null : z.dogTop - t.ucret;
              return (
                <tr key={t.id}>
                  <td><b className="tc-pyk-mono">{t.id}</b><AltNot>{t.ad ?? ''}</AltNot></td>
                  {TEZ_ALAN.map(([k, , ad, s]) => (
                    <td key={k} className="tc-pyk-num"><SayiGir deger={z.x[k]} ad={`${t.id} ${ad}`} min={s.min} max={s.max} kapali={kapali} yaz={(v) => y((w) => tezGiderYaz(w, D, t.id, k, v))} /></td>
                  ))}
                  <td className="tc-pyk-num">{tl(z.amort)}</td>
                  <td className="tc-pyk-num"><b>{z.oran === null ? '—' : tlSaat(z.oran)}</b><AltNot>{sayi(z.kap, 0)} sa kapasite</AltNot></td>
                  <td className="tc-pyk-num"><b>{tlSaat(z.dogTop)}</b><AltNot>enerji {sayi(z.dog.enerji, 0)} · takım {sayi(z.dog.sarf, 0)} · bakım {sayi(z.dog.bakim, 0)} · operatör {z.dog.operator === null ? '—' : sayi(z.dog.operator, 0)}</AltNot></td>
                  <td className="tc-pyk-num">{t.ucret === null || t.ucret === undefined ? '—' : sayi(t.ucret, 0)}{fark !== null && Math.abs(fark) >= 1 && <AltNot>öneri {fark > 0 ? '+' : '−'}{sayi(Math.abs(fark), 0)}</AltNot>}</td>
                  <td>{!kapali && <Dugme simge="check" aria-label={`${t.id} makine maliyetine önerilen değeri yaz`} className="tc-pyk-ikon" onClick={() => { y((w) => makineyeYaz(w, oneri([z]))); }} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Not>Amortisman doğrusal: (alış bedeli − hurda değeri) / (ömür × 12). Doğrudan saat maliyeti = kW × yük oranı × kWh fiyatı + takım ve sarf + bakım + operatör (grubun ortalama kişi saat maliyeti × operatör oranı). Onay düğmesi önerilen doğrudan maliyeti tezgâhın makine saat maliyetine yazar; plan bunu işleme maliyetinde kullanır.</Not>
    </AsilKart>
  );
}

function GrupKarti({ G }: { G: GenelGiderHesabi }) {
  // Grupta amortismanı bilinmeyen tezgâh varsa grubun oranı bilinmez; atıl gider bilinenlerin toplamı, hiçbiri bilinmiyorsa boş.
  const gr = new Map<string, { aylik: number; kap: number; mesgul: number; atil: number | null; bilinmez: boolean; n: number }>();
  for (const z of G.tez) {
    const k = z.tezgah.grup ?? '';
    const g = gr.get(k) ?? { aylik: 0, kap: 0, mesgul: 0, atil: null, bilinmez: false, n: 0 };
    g.aylik += z.aylik; g.kap += z.kap; g.mesgul += z.mesgul; g.n++;
    if (z.atil !== null) g.atil = (g.atil ?? 0) + z.atil;
    if (z.kap > 0 && z.amort === null) g.bilinmez = true;
    gr.set(k, g);
  }
  return (
    <AsilKart simge="chart" baslik="Gruba göre dağılım">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>Grup</th><th className="tc-pyk-num">Aylık gider</th><th className="tc-pyk-num">Kapasite</th><th className="tc-pyk-num">Oran</th><th className="tc-pyk-num">Doluluk</th><th className="tc-pyk-num">Atıl kapasite</th></tr></thead>
          <tbody>
            {[...gr].map(([g, x]) => (
              <tr key={g}>
                <td><b>{g}</b> <span className="tc-pyk-soluk">{x.n} tezgâh</span></td>
                <td className="tc-pyk-num">{tl(x.aylik)}</td>
                <td className="tc-pyk-num">{sayi(x.kap, 0)} sa</td>
                <td className="tc-pyk-num"><b>{x.kap && !x.bilinmez ? tlSaat(x.aylik / x.kap) : '—'}</b></td>
                <td className="tc-pyk-num">{x.kap ? `%${sayi(Math.min(100, (x.mesgul / x.kap) * 100), 0)}` : '—'}</td>
                <td className="tc-pyk-num">{tl(x.atil)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Not>Doluluk önümüzdeki 30 günün planından okunur; planda o kadar iş yoksa atıl kapasite yüksek görünür. Atıl kapasite gideri ilk bakılacak yerdir: düşük dolu pahalı tezgâh fiyatı yükseltmek yerine iş çekme ya da vardiya azaltma adayıdır.</Not>
    </AsilKart>
  );
}
