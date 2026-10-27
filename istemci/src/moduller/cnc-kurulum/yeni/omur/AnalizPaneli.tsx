import { useId, useState, type ReactNode } from 'react';
import { Dugme, Girdi, Simge } from '../../../../ortak/arayuz/index.ts';
import {
  allLathe, allMaterials, allMill, D, fmtN, lifeKind, lifeMat, lifeRefs, machine, num, pad2, state, toolById, tools, wearPeek,
} from './cekirdek.ts';
import {
  kalibrasyon, lifeChain, lifeFill, openAnalysis, type AnalizSonucu, type HesapliSonuc, type OtoAlan,
} from './analiz.ts';
import { HesapZinciri } from './HesapZinciri.tsx';
import { Baslik, Bolum, degisince, Kv, Not, Uyari } from './parcalar.tsx';

interface Ozellikler {
  res: AnalizSonucu;
  yazabilir: boolean;
  geri: () => void;
  // Durum değişti: analiz yeniden hesaplanır ve kaydedilir.
  degisti: () => void;
}

const BOSALT = ['vc', 'f', 'ap', 'ae', 'tp', 'vb', 'ld'] as const;

// Yeşil alan: kullanıcı girmediyse optimum (katalog / önerilen) değerle doludur; boşaltılırsa optimuma döner.
function SayiAlani({ k, etiket, oto, placeholder, step, min, degisti }: {
  k: OtoAlan | 'price'; etiket: string; oto?: string; placeholder?: string; step?: string; min?: string; degisti: () => void;
}) {
  const l = state.life, own = l[k] != null && l[k] !== '', deger = own ? String(l[k]) : oto ?? '';
  return (
    <Girdi
      etiket={etiket} type="number" step={step} min={min} placeholder={placeholder} key={k + '|' + deger} defaultValue={deger}
      className={!own && oto ? 'tc-co-oto' : undefined} {...degisince((v) => { l[k] = v; degisti(); })}
    />
  );
}

function SecimAlani({ etiket, value, onChange, children }: { etiket: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="tc-alan">
      <label className="tc-alan-etiket" htmlFor={id}>{etiket}</label>
      <select id={id} className="tc-alan-kutu" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </div>
  );
}

// Seçenekler arasında sayıca eşleşen değer (prototipte "0.3" ile 0.3 aynı seçenektir); yoksa boş.
const secenekDegeri = (secenekler: readonly string[], v: string | undefined): string =>
  v == null || v === '' ? '' : secenekler.find((o) => +o === +v) ?? '';

const VB = [['0.2', 'Finiş · VB 0,2 mm'], ['0.3', 'Genel · VB 0,3 mm'], ['0.4', 'VB 0,4 mm'], ['0.6', 'Kaba · VB 0,6 mm']] as const;
const REL = [['50', '%50 (ortalama)'], ['80', '%80'], ['90', '%90'], ['95', '%95'], ['99', '%99']] as const;

