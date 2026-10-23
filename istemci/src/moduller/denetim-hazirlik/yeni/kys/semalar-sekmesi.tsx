import { useRef, type ReactNode } from 'react';
import { Dugme, Rozet, Secim, Sekmeler, Simge, type Sekme } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { guvenliAd, indir, yazdir } from '../disa-aktar.ts';
import { KYSB, KYSG, ROAD, RTF, type Donem } from '../icerik/kys-yapi.ts';
import { PTYPE } from '../icerik/programlar.ts';
import { gostergeAylari, gostergeSon, gostergeTuttu, kysAcik, kysIstatistigi, rutinIstatistigi, yolAdimiDurumu } from '../kurallar/kys.ts';
import { bugunTarihi, tarihMetni } from '../tarih.ts';
import type { Profil, ProgramKodu, Surec } from '../tipler.ts';
import {
  asciiAd, ayAdi, butunDokumanlar, degerMetni, dokumanBul, dokumanDurumu, dokumanKullaniliyor, dosyaAgaci, gozdenGecirmeYuku, hedefMetni, kokKlasor,
  sayiMetni, type AgacDokumani,
} from './dokuman-metni.ts';
import { FLOW_DOC } from './dokuman-sablonlari.ts';
import { pngYap, SemaCizimi, svgMetni } from './sema-cizim.tsx';
import { akisSemasi, etkilesimSemasi, FLOWS, kaplumbagaSemasi, organizasyonSemasi, type Sema, type SurecDurumu } from './semalar.ts';
import { Bolum, htmlUret, KysBaglantisi, OranCubugu, rolSatiri, yuzdeTonu } from './ortak.tsx';
import { useSureciDuzenle } from './surecler.tsx';

// Şemalar ve grafikler (prototip kysSema, panoHtml, curSvg, svgExport, svgPrint, treeHtml).

type SemaGorunumu = 'pano' | 'akis' | 'etk' | 'kap' | 'org' | 'agac';
const SV: readonly Sekme<SemaGorunumu>[] = [
  { anahtar: 'pano', baslik: 'Pano', simge: 'chart' }, { anahtar: 'akis', baslik: 'Akış şemaları', simge: 'rotate' },
  { anahtar: 'etk', baslik: 'Süreç etkileşimi', simge: 'layers' }, { anahtar: 'kap', baslik: 'Kaplumbağa', simge: 'target' },
  { anahtar: 'org', baslik: 'Organizasyon', simge: 'users' }, { anahtar: 'agac', baslik: 'Dosya ağacı', simge: 'file' },
];
const gorunum = (v: string): SemaGorunumu => (SV.some((x) => x.anahtar === v) ? v as SemaGorunumu : 'pano');

// procColor: son ayın göstergesi hedefe göre.
function surecDurumu(p: Surec | undefined): SurecDurumu {
  const l = p ? gostergeSon(p) : null;
  const ok = p && l ? gostergeTuttu(p, l.v) : null;
  return ok === null ? null : ok ? 'iyi' : 'kotu';
}

function kaplumbaga(p: Surec, profil: Profil): Sema {
  const sd = profil.kys.gd[`surec:${p.id}`];
  const nasil = [...(sd?.code ? [`Süreç kartı ${sd.code}`] : []), ...(p.how ? p.how.split(/[,;\n]/) : [])];
  const l = gostergeSon(p);
  const olcutler = [
    ...(p.kpi ? [p.kpi] : []), ...(p.target !== '' ? [`Hedef ${hedefMetni(p)}`] : []),
    ...(l ? [`Son: ${degerMetni(l.v, p.unit)} (${ayAdi(l.m)})`] : []), ...(p.risk ? [`Risk: ${p.risk}`] : []),
  ];
  return kaplumbagaSemasi({ surec: p, turAdi: PTYPE[p.type], nasil, olcutler });
}

