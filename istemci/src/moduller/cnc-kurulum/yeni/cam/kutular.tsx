import { useState, type ReactNode } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { fmtN, num } from '../bicim.ts';
import { save } from '../depo.ts';
import { fmtT } from '../hesap/gkod.ts';
import { MB_SRC, mbAp, mbRange, mbSo } from '../hesap/malzeme-davranisi.ts';
import {
  fmtHC, fmtHM, SC_OPT, scEtiketi, SU_SRC, type AyarAraligi, type AyarElemani, type AyarToplami, type Senaryo,
} from './ayar-suresi.ts';
import { camKaydi, SC } from './durum.ts';
import { FAI_SRC } from './fai.ts';
import { camCal, camPrm, kalibreEt, kalibrasyonuSifirla, malzemeSec, partiYaz, type OmurSatiri } from './is.ts';
import type { MalzemeEtkisi } from './malzeme.ts';
import { Baslik, Kaynak, Kutular, Not, OranCubugu, tamamlaninca } from './parcalar.tsx';
import { sigmaSayilari, type SigmaListesi } from './sigma.ts';
import type { FaiSonucu } from './tipler.ts';
import { renkSinifi } from './renk.ts';

// Plan sonucunun altındaki kutular (prototipin camFitBox, camSetupBox, suRangeBox, suScenarios, camFAIBox, camMatBox, camCalBox).

const fmtMin = fmtT;

function Ayrinti({ sinif, acik, ozet, ek, children }: { sinif: string; acik?: boolean; ozet: ReactNode; ek?: ReactNode; children: ReactNode }) {
  return (
    <details className={`tc-cc-det ${sinif}`} open={acik}>
      <summary>{ozet}{ek != null && <em>{ek}</em>}</summary>
      {children}
    </details>
  );
}

/* ---------- sığma ---------- */
const SIGMA_ISARETI = { ok: '✓', warn: '!', bad: '✕', na: '?' } as const;
export function SigmaKutusu({ L }: { L: SigmaListesi }) {
  const n = sigmaSayilari(L), top = n.bad ? 'bad' : n.warn ? 'warn' : 'ok';
  return (
    <Ayrinti
      sinif={`tc-cc-sigma tc-cc-sigma-${top}`} acik={!!(n.bad || n.warn) || undefined} ozet="Sığma kontrolü"
      ek={n.bad ? '✕ ' + n.bad + ' sorun' : n.warn ? '⚠ ' + n.warn + ' uyarı' : '✓ hepsi sığıyor'}
    >
      <div className="tc-cc-sigma-liste">
        {L.map((x, i) => ('head' in x
          ? <div key={i} className="tc-cc-sigma-baslik">{x.head}</div>
          : (
            <div key={i} className={`tc-cc-sigma-satir tc-cc-sigma-${x.st}`}>
              <i aria-hidden="true">{SIGMA_ISARETI[x.st]}</i>
              <span>{x.lbl}{x.txt && <small>{x.txt}</small>}</span>
              <b>{x.val}<small>sınır {x.lim}</small></b>
            </div>
          )))}
      </div>
      <Not>Tezgâh sınırları Hazırlık → Tezgâh bilgileri'nde girilenlerden, girilmemişse üretici kataloğundan alınır. Takım boyu: kesme boyu + 60 mm tutucu.</Not>
    </Ayrinti>
  );
}