// Tek takım analizi (prototipin lifeForm + lifeRender'ı): girdiler, büyük sonuç, hesap zinciri, parti planı, ekonomik hız ve
// kalibrasyon. Analiz girdileri her rolde açıktır (hesap ekranda); kalibrasyonu kaydetmek yazma ister.
export function AnalizPaneli({ res, yazabilir, geri, degisti }: Ozellikler) {
  const [gozlenen, gozlenenYaz] = useState('');
  const l = state.life, t = res.t, K = lifeKind(t), m = machine(), arr = tools();
  const R0 = res.M.err === undefined ? res.M.R : lifeRefs(t, res.mat);
  const oto = lifeFill(res);
  const otoVar = Object.keys(oto).length > 0;
  const fEtiket = R0.pitch ? 'Adım (mm) — sabit' : R0.fz ? 'İlerleme fz (mm/diş)' : 'İlerleme f (mm/dev)';
  const takimDegisti = (v: string): void => {
    l.sel = v;
    for (const k of BOSALT) l[k] = '';
    if (v.indexOf('p:') === 0) openAnalysis(+v.slice(2));
    degisti();
  };
  const form = (
    <div className="tc-co-form">
      <div className="tc-co-dugmeler"><Dugme simge="chev-left" onClick={geri}>Magazin takibine dön</Dugme></div>
      <SecimAlani etiket="Takım" value={l.sel} onChange={takimDegisti}>
        <optgroup label={'Magazin · ' + m.name}>
          {arr.map((id, i) => {
            if (id === 'empty' || id === 'probe') return null;
            return <option key={'p' + i} value={'p:' + i}>T{pad2(i + 1)} · {toolById(id).name}</option>;
          })}
        </optgroup>
        <optgroup label="Kütüphane">
          {allMill().concat(allLathe()).filter((x) => x.kind !== 'probe').map((x) => <option key={'t' + x.id} value={'t:' + x.id}>{x.name}</option>)}
        </optgroup>
      </SecimAlani>
      <div className="tc-co-izgara">
        <SecimAlani etiket="İş malzemesi" value={lifeMat().id} onChange={(v) => { l.mat = v; l.vc = ''; l.f = ''; degisti(); }}>
          {allMaterials().map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </SecimAlani>
        <SecimAlani etiket="Soğutma" value={l.cool || state.coolant} onChange={(v) => { l.cool = v; degisti(); }}>
          {D.COOL.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SecimAlani>
        <SayiAlani k="vc" etiket="Kesme hızı Vc (m/dk)" min="1" oto={oto.vc} placeholder={'katalog ' + fmtN(R0.vref, 0)} degisti={degisti} />
        <SayiAlani k="f" etiket={fEtiket} step="0.001" min="0.001" oto={oto.f} placeholder={'katalog ' + fmtN(R0.fref, 3)} degisti={degisti} />
        {(K.milling || K.turning) && <SayiAlani k="ap" etiket="Kesme derinliği ap (mm)" step="0.1" min="0.01" oto={oto.ap} placeholder={R0.apRef ? 'öneri ' + fmtN(R0.apRef, 1) : '—'} degisti={degisti} />}
        {K.milling && <SayiAlani k="ae" etiket="Kavrama ae (mm)" step="0.1" min="0.01" oto={oto.ae} placeholder={R0.aeRef ? 'öneri ' + fmtN(R0.aeRef, 1) : '—'} degisti={degisti} />}
        {K.drilling && <SayiAlani k="ld" etiket="Delik derinliği (× çap)" step="0.5" min="0.5" oto={oto.ld} degisti={degisti} />}
        <SecimAlani etiket="Ne zaman değiştiriyorsunuz?" value={secenekDegeri(VB.map((v) => v[0]), l.vb !== '' ? String(l.vb) : oto.vb)} onChange={(v) => { l.vb = v; degisti(); }}>
          {VB.map(([v, a]) => <option key={v} value={v}>{a}</option>)}
        </SecimAlani>
        <SecimAlani etiket="Güvenlik payı" value={secenekDegeri(REL.map((v) => v[0]), String(l.rel))} onChange={(v) => { l.rel = v; degisti(); }}>
          {REL.map(([v, a]) => <option key={v} value={v}>{a}</option>)}
        </SecimAlani>
      </div>
      <Bolum baslik="Üretim ve maliyet">
        <div className="tc-co-izgara">
          <SayiAlani k="tp" etiket="Parça başı kesme (dk)" step="0.01" min="0" oto={oto.tp} placeholder="programdan" degisti={degisti} />
          <SayiAlani k="batch" etiket="Parti adedi" min="1" oto={oto.batch} degisti={degisti} />
          <SayiAlani k="price" etiket="Takım fiyatı (TL)" min="0" placeholder="isteğe bağlı" degisti={degisti} />
          <SayiAlani k="uses" etiket="Kenar / bileme sayısı" min="1" oto={oto.uses} placeholder="uçlu 2 · bütün 3" degisti={degisti} />
          <SayiAlani k="tc" etiket="Takım değişimi (dk)" step="0.1" min="0" oto={oto.tc} degisti={degisti} />
          <SayiAlani k="rate" etiket="Tezgâh ücreti (TL/sa)" min="0" oto={oto.rate} degisti={degisti} />
        </div>
      </Bolum>
      {otoVar && (
        <Not>
          <i className="tc-co-oto-isaret" aria-hidden="true" />Yeşil değerler bu takım ve malzeme için optimum (katalog / önerilen) olarak otomatik dolduruldu.
          Değiştirdiğiniz alan sizin değerinizle hesaplanır; alanı boşaltırsanız optimuma döner.
        </Not>
      )}
      <Not>
        {res.gtp ? <>Parça başı kesme süresi programdan: <b>{fmtN(res.gtp, 2)} dk</b></> : 'Bu takım için program verisi yok — parça başı süreyi elle girebilirsiniz.'}
      </Not>
      <div className="tc-co-dugmeler">
        <Dugme simge="rotate" onClick={() => {
          l.vc = l.f = l.ap = l.ae = l.tp = l.vb = l.ld = l.batch = l.uses = l.tc = l.rate = '';
          degisti();
        }}>Değerleri sıfırla</Dugme>
      </div>
    </div>
  );
  if (res.M.err !== undefined) return <div className="tc-co-panel">{form}<Uyari>{res.M.err}</Uyari></div>;
  const r = res as HesapliSonuc, M0 = r.M, p = r.p;
  const wr = r.sel.pocket != null ? wearPeek(m.id, r.sel.pocket, t.id) : null, lfw = wr?.lf ? wr.lf : 1;
  const CH = lifeChain({
    M: M0, p, lf: lfw, tp: r.tp, tpSrc: r.gtp && !(num(l.tp, 0) > 0) ? 'G-koddan' : 'elle girildi', perDay: num(l.perDay, 0),
    sogutmaAdi: D.COOL.find((c) => c.id === p.cool)?.name,
  });
  const kaydet = (): void => {
    const obs = num(gozlenen, 0);
    if (obs > 0) { l.cal[p.key] = kalibrasyon(r, obs); gozlenenYaz(''); degisti(); }
  };
  return (
    <div className="tc-co-panel">
      {form}
      <div className="tc-co-sonuc">
        <small>{t.name} · {r.mat.name}</small>
        <b>{CH.parts != null ? '≈ ' + fmtN(CH.parts) + ' parçada bir değiştirin' : '≈ ' + fmtN(CH.TR, 0) + ' dk kesmede bir değiştirin'}</b>
        <span>
          Ortalama {fmtN(M0.Tm, 0)} dk dayanır; %{p.rel} güvenle {fmtN(CH.TR, 0)} dk&apos;da değiştirmek kırılma riskini düşük tutar. Süreler <u>kesme</u> süresidir
          (takımın talaş kaldırdığı süre), tezgâhın çalıştığı toplam süre değil.
        </span>
      </div>
      {CH.parts == null && <Uyari>Parça sayısına çevirmek için “Üretim ve maliyet” bölümüne bu takımın <b>parça başı kesme süresini</b> girin (G-Kod simülasyonu yüklüyse otomatik gelir).</Uyari>}
      {(M0.capped || M0.lowV) && (
        <Uyari>
          <Simge ad="alert" boyut="k" /> {M0.lowV
            ? 'Kesme hızı katalog değerinin çok altında (Vc ' + fmtN(p.vc, 0) + ' / ' + fmtN(R0.vref, 0) + '). Bu bölgede sıvanma ve yapışma aşınması baskın olur; model ömrü olduğundan uzun gösterebilir.'
            : 'Kesme koşulları katalogdan çok uzak — tahmin sınırlandırıldı.'}
        </Uyari>
      )}
      <Baslik>Hesap adım adım</Baslik>
      <HesapZinciri steps={CH.steps} />
      <Bolum baslik="Parti planı" acik={r.batch ? true : undefined}>
        {r.batch ? (
          <>
            <Kv k="Parti">{fmtN(r.batch.Q)} parça · {fmtN(r.tp, 2)} dk/parça</Kv>
            <Kv k="Gereken kenar / takım">{fmtN(r.batch.edgesMean, 1)} (en kötü %10: {r.batch.edgesP90})</Kv>
            <Kv k="Planlı değişimden önce kırılma">en az bir kez %{fmtN(r.batch.pFail * 100, 0)} ihtimal</Kv>
            {r.costEdge > 0 && <Kv k="Takım + değişim maliyeti">{fmtN(r.batch.cost, 2)} TL / parça</Kv>}
          </>
        ) : <Not>Parça başı kesme süresi olmadan hesaplanamaz.</Not>}
      </Bolum>
      <Bolum baslik="En ekonomik kesme hızı">
        {r.vOpt ? (
          <>
            <p className="tc-co-neden">
              Takım fiyatı {fmtN(r.price)} TL, {r.uses} kullanım ve tezgâh ücretine göre parça başı maliyeti en düşük yapan hız
              <b className="tc-co-iyi"> Vc ≈ {fmtN(r.vOpt, 0)} m/dk</b>. Bu hızda takım ortalama ≈ {fmtN(r.Topt, 0)} dk dayanır.
            </p>
            <Not>Daha hızlı kesmek parçayı hızlandırır ama takımı daha çabuk bitirir; bu nokta ikisinin dengesidir.</Not>
          </>
        ) : <Not>Aşağıdaki &quot;Üretim ve maliyet&quot; bölümüne takım fiyatını girin.</Not>}
      </Bolum>
      <Bolum baslik="Gerçek ömürle kalibre et" ek={p.cal !== 1 ? '×' + fmtN(p.cal, 2) : undefined}>
        <Not>Bu takım bu malzemede gerçekte kaç dakika kesti? Girdiğinizde aynı takım + malzeme için tüm tahminler (Magazin Takibi dahil) buna göre ölçeklenir.</Not>
        <div className="tc-co-izgara">
          <Girdi etiket="Gözlenen ortalama ömür (dk)" type="number" min="0.1" step="0.1" placeholder={'örn. ' + fmtN(M0.Tm, 0)} value={gozlenen} onChange={(e) => gozlenenYaz(e.target.value)} />
          {yazabilir && (
            <div className="tc-co-alt-hiza tc-co-dugmeler">
              <Dugme tur="birincil" simge="check" onClick={kaydet}>Kaydet</Dugme>
              {p.cal !== 1 && <Dugme simge="rotate" onClick={() => { delete l.cal[p.key]; degisti(); }}>Sıfırla</Dugme>}
            </div>
          )}
        </div>
      </Bolum>
      <Not>Model: genişletilmiş Taylor denklemi + Weibull dağılımı. Mutlak değerler kalibrasyonsuz ±%50 sapabilir; değişikliklerin yönü ve oranı güvenilirdir.</Not>
    </div>
  );
}