// curSvg: açık şema; kaplumbağada seçili süreç yoksa ilk süreç.
function acikSema(profil: Profil, sv: SemaGorunumu, fl: string, tp: string): { sema: Sema; yatay: boolean } | null {
  const K = profil.kys;
  if (sv === 'akis') { const s = akisSemasi(fl, rolSatiri(K)); return s ? { sema: s, yatay: false } : null; }
  if (sv === 'etk') return { sema: etkilesimSemasi(K.procs, profil.profile.firma, (sp) => surecDurumu(K.procs.find((x) => x.id === sp.id))), yatay: true };
  if (sv === 'org') return { sema: organizasyonSemasi(K.procs, rolSatiri(K)), yatay: true };
  if (sv === 'kap') { const p = K.procs.find((x) => x.id === tp) ?? K.procs[0]; return p ? { sema: kaplumbaga(p, profil), yatay: true } : null; }
  return null;
}

export function SemalarSekmesi() {
  const d = useDenetim();
  const e = d.ekran.kys;
  const sv = gorunum(e.sv);
  const fl = FLOWS[e.fl] ? e.fl : 'dok';
  const K = d.profil.kys;
  const firma = d.profil.profile.firma;
  const svgRef = useRef<SVGSVGElement>(null);
  const sureciDuzenle = useSureciDuzenle();
  const acik = acikSema(d.profil, sv, fl, e.tp);

  const basimBasligi = (t: string, yatay: boolean, govde: ReactNode) => (
    <div className="tc-dhk-baski" data-theme="light">
      <div className="tc-dhk-pdok tc-dhk-pdiyagram" data-yatay={yatay || undefined}>
        <div className="tc-dhk-pdiyagram-ust"><b>{firma}</b><span>{t}</span><small>{tarihMetni(bugunTarihi())}</small></div>
        <div className="tc-dhk-pdiyagram-govde">{govde}</div>
      </div>
    </div>
  );
  const yazdirSema = () => {
    if (sv === 'agac') { yazdir(htmlUret(basimBasligi('Dosya ağacı', false, <DosyaAgaci profil={d.profil} />)), 'Dosya ağacı'); return; }
    if (!acik) return;
    yazdir(htmlUret(basimBasligi(acik.sema.baslik, acik.yatay, <SemaCizimi sema={acik.sema} />)), acik.sema.baslik);
  };
  const disaAktar = (tur: 'svg' | 'png') => {
    const svg = svgRef.current;
    if (!acik || !svg) return;
    const ad = guvenliAd((firma ? `${asciiAd(firma)}-` : '') + acik.sema.baslik);
    if (tur === 'svg') { indir(`${ad}.svg`, svgMetni(svg), 'image/svg+xml'); d.bildir('SVG indirildi'); return; }
    pngYap(svg, acik.sema.w, acik.sema.h).then((b) => { indir(`${ad}.png`, b, 'image/png'); d.bildir('PNG indirildi'); },
      () => { d.bildir('PNG oluşturulamadı; SVG indirin', { ton: 'hata' }); });
  };
  const araclar = (ek?: ReactNode, disa = true) => (
    <>
      {ek}
      <Dugme simge="printer" onClick={yazdirSema}>Yazdır / PDF</Dugme>
      {disa && <Dugme simge="download" onClick={() => { disaAktar('svg'); }}>SVG</Dugme>}
      {disa && <Dugme simge="download" onClick={() => { disaAktar('png'); }}>PNG</Dugme>}
    </>
  );
  const kutu = acik && <div className="tc-dhk-sema-kutu" data-theme="light"><SemaCizimi ref={svgRef} sema={acik.sema} /></div>;

  let icerik: ReactNode;
  if (sv === 'pano') {
    icerik = (
      <>
        <Bolum baslik="KYS panosu" simge="chart" sag={(
          <Dugme simge="printer" onClick={() => {
            yazdir(htmlUret(basimBasligi('KYS panosu', false, <PanoIcerik profil={d.profil} program={d.program} />)), 'KYS panosu');
          }}>Yazdır</Dugme>
        )}>
          <p className="tc-dhk-not">{`${firma || 'Firma'} · ${tarihMetni(bugunTarihi())}`}</p>
        </Bolum>
        <PanoIcerik profil={d.profil} program={d.program} surecBaglantisi={<KysBaglantisi hedef="surec" />} />
      </>
    );
  } else if (sv === 'akis') {
    const kullanan = Object.keys(FLOW_DOC).filter((k) => FLOW_DOC[k] === fl).map((k) => dokumanBul(K, k)?.name ?? '').filter(Boolean);
    icerik = (
      <Bolum baslik={FLOWS[fl]?.t ?? ''} simge="rotate" sag={araclar(
        <Secim etiket="Akış şeması" value={fl} secenekler={Object.keys(FLOWS).map((k) => ({ deger: k, baslik: FLOWS[k]?.t ?? k }))}
          onChange={(x) => { const v = x.target.value; d.ekranDegistir((t) => { t.kys.fl = v; }); }} />,
      )}>
        <p className="tc-dhk-not">
          Sol şeritte sorumlu rol ve atanmış kişi görünür.
          {kullanan.length > 0 && ` Bu akış şu prosedürlerde "Akış şeması" bölümü olarak yer alır: ${kullanan.join(', ')}.`}
        </p>
        {kutu}
        <div className="tc-dhk-lejant">
          {([['bas', 'Başla / bitir'], ['islem', 'İşlem'], ['karar', 'Karar'], ['belge', 'Doküman / kayıt'], ['yan', 'Alternatif yol']] as const)
            .map(([k, t]) => <span key={k}><i className={`tc-dhk-lejant-${k}`} aria-hidden="true" />{t}</span>)}
        </div>
      </Bolum>
    );
  } else if (sv === 'etk') {
    icerik = (
      <Bolum baslik="Süreç etkileşim şeması" simge="layers" sag={araclar()}>
        <p className="tc-dhk-not">
          Süreçler sekmesindeki süreçlerden oluşur. Nokta rengi son ayın göstergesinin hedefe göre durumunu gösterir. ISO 9001 madde 4.4 süreçlerin
          etkileşiminin belirlenmesini ister; bu şema el kitabı ve süreç haritası dokümanı için kullanılabilir.
        </p>
        {kutu}
      </Bolum>
    );
  } else if (sv === 'kap') {
    const p = K.procs.find((x) => x.id === e.tp) ?? K.procs[0];
    if (!p) {
      icerik = (
        <section className="tc-dhk-kart tc-dhk-bos-kart">
          <Simge ad="target" />
          <h3>Önce süreç tanımlayın</h3>
          <p>Kaplumbağa diyagramı her süreç için girdi, çıktı, kaynak, yetkinlik, yöntem ve ölçütleri tek sayfada gösterir. Süreç denetimlerinde denetçilerin kullandığı klasik araçtır.</p>
          <KysBaglantisi hedef="surec" />
        </section>
      );
    } else {
      const eksik = [!p.res ? 'Ne ile' : '', !p.who ? 'Kim ile' : '', !p.how ? 'Nasıl' : '', !p.kpi ? 'Gösterge' : ''].filter(Boolean);
      icerik = (
        <Bolum baslik="Kaplumbağa diyagramı" simge="target" sag={araclar(
          <>
            <Secim etiket="Süreç" value={p.id} secenekler={K.procs.map((x) => ({ deger: x.id, baslik: x.name }))}
              onChange={(x) => { const v = x.target.value; d.ekranDegistir((t) => { t.kys.tp = v; }); }} />
            <Dugme simge="edit" onClick={() => { sureciDuzenle(p.id); }}>Süreci düzenle</Dugme>
          </>,
        )}>
          {eksik.length > 0 && (
            <p className="tc-dhk-uyari"><Simge ad="alert" boyut="k" /><span>{`Eksik alanlar: ${eksik.join(', ')}. "Süreci düzenle" ile tamamlayın; denetçi bu altı soruyu sorar.`}</span></p>
          )}
          {kutu}
        </Bolum>
      );
    }
  } else if (sv === 'org') {
    icerik = (
      <Bolum baslik="Organizasyon şeması" simge="users" sag={araclar()}>
        <p className="tc-dhk-not">
          Genel müdür ve KYS sorumlusu Görev tanımları sekmesinden, birimler süreç sahiplerinden oluşur. Her birimin altında sahip olduğu süreçler listelenir.
        </p>
        {kutu}
      </Bolum>
    );
  } else {
    icerik = (
      <Bolum baslik="Dosya ağacı" simge="file" sag={araclar(undefined, false)}>
        <p className="tc-dhk-not">
          Klasör yapısı ve her klasöre yerleşen dokümanlar. Yeşil yürürlükte, turuncu taslak. Dokümanlar türlerine ve süreçlerine göre yerleştirilir.
          {' '}<KysBaglantisi hedef="dosya" />
        </p>
        <DosyaAgaci profil={d.profil} />
      </Bolum>
    );
  }

  return (
    <>
      <Sekmeler etiket="Şema türü" sekmeler={SV} secili={sv} sec={(k) => { d.ekranDegistir((t) => { t.kys.sv = k; }); }} />
      {icerik}
    </>
  );
}