/* ---------- FAI ---------- */
export function FaiKutusu({ F, yeni }: { F: FaiSonucu; yeni: boolean }) {
  return (
    <Ayrinti sinif="tc-cc-fai" ozet="FAI · ilk ürün muayenesi" ek={yeni ? fmtHM(F.labor) + ' · ' + F.chars.length + ' karakteristik' : 'tekrar işte gerekmez'}>
      <div className="tc-cc-det-ic">
        <Not>
          {yeni
            ? <>Bu iş <b>ilk üretim</b>: AS9102 mantığıyla her ölçü ayrı karakteristik olarak ölçülüp kayıt altına alınır. {SC().faiw === 'run' ? 'Tezgâh FAI sürerken üretime devam ediyor (risk sizde) — tezgâh beklemesine yalnız 5 dk operatör kontrolü eklendi.' : 'Tezgâh FAI ölçümleri bitene kadar bekliyor: ' + fmtHM(F.meas) + ' hazırlık süresine eklendi.'}</>
            : 'Tekrar işte FAI gerekmez; yalnız ilk parça kontrolü yapılır. FAI şu durumlarda yeniden gerekir: tasarım / revizyon değişikliği, süreç ya da tedarikçi değişikliği, üretime 2 yıl ara.'}
        </Not>
        <Kutular kutular={[
          { k: 'Ölçüm', b: fmtHM(F.meas), i: F.chars.length + ' karakteristik' },
          { k: 'Kayıt (Form 3)', b: fmtHM(F.rec), i: '1 dk / karakteristik' },
          { k: 'Belge + onay', b: fmtHM(F.fixT), i: F.cmmN ? 'CMM programı dahil' : 'Form 1–2, balon' },
        ]}
        />
        <div className="tc-cc-tablo4">
          <div className="tc-cc-tablo4-ust"><b>#</b><span>Karakteristik · nominal</span><span>Alet</span><em>dk</em></div>
          {F.chars.map((c) => (
            <div key={c.no}><b>{c.no}</b><span>{c.name}{c.nom && <i> {c.nom}</i>}<small>{c.grp}</small></span><span>{c.inst}</span><em>{fmtN(c.tm, 1)}</em></div>
          ))}
        </div>
        <div className="tc-cc-sabit">{F.fixed.map((x) => <div key={x[0]}><span>{x[0]}</span><em>{fmtN(x[1], 0)} dk</em></div>)}</div>
        <Not>
          Ölçüm aleti ve süresi "Tolerans" seçimine göre değişir (Atölye koşulları). Kaynak: {FAI_SRC.map((s, i) => <span key={s[1]}>{i > 0 && ' · '}<Kaynak ad={s[0]} adres={s[1]} /></span>)} — elle hazırlanan tam FAI raporu tipik olarak 4–5 saat, yazılımla 2 saatin altında.
        </Not>
      </div>
    </Ayrinti>
  );
}

