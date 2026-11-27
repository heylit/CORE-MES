import { useEffect, useRef, useState } from 'react';
import type { CanliyaAlOnizlemesiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { OnayPenceresi, Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../../ortak/veri/api.ts';
import { useEmirNo } from '../../ortak/emir-no.ts';
import { altEkranAdresi, type PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { kisitAdi, saatYaz, simdiSaati, type OkunanPlan } from '../kurallar.ts';
import { adimAdi, careCumlesi, gunSaat, itilenSatiri, kaydirmaDugmesi, kaydirmaIsleri, kapaliListeFarkli, KaydirmaHatasi, kilidiKaldir, kilitCakismasiIsi, kilitCakismasiNedeni, oneriYokMetni, kilitleriKaydir, komsuAdi, komsuKilitKaymalari, nedenCumlesi, yazilanOneri, type Ihlal, type KilitCakismasi, type OnizlemeDurumu } from './canli-onizleme.ts';

// 3669: onay sayfasında gönderme öncesi iki parça. Kalıcı satır: kapalı kısıt varken plan o kısıtları saymadan çözülür (canlıya çıkacak saatler
// de öyle). Uyarı kartı: sunucunun yazacağı yerleşimde sıraya aykırı adım varsa gönderilmeden önce söyler; kilitli adım için kaydırma önerir
// (Kokpit'in taşıma komutuyla, Geri al ile döner). Saatlerin yanında hangisinin Kokpit, hangisinin canlıya alınınca olacak saat olduğu yazılır.
const GORUNEN_KISIT = 2;
const ILK_IHLAL = 5;

export function KapaliKisitSatiri({ c, sunucu }: { c: Pick<PlanlamaCalismasi, 'kapali'>; sunucu: readonly string[] | null }) {
  const [acik, setAcik] = useState(false);
  if (c.kapali.length === 0) return null;
  const adlar = c.kapali.map(kisitAdi);
  const farkli = sunucu !== null && kapaliListeFarkli(c, sunucu);
  const gorunen = acik ? adlar : adlar.slice(0, GORUNEN_KISIT);
  return (
    <p className="tc-pym-pa-kisit" data-ton={farkli ? 'uyari' : 'sakin'} role="status">
      <Simge ad="target" boyut="k" />
      <span>
        {`Kapalı kısıt: ${gorunen.join(', ')}. Plan ve canlıya çıkacak saatler bunları saymadan hesaplanır.`}
        {farkli && ' Önizleme kayıtlı çalışmaya göre; kaydedilmemiş kısıt değişikliği var.'}
      </span>
      {adlar.length > GORUNEN_KISIT && (
        <button type="button" className="tc-pym-pa-kisit-fazla" aria-expanded={acik} aria-label={acik ? 'Kısıt listesini daralt' : `${String(adlar.length - GORUNEN_KISIT)} kısıt daha`} onClick={() => { setAcik(!acik); }}>
          {acik ? 'Daralt' : `+${String(adlar.length - GORUNEN_KISIT)}`}
        </button>
      )}
      <a href={altEkranAdresi({ ekran: 'veri', bolum: 'kisitlar' })} target="_blank" rel="noopener noreferrer">Kısıtlar<span className="tc-gizli-etiket"> (yeni sekmede açılır)</span></a>
    </p>
  );
}

function IhlalSatiri({ c, p, i }: { c: PlanlamaCalismasi; p: OkunanPlan; i: Ihlal }) {
  const op = i.k === null ? undefined : p.ops[i.k];
  const oncul = i.oncul;
  const oncOp = oncul?.k == null ? undefined : p.ops[oncul.k];
  const kokpit = (S: number | undefined) => (S === undefined || !Number.isFinite(S) ? '—' : saatYaz(c.D, S));
  const neden = nedenCumlesi(c, p, i);
  return (
    <li className="tc-pym-pa-ihlal">
      <strong>{`${i.emirNo} ${adimAdi(i)}`}</strong>
      <span>{i.kilitli ? 'elle kilitli ve öncülü bitmeden başlıyor.' : 'öncülü bitmeden başlıyor.'}</span>
      {neden !== null && <span>{neden}</span>}
      {!i.kilitli && <span>{careCumlesi(i, i.k === null ? undefined : p.ops[`${i.k}~2`] !== undefined)}</span>}
      {oncul !== null && (
        <dl className="tc-pym-pa-ihlal-saat">
          <div><dt>Kokpit</dt><dd className="mono"><span>{`${adimAdi(oncul)} ${kokpit(oncOp?.C)} bitiyor`}</span><span>{`${adimAdi(i)} ${kokpit(op?.S)} başlıyor`}</span></dd></div>
          <div><dt>Canlıya alınınca</dt><dd className="mono"><span>{`${adimAdi(oncul)} ${gunSaat(oncul.bitis)} bitiyor`}</span><span>{`${adimAdi(i)} ${gunSaat(i.baslangic)} başlıyor`}</span></dd></div>
        </dl>
      )}
    </li>
  );
}

export function KomsuKilitler({ komsular, D, emirNo }: { komsular: ReturnType<typeof komsuKilitKaymalari>; D: PlanlamaCalismasi['D']; emirNo: (id: string) => string }) {
  const [hepsi, setHepsi] = useState(false);
  if (komsular.length === 0) return null;
  return (
    <>
      <p className="tc-pym-pa-kucuk">Bu adımların kilidi de kaydı:</p>
      <ul className="tc-pym-pa-oneri">
        {(hepsi ? komsular : komsular.slice(0, 5)).map((x) => <li key={x.k}>{`${komsuAdi(x.k, emirNo) ?? 'Başka bir kilitli adım'}: ${saatYaz(D, x.eski)} → ${saatYaz(D, x.yeni)}`}</li>)}
      </ul>
      {komsular.length > 5 && !hepsi && <button type="button" className="tc-dugme tc-pym-kucuk" onClick={() => { setHepsi(true); }}>{`${String(komsular.length - 5)} tane daha`}</button>}
    </>
  );
}

function Oneri({ oneri, yaklasik = false }: { oneri: NonNullable<CanliyaAlOnizlemesiCevabi['oneri']>; yaklasik?: boolean }) {
  return (
    <ul className="tc-pym-pa-oneri">
      {oneri.adimlar.map((a) => <li key={a.isEmriId}>{`${a.emirNo} ${adimAdi(a)}: ${gunSaat(a.eskiBaslangic)} → ${gunSaat(a.yeniBaslangic)}`}</li>)}
      {oneri.emirler.map((e) => (
        <li key={e.emirNo}>{`${e.emirNo} bitişi${yaklasik ? ' (yaklaşık)' : ''}: ${gunSaat(e.once)} → ${gunSaat(e.sonra)}${e.termin ? ` (termin ${e.termin.slice(8, 10)}.${e.termin.slice(5, 7)})` : ''}`}</li>
      ))}
      {oneri.kalanIhlal > 0 && <li>{`Kaydırınca ${String(oneri.kalanIhlal)} kilitsiz adım daha öncülünden önce kalır; planı Kokpit'te yeniden çözün.`}</li>}
    </ul>
  );
}

// 3793-2 (madde 8): kilitli adım canlıda yerinde kalan işle üst üste. Düğme kendiliğinden bir şey yapmaz; onay penceresi ne olacağını söyler.
// Taşıma Kokpit'in taşıma komutuyla gider (kilitli kalır, ardılları gerekiyorsa itilir), kaldırma kayıtlı çalışmada tek adımdır; ikisi de Geri al ile döner.
function KilitCakismasiKarti({ o, c, x, emirNo }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; x: KilitCakismasi; emirNo: (id: string) => string }) {
  const { bildir } = useBildirim();
  const [onay, setOnay] = useState<'tasi' | 'kaldir' | null>(null);
  const [gidiyor, setGidiyor] = useState(false);
  const [yapildi, setYapildi] = useState<string | null>(null);
  const komut = o.komut;
  const kilitYetkisi = o.yetki.islemVar('plan.kilitle');
  const isi = kilitCakismasiIsi(c, x, emirNo, simdiSaati(c, Date.now()));
  const ad = `${x.emirNo} ${adimAdi(x)}`;
  const saat = isi === null ? '' : saatYaz(c.D, isi.S);
  const kapali = gidiyor || komut === null || isi === null || !kilitYetkisi;
  const tasi = async (): Promise<void> => {
    if (komut === null || isi === null) return;
    setGidiyor(true);
    try {
      await kilitleriKaydir(komut, c, [isi], 'Kilit çakışan işin arkasına alındı');
      setYapildi(`${ad} ${saat} saatine taşındı ve kilitli; sıra denetimi yeniden yapılıyor.`);
      bildir('tamam', `${ad} çakışan işin arkasına alındı; plan yeniden diziliyor.`);
      o.yenile();
    } catch (h) { bildir('hata', h instanceof KaydirmaHatasi ? h.message : hataIletisi(h, 'Kilit taşınamadı; sayfayı yenileyip yeniden deneyin.')); } finally { setGidiyor(false); }
  };
  const kaldir = (): void => {
    if (komut === null || isi === null) return;
    if (kilidiKaldir(komut, isi.k, ad)) { setYapildi(`${ad} kilidi kaldırıldı; plan yeniden dizilince sıra denetimi yapılır.`); bildir('tamam', `${ad} kilidi kaldırıldı; Geri al ile döner.`); }
    else bildir('hata', 'Kilit kaldırılamadı; plan bu arada değişti.');
  };
  const geriAl = (): void => {
    if (komut?.geriAl()) { setYapildi(null); bildir('tamam', 'Geri alındı.'); } else bildir('hata', 'Geri alınamadı; plan bu arada değişti.');
  };
  return (
    <div className="tc-pym-pa-ihlal-kart" role="group" aria-label="Kilit çakışması">
      <h3><Simge ad="lock" boyut="k" />{' Canlıya alınamıyor: kilitli adım yerinde kalan işle üst üste'}</h3>
      <p className="tc-pym-pa-kucuk">{`${ad} kilitli saatinde ${x.kaynak} üzerinde ${kilitCakismasiNedeni(x)}`}</p>
      {yapildi === null ? (
        <div className="tc-pym-pa-dugmeler">
          <button type="button" className="tc-dugme tc-dugme-birincil" disabled={kapali} onClick={() => { setOnay('tasi'); }}>
            <Simge ad="clock" boyut="k" />{isi === null ? 'Arkasına al' : `Arkasına al (${saat})`}
          </button>
          <button type="button" className="tc-dugme" disabled={kapali} onClick={() => { setOnay('kaldir'); }}><Simge ad="lock" boyut="k" />Kilidi kaldır</button>
          {!kilitYetkisi && <span className="tc-pym-pa-kucuk">Kilidi taşımak ya da kaldırmak plan kilitleme yetkisi ister.</span>}
          {kilitYetkisi && isi === null && <span className="tc-pym-pa-kucuk">{"Bu kilit Kokpit çalışmasında bulunamadı; Kokpit'te elle taşıyın."}</span>}
        </div>
      ) : (
        <p className="tc-pym-pa-kucuk" role="status">
          <Simge ad="check" boyut="k" />{` ${yapildi} `}
          {komut?.geriAlinabilir() === true && <button type="button" className="tc-dugme tc-pym-kucuk" onClick={geriAl}><Simge ad="back" boyut="k" />Geri al</button>}
        </p>
      )}
      <OnayPenceresi
        acik={onay !== null} yukleniyor={gidiyor}
        baslik={onay === 'kaldir' ? `${ad} kilidini kaldır?` : `${adimAdi(x)}'i ${saat} saatine taşı ve kilitli tut?`}
        onayMetni={onay === 'kaldir' ? 'Kilidi kaldır' : 'Taşı'}
        vazgec={() => { setOnay(null); }}
        onayla={() => { const n = onay; setOnay(null); if (n === 'kaldir') kaldir(); else void tasi(); }}
      >
        <ul className="tc-pym-pa-oneri">
          <li>Kokpit çalışmasına yazılır; Geri al ile döner.</li>
          <li>Sıra denetimi yeniden yapılır; canlıya alma ayrıca onaylanır.</li>
          <li>{onay === 'kaldir' ? `${adimAdi(x)} plan yeniden dizilince motorun bulduğu yere gider.` : `${adimAdi(x)}'in ardılları gerekiyorsa arkasına itilir.`}</li>
        </ul>
      </OnayPenceresi>
    </div>
  );
}

export function CanliOnizleme({ o, c, p, durum, yenidenDene, etkin = true }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan | null; durum: OnizlemeDurumu; yenidenDene: () => void; etkin?: boolean }) {
  const { bildir } = useBildirim();
  const [gidiyor, setGidiyor] = useState(false);
  const [kaydirilan, setKaydirilan] = useState<NonNullable<CanliyaAlOnizlemesiCevabi['oneri']> | null>(null);
  const [kilitOnce, setKilitOnce] = useState<Record<string, number>>({});
  // Komşu kilit karşılaştırması plan yeniden dizildiği anda bir kez sabitlenir; sonradan elle değiştirilen kilit buraya girmez.
  const [komsuSabit, setKomsuSabit] = useState<ReturnType<typeof komsuKilitKaymalari> | null>(null);
  const planOnce = useRef<OkunanPlan | null>(null);
  const [hepsi, setHepsi] = useState(false);
  // Kaydır gönderildiği an düğmenin bağlı olduğu sonuç; yeni önizleme (yeni nesne) gelene kadar düğme kapalı kalır (ikinci tıklama olmaz).
  const [kaydirmaSonucu, setKaydirmaSonucu] = useState<object | null>(null);
  const veri = durum.tur === 'hazir' ? durum.veri : durum.tur === 'yukleniyor' ? durum.onceki : null;
  const eski = durum.tur === 'yukleniyor';
  const komut = o.komut;
  const emirNo = useEmirNo(o.depo.receteRotaKaydi, o.depo.durum?.emirler);
  const kilitYetkisi = o.yetki.islemVar('plan.kilitle');
  const kaydir = async (oneri: NonNullable<CanliyaAlOnizlemesiCevabi['oneri']>): Promise<void> => {
    const isler = p === null ? null : kaydirmaIsleri(c, p, oneri);
    if (komut === null || isler === null) { bildir('hata', "Bu adımlar Kokpit planında bulunamadı; Kokpit'te elle taşıyın."); return; }
    setGidiyor(true);
    setKaydirmaSonucu(veri);
    planOnce.current = p;
    setKomsuSabit(null);
    setKilitOnce(Object.fromEntries(Object.entries(c.locks).flatMap(([k, x]) => (typeof (x as { S?: unknown } | null)?.S === 'number' ? [[k, (x as { S: number }).S]] : []))));
    try {
      await kilitleriKaydir(komut, c, isler, 'Kilitli adımlar kaydırıldı');
      setKaydirilan(yazilanOneri(oneri, isler, simdiSaati(c, Date.now())));
      bildir('tamam', 'Kilitli adımlar kaydırıldı; plan yeniden diziliyor.');
      o.yenile();
    } catch (h) { bildir('hata', h instanceof KaydirmaHatasi ? h.message : hataIletisi(h, 'Kilitler kaydırılamadı; sayfayı yenileyip yeniden deneyin.')); setKaydirmaSonucu(null); } finally { setGidiyor(false); }
  };
  useEffect(() => {
    if (kaydirilan === null || komsuSabit !== null || p === null || p === planOnce.current) return;
    setKomsuSabit(komsuKilitKaymalari(kilitOnce, c.locks, new Set(kaydirilan.adimlar.flatMap((a) => (a.k === null ? [] : [a.k])))));
  }, [kaydirilan, komsuSabit, p, kilitOnce, c.locks]);
  const komsular = komsuSabit ?? [];
  const geriAl = (): void => {
    if (komut?.geriAl()) { setKaydirilan(null); setKomsuSabit(null); bildir('tamam', 'Kaydırma geri alındı.'); } else bildir('hata', 'Geri alınamadı; plan bu arada değişti.');
  };
  // Plan veriden eskiyse denetim istenmez (etkin değil): sonsuz "yapılıyor" yerine nedeni ve çıkışı söylenir (v2 "eski" durumu).
  if (!etkin) {
    return (
      <section className="tc-pym-pa-bolum tc-pym-pa-onizleme" aria-label="Sıra denetimi">
        <KapaliKisitSatiri c={c} sunucu={null} />
        <p className="tc-pym-pa-kucuk" role="status"><Simge ad="alert" boyut="k" />{" Plan güncel değil; sıra denetimi plan güncellenince yapılır. Önce Kokpit'te planı güncelleyin."}</p>
      </section>
    );
  }
  const ihlaller = veri?.ihlaller ?? [];
  const gorunen = hepsi ? ihlaller : ihlaller.slice(0, ILK_IHLAL);
  return (
    <section className="tc-pym-pa-bolum tc-pym-pa-onizleme" aria-label="Sıra denetimi" aria-busy={eski}>
      <KapaliKisitSatiri c={c} sunucu={veri?.kapali ?? null} />
      {durum.tur === 'hata' && durum.kilit !== null && <KilitCakismasiKarti key={durum.ileti} o={o} c={c} x={durum.kilit} emirNo={emirNo} />}
      {durum.tur === 'hata' && durum.kilit === null && (
        <p className="tc-pym-pa-kucuk" role="status">
          <Simge ad="alert" boyut="k" />{` Sıra denetimi alınamadı: ${durum.ileti}. Düğmeler denetim yapılana kadar kapalı. `}
          <button type="button" className="tc-dugme tc-pym-kucuk" onClick={yenidenDene}><Simge ad="rotate" boyut="k" />Yeniden dene</button>
        </p>
      )}
      {durum.tur === 'yukleniyor' && <p className="tc-pym-pa-kucuk" role="status">{veri === null ? 'Sıra denetimi yapılıyor…' : 'Sıra denetimi yenileniyor; aşağıdaki sonuç eski olabilir.'}</p>}
      {veri !== null && ihlaller.length === 0 && durum.tur === 'hazir' && <p className="tc-pym-pa-kucuk" role="status"><Simge ad="check" boyut="k" />{' Sıraya aykırı adım yok.'}</p>}
      {(veri?.itilen?.length ?? 0) > 0 && (
        <div className="tc-pym-pa-kucuk" role="status">
          <Simge ad="clock" boyut="k" />{` ${String(veri!.itilen!.length)} parça Kokpit'teki saatinde öncülünden önce kalıyordu; canlıya alınınca öncülün arkasına itilir.`}
          <ul className="tc-pym-pa-oneri">{veri!.itilen!.map((x) => <li key={`${x.emirNo}|${String(x.opNo)}|${String(x.parca)}`}>{itilenSatiri(x)}</li>)}</ul>
        </div>
      )}
      {(veri?.uyarilar?.length ?? 0) > 0 && (
        <div className="tc-pym-pa-kucuk" role="status" aria-label="Yazım uyarıları">
          <Simge ad="alert" boyut="k" />{' Canlıya alınırken:'}
          <ul className="tc-pym-pa-oneri">{veri!.uyarilar!.map((u) => <li key={u}>{u}</li>)}</ul>
        </div>
      )}
      {ihlaller.length > 0 && p !== null && (
        <div className="tc-pym-pa-ihlal-kart" role="group" aria-label="Sıraya aykırı adımlar">
          <h3><Simge ad="alert" boyut="k" />{` Canlıya alınınca ${String(ihlaller.length)} adım öncülünden önce başlar`}{eski && <span className="tc-pym-pa-eski"> · Eski olabilir</span>}</h3>
          <ul className="tc-pym-pa-ihlaller">{gorunen.map((i) => <IhlalSatiri key={i.isEmriId} c={c} p={p} i={i} />)}</ul>
          {ihlaller.length > ILK_IHLAL && (
            <button type="button" className="tc-dugme tc-pym-kucuk" aria-expanded={hepsi} onClick={() => { setHepsi(!hepsi); }}>
              {hepsi ? 'Daralt' : `${String(ihlaller.length - ILK_IHLAL)} adım daha`}
            </button>
          )}
          {veri?.oneri != null && <Oneri oneri={veri.oneri} />}
          <div className="tc-pym-pa-dugmeler">
            {veri?.oneri != null && kilitYetkisi && (
              <button type="button" className="tc-dugme tc-dugme-birincil" disabled={gidiyor || eski || komut === null || (kaydirmaSonucu !== null && kaydirmaSonucu === veri)} onClick={() => { void kaydir(veri.oneri!); }}>
                <Simge ad="rotate" boyut="k" />{kaydirmaDugmesi(veri.oneri.adimlar)}
              </button>
            )}
            {!kilitYetkisi && <span className="tc-pym-pa-kucuk">Kilitli adımı kaydırmak plan kilitleme yetkisi ister.</span>}
            {kilitYetkisi && veri?.oneri == null && <span className="tc-pym-pa-kucuk">{veri?.oneriNedeni ?? oneriYokMetni(ihlaller)}</span>}
          </div>
        </div>
      )}
      {kaydirilan !== null && (
        <div className="tc-pym-pa-kaydirildi" role="status">
          <strong><Simge ad="check" boyut="k" />{' Kilitli adımlar kaydırıldı'}</strong>
          <Oneri oneri={kaydirilan} yaklasik />
          <KomsuKilitler komsular={komsular} D={c.D} emirNo={emirNo} />
          {komut?.geriAlinabilir() === true && <button type="button" className="tc-dugme tc-pym-kucuk" onClick={geriAl}><Simge ad="back" boyut="k" />Geri al</button>}
        </div>
      )}
    </section>
  );
}