// --- Dosya ağacı (treeHtml) ---

function AgacSatiri({ it }: { it: AgacDokumani }) {
  return <li className="tc-dhk-agac-dok"><i className={`tc-dhk-nokta tc-dhk-nokta-${String(it.st)}`} aria-hidden="true" /><code>{it.code}</code><span>{it.n}</span></li>;
}
function DosyaAgaci({ profil }: { profil: Profil }) {
  const a = dosyaAgaci(profil.kys);
  return (
    <div className="tc-dhk-agac">
      <div className="tc-dhk-agac-kok"><Simge ad="layers" /><b>{kokKlasor(profil.profile.firma)}</b><small>{`${String(a.adet)} doküman`}</small></div>
      <ul>
        {a.klasorler.map((f) => (
          <li key={f.ad}>
            <span className="tc-dhk-agac-klasor"><Simge ad="file" boyut="k" /><b>{f.ad}</b>{f.adet > 0 && <span className="tc-dhk-sayac">{f.adet}</span>}</span>
            <ul>
              {f.altlar.map((s) => (
                <li key={s.ad}>
                  <span className="tc-dhk-agac-alt">{s.ad}{s.dokumanlar.length > 0 && <span className="tc-dhk-sayac">{s.dokumanlar.length}</span>}</span>
                  {s.dokumanlar.length > 0 && <ul>{s.dokumanlar.map((it) => <AgacSatiri key={it.code} it={it} />)}</ul>}
                </li>
              ))}
              {f.dogrudan.map((it) => <AgacSatiri key={it.code} it={it} />)}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Pano (panoHtml): bağlamsız çizilir, basımda da aynı bileşen kullanılır ---

type DilimTonu = 'iyi' | 'kotu' | 'uyari' | 'cizgi' | 'vurgu';
interface Dilim { deger: number; ton: DilimTonu; ad: string }

const SIMIT_R = 52, SIMIT_C = 2 * Math.PI * SIMIT_R;
function Simit({ dilimler, orta, alt, etiket }: { dilimler: readonly Dilim[]; orta: string; alt: string; etiket: string }) {
  const top = dilimler.reduce((a, s) => a + s.deger, 0) || 1;
  let off = 0;
  return (
    <svg viewBox="0 0 140 140" className="tc-dhk-simit" role="img" aria-label={etiket}>
      <circle cx="70" cy="70" r={SIMIT_R} fill="none" strokeWidth="16" className="tc-dhk-simit-yol" />
      {dilimler.map((s) => {
        if (!s.deger) return null;
        const L = (s.deger / top) * SIMIT_C;
        const c = <circle key={s.ad} cx="70" cy="70" r={SIMIT_R} fill="none" strokeWidth="16" className={`tc-dhk-simit-${s.ton}`}
          strokeDasharray={`${L.toFixed(2)} ${(SIMIT_C - L).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} transform="rotate(-90 70 70)" />;
        off += L;
        return c;
      })}
      <text x="70" y="66" textAnchor="middle" className="tc-dhk-simit-orta">{orta}</text>
      <text x="70" y="88" textAnchor="middle" className="tc-dhk-simit-alt">{alt}</text>
    </svg>
  );
}
function Lejant({ dilimler }: { dilimler: readonly { ton: DilimTonu; ad: string; deger?: number }[] }) {
  return (
    <div className="tc-dhk-dlejant">
      {dilimler.map((s) => <span key={s.ad}><i className={`tc-dhk-renk-${s.ton}`} aria-hidden="true" />{s.ad}{s.deger !== undefined && <b>{` ${String(s.deger)}`}</b>}</span>)}
    </div>
  );
}
function Cubuk({ ad, parcalar, deger }: { ad: string; parcalar: readonly { oran: number; ton: 'iyi' | 'uyari' | 'vurgu' | 'kotu' }[]; deger: ReactNode }) {
  return (
    <div className="tc-dhk-hcubuk">
      <span className="tc-dhk-hcubuk-ad">{ad}</span>
      <OranCubugu etiket={ad} parcalar={parcalar} />
      <span className="tc-dhk-hcubuk-deger mono">{deger}</span>
    </div>
  );
}

function PanoIcerik({ profil, program, surecBaglantisi = null }: { profil: Profil; program: ProgramKodu; surecBaglantisi?: ReactNode }) {
  const K = profil.kys;
  const st = kysIstatistigi(profil, program);
  const s1: Dilim[] = [
    { deger: st.live - st.late, ton: 'iyi', ad: 'Yürürlükte' }, { deger: st.late, ton: 'kotu', ad: 'Gözden geçirme gecikti' },
    { deger: st.draft, ton: 'uyari', ad: 'Taslak' }, { deger: st.miss, ton: 'cizgi', ad: 'Yok' },
  ];
  const cnt = { yayin: 0, taslak: 0, yok: 0 };
  for (const x of butunDokumanlar(K)) if (dokumanKullaniliyor(x, profil, program)) cnt[dokumanDurumu(K, x.id).k]++;
  const s2: Dilim[] = [{ deger: cnt.yayin, ton: 'iyi', ad: 'Yürürlükte' }, { deger: cnt.taslak, ton: 'uyari', ad: 'Taslak' }, { deger: cnt.yok, ton: 'cizgi', ad: 'Oluşturulmadı' }];
  const ms = gostergeAylari(6);
  const yuk = gozdenGecirmeYuku(profil);
  const mxv = Math.max(1, ...yuk.aylar.map((m) => m.c + m.late));
  return (
    <>
      <div className="tc-dhk-iki">
        <Bolum baslik="KYS olgunluğu: PUKÖ" simge="layers">
          <div className="tc-dhk-hcubuklar">
            {KYSG.map((g) => {
              const bs = KYSB.filter((b) => b.g === g.k && kysAcik(b, profil, program));
              const n = bs.length || 1;
              const l = bs.filter((b) => K.items[b.id]?.st === 2).length;
              const dr = bs.filter((b) => K.items[b.id]?.st === 1).length;
              return <Cubuk key={g.k} ad={g.n} parcalar={[{ oran: l / n, ton: 'iyi' }, { oran: dr / n, ton: 'uyari' }]} deger={`${String(l)}/${String(bs.length)}`} />;
            })}
          </div>
          <Lejant dilimler={[{ ton: 'iyi', ad: 'Yürürlükte' }, { ton: 'uyari', ad: 'Taslak' }, { ton: 'cizgi', ad: 'Yok' }]} />
        </Bolum>
        <Bolum baslik="Durum dağılımı" simge="target">
          <div className="tc-dhk-simitler">
            <div><Simit dilimler={s1} orta={`%${String(st.pct)}`} alt="olgunluk" etiket="Yapı taşları durum dağılımı" /><b>Yapı taşları</b><Lejant dilimler={s1} /></div>
            <div><Simit dilimler={s2} orta={String(cnt.yayin)} alt="yürürlükte" etiket="Dokümanlar durum dağılımı" /><b>Dokümanlar</b><Lejant dilimler={s2} /></div>
          </div>
        </Bolum>
      </div>
      <Bolum baslik="Süreç performansı: son 6 ay" simge="chart" sag={<span className="tc-dhk-soluk">Yeşil hedefte, kırmızı hedef dışı, gri veri yok</span>}>
        {K.procs.length ? (
          <div className="tc-dhk-kaydir">
            <table className="tc-dhk-isi">
              <thead><tr><th />{ms.map((m) => <th key={m} scope="col">{ayAdi(m)}</th>)}<th scope="col">Hedef</th></tr></thead>
              <tbody>
                {K.procs.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}<small>{p.kpi || 'gösterge yok'}</small></th>
                    {ms.map((m) => {
                      const v = p.vals[m];
                      const ok = v === undefined || v === null ? null : gostergeTuttu(p, v);
                      const k = ok === null ? (v === undefined || v === null ? 'bos' : 'notr') : ok ? 'iyi' : 'kotu';
                      return <td key={m}><span className="tc-dhk-isi-hucre mono" data-ton={k}>{v === undefined || v === null ? '–' : sayiMetni(v)}</span></td>;
                    })}
                    <td className="tc-dhk-soluk">{hedefMetni(p) || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="tc-dhk-not">Süreçler sekmesinde süreç ve gösterge tanımlayın. {surecBaglantisi}</p>}
      </Bolum>
      <div className="tc-dhk-iki">
        <Bolum baslik="Rutin görev uyumu" simge="clipboard-check">
          <div className="tc-dhk-hcubuklar">
            {(Object.keys(RTF) as Donem[]).map((f) => {
              const s = rutinIstatistigi(profil, f);
              return (
                <Cubuk key={f} ad={RTF[f]} parcalar={[{ oran: s.n ? s.k / s.n : 0, ton: 'vurgu' }]}
                  deger={<>{`${String(s.k)}/${String(s.n)}`}{s.uyum !== null && <> · <b className={`tc-dhy-ton-${yuzdeTonu(s.uyum)}`}>{`%${String(s.uyum)}`}</b></>}</>} />
              );
            })}
          </div>
          <p className="tc-dhk-not">Çubuk: bu dönem tamamlanan; yüzde: geçmiş dönem uyumu.</p>
        </Bolum>
        <Bolum baslik="Yol haritası ilerlemesi" simge="flag">
          <div className="tc-dhk-hcubuklar">
            {ROAD.map((f, i) => {
              const n = f.steps.length;
              const k = f.steps.filter((s) => yolAdimiDurumu(s, profil) === 2).length;
              const pp = f.steps.filter((s) => yolAdimiDurumu(s, profil) === 1).length;
              return <Cubuk key={f.k} ad={`${String(i + 1)}. ${f.n}`} parcalar={[{ oran: k / n, ton: 'iyi' }, { oran: pp / n, ton: 'uyari' }]} deger={`${String(k)}/${String(n)}`} />;
            })}
          </div>
        </Bolum>
      </div>
      <Bolum baslik="Gözden geçirme yükü: önümüzdeki 12 ay" simge="clock" sag={yuk.gecikmis > 0 ? <Rozet ton="hata">{`${String(yuk.gecikmis)} gecikmiş`}</Rozet> : undefined}>
        <ol className="tc-dhk-sutunlar">
          {yuk.aylar.map((m) => {
            const c = (m.c / mxv) * 100, gec = (m.late / mxv) * 100;
            return (
              <li key={m.k} title={`${m.n}: ${m.items.length ? m.items.join(', ') : 'Gözden geçirme yok'}`}>
                <svg className="tc-dhk-sutun" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
                  <rect className="tc-dhk-sutun-yol" x="0" y="0" width="10" height="100" />
                  {c > 0 && <rect className="tc-dhk-cubuk-vurgu" x="0" y={100 - c} width="10" height={c} />}
                  {gec > 0 && <rect className="tc-dhk-cubuk-kotu" x="0" y={100 - c - gec} width="10" height={gec} />}
                </svg>
                <span>{m.n}</span>
                <b className="mono">{m.c + m.late || ''}</b>
              </li>
            );
          })}
        </ol>
        <p className="tc-dhk-not">Yürürlükteki yapı taşlarının son gözden geçirme tarihine ve önerilen sıklığa göre hesaplanır.</p>
      </Bolum>
    </>
  );
}
