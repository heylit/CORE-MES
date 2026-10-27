import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dugme, IsaretKutusu, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { miktar as miktarMetni, sayi, YOK } from '../bicim.ts';
import { useRrKomutu } from '../veri.ts';
import {
  adimEkle, adimGuncelle, adimSil, adimSurukle, akisKarti, bagimlilikYaz, BAGIMLILIK_SIRASI, cevrimToplami, degisimOrani, fasonaCevir, fasonMu,
  istasyonYaz, kartBasligi, katalogaDon, katalogdanFarkli, kucuk, malzemeMaliyeti, OP_GRUPLARI, operasyonYaz, rotaEksikleri,
  sirali, statuNo, sureGirisi, sureMetni, sureYaz, tuketilenAdimlar, TUR_ADI, turKisa, yeniAdim,
  type Adim, type Malzeme, type Operasyon,
} from './kurallar.ts';
import { BAG_ADI, Bolme, fasonAdi, MetinAlani, SayiAlani, SecimAlani, type RotaEkrani, type Secim } from './ortak.tsx';
import { OperasyonKutuculari } from './AdimPaneli.tsx';
import { HizliEkle, MalzemeListesi } from './MalzemeSecici.tsx';
import { yeniKimlik } from './useRotaDuzeni.ts';

const BAG_ACIKLAMA = { bagimli: 'Önceki adım tamamen bitince başlar.', ortulu: 'Önceki adımdan belirli adet çıkınca başlar, akarak devam eder.', bagimsiz: 'Önceki adımı beklemez, paralel yapılır.' } as const;
const MALZEME_GIT_NOT = 'Listede olmayan malzeme Malzemeler ve Hizmetler\'de açılır; kart onaylanınca burada seçilebilir.';

function Baslik({ baslik, etiket, kapat }: { baslik: string; etiket?: string; kapat: () => void }) {
  return (
    <div className="tc-rr1-insp-hd">
      {etiket && <span className="tc-rr1-tag">{etiket}</span>}
      <b>{baslik}</b>
      <button type="button" className="tc-rr1-ib" onClick={kapat} aria-label="Paneli kapat"><Simge ad="x" boyut="k" /></button>
    </div>
  );
}

function MalzemeGit() {
  const git = useNavigate();
  return (
    <Bolme baslik="Listede yok mu?">
      <p className="tc-rr1-ipucu">{MALZEME_GIT_NOT}</p>
      <Dugme tur="birincil" simge="plus" title="Yeni kart Malzemeler ve Hizmetler'de açılır" onClick={() => { void git('/malzemeler/yeni'); }}>
        Malzemeler ve Hizmetler&apos;de oluştur
      </Dugme>
    </Bolme>
  );
}

