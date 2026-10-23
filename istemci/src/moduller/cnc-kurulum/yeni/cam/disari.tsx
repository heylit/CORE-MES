import { useMemo, type KeyboardEvent } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { fmtN, num } from '../bicim.ts';
import { save, state, useCncSurum } from '../depo.ts';
import { useCncYetkisi } from '../veri.ts';
import { SU_PF, SU_SPREAD, fmtHC, scEtiketi, suProfBase, suProfRows, type ProfilSatiri } from './ayar-suresi.ts';
import { SC, suProfKaydi } from './durum.ts';
import './cam.css';

// P4'ün öteki parçalara verdiği (sözleşme bölüm 4): Tanımlar penceresinin "Hazırlık süreleri" sekmesi (prototipin suProfTab'ı).
function profilYaz(mid: string, alan: string, deger: string): void {
  const kayit = suProfKaydi(), o = kayit[mid] || (kayit[mid] = {});
  if (deger === '') delete o[alan]; else o[alan] = alan === 'meas' ? deger : Math.max(0, num(deger, 0));
  save();
}
function profilleriSifirla(): void { (state as Record<string, unknown>)['suProf'] = {}; save(); }

function ProfilKutusu({ mid, alan, taban, adim, kilitli }: { mid: string; alan: string; taban: unknown; adim: number; kilitli: boolean }) {
  const o = suProfKaydi()[mid] || {}, v = o[alan], kendi = v != null && v !== '';
  const yaz = (deger: string) => { if (deger !== (kendi ? String(v) : '')) profilYaz(mid, alan, deger); };
  return (
    <input
      type="number" min="0" step={adim} defaultValue={kendi ? String(v) : ''} placeholder={String(taban)} disabled={kilitli}
      className={kendi ? 'tc-cc-kendi' : undefined} aria-label={alan}
      onBlur={(e) => yaz(e.currentTarget.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') yaz(e.currentTarget.value); }}
    />
  );
}

// Aralık çubuğu: satır başına tek SVG (inline stil yok); yüzdeler en büyük "ilk kez" en kötü değerine göre.
function AralikCubugu({ r, mx }: { r: ProfilSatiri; mx: number }) {
  const y = (v: number) => +(v / mx * 100).toFixed(1);
  return (
    <svg className="tc-cc-bant" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="tc-cc-bant-b" x={y(r.B.best)} y={0} width={y(r.B.worst - r.B.best)} height={8} rx={2} />
      <rect className="tc-cc-bant-a" x={y(r.A.best)} y={1.5} width={y(r.A.worst - r.A.best)} height={5} rx={2} />
      <line className="tc-cc-bant-ort" x1={y(r.A.mean)} x2={y(r.A.mean)} y1={0} y2={8} />
      <line className="tc-cc-bant-ort tc-cc-bant-yeni" x1={y(r.B.mean)} x2={y(r.B.mean)} y1={0} y2={8} />
    </svg>
  );
}

export function AyarSuresiProfili() {
  const surum = useCncSurum(), yetki = useCncYetkisi(), kilitli = !yetki.yazabilir;
  const rows = useMemo(() => { void surum; return suProfRows(); }, [surum]);
  const mxB = rows.reduce((a, r) => Math.max(a, r.B.worst), 0) || 1, sc = SC();
  return (
    <div className="tc-cc-sup" key={surum}>
      <p className="tc-cc-not">Her tezgâh aynı <b>standart referans işle</b> karşılaştırılır: 10 takım (magazinde hazır olmayanlar takılır), 2 bağlama / taraf, 12 ölçü, çevrim torna 10 dk / freze 15 dk. Kutulardaki değerler tezgâhın profili — değiştirdiğiniz değer hem bu tabloya hem Oto-CAM ayar hesabına geçer.</p>
      <details className="tc-cc-ayrinti" open>
        <summary>Hesap nasıl yapılıyor?</summary>
        <div className="tc-cc-kaynak">
          <p><b>1 · Adımlara bölme.</b> Hazırlık; takım bağlama, ölçme, ayna / aparat, sıfır, program denemesi, ilk parça gibi adımlara ayrılır. Adım sayıları işten (takım, taraf, ölçü sayısı), birim süreler sahada kronometreyle ölçülmüş çalışmalardan ve tezgâhın profilinden gelir.</p>
          <p><b>2 · Üç nokta (PERT).</b> Her adımın en iyi (a), en olası (m) ve en kötü (b) süresi vardır. Beklenen süre = (a + 4m + b) / 6. Adım türüne göre saçılma:</p>
          <table className="tc-cc-tablo">
            <thead><tr><th>Adım türü</th><th>En iyi</th><th>En kötü</th><th>Neden</th></tr></thead>
            <tbody>
              {Object.keys(SU_SPREAD).map((k) => { const s = SU_SPREAD[k]!; return <tr key={k}><td><b>{s[2]}</b></td><td>×{fmtN(s[0], 1)}</td><td>×{fmtN(s[1], 1)}</td><td>{s[3]}</td></tr>; })}
            </tbody>
          </table>
          <p><b>3 · Monte Carlo.</b> Ayar 1500 kez "yapılır": her adım kendi dağılımından çekilir; aynı gün / aynı operatör etkisi için hepsi ortak bir katsayıyla (0,9–1,25) çarpılır. Sıralanan sonuçlardan P10 / P50 / P90 okunur.</p>
          <p><b>4 · Üç sonuç.</b> <b>En iyi</b>: ön ayar cihazı, kit, hızlı çene / sıfır noktası, deneyimli operatör ve her adım en kısa — ulaşılabilecek alt sınır. <b>Ortalama</b>: şu an seçili atölye koşullarında beklenen süre. <b>En kötü</b>: elle ölçme, hazırlıksız, klasik çene, seyrek kullanan operatör, kalite bekleme — ve bu koşullarda 10 hazırlıktan 1'inin aşacağı süre (P90).</p>
        </div>
      </details>
      <div className="tc-cc-ptab">
        <table className="tc-cc-tablo">
          <thead>
            <tr>
              <th rowSpan={2}>Tezgâh</th><th rowSpan={2}>Profil</th><th colSpan={5}>Profil değerleri</th>
              <th colSpan={3} className="tc-cc-grup">Tekrar iş · sa:dk</th><th colSpan={3} className="tc-cc-grup">İlk kez (FAI dahil) · sa:dk</th>
            </tr>
            <tr>
              {SU_PF.map((f) => <th key={f[0]}>{f[1]}{f[2] ? <small>{f[2]}</small> : null}</th>)}
              <th className="tc-cc-iyi">En iyi</th><th>Ort.</th><th className="tc-cc-kotu">En kötü</th>
              <th className="tc-cc-iyi">En iyi</th><th>Ort.</th><th className="tc-cc-kotu">En kötü</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = r.m, P = r.P, mid = String(m.id), o = suProfKaydi()[mid] || {}, base = suProfBase(m), hk = P.cls === 'mill5' || P.cls === 'hmc' ? 'fix' : 'jaw';
              return [
                <tr key={mid}>
                  <td><b>{String(m['no'] || '')}</b> {m.baseName || m.name}</td>
                  <td><small>{P.hold}{P.why ? <><br />{P.why}</> : null}</small></td>
                  <td><ProfilKutusu mid={mid} alan="swap" taban={base.swap} adim={0.1} kilitli={kilitli} /></td>
                  <td><ProfilKutusu mid={mid} alan={hk} taban={base[hk]} adim={0.5} kilitli={kilitli} /><small>{hk === 'fix' ? 'aparat hizalama' : 'çene değişimi'}</small></td>
                  <td>
                    <select aria-label="meas" defaultValue={o['meas'] === 'probe' || o['meas'] === 'manual' ? String(o['meas']) : ''} disabled={!!m.manual || kilitli} onChange={(e) => profilYaz(mid, 'meas', e.currentTarget.value)}>
                      <option value="">{base.meas === 'manual' ? 'elle' : 'prob / lazer'}</option>
                      <option value="probe">prob / lazer</option>
                      <option value="manual">elle</option>
                    </select>
                  </td>
                  <td>{P.cls === 'manual' ? '—' : <ProfilKutusu mid={mid} alan="prove" taban={base.prove} adim={0.1} kilitli={kilitli} />}</td>
                  <td><ProfilKutusu mid={mid} alan="kg" taban={base.kg} adim={1} kilitli={kilitli} /></td>
                  {[r.A, r.B].map((R, i) => [
                    <td key={i + 'a'} className="tc-cc-iyi">{fmtHC(R.best)}</td>,
                    <td key={i + 'b'}><b>{fmtHC(R.mean)}</b></td>,
                    <td key={i + 'c'} className="tc-cc-kotu">{fmtHC(R.worst)}</td>,
                  ])}
                </tr>,
                <tr key={mid + '-bant'} className="tc-cc-bant-satir"><td colSpan={13}><AralikCubugu r={r} mx={mxB} /></td></tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="tc-cc-not">
        Çubuk: <span className="tc-cc-ornek tc-cc-ornek-a" /> tekrar iş aralığı · <span className="tc-cc-ornek tc-cc-ornek-b" /> ilk kez aralığı · çizgiler ortalama. "Ortalama" sütunları şu anki atölye koşullarıyla ({scEtiketi('meas', sc.meas)}, {scEtiketi('op', sc.op)}, tolerans {scEtiketi('tol', sc.tol)}) hesaplanır; koşullar Oto-CAM → Atölye koşulları'ndan değişir. Boş kutu = varsayılan (gri), mavi = sizin değeriniz.
        {kilitli ? null : <> <Dugme simge="rotate" onClick={profilleriSifirla}>Profilleri varsayılana döndür</Dugme></>}
      </p>
    </div>
  );
}
