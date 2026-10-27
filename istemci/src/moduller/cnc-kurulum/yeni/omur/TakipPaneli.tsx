import { useState } from 'react';
import { Dugme, Girdi, IsaretKutusu, OnayPenceresi, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import {
  allMachines, byId, cycleOf, fmtDay, fmtDur, fmtN, fmtT, invKey, isLatheTool, isMillTool, num, pad2, REL_TXT, ST_TXT, state, toolsOf,
} from './cekirdek.ts';
import { lifeChain } from './analiz.ts';
import { HesapZinciri } from './HesapZinciri.tsx';
import { Baslik, Bolum, degisince, depoOzeti, durumOzeti, Not, Ozet, Uyari } from './parcalar.tsx';
import { clearDemo, seedDemo } from './ornek.ts';
import {
  depoAdedi, kullanimDuzelt, parcaSuresi, satirKotu, takimDegisti, toplamlar, type CarkSatiri,
} from './takip.ts';
import type { CarkKarti, DepoKarti, OmurKarti } from './tipler.ts';

export interface PanelYetkisi { yazabilir: boolean; takimDegistirebilir: boolean; stokDusebilir: boolean }

interface Ozellikler {
  defs: readonly CarkSatiri[];
  active: number;
  secili: CarkKarti | null;
  yetki: PanelYetkisi;
  satiraGit: (i: number) => void;
  tezgahaGit: (tezgah: string, takim: string) => void;
  analiz: (c: CarkKarti) => void;
  kutuphane: () => void;
  // Durum değişti: kaydedilir, çark yeniden okunur.
  degisti: () => void;
}

const TP_KAYNAK = { program: 'G-koddan', elle: 'elle girildi', 'varsayılan': 'varsayılan — G-kod yüklenince gerçeği gelir' } as const;

// Çarkın yan paneli (prototipin lwPanel'i): bütün tezgâhlar ve depo özeti, örnek veri, çark satırları; seçili satır tezgâhsa seçili
// takımın "ne zaman değişecek" kartı, hesap zinciri ve değişim; depo satırıysa seçili kalemin stoğu. Elle üretim kaydı kurulmaz
// (311 a: adet yalnız Üretim Terminali'nden).
export function TakipPaneli({ defs, active, secili, yetki, satiraGit, tezgahaGit, analiz, kutuphane, degisti }: Ozellikler) {
  const [satirlarAcik, satirlarYaz] = useState(false);
  const [zincirAcik, zincirYaz] = useState(false);
  const [depodanDus, depodanDusYaz] = useState(true);
  const [onay, onayYaz] = useState<'chg' | 'clear' | null>(null);
  const d = defs[active];
  const { tot, dt, noSpare } = toplamlar(defs);
  const kart = secili && !secili.depot && d && !d.depot ? secili : null;

  return (
    <div className="tc-co-panel">
      <Baslik>Tüm tezgâhlar</Baslik>
      <Ozet satirlar={durumOzeti(tot)} />
      <Baslik>Depo</Baslik>
      <Ozet satirlar={depoOzeti(dt)} />
      {noSpare > 0 && <Uyari><Simge ad="alert" boyut="k" /> {noSpare} takımın ömrü bitiyor ve depoda yedeği yok — sipariş verin.</Uyari>}
      {state.lifeDemo === 'demo' ? (
        <div className="tc-co-ipucu">
          Örnek verilerle gösteriliyor: takım kullanımları ve stok adetleri uydurma. Kendi verinizi girdikçe yerini alır.
          {yetki.yazabilir && <Dugme simge="trash" onClick={() => onayYaz('clear')}>Örnek verileri temizle</Dugme>}
        </div>
      ) : yetki.yazabilir && (
        <div className="tc-co-satir"><Dugme simge="download" onClick={() => { seedDemo(); degisti(); }}>Örnek verileri yükle</Dugme></div>
      )}
      <Bolum baslik="Çark satırları" ek={`${active + 1} / ${defs.length}`} acik={satirlarAcik} degisti={satirlarYaz}>
        <div className="tc-co-satirlar">
          {defs.map((x, i) => {
            const bad = satirKotu(x);
            return (
              <button key={x.key} type="button" className={`tc-co-satirlar-oge${i === active ? ' tc-co-on' : ''}${x.depot ? ' tc-co-dep' : ''}`} onClick={() => satiraGit(i)}>
                <span>{x.title}</span><i>{x.cards.length}</i>
                {bad ? <b><Simge ad="alert" boyut="k" /> {bad}</b> : <b className="tc-co-iyi"><Simge ad="check" boyut="k" /></b>}
              </button>
            );
          })}
        </div>
      </Bolum>
      {d?.depot && <DepoBolumu d={d} c={secili?.depot ? secili : null} yetki={yetki} tezgahaGit={tezgahaGit} analiz={analiz} kutuphane={kutuphane} degisti={degisti} />}
      {d && !d.depot && (
        <>
          <Baslik>{d.m.name}</Baslik>
          <TezgahBaglami d={d} />
          {kart && (
            <TakimKarti
              c={kart} yetki={yetki} zincirAcik={zincirAcik} zincirYaz={zincirYaz} depodanDus={depodanDus} depodanDusYaz={depodanDusYaz}
              degistir={() => onayYaz('chg')} analiz={() => analiz(kart)} degisti={degisti}
            />
          )}
          <Baslik>Ayarlar</Baslik>
          <div className="tc-co-izgara">
            <Secim
              etiket="Değişim kriteri" value={String(num(state.life.trel, 80))} disabled={!yetki.yazabilir}
              secenekler={[50, 80, 95].map((v) => ({ deger: String(v), baslik: REL_TXT[v]! }))}
              onChange={(e) => { state.life.trel = e.target.value; degisti(); }}
            />
            <Girdi
              etiket="Günlük üretim (adet)" type="number" min="0" defaultValue={String(state.life.perDay ?? '')} key={'pd' + String(state.life.perDay)}
              disabled={!yetki.yazabilir} {...degisince((v) => { state.life.perDay = v; degisti(); })}
            />
          </div>
        </>
      )}
      <OnayPenceresi
        acik={onay === 'chg' && kart !== null} baslik="Takım değiştirildi"
        onayla={() => { if (kart) takimDegisti(kart, depodanDus); onayYaz(null); degisti(); }} vazgec={() => onayYaz(null)}
      >
        {kart && <p>T{pad2(kart.p + 1)} · {kart.t.name} yenisiyle değiştirildi mi?</p>}
      </OnayPenceresi>
      <OnayPenceresi
        acik={onay === 'clear'} baslik="Örnek veriler" tehlikeli onayMetni="Sil"
        onayla={() => { clearDemo(); onayYaz(null); degisti(); }} vazgec={() => onayYaz(null)}
      >
        <p>Örnek kullanım ve stok verileri silinsin mi? (Kendi girdiğiniz veriler korunur)</p>
      </OnayPenceresi>
    </div>
  );
}

function TezgahBaglami({ d }: { d: Extract<CarkSatiri, { depot?: false }> }) {
  const m = d.m, arr = toolsOf(m), cyc = cycleOf(m, arr), g = !!state.gsim && state.gsim.machine === m.id;
  return (
    <div className="tc-co-baglam">
      <div><small>Takım</small><b>{d.cards.length}</b></div>
      <div><small>Parça başı çevrim</small><b>{fmtT(cyc)}{g ? '' : ' ≈'}</b></div>
      <div className="tc-co-genis">
        <small>Süre kaynağı</small>
        <b>{g ? 'G-kod: ' + state.gsim!.name : 'Takım tipine göre varsayılan (G-kod yüklenince gerçek)'}</b>
      </div>
    </div>
  );
}

function TakimKarti({ c, yetki, zincirAcik, zincirYaz, depodanDus, depodanDusYaz, degistir, analiz, degisti }: {
  c: OmurKarti; yetki: PanelYetkisi; zincirAcik: boolean; zincirYaz: (v: boolean) => void; depodanDus: boolean; depodanDusYaz: (v: boolean) => void;
  degistir: () => void; analiz: () => void; degisti: () => void;
}) {
  const sp = c.spare, iv = state.inv[invKey(c.t)];
  return (
    <>
      <div className={`tc-co-tbas tc-co-st-${c.st}`}>
        <span className="tc-co-tn">T{pad2(c.p + 1)}</span><b>{c.t.name}</b><span className="tc-co-hap">{ST_TXT[c.st]}</span>
      </div>
      {c.M.err !== undefined ? <Not>{c.M.err}</Not> : (
        <>
          <div className="tc-co-ne-zaman">
            <small>Ne zaman değişecek?</small>
            <div>
              {c.st === 'over'
                ? <><b className="tc-co-kisa">Şimdi değiştirin</b> — güvenli süre {fmtN(-(c.rem ?? 0), 1)} dk aşıldı</>
                : <><b>≈ {fmtN(c.parts)} parça sonra</b>{c.hrs != null ? ' · ' + fmtDur(c.hrs) + ' tezgâh çalışması' : ''}{c.days != null ? ' · ' + fmtDay(c.days) : ''}</>}
            </div>
          </div>
          <Bolum baslik="Hesap adım adım" ek={c.src === 'program' ? 'kesme verisi G-koddan' : 'katalog kesme verisi'} acik={zincirAcik} degisti={zincirYaz}>
            <HesapZinciri steps={lifeChain({
              M: c.M, p: Object.assign({}, c.q, { rel: num(state.life.trel, 80) }), lf: c.w.lf || 1, used: c.w.used, parts: c.w.parts, tp: c.tp,
              tpSrc: TP_KAYNAK[c.tpi.src], perDay: num(state.life.perDay, 0),
            }).steps} />
          </Bolum>
          <div className="tc-co-izgara">
            <Girdi
              etiket="Parça başı kesme (dk)" type="number" step="0.01" min="0.01" key={'tp' + c.m.id + c.p + String(c.tp)} defaultValue={String(+(c.tp ?? 0).toFixed(3))}
              disabled={c.tpi.src === 'program' || !yetki.yazabilir} title={c.tpi.src === 'program' ? 'G-koddan geliyor' : undefined}
              {...degisince((v) => { parcaSuresi(c, v); degisti(); })}
            />
            <Girdi
              etiket="Kullanılan süre (dk)" type="number" step="0.1" min="0" key={'u' + c.m.id + c.p + String(c.w.used)} defaultValue={String(+c.w.used.toFixed(2))}
              disabled={!yetki.takimDegistirebilir} {...degisince((v) => { kullanimDuzelt(c, v); degisti(); })}
            />
          </div>
        </>
      )}
      <div className={`tc-co-yedek${sp == null ? '' : sp > 0 ? ' tc-co-yedek-var' : ' tc-co-yedek-yok'}`}>
        {sp == null ? 'Bu takım için stok girilmemiş.'
          : sp > 0 ? <><Simge ad="check" boyut="k" /> Depoda <b>{sp}</b> yedek var{iv?.loc ? ' · ' + iv.loc : ''}</>
          : <><Simge ad="alert" boyut="k" /> Depoda yedek yok — sipariş verin</>}
      </div>
      {yetki.takimDegistirebilir && <IsaretKutusu etiket="Değiştirince depodan 1 yedek düş" checked={depodanDus} onChange={(e) => depodanDusYaz(e.target.checked)} />}
      <div className="tc-co-dugmeler">
        {yetki.takimDegistirebilir && <Dugme tur="birincil" simge="rotate" onClick={degistir}>Takım değiştirildi</Dugme>}
        <Dugme simge="chart" onClick={analiz}>Ayrıntılı analiz</Dugme>
      </div>
    </>
  );
}

function DepoBolumu({ d, c, yetki, tezgahaGit, analiz, kutuphane, degisti }: {
  d: Extract<CarkSatiri, { depot: true }>; c: DepoKarti | null; yetki: PanelYetkisi; tezgahaGit: (tezgah: string, takim: string) => void;
  analiz: (c: CarkKarti) => void; kutuphane: () => void; degisti: () => void;
}) {
  const by = c?.u ? c.u.by : {};
  const used = Object.keys(by).filter((k) => by[k]!.mag + by[k]!.man);
  const s = c?.stock, iv = c ? state.inv[c.key] : undefined;
  return (
    <>
      <Baslik>{d.title}</Baslik>
      <Ozet satirlar={depoOzeti(d.n)} />
      {!c || !s ? <Not>Stok girilmiş kalem yok. Kütüphane sayfasından adet girin.</Not> : (
        <>
          <div className="tc-co-sonuc"><small>{c.shelf}</small><b>{c.t.name}</b><span>{c.t.code || ''}</span></div>
          <div className="tc-co-hucre tc-co-hucre-3">
            <div><small>Depoda</small><b className={`tc-co-stok-${s.st}`}>{s.avail == null ? '—' : s.avail}</b><i>adet</i></div>
            <div><small>Toplam</small><b>{s.qty}</b><i>adet</i></div>
            <div><small>Tezgâhta</small><b>{s.used}</b><i>adet</i></div>
          </div>
          <Not>
            {used.length ? (
              <>Takılı olduğu tezgâhlar: {used.map((k, i) => {
                const mm = byId(allMachines(), k);
                return <span key={k}>{i > 0 && ' · '}<button type="button" className="tc-co-bag" onClick={() => tezgahaGit(k, c.t.id)}>{mm ? mm.name : k} ×{by[k]!.mag + by[k]!.man}</button></span>;
              })}</>
            ) : 'Hiçbir tezgâhta takılı değil.'}
            {iv?.loc && <><br />Yer: {iv.loc}</>}
          </Not>
          <div className="tc-co-dugmeler">
            {yetki.stokDusebilir && <Dugme simge="minus" onClick={() => { depoAdedi(c, -1); degisti(); }}>1 adet</Dugme>}
            {yetki.yazabilir && <Dugme simge="plus" onClick={() => { depoAdedi(c, 1); degisti(); }}>1 adet</Dugme>}
            <Dugme simge="book" onClick={kutuphane}>Kütüphanede aç</Dugme>
            {(isMillTool(c.t) || isLatheTool(c.t)) && <Dugme simge="chart" onClick={() => analiz(c)}>Ömür analizi</Dugme>}
          </div>
        </>
      )}
    </>
  );
}