/* ---------- malzeme etkisi ---------- */
export function MalzemeKutusu({ e, yenidenUret }: { e: MalzemeEtkisi; yenidenUret: () => void }) {
  const { m, b, ref, sc } = { ...e, sc: SC() }, prm = camPrm(), notlar: ReactNode[] = [];
  if (b.wh) notlar.push(<><b>İş sertleşmesi:</b> takımı kesimde bekletmeyin, sürtme yaptırmayın, finiş payını 0,1 mm'nin altına düşürmeyin; körelen ucu erken değiştirin — körelmiş uç yüzeyi sertleştirir, bir sonraki paso daha da zorlaşır.</>);
  if (m.fam === '174ph') {
    const sz = e.sz;
    if (m.age) {
      notlar.push(<><b>Kondisyon A'da işleyip sonra yaşlandırırsanız parça küçülür:</b> H900'e %0,04–0,06, H1150'ye %0,09–0,12.{sz ? ' Bu parçada boy ' + fmtN(sz.L, 1) + ' mm → H900: ' + mbRange(sz.L, 0.0004, 0.0006) + ', H1150: ' + mbRange(sz.L, 0.0009, 0.0012) + (sz.D ? '; Ø' + fmtN(sz.D, 1) + ' → H900: ' + mbRange(sz.D, 0.0004, 0.0006) : '') + ' küçülme. Hassas ölçülere bu payı programda ekleyin.' : ''} Kondisyon A'daki parça kullanıma bu hâliyle verilmez.</>);
    } else notlar.push(<><b>{m.cond} durumunda işleniyor:</b> ısıl işlem bitmiş, sonradan boyut değişimi beklenmez. Durum sertleştikçe kesme hızı düşer (sertlik oranıyla, örn. H900 ≈ H1150 × 0,69).</>);
  }
  return (
    <Ayrinti sinif="tc-cc-malzeme" ozet={'Malzeme etkisi · ' + m.name} ek={e.isRef ? 'referans malzeme' : 'C45\'e göre çevrim ×' + fmtN(e.x, 2)}>
      <div className="tc-cc-det-ic">
        <Not>Malzeme yalnız kesme hızını değil; ilerlemeyi, kaba işlemedeki kavramayı, takım ömrünün hıza duyarlılığını ve ilk iş ayarını da değiştirir. {e.isRef ? null : <>Bu parça C45'ten işlenseydi çevrim ≈ <b>{fmtMin(e.tRef)}</b> olurdu; {m.name} ile <b>{fmtMin(e.tNow)}</b>.</>}</Not>
        <Kutular kutular={[
          { k: 'Kesme hızı (karbür)', b: m.vcK + ' m/dk', i: 'C45\'e göre ×' + fmtN(m.vcK / ref.vcK, 2) },
          { k: 'İlerleme', b: '×' + fmtN(m.fk, 2), i: 'katalog değerine göre' },
          { k: 'Kaba kavrama', b: 'ae ' + fmtN(mbSo(m, prm.so) * 100, 0) + '% Ø', i: 'torna ap ' + fmtN(mbAp(m), 1) + ' mm' },
        ]}
        />
        <Kutular kutular={[
          { k: 'Ömür hassasiyeti', b: '−%' + Math.round(e.dl * 100), i: 'Vc %10 artarsa · n ≈ ' + fmtN(e.n, 2) },
          { k: 'Hazırlığa ek', b: b.tune ? (sc.job === 'new' ? '+' + fmtN(b.tune, 0) + ' dk' : '0 dk') : '—', i: b.tune ? (sc.job === 'new' ? 'ilk iş: talaş / veri denemesi' : 'tekrar işte veri hazır') : 'kolay malzeme' },
          { k: 'Önerilen soğutma', b: <span className="tc-cc-kucuk">{e.cool ? e.cool.name : '—'}</span>, i: e.cool ? e.cool.code || '' : '' },
        ]}
        />
        {notlar.length > 0 && <div className="tc-cc-notlar">{notlar.map((t, i) => <p key={i}>{t}</p>)}</div>}
        {e.sib.length > 1 && (
          <>
            <div className="tc-cc-tablo4 tc-cc-durumlar">
              <div className="tc-cc-tablo4-ust"><b /><span>Aynı malzeme, diğer durumlar</span><span>Vc</span><em>Bu parça</em></div>
              {e.sib.map(({ q, t }) => (
                <button
                  key={q.id} type="button" className={q.id === m.id ? 'tc-cc-secili' : undefined} aria-pressed={q.id === m.id}
                  onClick={() => { if (q.id !== m.id) { malzemeSec(q.id); yenidenUret(); } }}
                >
                  <b>{q.id === m.id ? '●' : ''}</b><span>{q.cond || q.name}<small>{q.hard || ''}</small></span><span>{q.vcK} m/dk</span><em>{fmtMin(t)}</em>
                </button>
              ))}
            </div>
            <Not>Satıra tıklayın: malzeme o durum olarak seçilir, plan yeniden oluşturulur.</Not>
          </>
        )}
        <Not>Değerler ISO grubundan gelir, malzemeye özel düzeltme Tanımlar → Malzemeler'den yapılır. Kaynak: {MB_SRC.map((s, i) => <span key={s[1]}>{i > 0 && ' · '}<Kaynak ad={s[0]} adres={s[1]} /></span>)}</Not>
      </div>
    </Ayrinti>
  );
}

/* ---------- hazırlık ve toplam süre ---------- */
function AralikKutusu({ r }: { r: AyarAraligi }) {
  const mx = Math.max(r.worst, r.p90) * 1.04 || 1, X = (v: number): number => +(v / mx * 100).toFixed(1);
  return (
    <div className="tc-cc-aralik">
      <div className="tc-cc-aralik-ust"><span>Hazırlık süresi aralığı</span><em>teorik model · PERT + Monte Carlo</em></div>
      <Kutular kutular={[
        { k: 'En iyi', b: fmtHM(r.best), i: 'en iyi koşul, her adım en kısa', ton: 'iyi' },
        { k: 'Ortalama (beklenen)', b: fmtHM(r.mean), i: 'seçili koşullar · %80: ' + fmtHC(r.p10) + '–' + fmtHC(r.p90) },
        { k: 'En kötü (P90)', b: fmtHM(r.worst), i: 'kötü koşul · 10 hazırlıktan 1\'i aşar', ton: 'kotu' },
      ]}
      />
      <svg className="tc-cc-bant2" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect className="tc-cc-bant2-dis" x={X(r.best)} y={2} width={Math.max(0, X(r.worst) - X(r.best))} height={6} rx={2} />
        <rect className="tc-cc-bant2-ic" x={X(r.p10)} y={2} width={Math.max(0, X(r.p90) - X(r.p10))} height={6} rx={2} />
        <line className="tc-cc-bant2-ort" x1={X(r.mean)} x2={X(r.mean)} y1={0} y2={10} />
      </svg>
      <Not>Her adım üç değerle hesaplanır: en iyi, en olası, en kötü. Ölçme, deneme, arama ve bekleme adımları geniş; söküp takma adımları dar dağılır. Kötü koşulların hepsi aynı anda en uzun hâlinde gerçekleşirse ≈ {fmtHM(r.abs)} (mutlak üst sınır). Tezgâhların profilleri: Tanımlar → Hazırlık süreleri.</Not>
    </div>
  );
}

function Senaryolar({ rows, q }: { rows: Senaryo[]; q: number }) {
  const mx = rows.reduce((a, r) => Math.max(a, r.R.setup), 0) || 1, mn = rows.reduce((a, r) => Math.min(a, r.R.setup), 1e9);
  const sec = (r: Senaryo): void => { const c = camKaydi(); c.sc = Object.assign({}, c.sc, r.o); save(); };
  return (
    <Ayrinti sinif="tc-cc-senaryo" ozet="Durumlara göre hazırlık süresi" ek={fmtHC(mn) + ' – ' + fmtHC(mx) + ' sa'}>
      <div className="tc-cc-senaryo-tablo">
        <div className="tc-cc-senaryo-ust"><span>Durum · sa:dk</span><b>Torna</b><b>Freze</b><b>Ayar</b><b>Parti {q}</b></div>
        {rows.map((r, i) => (
          <button key={r.n} type="button" className={i === 0 ? 'tc-cc-secili' : undefined} onClick={() => { sec(r); }}>
            <span>{r.n}<OranCubugu oran={r.R.setup / mx} /></span>
            <b>{r.R.setT ? fmtHC(r.R.setT) : '—'}</b><b>{fmtHC(r.R.setM)}</b><b>{fmtHC(r.R.setup)}</b><b>{fmtHC(r.R.total)}</b>
          </button>
        ))}
      </div>
      <Not>Satıra tıklayınca o durumun koşulları seçilir. İlk üretimde FAI muayenesi ve program denemesi eklenir; ölçüm süreleri tolerans seçimine bağlıdır.</Not>
    </Ayrinti>
  );
}

function ElemanListesi({ baslik, L, raw, tot }: { baslik: string; L: AyarElemani[]; raw: number; tot: number }) {
  if (!L.length) return null;
  const yaz = (k: string, v: string): void => { camKaydi().su[k] = v === '' ? '' : Math.max(0, num(v, 0)); save(); };
  return (
    <Ayrinti sinif="tc-cc-eleman" ozet={baslik} ek={fmtHM(tot)}>
      <div className="tc-cc-eleman-liste">
        {L.map((x) => (
          <label key={x.k} className={x.n ? undefined : 'tc-cc-sifir'}>
            <span>{x.lbl}{x.note && <small>{x.note}</small>}</span>
            <input
              type="number" min="0" step="0.1" defaultValue={String(+x.u.toFixed(2))} key={x.u} className={x.own ? 'tc-cc-kendi' : undefined}
              title="birim süre (dk)" aria-label={x.lbl + ' birim süre (dk)'} {...tamamlaninca((v) => { if (v !== String(+x.u.toFixed(2))) yaz(x.k, v); })}
            />
            <em>{fmtN(x.min, x.min % 1 ? 1 : 0)} dk{x.src && <sup>{x.src}</sup>}</em>
          </label>
        ))}
        {raw > 0 && Math.abs(tot - raw) > 0.05 && <div className="tc-cc-of">Operatör katsayısı ×{fmtN(tot / raw, 1)} → {fmtHM(tot)}</div>}
      </div>
    </Ayrinti>
  );
}

export function AyarKutusu({ E, rng, senaryolar }: { E: AyarToplami; rng: AyarAraligi | null; senaryolar: Senaryo[] }) {
  const sc = SC(), p = Math.max(1e-9, E.total);
  const seg = ([
    ['Torna hazırlığı', E.setT, 'vurgu'], ['Freze hazırlığı', E.setM, 'acik-mavi'], ['Torna çevrimi', E.q * E.cycT, 'cam-torna-arka'],
    ['Freze çevrimi', E.q * E.cycM, 'cam-freze-cevrim'], ['Yükleme / kontrol', E.q * E.hand, 'cam-yukleme'],
  ] as const).filter((s) => s[1] > 0.01);
  const used: Record<string, 1> = {}; E.T.concat(E.M, E.H).forEach((x) => { if (x.src && x.n) used[x.src] = 1; });
  const kosulYaz = (k: string, v: string): void => { SC()[k] = v; save(); };
  let x0 = 0;
  return (
    <>
      <Baslik ek={'parti ' + E.q + ' adet'}>Hazırlık ve toplam süre</Baslik>
      <Ayrinti
        sinif="tc-cc-kosul" acik ozet="Atölye koşulları — hazırlık süresini bunlar değiştirir"
        ek={scEtiketi('meas', sc.meas).split(' ')[0] + ' · ' + (sc.job === 'new' ? 'ilk kez' : 'tekrar iş') + ' · ' + scEtiketi('op', sc.op).split(' (')[0]!.toLowerCase()}
      >
        <div className="tc-cc-izgara">
          {Object.keys(SC_OPT).map((k) => {
            const o = SC_OPT[k]!;
            return (
              <label key={k} className="tc-cc-alan">{o[0]}
                <select value={sc[k]} onChange={(e) => { kosulYaz(k, e.target.value); }}>
                  {o[1].map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </Ayrinti>
      <div className="tc-cc-izgara">
        <label className="tc-cc-alan">Parti adedi
          <input
            type="number" min="1" step="1" defaultValue={E.q} key={E.q}
            {...tamamlaninca((v) => { const q = Math.max(1, Math.round(num(v, 1))); if (q !== E.q) partiYaz(q); })}
          />
        </label>
        <div className="tc-cc-alan">Parça başı (ayar dahil)<b className="tc-cc-toplam">{fmtMin(E.eff)}</b></div>
      </div>
      <svg className="tc-cc-surecubugu" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="Süre dağılımı">
        {seg.map((s) => { const w = s[1] / p * 100, r = <rect key={s[0]} className={renkSinifi(s[2])} x={+x0.toFixed(2)} y={0} width={+w.toFixed(2)} height={10}><title>{s[0] + ' · ' + fmtHM(s[1])}</title></rect>; x0 += w; return r; })}
      </svg>
      <div className="tc-cc-lejant">{seg.map((s) => <span key={s[0]}><i className={`tc-cc-ornek ${renkSinifi(s[2])}`} aria-hidden="true" />{s[0]} <b>{fmtHM(s[1])}</b></span>)}</div>
      <Kutular kutular={[
        { k: 'Toplam iş süresi', b: fmtHM(E.total), i: E.q + ' parça' },
        { k: 'Hazırlık · en olası', b: fmtHM(E.setup), i: (E.setT ? 'torna ' + fmtHM(E.setT) + ' · ' : '') + 'freze ' + fmtHM(E.setM) },
        { k: 'Üretim', b: fmtHM(E.prod), i: fmtMin(E.part) + ' / parça' },
      ]}
      />
      <Not>Hazırlık süresi, {E.beq} parçanın üretim süresine eşit{E.q < E.beq ? ' — bu partide hazırlık, üretimden uzun sürüyor; parti büyütmek parça başı süreyi hızla düşürür.' : '.'}{E.of !== 1 ? ' Operatör katsayısı ×' + fmtN(E.of, 1) + ' uygulandı.' : ''}</Not>
      {E.sep && E.mill && E.lath && (
        <Not>Tezgâh doluluğu: {E.lath.name} {fmtHM(E.machT)} · {E.mill.name} {fmtHM(E.machM)}. İki tezgâh paralel çalışırsa parti ≈ {fmtHM(Math.max(E.machT, E.machM) + Math.min(E.cycT + E.hT, E.cycM + E.hM))} sürer.</Not>
      )}
      {rng && <AralikKutusu r={rng} />}
      {senaryolar.length > 0 && <Senaryolar rows={senaryolar} q={E.q} />}
      {E.fai && <FaiKutusu F={E.fai} yeni={SC().job === 'new'} />}
      <ElemanListesi baslik="Torna hazırlığı" L={E.T} raw={E.rawT} tot={E.setT} />
      <ElemanListesi baslik="Freze hazırlığı" L={E.M} raw={E.rawM} tot={E.setM} />
      <ElemanListesi baslik="Parça başı yükleme / kontrol" L={E.H} raw={0} tot={E.hand} />
      <Ayrinti sinif="tc-cc-kaynaklar" ozet="Bu süreler nereden geliyor?">
        <div className="tc-cc-det-ic">
          <p>Eleman süreleri sahada kronometreyle ölçülmüş ayar adımlarından alındı; adetleri (takım, taraf, bağlama yönü, ölçü sayısı) bu plandan sayılır. Örneğin IEOM çalışmasındaki çubuk beslemeli, karşı iş milli torna değişimi 24 adımda 85,5 dk sürmüş, iyileştirmeden sonra 47–50 dk'ya inmiş. Kendi atölyenizde birkaç ayarı ölçüp birim süreleri düzeltin — mavi çerçeveli kutular sizin değerleriniz.</p>
          {Object.keys(used).map((k) => <div key={k} className="tc-cc-kaynak-satir"><b>{k}</b>{SU_SRC[k] ? <Kaynak ad={SU_SRC[k][0]} adres={SU_SRC[k][1]} /> : null}</div>)}
          <Dugme simge="rotate" onClick={() => { camKaydi().su = {}; save(); }}>Birim süreleri varsayılana döndür</Dugme>
        </div>
      </Ayrinti>
    </>
  );
}

/* ---------- süre kalibrasyonu ---------- */
export function KalibrasyonKutusu({ raw, tezgahAdi, tezgahId, yazabilir }: { raw: number; tezgahAdi: string; tezgahId: string; yazabilir: boolean }) {
  const [gercek, gercekYaz] = useState('');
  const c = (camKaydi().cal[tezgahId] || {}) as { f?: number; n?: number };
  return (
    <>
      <Baslik ek={tezgahAdi}>Süre kalibrasyonu</Baslik>
      <div className="tc-cc-izgara">
        <label className="tc-cc-alan">Gerçek çevrim süresi (dk)
          <input type="number" min="0" step="0.1" placeholder="tezgâhta ölçülen" value={gercek} onChange={(e) => { gercekYaz(e.target.value); }} disabled={!yazabilir} />
        </label>
        <div className="tc-cc-alan tc-cc-alt-hiza">
          <Dugme simge="check" disabled={!yazabilir} onClick={() => { kalibreEt(num(gercek, 0)); gercekYaz(''); }}>Kaydet</Dugme>
        </div>
      </div>
      <Not>
        {c.n ? c.n + ' ölçümle düzeltme katsayısı ×' + fmtN(c.f ?? 1, 2) + ' (tahmini ' + fmtMin(raw) + ' → ' + fmtMin(raw * (c.f ?? 1)) + '). ' : ''}
        Tezgâhta ölçülen gerçek süreyi girin; sistem bu tezgâh için katsayıyı öğrenir ve sonraki tahminleri düzeltir.{' '}
        <button type="button" className="tc-cc-bag" disabled={!yazabilir} onClick={kalibrasyonuSifirla}>Sıfırla</button>
      </Not>
    </>
  );
}

/* ---------- takımlar ve ömür ---------- */
export function OmurListesi({ L, q, mt }: { L: OmurSatiri[]; q: number; mt: boolean }) {
  return (
    <>
      <Baslik ek={'parti ' + q + ' adet'}>Takımlar ve ömür</Baslik>
      <div className="tc-cc-omur">
        {L.map((x) => {
          const yedek = x.parts ? Math.ceil(q / Math.max(1, x.parts)) - 1 : 0;
          return (
            <div key={(x.proc ?? '') + x.id + x.T} className={x.parts != null && x.parts < q ? 'tc-cc-omur-az' : undefined}>
              <b>T{mt ? String(x.T).padStart(2, '0') : x.T}</b>
              <span>{x.t ? x.t.name : x.id}{mt ? <em> {x.proc === 'turn' ? 'torna' : 'freze'}</em> : !x.inMag && <em> magazinde yok</em>}</span>
              <small>{x.cut ? fmtN(x.cut, 2) + ' dk/parça' : 'döngü'}{x.parts != null ? ' · ömür ≈' + fmtN(x.parts) + ' parça' + (yedek > 0 ? ' · partide ' + yedek + ' yedek' : '') : ''}</small>
            </div>
          );
        })}
      </div>
    </>
  );
}

export { camCal };
