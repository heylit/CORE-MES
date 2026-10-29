import { useMemo } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { fint, fmtN, num, pad2 } from '../bicim.ts';
import { useCncSurum } from '../depo.ts';
import { fmtT } from '../hesap/gkod.ts';
import { S } from '../parca.ts';
import { allLathe, allMachines, allMaterials, allMill, byId, machine, material } from '../secici.ts';
import { D } from '../veri/cncdata.ts';
import { camQty, camSetupMill, camSetupMT, camSetupRange, suScenarios } from './ayar-suresi.ts';
import { CAM_DEF } from './cekirdek.ts';
import { camKaydi } from './durum.ts';
import {
  baglamaGoster, burcYukle, camCal, camDialect, camMode, camMTCfg, camLatheMachs, camMillMachs, camPrm, CS, dilSec, hamSonucu,
  hepsiniIndir, islemGorunur, islemKarti, kilavuzSec, magazineYerlestir, malzemeSec, mtFrezeSec, mtSatirEtiketi, mtTornaSec,
  ornekYukle, parametreYaz, parcaHazir, programIndir, rota, rotaAnahtari, rotalariKarsilastir, rotaListeleri, rotaSec,
  rotaTezgahiSec, satirSec, takimListesi, tezgahSec, uret, uretimSuruyor,
} from './is.ts';
import { AyarKutusu, KalibrasyonKutusu, MalzemeKutusu, OmurListesi, SigmaKutusu } from './kutular.tsx';
import { malzemeEtkisi } from './malzeme.ts';
import type { MakineSimulasyonu } from './makine-sahnesi.ts';
import { msSegAt } from './makine-sim.ts';
import { Baslik, Kutular, Mesajlar, Not, RenkOrnegi, Satir, tamamlaninca, type MesajTuru } from './parcalar.tsx';
import { islemRengiAdi, satirRengiAdi } from './renk.ts';
import { RT_NAME, rtFirst, rtGeo, rtOk, rtPick, rtRecommend, type HamGeometrisi, type Rota, type RotaListeleri, type RotaRolu } from './rota.ts';
import { camFitMill, camFitMT } from './sigma.ts';
import type { CamParametre, FrezeIs, MtIs, NcProgram } from './tipler.ts';
import type { TornaSonucu } from './torna.ts';

// Oto-CAM panelinin bölümleri (prototipin camPanel, camRouteBox, camMachBox, camMillPanel, camLathePanel, camMTPanel, camMSPanel).
// Hesap ve durum is.ts'tedir; burada yalnız gösterim ve eylem bağlantısı.

const fmtMin = fmtT;
export interface PanelYetkisi { yazabilir: boolean; takimDegistirebilir: boolean }
export interface PanelEylemleri {
  dosyaAc: () => void;
  hamaGit: () => void;
  simulasyona: (p: NcProgram, si: number) => void;
  mtSimulasyona: (p: NcProgram) => void;
  hazirliga: (p: NcProgram) => void;
}

const DIL_SECENEKLERI = [['heid', 'Heidenhain Klartext (.H)'], ['iso', 'ISO / G-kod (.NC)']] as const;
const DIL_KISA = [['heid', 'Heidenhain (.H)'], ['iso', 'ISO (.NC)']] as const;