// Malzeme kartı salt okunur: kartın sahibi Malzemeler ve Hizmetler'dir (bağlantı oraya).
function KartBilgisi({ r, m }: { r: RotaEkrani; m: Malzeme }) {
  const { duzen } = r;
  const maliyet = duzen.durum.maliyet;
  const birim = (id: string): number | null => {
    const g = maliyet?.malzeme[id];
    const n = g ? Number(g.birimMaliyet) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const uretilen = duzen.adimlar(m.id).length > 0;
  const tutar = maliyet ? (uretilen ? malzemeMaliyeti(m.id, duzen.adimlar, (id) => duzen.h.malzeme.get(id), birim) : birim(m.id)) : null;
  return (
    <>
      <dl className="tc-rr1-ig">
        <div className="tc-rr1-genis"><dt>Ad</dt><dd>{m.name}</dd></div>
        <div><dt>Kod</dt><dd>{m.code}</dd></div>
        <div><dt>Birim</dt><dd>{m.unit ?? YOK}</dd></div>
        <div><dt>Tür</dt><dd>{TUR_ADI[m.type] ?? m.type}</dd></div>
        {r.yetki.maliyetOku && <div><dt>{uretilen ? 'Malzeme maliyeti' : 'Birim maliyet'}</dt><dd>{tutar === null ? YOK : `${sayi(Math.round(tutar * 100) / 100)} ₺`}</dd></div>}
        <div><dt>Eldeki stok</dt><dd>{miktarMetni(m.stock, m.unit)}</dd></div>
        <div><dt>Minimum stok</dt><dd>{miktarMetni(m.min, m.unit)}</dd></div>
      </dl>
      <div className="tc-rr1-btnrow">
        <Dugme tur="ikincil" simge="tag" onClick={() => { r.git('items', m.id); }}>Malzemeler&apos;de aç</Dugme>
      </div>
    </>
  );
}

function UrunPaneli({ r, s, kapat }: { r: RotaEkrani; s: Extract<Secim, { tur: 'urun' }>; kapat: () => void }) {
  const m = r.duzen.h.malzeme.get(s.urunId);
  if (!m) return <BosPanel r={r} />;
  const ss = sirali(r.duzen.adimlar(m.id));
  const duzen = r.duzen.duzenlenebilir(m.id);
  return (
    <>
      <Baslik baslik={m.code} etiket={TUR_ADI[m.type] ?? m.type} kapat={kapat} />
      <Bolme baslik="Malzeme kartı"><KartBilgisi r={r} m={m} /></Bolme>
      {m.type !== 'ham' && (
        <Bolme baslik="Rota">
          {ss.length > 0 || r.duzen.gorulen(m.id) ? (
            <>
              <p className="tc-rr1-ipucu">Baz miktar 1 {m.unit ?? ''}: girenler, çıkanlar ile işlem ve değişim süreleri bu kadar çıktı için girilir.</p>
              <p className="tc-rr1-ipucu">{ss.length} adım, {ss.reduce((t, x) => t + x.ins.length, 0)} giren, {ss.reduce((t, x) => t + x.outs.length, 0)} çıkan.</p>
              <div className="tc-rr1-btnrow">
                {duzen && <Dugme tur="ikincil" simge="plus" onClick={() => { r.sec({ tur: 'adimEkle', urunId: m.id, sonraId: ss.at(-1)?.id ?? null }); }}>Adım ekle</Dugme>}
                {s.nid !== 'kok' && <Dugme tur="ikincil" onClick={() => { r.kokSec(m.id); }}>Ayrı şemada aç</Dugme>}
              </div>
            </>
          ) : (
            <>
              <p className="tc-rr1-ipucu">Bu {(TUR_ADI[m.type] ?? '').toLocaleLowerCase('tr-TR')} için rota yok; satın alınan parça gibi hesaplanır.</p>
              {duzen && <Dugme tur="birincil" onClick={() => { r.sec({ tur: 'adimEkle', urunId: m.id, sonraId: null }); }}>Rota oluştur</Dugme>}
            </>
          )}
        </Bolme>
      )}
    </>
  );
}

function UretimYeri({ r, s, a, duzen }: { r: RotaEkrani; s: { urunId: string }; a: Adim; duzen: boolean }) {
  const [dis, setDis] = useState(false);
  const firmalar = r.duzen.durum.fasonFirms ?? [];
  const fason = fasonMu(a);
  const acik = fason || dis;
  const kapali = firmalar.length === 0 && !fason;
  const op = r.duzen.h.op.get(a.opId);
  const yaz = (f: (x: Adim) => Adim, metin: string) => { r.duzen.degistir(s.urunId, (l) => adimGuncelle(l, a.id, f), metin); };
  const bilinmeyen = fason && !firmalar.some((f) => f.id === a.fasonId);
  return (
    <Bolme baslik="Nerede yapılır" ek="tc-rr1-depbox">
      <div className="tc-rr1-depsel tc-rr1-depsel-2">
        <button type="button" className={`tc-rr1-depb${acik ? '' : ' tc-rr1-on'}`} aria-pressed={!acik} disabled={!duzen}
          onClick={() => { setDis(false); if (fason) yaz((x) => fasonaCevir(x, null, op), 'İç üretime alındı'); }}>
          <b>İç üretim</b><small>Atölyede, istasyonda yapılır.</small>
        </button>
        <button type="button" className={`tc-rr1-depb${acik ? ' tc-rr1-on' : ''}`} aria-pressed={acik} disabled={!duzen || kapali}
          onClick={() => { setDis(true); }}>
          <b>Dış üretim (fason)</b><small>Fason firmada yapılır; termin gün olarak girilir.</small>
        </button>
      </div>
      {kapali && <p className="tc-rr1-ipucu">Fason işaretli firma yok. Müşteri ve Tedarikçi sayfasında firmayı fason işaretleyince dış üretim seçilebilir.</p>}
      {acik && (
        <div className="tc-rr1-ig">
          <SecimAlani etiket="Fason firma" deger={fason ? a.fasonId ?? '' : ''} kapali={!duzen} bos="Fason firma seç…"
            secenekler={[...(bilinmeyen ? [{ deger: a.fasonId ?? '', baslik: `Fason firma #${a.fasonId ?? ''} (listede yok)` }] : []),
              ...firmalar.map((f) => ({ deger: f.id, baslik: `${f.code ? `${f.code} ` : ''}${f.name}` }))]}
            yaz={(v) => { if (v) yaz((x) => fasonaCevir(x, v, op), 'Dış üretime alındı'); }} />
          {fason && (
            <SayiAlani etiket="Termin (gün)" deger={a.terminGun} kapali={!duzen} yerTutucu="gün"
              yaz={(v) => { yaz((x) => ({ ...x, terminGun: v === null || v <= 0 ? null : Math.round(v) }), 'Termin değişti'); }} />
          )}
          <p className="tc-rr1-ipucu tc-rr1-genis">
            {fason ? 'İş firmada yapılır: istasyon, makine ve süre girilmez; firmanın teslim süresi gün olarak yazılır.' : 'Firma seçilince adım dış üretime geçer.'}
            {' '}Açılmış emirde bu adım, başlamadan önce emrin kendisinde de değiştirilebilir.
          </p>
        </div>
      )}
    </Bolme>
  );
}

function AdimDuzeni({ r, s, kapat }: { r: RotaEkrani; s: Extract<Secim, { tur: 'adim' }>; kapat: () => void }) {
  const { duzen: dz } = r;
  const { h } = dz;
  const liste = sirali(dz.adimlar(s.urunId));
  const a = liste.find((x) => x.id === s.adimId) ?? liste.find((x) => x.seq === s.seq && x.id.startsWith('o'));
  const sahip = h.malzeme.get(s.urunId);
  if (!a || !sahip) return <BosPanel r={r} />;
  const idx = liste.indexOf(a);
  const son = idx === liste.length - 1;
  const duzen = dz.duzenlenebilir(s.urunId);
  const op = h.op.get(a.opId);
  const ist = a.stationId ? h.istasyon.get(a.stationId) : undefined;
  const im = ist ? h.isMerkezi.get(ist.wcId) : undefined;
  const fason = fasonMu(a);
  const birim = sahip.unit ?? '';
  const yaz = (f: (x: Adim) => Adim, metin: string) => { dz.degistir(s.urunId, (l) => adimGuncelle(l, a.id, f), metin); };
  const eksik = rotaEksikleri(liste, dz.malzemeVar, dz.opAdi).find((x) => x.adimId === a.id);
  const istasyonlar = [...h.istasyon.values()].filter((x) => x.aktif || x.id === a.stationId);
  const makineler = h.makineler(a.stationId).filter((x) => x.status === 'aktif' || x.id === a.machineId);
  const onceki = tuketilenAdimlar(liste, idx);
  const kart = son ? null : akisKarti(sahip.id, liste, idx, dz.malzemeVar);
  const opSecenek = [...h.op.values()].filter((o) => o.aktif || o.id === a.opId).map((o) => ({ deger: o.id, baslik: `${o.abbr ?? o.code} ${o.name}` }));
  const girenEkle = (m: Malzeme, n: number) => { yaz((x) => ({ ...x, ins: [...x.ins, { itemId: m.id, qty: n, scrap: 0 }] }), `${m.code} giren eklendi`); };
  const yanEkle = (m: Malzeme, n: number) => { yaz((x) => ({ ...x, outs: [...x.outs, { itemId: m.id, qty: n, kind: 'yan' as const }] }), `${m.code} yan ürün eklendi`); };
  return (
    <>
      <Baslik baslik={`${op?.abbr ?? 'Adım'} ${String(statuNo(a))}`} etiket={sahip.code} kapat={kapat} />
      {!duzen && r.yetki.rotaYaz && <p className="tc-rr1-ipucu">Bu revizyon salt gösteriliyor; değiştirmek için açık taslağı seç.</p>}
      {eksik && <div className="tc-rr1-warnbox" role="alert">{eksik.metin}. Eksik rota onaya gönderilemez ve emri plana alınmaz.</div>}
      <UretimYeri r={r} s={s} a={a} duzen={duzen} />
      <Bolme baslik={idx === 0 ? 'Önceki adımla ilişki' : `Önceki adımla ilişki (OP ${String(liste[idx - 1]?.seq ?? '')} → OP ${String(a.seq)})`} ek="tc-rr1-depbox">
        {idx === 0 ? <p className="tc-rr1-ipucu">Bu rotanın ilk adımı; emir başlayınca ve girenleri hazır olunca başlar.</p> : (
          <>
            <div className="tc-rr1-depsel">
              {BAGIMLILIK_SIRASI.map((k) => (
                <button key={k} type="button" className={`tc-rr1-depb${a.dep === k ? ' tc-rr1-on' : ''}`} aria-pressed={a.dep === k} disabled={!duzen}
                  onClick={() => { yaz((x) => bagimlilikYaz(x, k), 'Bağlılık değişti'); }}>
                  <b>{BAG_ADI[k]}</b><small>{BAG_ACIKLAMA[k]}</small>
                </button>
              ))}
            </div>
            {a.dep === 'ortulu' && (
              <SayiAlani etiket={`Kaç ${birim} çıkınca başlasın`} deger={a.depQty ?? 1} kapali={!duzen} ipucu="Bu adım öncekinden önce bitemez."
                yaz={(v) => { yaz((x) => ({ ...x, depQty: v !== null && v > 0 ? v : 1 }), 'Örtüşme değişti'); }} />
            )}
          </>
        )}
      </Bolme>
      <Bolme baslik={`Girenler (${String(a.ins.length)})`}>
        {a.ins.length > 0 ? (
          <div className="tc-rr1-qt">
            {a.ins.map((x, sira) => {
              const gm = h.malzeme.get(x.itemId);
              return (
                <div key={`${x.itemId}-${String(sira)}`} className="tc-rr1-qtr">
                  <button type="button" className="tc-rr1-qtn" onClick={() => { r.sec({ tur: 'giren', urunId: s.urunId, adimId: a.id, sira, nid: '', miktar: s.miktar * x.qty }); }}>
                    <span className={`tc-rr1-slot tc-rr1-slot-${gm?.type ?? 'yok'}`}>{gm ? turKisa(gm.type) : '?'}</span>
                    <b>{gm?.code ?? 'Silinmiş kart'}</b> <small>{gm?.name ?? ''}</small>
                  </button>
                  <SayiAlani etiket={`${gm?.code ?? ''} miktarı`} deger={x.qty} birim={gm?.unit ?? ''} kapali={!duzen}
                    yaz={(v) => { yaz((y) => ({ ...y, ins: y.ins.map((g, i) => (i === sira ? { ...g, qty: v ?? 0 } : g)) }), 'Giren miktarı değişti'); }} />
                  <SayiAlani etiket={`${gm?.code ?? ''} fire yüzdesi`} deger={x.scrap} birim="% fire" kapali={!duzen}
                    yaz={(v) => { yaz((y) => ({ ...y, ins: y.ins.map((g, i) => (i === sira ? { ...g, scrap: v ?? 0 } : g)) }), 'Giren firesi değişti'); }} />
                  {duzen && (
                    <button type="button" className="tc-rr1-ib" aria-label={`${gm?.code ?? ''} girenini kaldır`}
                      onClick={() => { yaz((y) => ({ ...y, ins: y.ins.filter((_, i) => i !== sira) }), 'Giren kaldırıldı'); }}>
                      <Simge ad="x" boyut="k" />
                    </button>
                  )}
                </div>
              );
            })}
            <p className="tc-rr1-ipucu">Miktarlar 1 {birim} {sahip.code} başınadır.</p>
          </div>
        ) : <p className="tc-rr1-ipucu">Bu adıma ek malzeme girmiyor; önceki adımın çıktısıyla devam eder.</p>}
        {duzen && <HizliEkle liste={[...h.malzeme.values()]} girdi haricId={sahip.id} ekle={girenEkle} etiket="Giren malzeme" />}
      </Bolme>
      <Bolme baslik={`Yan ürünler (${String(a.outs.length)})`}>
        {a.outs.length > 0 ? (
          <div className="tc-rr1-qt">
            {a.outs.map((x, sira) => {
              const ym = h.malzeme.get(x.itemId);
              return (
                <div key={`${x.itemId}-${String(sira)}`} className="tc-rr1-qtr">
                  <button type="button" className="tc-rr1-qtn" onClick={() => { r.sec({ tur: 'yan', urunId: s.urunId, adimId: a.id, sira, nid: '', miktar: s.miktar * x.qty }); }}>
                    <span className={`tc-rr1-slot tc-rr1-slot-${ym?.type ?? 'yok'}`}>{ym ? turKisa(ym.type) : '?'}</span>
                    <b>{ym?.code ?? 'Silinmiş kart'}</b> <small>{ym?.name ?? ''}</small>
                  </button>
                  <SayiAlani etiket={`${ym?.code ?? ''} yan ürün miktarı`} deger={x.qty} birim={ym?.unit ?? ''} kapali={!duzen}
                    yaz={(v) => { yaz((y) => ({ ...y, outs: y.outs.map((g, i) => (i === sira ? { ...g, qty: v ?? 0 } : g)) }), 'Yan ürün miktarı değişti'); }} />
                  {duzen && (
                    <button type="button" className="tc-rr1-ib" aria-label={`${ym?.code ?? ''} yan ürününü kaldır`}
                      onClick={() => { yaz((y) => ({ ...y, outs: y.outs.filter((_, i) => i !== sira) }), 'Yan ürün kaldırıldı'); }}>
                      <Simge ad="x" boyut="k" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : <p className="tc-rr1-ipucu">Yan ürün: ana ürünle birlikte bu adımdan çıkan, başka yerde kullanılan ya da satılan ürün. Çoğu adımda yoktur.</p>}
        {duzen && <HizliEkle liste={[...h.malzeme.values()]} girdi={false} haricId={null} ekle={yanEkle} etiket="Yan ürün" />}
      </Bolme>
      <Bolme baslik={fason ? 'Operasyon' : 'Operasyon ve istasyon'}>
        <div className="tc-rr1-ig">
          <span className="tc-rr1-genis">
            <SecimAlani etiket="Operasyon" deger={a.opId} secenekler={opSecenek} kapali={!duzen} bos={op ? undefined : 'Operasyon seç…'}
              yaz={(v) => { yaz((x) => operasyonYaz(x, h.op.get(v)), 'Operasyon değişti'); }} />
          </span>
          {!fason && (
            <>
              <span className="tc-rr1-genis">
                <SecimAlani etiket="İstasyon" deger={a.stationId ?? ''} kapali={!duzen} bos="Seç…"
                  secenekler={istasyonlar.map((x) => ({ deger: x.id, baslik: `${x.code} ${x.name}` }))}
                  yaz={(v) => { yaz((x) => istasyonYaz(x, v || null), 'İstasyon değişti'); }} />
              </span>
              <span className="tc-rr1-genis">
                <SecimAlani etiket="Makine" deger={a.machineId ?? ''} kapali={!duzen || makineler.length === 0} bos="Planlayıcı seçer"
                  secenekler={makineler.map((x) => ({ deger: x.id, baslik: `${x.code} ${x.name}` }))}
                  yaz={(v) => { yaz((x) => ({ ...x, machineId: v || null }), 'Makine değişti'); }} />
                <small className="tc-rr1-ipucu">
                  {makineler.length ? 'Boş bırakılırsa makineyi planlayıcı seçer; seçilirse plan adımı bu makineye sabitler.' : 'Bu istasyonda tanımlı aktif makine yok.'}
                  {a.machineId && a.alts.length > 0 ? ' Makine seçili: alternatif istasyonlar bu adımda kullanılmaz.' : ''}
                </small>
              </span>
              <SayiAlani etiket="Hazırlık (dk / parti)" deger={a.setup} kapali={!duzen} yaz={(v) => { yaz((x) => sureYaz(x, 'setup', v), 'Hazırlık süresi değişti'); }} />
              <SayiAlani etiket={`İşlem (dk / 1 ${birim})`} deger={a.proc} kapali={!duzen} yaz={(v) => { yaz((x) => sureYaz(x, 'proc', v), 'İşlem süresi değişti'); }} />
              <SayiAlani etiket={`Değişim (dk / 1 ${birim})`} deger={a.chg} kapali={!duzen} yerTutucu="boş" yaz={(v) => { yaz((x) => sureYaz(x, 'chg', v), 'Değişim süresi değişti'); }} />
              <div className="tc-rr1-alan"><span>Değişim %</span><b>{(() => { const o = degisimOrani(a.proc, a.chg); return o === null ? YOK : `%${sayi(Math.round(o * 10) / 10)}`; })()}</b></div>
              <p className="tc-rr1-ipucu tc-rr1-genis">
                Çevrim = işlem + değişim ({sayi(cevrimToplami(a.proc, a.chg))} dk).{' '}
                <button type="button" className="tc-rr1-linkbtn" onClick={() => { r.git('sureler'); }}>Süreler bölümü</button>
              </p>
            </>
          )}
          <div className="tc-rr1-genis tc-rr1-flowbox">
            <div>
              <span className="tc-rr1-lbl">Bu adımın girdisi</span>
              {idx === 0 ? <span className="tc-rr1-ipucu">İlk adım: girenler (hammadde) ile başlar</span>
                : a.dep === 'bagimsiz' ? <span className="tc-rr1-ipucu">Bağımsız adım: önceki adımın çıktısını beklemez ve tüketmez</span>
                  : onceki.map((p) => {
                    const k = akisKarti(sahip.id, liste, liste.indexOf(p), dz.malzemeVar);
                    return <span key={p.id} className="tc-rr1-flowc"><b>{kartBasligi(h.malzeme.get(k.itemId), k.adim, dz.opAdi)}</b> <small>önceki adımdan gelir ve tüketilir</small></span>;
                  })}
            </div>
            <div>
              <span className="tc-rr1-lbl">Bu adımın çıktısı</span>
              {son || !kart ? <span className="tc-rr1-flowc"><b>{sahip.code}</b> <small>son adım: ürün stoğa girer</small></span>
                : <span className="tc-rr1-flowc"><b>{kartBasligi(h.malzeme.get(kart.itemId), kart.adim, dz.opAdi)}</b> <small>{sahip.code} stoğunun bu adımdan sonraki hâli; sonraki adım onu tüketir</small></span>}
            </div>
          </div>
          <SayiAlani etiket="Fire / ret payı %" deger={a.rejectPct} kapali={!duzen}
            ipucu="Yalnızca planı büyütür: bu adımda kaybedilecek pay kadar önceki adımlar ve girenler fazla planlanır. Hurda rotada tanımlanmaz."
            yaz={(v) => { yaz((x) => ({ ...x, rejectPct: Math.min(95, Math.max(0, v ?? 0)) }), 'Fire payı değişti'); }} />
          {!fason && (
            <>
              <SecimAlani etiket="Makine kullanımı" deger={a.split} kapali={!duzen}
                secenekler={[{ deger: 'tek', baslik: 'Tek makinede' }, { deger: 'bol', baslik: 'Paralel böl' }]}
                yaz={(v) => { yaz((x) => ({ ...x, split: v === 'bol' ? 'bol' : 'tek' }), 'Makine kullanımı değişti'); }} />
              {a.split === 'bol' && (
                <SayiAlani etiket="En küçük parça" deger={a.minLot} kapali={!duzen} yerTutucu="boş"
                  yaz={(v) => { yaz((x) => ({ ...x, minLot: v !== null && v > 0 ? Math.round(v) : null }), 'En küçük parça değişti'); }} />
              )}
              <div className="tc-rr1-genis tc-rr1-altbox">
                <span className="tc-rr1-lbl">Alternatif istasyonlar</span>
                {a.alts.map((id) => {
                  const x = h.istasyon.get(id);
                  const t = a.altTimes[id];
                  return (
                    <div key={id} className="tc-rr1-altrow">
                      <span className="tc-rr1-chip">{x ? `${x.code} ${x.name}` : `İstasyon #${id}`}</span>
                      <SayiAlani etiket={`${x?.name ?? id} çevrim toplamı (dk)`} deger={t && (t.cycle ?? 0) > 0 ? t.cycle : null} yerTutucu={sayi(a.cycle)} kapali={!duzen}
                        yaz={(v) => { yaz((y) => ({ ...y, altTimes: { ...y.altTimes, [id]: { setup: y.altTimes[id]?.setup ?? null, cycle: v } } }), 'Alternatif süresi değişti'); }} />
                      <SayiAlani etiket={`${x?.name ?? id} hazırlık (dk)`} deger={t?.setup ?? null} yerTutucu={sayi(a.setup)} kapali={!duzen}
                        yaz={(v) => { yaz((y) => ({ ...y, altTimes: { ...y.altTimes, [id]: { cycle: y.altTimes[id]?.cycle ?? null, setup: v } } }), 'Alternatif süresi değişti'); }} />
                      {duzen && (
                        <button type="button" className="tc-rr1-ib" aria-label={`${x?.name ?? id} alternatifini kaldır`}
                          onClick={() => {
                            yaz((y) => {
                              const { [id]: _silinen, ...kalan } = y.altTimes;
                              return { ...y, alts: y.alts.filter((z) => z !== id), altTimes: kalan };
                            }, 'Alternatif kaldırıldı');
                          }}>
                          <Simge ad="x" boyut="k" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {duzen && (
                  <select className="tc-rr1-secim" value="" aria-label="Alternatif istasyon ekle"
                    onChange={(e) => { const v = e.target.value; if (v) yaz((y) => (y.alts.includes(v) ? y : { ...y, alts: [...y.alts, v] }), 'Alternatif eklendi'); }}>
                    <option value="">Alternatif ekle</option>
                    {istasyonlar.filter((x) => x.id !== a.stationId && !a.alts.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                  </select>
                )}
                <p className="tc-rr1-ipucu">Alternatifte süreyi boş bırakırsan ana istasyonun süresi kullanılır. Süre ayrıca istasyonun verimiyle düzeltilir.</p>
              </div>
              <span className="tc-rr1-genis">
                <IsaretKutusu etiket="Yarıda kalıp dönülünce hazırlık yeniden eklensin" checked={a.resetup} disabled={!duzen}
                  onChange={(e) => { const v = e.target.checked; yaz((x) => ({ ...x, resetup: v }), 'Yeniden hazırlık değişti'); }} />
              </span>
              <span className="tc-rr1-genis">
                <IsaretKutusu etiket="Her kurulumda ilk parça onayı istensin" checked={a.ilkParca !== 'yok'} disabled={!duzen}
                  onChange={(e) => { const v = e.target.checked; yaz((x) => ({ ...x, ilkParca: v ? 'her_kurulum' : 'yok' }), 'İlk parça onayı değişti'); }} />
              </span>
            </>
          )}
        </div>
        {!fason && duzen && op && katalogdanFarkli(a, op) && (
          <Dugme tur="ikincil" onClick={() => { yaz((x) => katalogaDon(x, op), 'Katalog değerlerine dönüldü'); }}>Katalog değerlerine dön ({op.abbr ?? op.code})</Dugme>
        )}
      </Bolme>
      {ist && (
        <Bolme baslik={<><span className={`tc-rr1-nokta ${ist.id ? `tc-rr1-renk-${String(Number(ist.id) % 6)}` : ''}`} /> İstasyon {ist.code}{im ? `, ${im.name}` : ''}</>}>
          <dl className="tc-rr1-ig">
            <div><dt>Verim %</dt><dd>{sayi(ist.eff)}</dd></div>
            <div><dt>Paralel adet</dt><dd>{sayi(ist.count)}</dd></div>
            {im && <div><dt>İş merkezi</dt><dd>{im.code} {im.name}</dd></div>}
          </dl>
          <p className="tc-rr1-ipucu">İstasyonun maliyeti, verimi ve vardiya düzeni Kaynaklar bölümündedir.</p>
          <Dugme tur="ikincil" simge="building" onClick={() => { r.git('res'); }}>Kaynaklar&apos;da aç</Dugme>
        </Bolme>
      )}
      {duzen && (
        <div className="tc-rr1-isec tc-rr1-btnrow">
          <Dugme tur="ikincil" simge="up" disabled={idx === 0} onClick={() => { const p = liste[idx - 1]; if (p) dz.degistir(s.urunId, (l) => adimSurukle(l, a.id, p.id), 'Adım yukarı taşındı'); }}>Yukarı</Dugme>
          <Dugme tur="ikincil" simge="down" disabled={son} onClick={() => { const n = liste[idx + 1]; if (n) dz.degistir(s.urunId, (l) => adimSurukle(l, a.id, n.id), 'Adım aşağı taşındı'); }}>Aşağı</Dugme>
          <Dugme tur="ikincil" simge="plus" onClick={() => { r.sec({ tur: 'adimEkle', urunId: s.urunId, sonraId: a.id }); }}>Sonrasına adım</Dugme>
          <Dugme tur="tehlike" simge="trash" onClick={() => { if (dz.degistir(s.urunId, (l) => adimSil(l, a.id), `OP ${String(statuNo(a))} silindi`)) r.sec(null); }}>Adımı sil</Dugme>
        </div>
      )}
    </>
  );
}

function KalemPaneli({ r, s, kapat }: { r: RotaEkrani; s: Extract<Secim, { tur: 'giren' | 'yan' }>; kapat: () => void }) {
  const { duzen: dz } = r;
  const { h } = dz;
  const a = dz.adimlar(s.urunId).find((x) => x.id === s.adimId);
  const sahip = h.malzeme.get(s.urunId);
  const giren = s.tur === 'giren';
  const kalem = a ? (giren ? a.ins[s.sira] : a.outs[s.sira]) : undefined;
  if (!a || !sahip || !kalem) return <BosPanel r={r} />;
  const m = h.malzeme.get(kalem.itemId);
  const duzen = dz.duzenlenebilir(s.urunId);
  const op = h.op.get(a.opId);
  const yaz = (f: (x: Adim) => Adim, metin: string) => { dz.degistir(s.urunId, (l) => adimGuncelle(l, a.id, f), metin); };
  const rotali = m ? dz.adimlar(m.id).length > 0 : false;
  return (
    <>
      <Baslik baslik={`${giren ? 'Giren' : 'Yan ürün'}: ${m?.code ?? '?'}`} etiket={`${sahip.code} / ${op?.abbr ?? ''} ${String(a.seq)}`} kapat={kapat} />
      <Bolme baslik={giren ? 'Bu adımdaki kullanım' : 'Bu adımdan çıkış'}>
        <div className="tc-rr1-ig">
          <div className="tc-rr1-alan tc-rr1-genis"><span>Malzeme</span><b>{m ? `${m.code} ${m.name}` : 'Silinmiş kart'}</b></div>
          <SayiAlani etiket={`Miktar (1 ${sahip.unit ?? ''} başına)`} deger={kalem.qty} kapali={!duzen}
            yaz={(v) => {
              yaz((x) => (giren ? { ...x, ins: x.ins.map((g, i) => (i === s.sira ? { ...g, qty: v ?? 0 } : g)) }
                : { ...x, outs: x.outs.map((g, i) => (i === s.sira ? { ...g, qty: v ?? 0 } : g)) }), 'Miktar değişti');
            }} />
          {giren && 'scrap' in kalem && (
            <SayiAlani etiket="Fire %" deger={kalem.scrap} kapali={!duzen}
              yaz={(v) => { yaz((x) => ({ ...x, ins: x.ins.map((g, i) => (i === s.sira ? { ...g, scrap: v ?? 0 } : g)) }), 'Fire değişti'); }} />
          )}
        </div>
        {!giren && <p className="tc-rr1-ipucu">Yan ürün, ana ürünle birlikte bu adımdan çıkar ve emir tamamlanınca stoğa girer. Birim maliyeti varsa değeri ürün maliyetinden düşülür.</p>}
        {duzen && (
          <div className="tc-rr1-btnrow">
            <Dugme tur="ikincil" onClick={() => { r.sec({ tur: giren ? 'girenEkle' : 'yanEkle', urunId: s.urunId, adimId: a.id, yerine: s.sira }); }}>Listeden değiştir</Dugme>
          </div>
        )}
      </Bolme>
      {m && (
        <Bolme baslik={`Malzeme kartı: ${m.code}`}>
          <KartBilgisi r={r} m={m} />
          {giren && m.type !== 'ham' && (
            <div className="tc-rr1-btnrow">
              {rotali ? (
                <>
                  {s.nid !== '' && <Dugme tur="ikincil" onClick={() => { r.kapaliDegistir(s.nid); }}>{r.kapali.has(s.nid) ? 'Alt akışı göster' : 'Alt akışı gizle'}</Dugme>}
                  <Dugme tur="ikincil" onClick={() => { r.kokSec(m.id); }}>Ayrı şemada aç</Dugme>
                </>
              ) : dz.duzenlenebilir(m.id) && (
                <Dugme tur="birincil" onClick={() => { r.sec({ tur: 'adimEkle', urunId: m.id, sonraId: null }); }}>Bu yarı mamule rota oluştur</Dugme>
              )}
            </div>
          )}
        </Bolme>
      )}
      <div className="tc-rr1-isec tc-rr1-btnrow">
        {duzen && (
          <Dugme tur="tehlike" onClick={() => {
            yaz((x) => (giren ? { ...x, ins: x.ins.filter((_, i) => i !== s.sira) } : { ...x, outs: x.outs.filter((_, i) => i !== s.sira) }), giren ? 'Giren kaldırıldı' : 'Yan ürün kaldırıldı');
            r.sec({ tur: 'adim', urunId: s.urunId, adimId: a.id, seq: a.seq, miktar: s.miktar });
          }}>Adımdan çıkar</Dugme>
        )}
        <Dugme tur="ikincil" onClick={() => { r.sec({ tur: 'adim', urunId: s.urunId, adimId: a.id, seq: a.seq, miktar: s.miktar }); }}>Adıma dön</Dugme>
      </div>
    </>
  );
}

function SecmeliPanel({ r, s, kapat }: { r: RotaEkrani; s: Extract<Secim, { tur: 'girenEkle' | 'yanEkle' }>; kapat: () => void }) {
  const { duzen: dz } = r;
  const a = dz.adimlar(s.urunId).find((x) => x.id === s.adimId);
  const sahip = dz.h.malzeme.get(s.urunId);
  if (!a || !sahip) return <BosPanel r={r} />;
  const giren = s.tur === 'girenEkle';
  const op = dz.h.op.get(a.opId);
  const sec = (m: Malzeme) => {
    let sira = s.yerine;
    const ok = dz.degistir(s.urunId, (l) => adimGuncelle(l, a.id, (x) => {
      if (giren) {
        if (sira !== null) return { ...x, ins: x.ins.map((g, i) => (i === sira ? { ...g, itemId: m.id } : g)) };
        sira = x.ins.length;
        return { ...x, ins: [...x.ins, { itemId: m.id, qty: 1, scrap: 0 }] };
      }
      if (sira !== null) return { ...x, outs: x.outs.map((g, i) => (i === sira ? { ...g, itemId: m.id } : g)) };
      sira = x.outs.length;
      return { ...x, outs: [...x.outs, { itemId: m.id, qty: 1, kind: 'yan' as const }] };
    }), `${m.code} ${giren ? 'giren' : 'yan ürün'} ${s.yerine !== null ? 'değişti' : 'eklendi'}`);
    if (ok && sira !== null) r.sec({ tur: giren ? 'giren' : 'yan', urunId: s.urunId, adimId: a.id, sira, nid: '', miktar: 1 });
  };
  return (
    <>
      <Baslik baslik={s.yerine !== null ? 'Malzemeyi değiştir' : giren ? 'Giren ekle' : 'Yan ürün ekle'} etiket={`${sahip.code} / ${op?.abbr ?? ''} ${String(a.seq)}`} kapat={kapat} />
      {!giren && (
        <p className="tc-rr1-ipucu">Buraya yalnızca yan ürün eklenir: ana ürünle birlikte aynı adımdan çıkan ve başka bir yerde kullanılan ya da satılan ikinci ürün. Hurda rotada tanımlanmaz.</p>
      )}
      <MalzemeListesi liste={[...dz.h.malzeme.values()]} girdi={giren} haricId={giren ? sahip.id : null} sec={sec} etiket="Malzeme ara" />
      <MalzemeGit />
    </>
  );
}

function YeniOperasyon({ r, eklendi }: { r: RotaEkrani; eklendi: (op: Operasyon) => void }) {
  const komut = useRrKomutu();
  const { bildir } = useBildirim();
  const ilkIst = [...r.duzen.h.istasyon.values()].find((x) => x.aktif)?.id ?? '';
  const [f, setF] = useState({ grup: OP_GRUPLARI[0]?.[0] ?? '', kod: '', kisa: '', ad: '', ist: ilkIst, setup: '15', proc: '2', chg: '' });
  const [hata, setHata] = useState('');
  const alan = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); };
  const kaydet = async () => {
    if (!f.kod.trim()) { setHata('Operasyonun kodunu yaz.'); return; }
    if (!f.ad.trim()) { setHata('Operasyonun adını yaz.'); return; }
    const s1 = sureGirisi(f.setup, 'hazirlik'); const s2 = sureGirisi(f.proc, 'islem'); const s3 = sureGirisi(f.chg, 'degisim');
    const kotu = [s1, s2, s3].find((x) => !x.ok);
    if (kotu && !kotu.ok) { setHata(kotu.ileti); return; }
    setHata('');
    const cevrim = s2.deger === null && s3.deger === null ? null : cevrimToplami(s2.deger, s3.deger);
    try {
      const c = await komut.mutateAsync({
        ad: 'operasyon-tipi-ekle',
        govde: {
          kod: f.kod.trim(), ad: f.ad.trim(), grup: f.grup, kisaltma: f.kisa.trim().toLocaleUpperCase('tr-TR') || null,
          varsayilanAyarDk: sureMetni(s1.deger, 2), varsayilanBirimDk: sureMetni(cevrim, 4), varsayilanIstasyonId: f.ist === '' ? null : Number(f.ist),
        },
      });
      const id = (c.sonuc as { id?: unknown } | null)?.id;
      if (typeof id !== 'number' && typeof id !== 'string') throw new Error('Operasyon kataloğunun cevabı okunamadı.');
      bildir('tamam', `${f.kod.trim()} operasyon kataloğuna eklendi.`);
      eklendi({
        id: String(id), code: f.kod.trim(), abbr: f.kisa.trim() || null, name: f.ad.trim(), group: f.grup, groupName: f.grup,
        stationId: f.ist || null, setup: s1.deger, cycle: cevrim, aktif: true,
      });
    } catch (e) {
      setHata((e as Error).message);
    }
  };
  return (
    <Bolme baslik="Yeni operasyon tanımla">
      <p className="tc-rr1-ipucu">Operasyon İstasyonlar&apos;ın operasyon tipi kataloğuna yazılır.</p>
      <div className="tc-rr1-ig">
        <SecimAlani etiket="Grup" deger={f.grup} secenekler={OP_GRUPLARI.map(([k, ad]) => ({ deger: k, baslik: ad }))} yaz={(v) => { alan('grup', v); }} />
        <label className="tc-rr1-alan"><span>Kod</span><input className="tc-rr1-metin" value={f.kod} placeholder="Örneğin KES-LZR" aria-label="Operasyon kodu" onChange={(e) => { alan('kod', e.target.value); }} /></label>
        <label className="tc-rr1-alan"><span>Kısaltma</span><input className="tc-rr1-metin" value={f.kisa} maxLength={6} placeholder="LZR" aria-label="Kısaltma" onChange={(e) => { alan('kisa', e.target.value); }} /></label>
        <label className="tc-rr1-alan tc-rr1-genis"><span>Ad</span><input className="tc-rr1-metin" value={f.ad} placeholder="Lazer kesim" aria-label="Operasyon adı" onChange={(e) => { alan('ad', e.target.value); }} /></label>
        <span className="tc-rr1-genis">
          <SecimAlani etiket="İstasyon" deger={f.ist} bos="Seç…" secenekler={[...r.duzen.h.istasyon.values()].filter((x) => x.aktif).map((x) => ({ deger: x.id, baslik: `${x.code} ${x.name}` }))}
            yaz={(v) => { alan('ist', v); }} />
        </span>
        <label className="tc-rr1-alan"><span>Hazırlık (dk)</span><input className="tc-rr1-sayi" inputMode="decimal" value={f.setup} aria-label="Hazırlık" onChange={(e) => { alan('setup', e.target.value); }} /></label>
        <label className="tc-rr1-alan"><span>İşlem (dk / birim)</span><input className="tc-rr1-sayi" inputMode="decimal" value={f.proc} aria-label="İşlem" onChange={(e) => { alan('proc', e.target.value); }} /></label>
        <label className="tc-rr1-alan"><span>Değişim (dk / birim)</span><input className="tc-rr1-sayi" inputMode="decimal" value={f.chg} placeholder="boş" aria-label="Değişim" onChange={(e) => { alan('chg', e.target.value); }} /></label>
      </div>
      {hata && <p className="tc-rr1-hata" role="alert">{hata}</p>}
      <Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => { void kaydet(); }}>Tanımla ve adıma ekle</Dugme>
    </Bolme>
  );
}

function AdimEklePaneli({ r, s, kapat }: { r: RotaEkrani; s: Extract<Secim, { tur: 'adimEkle' }>; kapat: () => void }) {
  const { duzen: dz } = r;
  const sahip = dz.h.malzeme.get(s.urunId);
  if (!sahip) return <BosPanel r={r} />;
  const sonra = s.sonraId ? dz.adimlar(s.urunId).find((x) => x.id === s.sonraId) : undefined;
  const ekle = (op: Operasyon) => {
    const yeni = yeniAdim(op, yeniKimlik());
    const l2 = adimEkle(dz.adimlar(s.urunId), s.sonraId, yeni);
    if (dz.degistir(s.urunId, () => l2, `${op.abbr ?? op.code} adımı eklendi`)) {
      r.sec({ tur: 'adim', urunId: s.urunId, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar: 1 });
    }
  };
  return (
    <>
      <Baslik baslik="Adım ekle" etiket={sahip.code} kapat={kapat} />
      <p className="tc-rr1-ipucu">{sonra ? `${String(sonra.seq)} numaralı adımdan sonra eklenecek.` : 'Rotanın başına eklenecek.'} Operasyona dokun, istasyon ve süreler katalogdan gelir.</p>
      <OperasyonKutuculari r={r} sec={ekle} />
      {r.yetki.istasyonYaz && <YeniOperasyon r={r} eklendi={ekle} />}
    </>
  );
}

function YeniRotaPaneli({ r, kapat }: { r: RotaEkrani; kapat: () => void }) {
  const [q, setQ] = useState('');
  const { duzen: dz } = r;
  const s = kucuk(q.trim());
  const adaylar = [...dz.h.malzeme.values()].filter((m) => (m.type === 'mamul' || m.type === 'yari') && dz.adimlar(m.id).length === 0
    && dz.revler(m.id).every((x) => x.status !== 'taslak' && x.status !== 'onay') && (!s || kucuk(`${m.code} ${m.name}`).includes(s)));
  return (
    <>
      <Baslik baslik="Yeni rota" kapat={kapat} />
      <p className="tc-rr1-ipucu">Rotası olmayan yarı mamul ya da mamulü seç; ilk adımı ekleyerek rotasını kur.</p>
      <input className="tc-rr1-metin" type="search" value={q} placeholder="Ürün ara: kod ya da ad" aria-label="Ürün ara" onChange={(e) => { setQ(e.target.value); }} />
      <div className="tc-rr1-picklist">
        {adaylar.map((m) => (
          <button key={m.id} type="button" className="tc-rr1-pick" onClick={() => { r.kokSec(m.id); r.sec({ tur: 'adimEkle', urunId: m.id, sonraId: null }); }}>
            <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</span><span className="tc-rr1-pn"><b>{m.code}</b> {m.name}</span>
          </button>
        ))}
        {adaylar.length === 0 && <p className="tc-rr1-ipucu">Rotası olmayan ürün yok.</p>}
      </div>
      <MalzemeGit />
    </>
  );
}

function BosPanel({ r }: { r: RotaEkrani }) {
  return (
    <div className="tc-rr1-insp-empty">
      <h3>Düzenleme paneli</h3>
      <p className="tc-rr1-ipucu">Şemada bir operasyon kutusuna ya da malzeme kartına, tabloda bir satırın OP numarasına dokun; ayrıntıları burada {r.yetki.rotaYaz ? 'düzenlersin' : 'görürsün'}.</p>
      <ul className="tc-rr1-liste">
        <li>Rota değişiklikleri taslak revizyona yazılır; üstteki şeritte görünür ve geri alınabilir.</li>
        <li>Onaylanana kadar plan, Kanban ve emirler yürürlükteki rotayı kullanır.</li>
        <li>Tekerlek yakınlaştırır, sürükleyerek gezersin; sağ alttaki yardım tüm kısayolları gösterir.</li>
      </ul>
    </div>
  );
}

export function DuzenlemePaneli({ r }: { r: RotaEkrani }) {
  const s = r.secim;
  const kapat = () => { r.sec(null); };
  const icerik = (() => {
    switch (s?.tur) {
      case undefined: return <BosPanel r={r} />;
      case 'urun': return <UrunPaneli r={r} s={s} kapat={kapat} />;
      case 'adim': return <AdimDuzeni key={`${s.urunId}|${s.adimId}`} r={r} s={s} kapat={kapat} />;
      case 'giren': case 'yan': return <KalemPaneli r={r} s={s} kapat={kapat} />;
      case 'girenEkle': case 'yanEkle': return <SecmeliPanel r={r} s={s} kapat={kapat} />;
      case 'adimEkle': return <AdimEklePaneli r={r} s={s} kapat={kapat} />;
      case 'yeniRota': return <YeniRotaPaneli r={r} kapat={kapat} />;
    }
  })();
  return (
    <aside className={`tc-rr1-insp${s ? '' : ' tc-rr1-kapali'}`} aria-label="Düzenleme paneli">
      {icerik}
    </aside>
  );
}