function DilSecimi({ etiket, kisa }: { etiket: string; kisa?: boolean }) {
  return (
    <label className="tc-cc-alan">{etiket}
      <select value={camDialect()} onChange={(e) => { dilSec(e.target.value); }}>
        {(kisa ? DIL_KISA : DIL_SECENEKLERI).map(([v, a]) => <option key={v} value={v}>{a}</option>)}
      </select>
    </label>
  );
}
function MalzemeSecimi() {
  return (
    <label className="tc-cc-alan">Malzeme
      <select value={material().id} onChange={(e) => { malzemeSec(e.target.value); }}>
        {allMaterials().map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </label>
  );
}
function Uyarilar({ L }: { L: string[] }) {
  if (!L.length) return null;
  return <><Baslik>Uyarılar</Baslik><Mesajlar satirlar={L.map((w) => ({ tur: 'warn' as MesajTuru, metin: w }))} /></>;
}

/* ---------- 1 · Parça ---------- */
const PRM_ALANLARI: [keyof CamParametre, string, number, number, number?][] = [
  ['ap', 'Kaba kademe (× Ø)', 0.05, 0.1], ['so', 'Yanal adım (× Ø)', 0.05, 0.1], ['allow', 'Kaba payı (mm)', 0.05, 0],
  ['allowF', 'Taban payı kabada (mm)', 0.05, 0], ['scallop', 'Serbest yüzey iz yük. (mm)', 0.002, 0.002], ['clamp', 'Bağlama payı / mengene (mm)', 1, 0],
];
function StratejiParametreleri() {
  const P = camPrm();
  const sayi = (k: keyof CamParametre) => tamamlaninca((v) => { parametreYaz(k, num(v, CAM_DEF[k] as number)); });
  return (
    <details className="tc-cc-det tc-cc-prm">
      <summary>Strateji parametreleri</summary>
      <div className="tc-cc-izgara">
        {PRM_ALANLARI.map(([k, a, st, mn]) => (
          <label key={k} className="tc-cc-alan">{a}<input type="number" step={st} min={mn} defaultValue={P[k] as number} {...sayi(k)} /></label>
        ))}
        <label className="tc-cc-alan">Analiz çözünürlüğü
          <select defaultValue={String(P.res)} onChange={(e) => { parametreYaz('res', +e.target.value); }}>
            <option value="80">Hızlı</option><option value="110">Normal</option><option value="150">Hassas</option>
          </select>
        </label>
        <label className="tc-cc-alan">En çok bağlama<input type="number" min={1} max={6} defaultValue={P.maxSetups} {...sayi('maxSetups')} /></label>
        <label className="tc-cc-alan">Takım değiştirme (sn)<input type="number" min={0} defaultValue={P.tc} {...sayi('tc')} /></label>
        <label className="tc-cc-alan">Eksen ivmesi (mm/s²)<input type="number" min={100} defaultValue={P.acc} {...sayi('acc')} /></label>
        <label className="tc-cc-isaret tc-cc-genis">
          <input type="checkbox" defaultChecked={P.use32} onChange={(e) => { parametreYaz('use32', e.target.checked); }} /> 5 eksenli tezgâhta yan yüzleri 3+2 ile aynı bağlamada işle
        </label>
      </div>
    </details>
  );
}

export function ParcaBolumu({ eylem }: { eylem: PanelEylemleri }) {
  const hazir = parcaHazir(), kip = camMode(), m = machine(), r = S.res;
  const g = rtGeo(hamSonucu());
  return (
    <>
      <Baslik ilk>1 · Parça</Baslik>
      {hazir && r ? (
        <div className="tc-cc-parca">
          <small>{(r.tube ? 'Boru' : r.type === 'bar' ? 'Yuvarlak çubuk' : 'Blok') + ' · ' + r.label}</small>
          <b>{S.name || 'Parça'}</b>
          <span>{fint(S.tris)} üçgen · {fmtN(S.vol / 1000, 1)} cm³</span>
        </div>
      ) : <Not>Parça yüklü değil. Örnek parçalardan birini açın ya da kendi STEP dosyanızı yükleyin.</Not>}
      <div className="tc-cc-dugmeler">
        <Dugme simge="cube" onClick={() => { ornekYukle('govde'); }}>Örnek gövde (freze)</Dugme>
        <Dugme simge="cube" onClick={() => { ornekYukle('mil'); }}>Örnek mil (torna)</Dugme>
        <Dugme simge="cube" onClick={() => { ornekYukle('mt'); }}>Örnek mil (torna + freze)</Dugme>
        <Dugme simge="cube" onClick={burcYukle}>Örnek burç (boru)</Dugme>
        <Dugme simge="upload" onClick={eylem.dosyaAc}>STEP / STL yükle</Dugme>
        <Dugme simge="chev-right" onClick={eylem.hamaGit}>Ham ölçü</Dugme>
      </div>
      {g ? <RotaKutusu g={g} /> : kip === 'mt' ? <MtTezgahSatiri /> : (
        <div className="tc-cc-izgara">
          <label className="tc-cc-alan">Tezgâh
            <select value={m.id} onChange={(e) => { tezgahSec(e.target.value); }}>
              {allMachines().map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <MalzemeSecimi />
        </div>
      )}
      <StratejiParametreleri />
      <div className="tc-cc-dugmeler">
        <Dugme tur="birincil" simge="play" disabled={!hazir || !!CS.busy || uretimSuruyor()} onClick={() => { void uret(); }}>
          {kip === 'mt' ? 'Torna + freze planı üret' : kip === 'lathe' ? 'Torna programı üret' : 'Analiz et ve program üret'}
        </Dugme>
      </div>
      {CS.msg && <Mesajlar satirlar={[{ tur: 'warn', metin: CS.msg.replace(/^⚠\s*/, '') }]} />}
    </>
  );
}

/* ---------- 2 · Yöntem ve rota ---------- */
function RotaKutusu({ g }: { g: HamGeometrisi & { circ?: number; turnFrac?: number; millFrac?: number } }) {
  const Ls = rotaListeleri()!, r = rota() as Rota, rec = rtRecommend(Ls, g), ok = !!CS.routes && CS.routesKey === rotaAnahtari();
  const rt = (k: Rota, rol: RotaRolu) => rtPick(Ls, k, rol).m.name;
  const eksen = typeof g.ai === 'number' ? 'XYZ'[g.ai] : String(g.ai);
  return (
    <>
      <div className="tc-cc-izgara"><MalzemeSecimi /><DilSecimi etiket="Program dili (freze)" kisa /></div>
      <Baslik>2 · Yöntem ve rota</Baslik>
      <Not>
        {g.method === 'mill' ? 'Parça dönel değil (dairesel kesit %' + fmtN((g.circ ?? 0) * 100, 0) + '): bloktan frezelenir.'
          : 'Dönel parça · ' + eksen + ' ekseni · yüzeylerin %' + fmtN((g.turnFrac ?? 0) * 100, 0) + '\'i torna'
            + (g.method === 'turn' ? ', freze gerekmez.' : ', %' + fmtN((g.millFrac ?? 0) * 100, 0) + '\'i freze (düz yüz, cep, yan delik, kama kanalı).')}
        {' '}Renkler: mavi torna, turuncu freze yüzeyi.
      </Not>
      <div className="tc-cc-rotalar">
        {(['a', 'b', 'c'] as Rota[]).map((k) => {
          const can = rtOk(k, Ls, g), o = ok ? CS.routes![k] : undefined, sm = o && 'sum' in o ? o.sum : null, err = o && 'err' in o ? o.err : '';
          const ms = k === 'a' ? rt('a', 'lathe') + (g.method === 'turn' ? '' : ' → ' + rt('a', 'mill')) : k === 'b' ? rt('b', 'mt') : rt('c', 'mill');
          const sinif = ['tc-cc-rota', k === r ? 'tc-cc-secili' : '', can ? '' : 'tc-cc-yok'].filter(Boolean).join(' ');
          return (
            <button key={k} type="button" className={sinif} aria-pressed={k === r} onClick={() => { rotaSec(k); }}>
              <b>{k.toUpperCase() + ' · ' + (k === 'a' && g.method === 'turn' ? 'Torna' : RT_NAME[k])}</b>
              <small>{ms}</small>
              {sm ? (
                <>
                  <small>Bağlama <u>{sm.setups}</u> · süre <u>{fmtMin(sm.time)}</u></small>
                  <small className={sm.bad ? 'tc-cc-ton-kotu' : 'tc-cc-ton-iyi'}>
                    {sm.bad ? '✕ ' + sm.bad + ' sığma sorunu' : '✓ sığıyor'}{sm.un > 1000 ? ' · ulaşılamaz ' + fmtN(sm.un / 1000, 1) + ' cm³' : ''}
                  </small>
                </>
              ) : err ? <small className="tc-cc-ton-kotu">✕ {err}</small>
                : <small className={can ? 'tc-cc-ton-iyi' : 'tc-cc-ton-kotu'}>{can ? '✓ sığan tezgâh var' : '✕ sığan tezgâh yok'}</small>}
              {g.method === 'mill' && k !== 'c' && <small className="tc-cc-ton-kotu">parça dönel değil</small>}
              {k === rec && <em>önerilen</em>}
            </button>
          );
        })}
      </div>
      <div className="tc-cc-dugmeler">
        <Dugme simge="route" disabled={!!CS.busy || uretimSuruyor()} onClick={() => { void rotalariKarsilastir(); }}>Üç rotayı hesapla ve karşılaştır</Dugme>
      </div>
      <TezgahKutusu r={r} Ls={Ls} g={g} />
    </>
  );
}

const SIGMA_ISARETI = { ok: '✓', warn: '!', bad: '✕' } as const;
function TezgahKutusu({ r, Ls, g }: { r: Rota; Ls: RotaListeleri; g: HamGeometrisi }) {
  const bar = S.alt?.bar, blok = S.alt?.block;
  const gruplar: [RotaRolu, string][] = r === 'a'
    ? [['lathe', 'Torna · Ø' + fmtN(bar?.D, 0) + ' × ' + fmtN(bar?.L, 0) + ' çubuk'] as [RotaRolu, string]].concat(g.method === 'turn' ? [] : [['mill', 'Freze · tornalanmış parça Ø' + fmtN(bar?.partD, 0) + ' × ' + fmtN(bar?.partLen, 0)]])
    : r === 'b' ? [['mt', 'Torna-freze · canlı takım / C ekseni']] : [['mill', 'Freze · blok ' + (blok?.label ?? '')]];
  let nOk = 0, nAll = 0;
  const satirlar = gruplar.map(([rol, baslik]) => {
    const L = (Ls[r] as Record<string, RotaListeleri['a']['lathe']>)[rol] ?? [], cur = rtPick(Ls, r, rol).m.id, best = rtFirst(L);
    return (
      <div key={rol}>
        <div className="tc-cc-sigma-baslik">{baslik}</div>
        {L.map((x) => {
          const st = x.bad.length ? 'bad' : x.warn.length ? 'warn' : 'ok', on = x.m.id === cur; nAll++; if (st !== 'bad') nOk++;
          return (
            <div key={x.m.id} className={`tc-cc-sigma-satir tc-cc-sigma-${st}${on ? ' tc-cc-secili' : ''}`}>
              <i aria-hidden="true">{SIGMA_ISARETI[st]}</i>
              <span>{x.m.name}<small>{x.bad.concat(x.warn).join(' · ') || x.info}</small></span>
              <b>
                {on ? 'seçili' : <Dugme onClick={() => { rotaTezgahiSec(r, rol, x.m.id); }}>Seç</Dugme>}
                {best && best.m.id === x.m.id && <small>en uygun</small>}
              </b>
            </div>
          );
        })}
      </div>
    );
  });
  return (
    <details className={`tc-cc-det tc-cc-sigma tc-cc-sigma-${rtOk(r, Ls, g) ? 'ok' : 'bad'}`} open>
      <summary>Tezgâh seçimi<em>{nOk} / {nAll} sığıyor</em></summary>
      <div className="tc-cc-sigma-liste">{satirlar}</div>
      <Not>Ön sığma: ham çapı, boyu, çubuk deliği, ayna, kurs, tabla ve yük. Sıralama: sığanlar önce, uyarısı az olan, sınırının %85'ini aşmayan, sonra sığan en küçük tezgâh. Programa bağlı denetimler (takım uzanımı, Y kursu) program üretilince Sığma kontrolü'nde.</Not>
    </details>
  );
}

function MtTezgahSatiri() {
  const cfg = camMTCfg();
  return (
    <>
      <div className="tc-cc-izgara">
        <label className="tc-cc-alan">Torna tezgâhı
          <select value={cfg.lathM.id} onChange={(e) => { mtTornaSec(e.target.value); }}>
            {camLatheMachs().map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="tc-cc-alan">Frezeleme nerede?
          <select value={cfg.sep ? cfg.millSel.id : 'same'} onChange={(e) => { mtFrezeSec(e.target.value); }}>
            <option value="same" disabled={!cfg.canSame}>Aynı tezgâh · C ekseni + canlı takım</option>
            {camMillMachs().map((x) => <option key={x.id} value={x.id}>Ayrı tezgâh · {x.name}</option>)}
          </select>
        </label>
        <MalzemeSecimi />
        <DilSecimi etiket="Program dili (ayrı freze)" kisa />
      </div>
      {!cfg.canSame ? <Not>{cfg.lathM.name} canlı takımlı değil: freze işlemleri ayrı tezgâhta yapılır.</Not>
        : cfg.lathM.type === 'lathe' ? <Not>Canlı takım kütüphanesi: {D.LIVE.length} takım (devir sınırı {fint(cfg.lathM.liveRpm || 6000)} dev/dk).</Not> : null}
    </>
  );
}

/* ---------- plan kutuları (malzeme, sığma, hazırlık) ---------- */
// Ayar süresi aralığı ve senaryolar ağır hesaptır (Monte Carlo): plan, programlar ya da kayıt değişince yeniden hesaplanır.
function PlanKutulari({ J, tur }: { J: FrezeIs | MtIs; tur: 'mill' | 'mt' }) {
  const surum = useCncSurum(), progs = CS.progs;
  const k = useMemo(() => {
    const kur = () => (tur === 'mt' ? camSetupMT(J as MtIs) : camSetupMill(J as FrezeIs, progs));
    const E = kur();
    return {
      e: malzemeEtkisi(J, tur, progs), fit: tur === 'mt' ? camFitMT(J as MtIs) : camFitMill(J as FrezeIs),
      E, rng: camSetupRange(E, progs), sen: suScenarios(kur),
    };
    // surum: atölye koşulları, birim süreler ve parti adedi kayıtta değişir.
  }, [J, tur, progs, surum]);
  return (
    <>
      <MalzemeKutusu e={k.e} yenidenUret={() => { void uret(); }} />
      <SigmaKutusu L={k.fit} />
      <AyarKutusu E={k.E} rng={k.rng} senaryolar={k.sen} />
    </>
  );
}

function UlasilamazListesi({ L, mt }: { L: { vol: number; box: number[]; clamp: boolean }[]; mt: boolean }) {
  if (!L.length) return null;
  return (
    <>
      <Baslik>Ulaşılamaz bölgeler</Baslik>
      <Mesajlar satirlar={L.slice(0, 6).map((u) => {
        const b = u.box;
        if (mt) return { tur: 'err' as MesajTuru, metin: fmtN(u.vol / 1000, 2) + ' cm³ · ön alından ' + fmtN(b[0], 0) + '…' + fmtN(b[3], 0) + ' mm — düz takımla hiçbir C açısından / eksenel erişilemiyor: özel takım ya da B ekseni gerekir' };
        return {
          tur: (u.clamp ? 'warn' : 'err') as MesajTuru,
          metin: fmtN(u.vol / 1000, 2) + ' cm³ · X' + fmtN(b[0], 0) + '…' + fmtN(b[3], 0) + ' Y' + fmtN(b[1], 0) + '…' + fmtN(b[4], 0) + ' Z' + fmtN(b[2], 0) + '…' + fmtN(b[5], 0) + ' — '
            + (u.clamp ? 'mengenede kalan bölge: ham ölçüyü / bağlama payını gözden geçirin' : 'düz takımla hiçbir yönden erişilemiyor (alttan boşaltma). T-kanal frezesi, lolipop freze ya da tel erozyon gerekir'),
        };
      })}
      />
    </>
  );
}

const sureEki = (): string => fmtN((CS.ms || 0) / 1000, 1) + ' sn';

/* ---------- 3 · Freze sonucu ---------- */
export function FrezePaneli({ J, yetki, eylem }: { J: FrezeIs; yetki: PanelYetkisi; eylem: PanelEylemleri }) {
  const cal = camCal(), c = camKaydi(), tmap = J.tmap || {}, ntool = Object.keys(tmap).length, AS = J.AS!;
  let raw = 0; J.setups.forEach((_s, i) => { const p = CS.progs[i]; if (p?.time) raw += p.time.total; });
  const unv = AS.unreach.filter((u) => !u.clamp).reduce((a, u) => a + u.vol, 0), unc = AS.unreach.filter((u) => u.clamp).reduce((a, u) => a + u.vol, 0);
  const progs = J.setups.map((_s, i) => CS.progs[i]).filter((p): p is NcProgram => !!p);
  return (
    <>
      <Baslik ek={sureEki()}>3 · Sonuç</Baslik>
      <Kutular kutular={[
        { k: 'Çevrim süresi', b: fmtMin(raw * cal), i: cal !== 1 ? 'kalibre ×' + fmtN(cal, 2) : 'dk:sn · tahmini' },
        { k: 'Bağlama', b: J.setups.length, i: J.five ? '5 eksen · 3+2' : '3 eksen' },
        { k: 'Takım', b: ntool, i: CS.need.length ? CS.need.length + ' magazinde yok' : 'magazinde' },
      ]}
      />
      <Kutular kutular={[
        { k: 'Talaş', b: fmtN(AS.totVol / 1000, 0), i: 'cm³ · ' + fmtN(AS.totVol / 1e6 * (J.mat.rho || 7.85), 2) + ' kg' },
        { k: 'Ulaşılamaz', b: fmtN(unv / 1000, 2), i: 'cm³', ton: unv > 1 ? 'kisa' : undefined },
        { k: 'Mengene payı', b: fmtN(unc / 1000, 1), i: 'cm³ · bağlamada kalır' },
      ]}
      />
      <PlanKutulari J={J} tur="mill" />
      <div className="tc-cc-izgara">
        <DilSecimi etiket="Program dili" />
        <label className="tc-cc-alan">Yolları göster
          <select value={String(c.sel ?? -1)} onChange={(e) => { baglamaGoster(+e.target.value); }}>
            <option value="-1">Tüm bağlamalar</option>
            {J.setups.map((s, i) => <option key={i} value={i}>OP{(i + 1) * 10} · {s.dir.name}</option>)}
          </select>
        </label>
      </div>
      <div className="tc-cc-dugmeler">
        <Dugme simge="download" onClick={() => { hepsiniIndir(progs); }}>Tüm programları indir</Dugme>
        {CS.need.length > 0 && yetki.takimDegistirebilir && <Dugme simge="layers" onClick={magazineYerlestir}>Eksik {CS.need.length} takımı magazine yerleştir</Dugme>}
        <Dugme simge="list" onClick={takimListesi}>Takım listesi (CSV)</Dugme>
      </div>
      {J.setups.map((s, i) => {
        const R = J.res[i]!, p = CS.progs[i], t = p?.time;
        const kilavuz: Record<string, NonNullable<typeof R.holes>> = {};
        (R.holes || []).filter((x) => x.tapM).forEach((x) => { const k = 'M' + x.tapM + (x.through ? ' boydan' : ' kör'); (kilavuz[k] = kilavuz[k] || []).push(x); });
        return (
          <section key={i} className="tc-cc-baglama">
            <header>
              <b>OP{(i + 1) * 10} · {s.dir.name} ({s.dir.k})</b>
              <span>{s.mode === '32' ? '3+2 · aynı bağlama' : i === 0 ? 'mengene · ' + s.dir.name + ' yüzü yukarı' : 'yeniden bağla · ' + s.dir.name + ' yüzü yukarı'}</span>
              <em>{t ? fmtMin(t.total * cal) : '—'}</em>
            </header>
            <div className="tc-cc-islemler">
              {R.ops.map((o, oi) => {
                const k = i + ':' + oi, on = c.vis[k] !== false;
                return (
                  <label key={oi} className={on ? undefined : 'tc-cc-kapali'}>
                    <input type="checkbox" checked={on} onChange={(e) => { islemGorunur(k, e.target.checked); }} />
                    <RenkOrnegi ad={islemRengiAdi(o.kind)} />
                    <span>{o.name}</span>
                    <small>T{tmap[o.tool.id]} · {o.tool.name}{o.cyc ? ' · ' + o.cyc.holes.length + ' delik' : ''}</small>
                  </label>
                );
              })}
            </div>
            {t && p && <div className="tc-cc-sure">Kesme {fmtMin(t.cut)} · hızlı {fmtMin(t.rapid)} · ivme {fmtMin(t.dyn)} · takım değişimi {fmtMin(t.tc)} · {fint(p.text.split('\n').length)} satır</div>}
            {Object.keys(kilavuz).length > 0 && (
              <div className="tc-cc-delikler">
                {Object.keys(kilavuz).map((k) => {
                  const xs = kilavuz[k]!, on = xs.every((x) => J.prm.tap[x.tapKey!]);
                  return (
                    <label key={k} className="tc-cc-isaret">
                      <input type="checkbox" checked={on} disabled={!!CS.busy} onChange={(e) => { void kilavuzSec(i, xs.map((x) => x.tapKey!), e.target.checked); }} />
                      {' '}Ø{fmtN(xs[0]!.d, 1)} × {xs.length} delik → {k} kılavuz çek
                    </label>
                  );
                })}
              </div>
            )}
            {p && (
              <div className="tc-cc-dugmeler">
                <Dugme simge="download" onClick={() => { programIndir(p); }}>{p.name}</Dugme>
                <Dugme simge="play" onClick={() => { eylem.simulasyona(p, i); }}>Simülasyonda aç</Dugme>
                {yetki.yazabilir && <Dugme simge="clipboard-check" onClick={() => { eylem.hazirliga(p); }}>Hazırlığa aktar</Dugme>}
                <Dugme simge="eye" onClick={() => { baglamaGoster(i); }}>Göster</Dugme>
              </div>
            )}
          </section>
        );
      })}
      {CS.tlife && <OmurListesi L={CS.tlife} q={camQty()} mt={false} />}
      <UlasilamazListesi L={AS.unreach} mt={false} />
      <Uyarilar L={J.warn} />
      <KalibrasyonKutusu raw={raw} tezgahAdi={machine().name} tezgahId={machine().id} yazabilir={yetki.yazabilir} />
      <Not>Bu program otomatik üretildi: tezgâhta ilk denemeden önce simülasyonda (parça ile karşılaştırma açık) ve kumandanın kendi grafik testinde kontrol edin. 3+2 yan bağlamalarda TRANS DATUM / PLANE SPATIAL satırlarını tezgâh kinematiğine göre doğrulayın.</Not>
    </>
  );
}

/* ---------- 3 · Torna sonucu ---------- */
export function TornaPaneli({ L, yetki, eylem }: { L: TornaSonucu; yetki: PanelYetkisi; eylem: PanelEylemleri }) {
  const t = L.time, cal = camCal(), p: NcProgram = { name: L.name, text: L.text, time: L.time ?? null };
  const kalemler = allLathe().concat(allMill());
  return (
    <>
      <Baslik ek={sureEki()}>3 · Sonuç</Baslik>
      <Kutular kutular={[
        { k: 'Süre', b: t ? fmtMin(t.total * cal) : '—', i: cal !== 1 ? 'kalibre' : 'tahmini' },
        { k: 'Parça boyu', b: fmtN(L.Lp, 1), i: 'mm' },
        { k: 'Takım', b: Object.keys(L.tn).length, i: 'istasyon' },
      ]}
      />
      <div className="tc-cc-islemler">
        {Object.keys(L.tn).map((id) => {
          const tt = byId(kalemler, id);
          return <label key={id}><RenkOrnegi ad="vurgu" /><span>T{L.tn[id]}</span><small>{tt ? tt.name : id}</small></label>;
        })}
      </div>
      {L.bore > 0 && <Satir k="Eksenel delik" v={'Ø' + fmtN(L.bore * 2, 2) + ' × ' + fmtN(L.Lb, 1) + ' mm'} />}
      {L.grooves.length > 0 && <Satir k="Kanal / boyun" v={L.grooves.length + ' adet'} />}
      <div className="tc-cc-dugmeler">
        <Dugme simge="download" onClick={() => { programIndir(p); }}>{L.name}</Dugme>
        <Dugme simge="play" onClick={() => { eylem.simulasyona(p, 0); }}>Simülasyonda aç</Dugme>
        {yetki.yazabilir && <Dugme simge="clipboard-check" onClick={() => { eylem.hazirliga(p); }}>Hazırlığa aktar</Dugme>}
      </div>
      <Uyarilar L={L.warn} />
      <KalibrasyonKutusu raw={t ? t.total : 0} tezgahAdi={machine().name} tezgahId={machine().id} yazabilir={yetki.yazabilir} />
    </>
  );
}

/* ---------- 3 · Torna + freze planı ---------- */
export function MtPaneli({ J, yetki, eylem, simuleEt }: { J: MtIs; yetki: PanelYetkisi; eylem: PanelEylemleri; simuleEt: () => void }) {
  const cfg = J.cfg, cal = camCal(), c = camKaydi(), sel = c.selRow ?? -1, nT: Record<string, 1> = {};
  J.rows.forEach((r) => { nT[r.proc + String(r.T)] = 1; });
  const nMill = J.rows.filter((r) => r.proc === 'mill').length, nTurn = J.rows.length - nMill, ops = J.ops || [], progs = J.progs || [];
  const unv = J.AS.unreach.reduce((a, u) => a + u.vol, 0);
  const kilavuz: Record<string, { si: number; d: number; key: string }[]> = {};
  J.res.forEach((r, si) => {
    (r?.holes || []).filter((x) => x.tapM && x.how === 'drill').forEach((x) => { const k = si + '|M' + x.tapM + (x.through ? ' boydan' : ' kör'); (kilavuz[k] = kilavuz[k] || []).push({ si, d: x.d ?? 0, key: x.tapKey! }); });
  });
  return (
    <>
      <Baslik ek={sureEki()}>3 · Plan</Baslik>
      <Kutular kutular={[
        { k: 'Çevrim süresi', b: fmtMin((J.total ?? 0) * cal), i: cal !== 1 ? 'kalibre ×' + fmtN(cal, 2) : 'parça başı · tahmini' },
        { k: 'İşlem', b: J.rows.length, i: nTurn + ' torna · ' + nMill + ' freze' },
        { k: 'Takım', b: Object.keys(nT).length, i: ops.length + ' operasyon' },
      ]}
      />
      <Kutular kutular={[
        { k: 'Freze talaşı', b: fmtN(J.AS.totVol / 1000, 1), i: 'cm³ · dönel olmayan' },
        { k: 'Freze yönü', b: J.AS.setups.length, i: cfg.sep ? 'ayrı tezgâh' : 'C ekseni + eksenel' },
        { k: 'Ulaşılamaz', b: fmtN(unv / 1000, 2), i: 'cm³', ton: J.AS.unreach.length ? 'kisa' : undefined },
      ]}
      />
      <PlanKutulari J={J} tur="mt" />
      <div className="tc-cc-dugmeler">
        <Dugme tur="birincil" boyut="ana" simge="play" disabled={!!CS.busy} onClick={simuleEt}>Bütün operasyonları makinede simüle et</Dugme>
      </div>
      <div className="tc-cc-dugmeler">
        <Dugme simge="download" onClick={() => { hepsiniIndir(progs); }}>Tüm programlar</Dugme>
        <Dugme simge="list" onClick={islemKarti}>İşlem kartı (CSV)</Dugme>
        <Dugme simge="eye" disabled={sel < 0} onClick={() => { satirSec(sel); }}>Tüm yolları göster</Dugme>
      </div>
      <Not>Satıra tıklayın: o işlemin takım yolu 3B görünümde tek başına gösterilir.</Not>
      {ops.map((g) => {
        const first = g.rows[0]!;
        const alt = g.op === 10 ? cfg.lathM.name + ' · ana iş mili · çubuk Ø' + fmtN(J.D0, 0) + ' aynada'
          : g.op === 20 ? 'Ters bağlama / karşı iş mili · Ø' + fmtN(2 * J.L1.prof[Math.min(J.L1.prof.length - 1, Math.round(J.grip / 0.25))]!.r, 1) + ' çaptan ' + fmtN(J.grip, 0) + ' mm tutulur'
            : cfg.millSel.name + ' · ' + (first.setup?.dir.name ?? '') + ' · V-blok / mengene';
        return (
          <section key={g.op} className="tc-cc-baglama">
            <header>
              <b>OP{g.op}{g.op === 10 ? ' · Ön taraf' : g.op === 20 ? ' · Arka taraf' : ' · Frezeleme'}</b>
              <span>{alt}</span>
              <em>{fmtMin(g.time * cal)}</em>
            </header>
            <div className="tc-cc-satirlar">
              {g.rows.map((r, n) => {
                const idx = J.rows.indexOf(r);
                return (
                  <button key={idx} type="button" className={`tc-cc-satir${sel === idx ? ' tc-cc-secili' : ''}`} aria-pressed={sel === idx} onClick={() => { satirSec(idx); }}>
                    <b>{n + 1}</b>
                    <RenkOrnegi ad={satirRengiAdi(r.proc, r.sub, r.kind)} />
                    <span>{r.name}<u className={r.proc === 'turn' ? 'tc-cc-torna' : 'tc-cc-freze'}>{mtSatirEtiketi(r)}</u></span>
                    <small>T{pad2(r.T ?? 0)} · {r.tool.name}{r.mop?.cyc ? ' · ' + r.mop.cyc.holes.length + ' delik' : ''}{r.tcSkip ? ' · takım aynı' : ''}</small>
                    <em>{fmtMin((r.time ?? 0) * cal)}</em>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {Object.keys(kilavuz).length > 0 && (
        <>
          <Baslik>Diş açma</Baslik>
          <div className="tc-cc-delikler">
            {Object.keys(kilavuz).map((k) => {
              const xs = kilavuz[k]!, s = J.AS.setups[xs[0]!.si]!, on = xs.every((q) => J.prm.tap[q.key]);
              return (
                <label key={k} className="tc-cc-isaret">
                  <input type="checkbox" checked={on} disabled={!!CS.busy} onChange={(e) => { void kilavuzSec(xs[0]!.si, xs.map((q) => q.key), e.target.checked); }} />
                  {' '}OP{s.opn || s.op} {s.dir.name}: Ø{fmtN(xs[0]!.d, 1)} × {xs.length} delik → {k.split('|')[1]} kılavuz çek
                </label>
              );
            })}
          </div>
        </>
      )}
      <Baslik>Programlar</Baslik>
      <div className="tc-cc-programlar">
        {progs.map((p, i) => {
          const d = p.kind === 'comb' ? 'Tezgâh için birleşik program (torna + C ekseni freze)'
            : p.kind === 'lathe' ? (p.back ? 'Arka taraf tornalama · simüle edilebilir' : 'Ön taraf tornalama + kesme · simüle edilebilir')
              : 'Frezeleme · ' + (J.AS.setups[p.sIdx ?? 0]?.dir.name ?? '') + ' · yerel çerçeve, simüle edilebilir';
          return (
            <div key={i}>
              <b>{p.name}</b>
              <small>{d} · {fint(p.text.split('\n').length)} satır</small>
              <span>
                <Dugme simge="download" title="İndir" aria-label={p.name + ' indir'} onClick={() => { programIndir(p); }} />
                {p.kind !== 'comb' && <Dugme simge="play" onClick={() => { eylem.mtSimulasyona(p); }}>Sim.</Dugme>}
                {yetki.yazabilir && <Dugme simge="clipboard-check" onClick={() => { eylem.hazirliga(p); }}>Hazırlık</Dugme>}
              </span>
            </div>
          );
        })}
      </div>
      {!cfg.sep && <Not>Birleşik programda * işaretli satırlar (C ekseni bağlama, canlı takım M kodları, yerel çerçeve) kumandaya göre uyarlanmalıdır; simülasyon için ayrı torna / freze programlarını kullanın.</Not>}
      {CS.tlife && <OmurListesi L={CS.tlife} q={camQty()} mt />}
      <UlasilamazListesi L={J.AS.unreach} mt />
      <Uyarilar L={J.warn} />
      <KalibrasyonKutusu raw={J.total ?? 0} tezgahAdi={machine().name} tezgahId={machine().id} yazabilir={yetki.yazabilir} />
      <Not>Sıralama mantığı: önce dönel profil (alın, kaba, delik, finiş, kanal), sonra frezeleme. Frezede işlemler türüne göre (kaba → kalan → finiş → punta → delme → kılavuz) ve aynı takım bütün C açılarında art arda kullanılacak şekilde dizilir; kesmeden sonra arka taraf (ters bağlama) gelir. Ön taraftaki frezeleme, arka tarafta tornalanacak bölgeye girmez.</Not>
    </>
  );
}

/* ---------- makine simülasyonu ---------- */
export function SimPaneli({ ms }: { ms: MakineSimulasyonu }) {
  const S0 = ms.S; if (!S0) return null;
  const J = S0.J, F = S0.F, n = ms.cmpN, tot = Math.max(1, n.g + n.l + n.ok);
  const t = Math.min(S0.t, S0.total - 1e-9), rowNow = S0.segs.length ? (S0.segs[msSegAt(S0, t)]?.row ?? -1) : -1;
  return (
    <>
      <div className="tc-cc-dugmeler"><Dugme simge="chev-left" onClick={() => { ms.durdur(); }}>Plana dön</Dugme></div>
      <Baslik ek={J.cfg.lathM.name}>Makine simülasyonu</Baslik>
      <Not>Ham çubuk Ø{fmtN(J.D0, 0)} · bütün plan sırayla: torna, C ekseni frezeleme, kesme, {S0.st.sub ? 'karşı iş miline aktarma' : 'ters bağlama'}, arka taraf. Voksel {fmtN(F.h, 2)} mm · {fmtN(F.NX * F.NY * F.NZ / 1e6, 1)} M nokta.</Not>
      {J.cfg.sep && <Not>Frezeleme işlemleri seçiminize göre ayrı tezgâhta yapılır; burada sıranın tamamını görmek için aynı bağlamada gösterilir.</Not>}
      <div className="tc-cc-dugmeler">
        <Dugme tur={ms.show.cmp ? 'birincil' : 'ikincil'} simge={ms.show.cmp ? 'check' : 'target'} aria-pressed={ms.show.cmp} onClick={() => { ms.karsilastirmaAc(); }}>Parça ile karşılaştır</Dugme>
        <Dugme tur={ms.show.path ? 'birincil' : 'ikincil'} simge="route" aria-pressed={ms.show.path} onClick={() => { ms.yolAc(); }}>Takım yolu</Dugme>
        <Dugme tur={ms.show.shell ? 'birincil' : 'ikincil'} simge="box" aria-pressed={ms.show.shell} onClick={() => { ms.kabinAc(); }}>Makine kabini</Dugme>
      </div>
      {ms.show.cmp && ms.PS && (
        <>
          <Kutular kutular={[
            { k: 'Ölçüde', b: '%' + fmtN(n.ok / tot * 100, 0), i: 'yeşil', ton: 'iyi' },
            { k: 'Fazla malzeme', b: '%' + fmtN(n.l / tot * 100, 1), i: 'sarı / turuncu' },
            { k: 'Fazla kesme', b: '%' + fmtN(n.g / tot * 100, 1), i: 'kırmızı', ton: n.g / tot > 0.002 ? 'kisa' : undefined },
          ]}
          />
          <Not>Yüzey noktalarının bitmiş parçaya uzaklığı (tolerans ±{fmtN(0.35 * F.h + 0.05, 2)} mm, voksel çözünürlüğü kadar). Sarı alanlar çoğunlukla bilerek bırakılan yerlerdir: ulaşılamayan bölge, kılavuz çekilmemiş delik, punta / matkap ucu.</Not>
        </>
      )}
      <Baslik>Çarpışma kontrolü</Baslik>
      <Mesajlar satirlar={S0.colls.length
        ? S0.colls.map((x) => ({ tur: 'err' as MesajTuru, metin: fmtMin(x.t) + ' · ' + (x.row + 1) + '. ' + (J.rows[x.row]?.name ?? '') + ' — hızlı harekette (G0) takım malzemeye giriyor' }))
        : [{ tur: 'ok' as MesajTuru, metin: 'Şu ana kadar hızlı harekette çarpışma yok' }]}
      />
      <Baslik>İşlem sırası</Baslik>
      <div className="tc-cc-satirlar">
        {J.rows.map((r, i) => (
          <button
            key={i} type="button" aria-current={i === rowNow || undefined}
            className={`tc-cc-satir${i === rowNow ? ' tc-cc-secili' : i < rowNow ? ' tc-cc-bitti' : ''}`} onClick={() => { ms.satir(i); }}
          >
            <b>{i + 1}</b>
            <RenkOrnegi ad={r.proc === 'turn' ? 'vurgu' : islemRengiAdi(r.kind)} />
            <span>{r.name}<u className={r.proc === 'turn' ? 'tc-cc-torna' : 'tc-cc-freze'}>{mtSatirEtiketi(r)}</u></span>
            <small>OP{r.op} · T{pad2(r.T ?? 0)} · {r.tool.name}</small>
            <em>{fmtMin(S0.rowStart[i] ?? 0)}</em>
          </button>
        ))}
      </div>
      <Not>Satıra tıklayın: simülasyon o işlemin başına gider (geri giderken baştan yeniden hesaplanır). Turuncu nokta yerine kırmızı küre: hızlı harekette çarpışma.</Not>
    </>
  );
}

/* ---------- henüz plan yokken ---------- */
export function KipNotu() {
  const kip = camMode();
  return (
    <Not>
      {kip === 'mt' ? 'Çubuk parça: önce dönel profil tornalanır (alın, kaba, delik, finiş, kanal, kesme), ardından tornalanmış gövde ile parça arasındaki fark (düz yüzey, kama kanalı, çapraz / alın delikleri) bulunur; her özellik için en uygun C açısı ya da eksenel yön seçilir ve hepsi tek bir işlem sırasına konur. Arka taraf ters bağlamada tamamlanır.'
        : kip === 'lathe' ? 'Torna: dönel profil çıkarılır; alın, kaba, finiş, kanal, eksenel delik ve kesme işlemleri ISO olarak yazılır.'
          : 'Freze: parça 6 yönden taranır, erişilebilen talaş bağlamalara dağıtılır; her bağlama için alın, kaba, kalan malzeme, finiş, serbest yüzey ve delik işlemleri üretilir.'}
    </Not>
  );
}
