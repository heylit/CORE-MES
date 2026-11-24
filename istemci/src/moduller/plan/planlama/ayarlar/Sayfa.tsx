import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { MotorAyarlariCevabi, PlanSistemAyarlariCevabi, PlanSistemAyariSatiri } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { EtkiBolumu, useEtki } from '../kokpit/etki.tsx';
import { ayarKomutu, useTaslak, type TaslakYazici } from '../kokpit/taslak.ts';
import { calismaOku } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  GENEL_KISITLAR, KAYNAK_KISITLARI, alanAnahtari, alanDegeri, alanYaz, ayarTaslagi, farklar, kaynakAdi, kaynakSecimi, kipYaz, kisitYaz, panelKisitAdi, sayiOku, type AyarAlani, type AyarTaslagi,
} from './alanlar.ts';
import {
  BOLUMLER, BOLUM_KAPILARI, acikKisitOzeti, bedelKontrolSatirlari, bedelSatirlari, bolumAlanlari, bolumBasligi, bolumFarklari, bolumOku, calismaSatirlari, motorSatirlari,
  sistemSatirlari, suz, zamanYazisi, type BedelSatiri, type BolumAnahtari, type CalismaBolumu, type KontrolSatiri, type KontrolSuzgeci,
} from './bolumler.ts';
import { useOku } from './kullan-oku.ts';
import { KaynakSecimiGrubu } from './KaynakSecimi.tsx';
import { MotorBolumu } from './MotorBolumu.tsx';
import { SistemBolumu } from './SistemBolumu.tsx';
import './ayarlar.css';

// Planlama ayarları (3561): planın nasıl kurulduğunu belirleyen her ayar tek sayfada: değiştir (etkisini görerek) ve kontrol et (geçerli değer, kaynak,
// son değiştiren, taslakta fark). Yerleşim Ana ve ayrıntı (3558 b): solda gruplar, sağda seçili bölüm; telefonda iki adım (liste, ayrıntı) ve adres
// tarayıcı geri tuşuyla bağlıdır (?bolum=). Çalışma ayarları kişinin taslağına yazılır, motor ve sistem ayarı kendi kaydına.
// Kokpit'in Araçlar > Ayarlar maddesi bu sayfayı açar; yön seçici Kokpit'te kalır.

// Taslak varken gösterilen çalışma taslağın görünümüdür (Kokpit ile aynı); yoksa ortak çalışma. Yazamayan taslak açmaz.
export function PlanlamaAyarlari(o: PlanlamaEkranOzellikleri) {
  return o.calisma === null ? <AyarlarGovdesi o={o} ortak={null} c={null} taslak={null} /> : <Taslakli o={o} ortak={o.calisma} />;
}

function Taslakli({ o, ortak }: { o: PlanlamaEkranOzellikleri; ortak: PlanlamaCalismasi }) {
  const { bildir } = useBildirim();
  const yazabilir = o.yetki.planYaz && o.komut !== null;
  const tk = useTaslak(yazabilir, (ileti) => { bildir('hata', ileti); });
  const ham = tk.cevap?.taslak ? tk.cevap.calisma : null;
  const gorunum = useMemo(() => (ham === null ? null : calismaOku(ham)), [ham]) ?? ortak;
  return <AyarlarGovdesi o={o} ortak={ortak} c={gorunum} taslak={yazabilir ? tk : null} />;
}

const BEDEL_OKUYAN = ['plan.yaz', 'finans.maliyet-oku', 'plan.bedel-ayari'] as const;
type Bedel = Parameters<typeof bedelSatirlari>[0];

export function AyarlarGovdesi({ o, ortak, c, taslak }: { o: PlanlamaEkranOzellikleri; ortak: PlanlamaCalismasi | null; c: PlanlamaCalismasi | null; taslak: TaslakYazici | null }) {
  const [sorgu] = useSearchParams();
  const bolumParam = sorgu.get('bolum');
  const bolum = bolumOku(bolumParam);
  const { islemVar } = o.yetki;

  const motor = useOku<MotorAyarlariCevabi>('/plan/motor-ayarlari', true, 'Motor ayarı okunamadı.');
  const sistem = useOku<PlanSistemAyarlariCevabi>('/plan/sistem-ayarlari', true, 'Sistem ayarları okunamadı.');
  const bedel = useOku<Bedel>('/plan/bedel-ayari', BEDEL_OKUYAN.some(islemVar), 'Öncelik ayarı okunamadı.');

  const satirlar = useMemo<KontrolSatiri[]>(() => [
    ...(ortak !== null && c !== null ? calismaSatirlari(ortak, c) : []),
    ...(motor.okuma.durum === 'tamam' ? motorSatirlari(motor.okuma.veri.guncel) : []),
    ...(bedel.okuma.durum === 'tamam' ? bedelKontrolSatirlari(bedelSatirlari(bedel.okuma.veri)) : []),
    ...(sistem.okuma.durum === 'tamam' ? sistemSatirlari(sistem.okuma.veri.ayarlar) : []),
  ], [ortak, c, motor.okuma, bedel.okuma, sistem.okuma]);
  const rozetler = useMemo(() => bolumFarklari(satirlar), [satirlar]);
  const kisitOzeti = ortak !== null && c !== null ? acikKisitOzeti(ortak, c) : null;
  const motorVeri = motor.okuma.durum === 'tamam' ? motor.okuma.veri : null;
  const sistemVeri = sistem.okuma.durum === 'tamam' ? sistem.okuma.veri : null;
  const motorSurumu = motorVeri === null ? null : motorVeri.guncel;

  const adim = bolumParam === null ? 'liste' : 'ayrinti';
  // Telefonda grup değişince bakılan öğe DOM'dan kalkar: odak yeni ayrıntı başlığına, listeye dönüşte seçili gruba gider.
  const kap = useRef<HTMLDivElement>(null);
  const ilk = useRef(true);
  const sonGrup = useRef<string | null>(bolumParam);
  useEffect(() => {
    const onceki = sonGrup.current;
    if (bolumParam !== null) sonGrup.current = bolumParam;
    if (ilk.current) { ilk.current = false; return; }
    const hedef = bolumParam === null ? kap.current?.querySelector<HTMLElement>(`.tc-pya-liste a[href$="?bolum=${onceki ?? 'kontrol'}"]`) : kap.current?.querySelector<HTMLElement>('.tc-pya-ayrinti h3');
    hedef?.focus();
  }, [bolumParam]);
  const calismaYok = ortak === null || c === null;
  return (
    <div className="tc-pya" data-adim={adim} data-bolum={bolum} ref={kap}>
      <header className="tc-pya-ust">
        <h2><Simge ad="gear" boyut="k" /> Planlama ayarları</h2>
        <p>Planın nasıl kurulduğunu belirleyen ayarlar; değiştirilen ayar önce etkisiyle gösterilir.</p>
      </header>
      {rozetler.kontrol > 0 && (
        <p className="tc-pya-serit" role="status">
          <Simge ad="edit" boyut="k" /> <span>Taslakta {rozetler.kontrol} ayar farkı</span> <Link to="/plan">Kokpit&apos;te gör</Link>
        </p>
      )}
      <section className="tc-pya-ozet" aria-label="Kontrol özeti">
        {!calismaYok && <span><b>{rozetler.kontrol}</b> taslakta fark</span>}
        {motorSurumu !== null && <span>Motor <b>{motorSurumu.surumId === null ? 'varsayılan' : `v${String(motorSurumu.surumId)}`}</b>{motorSurumu.zaman !== null && ` ${zamanYazisi(motorSurumu.zaman)}`}</span>}
        {kisitOzeti !== null && <span><b>{kisitOzeti.acik} / {kisitOzeti.toplam}</b> kısıt açık{kisitOzeti.taslakta !== null && ` (taslakta ${String(kisitOzeti.taslakta)})`}</span>}
        <small>Sayılar kayıtlı değerdir; taslak ayrı yazılır.</small>
      </section>
      <div className="tc-pya-ana">
        <Gruplar bolum={bolum} rozetler={rozetler} />
        <div className="tc-pya-ayrinti">
          <Link className="tc-pya-geri" to="?"><Simge ad="chev-left" boyut="k" /> Gruplar</Link>
          {bolum === 'kontrol' && <KontrolTablosu calismaYok={calismaYok} satirlar={satirlar} bekliyor={motor.okuma.durum === 'bekliyor' || sistem.okuma.durum === 'bekliyor'} hatalar={[motor.okuma, sistem.okuma].flatMap((x) => (x.durum === 'hata' ? [x.ileti] : []))} />}
          {(bolum === 'zaman' || bolum === 'tampon' || bolum === 'kisitlar') && (
            ortak === null || c === null
              ? <section className="tc-pya-bolum"><h3 tabIndex={-1}>{bolumBasligi(bolum)}</h3><DurumKutusu durum="bos" mesaj="Planlama çalışması henüz açılmadı; bu ayarlar çalışmada durur." /></section>
              : <CalismaFormu key={bolum} bolum={bolum} c={c} taslak={taslak} yazabilir={o.yetki.planYaz && taslak !== null} satirlar={satirlar} />
          )}
          {bolum === 'motor' && (
            <section className="tc-pya-bolum">
              <Baslik b="motor" />
              {!islemVar(BOLUM_KAPILARI.motor.islem) && <KapiSatiri b="motor" />}
              {motorVeri !== null
                ? <MotorBolumu g={motorVeri.guncel} yazabilir={islemVar(BOLUM_KAPILARI.motor.islem)} kaydedildi={(g) => { motor.koy({ ...motorVeri, guncel: g }); o.yenile(); }} />
                : <OkumaDurumu okuma={motor.okuma} yenile={motor.yenile} />}
            </section>
          )}
          {bolum === 'oncelik' && <OncelikBolumu okuma={bedel.okuma} okuyabilir={BEDEL_OKUYAN.some(islemVar)} yazabilir={islemVar(BOLUM_KAPILARI.oncelik.islem)} yenile={bedel.yenile} oncelikSayfasi={islemVar('sayfa.recete-rota')} />}
          {bolum === 'sistem' && (
            <section className="tc-pya-bolum">
              <Baslik b="sistem" />
              {sistemVeri !== null
                ? <SistemBolumu satirlar={sistemVeri.ayarlar} islemVar={islemVar} yenile={sistem.yenile}
                  degisti={(s: PlanSistemAyariSatiri) => { sistem.koy({ ayarlar: sistemVeri.ayarlar.map((x) => (x.ayar.anahtar === s.ayar.anahtar ? s : x)) }); }} />
                : <OkumaDurumu okuma={sistem.okuma} yenile={sistem.yenile} />}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Baslik({ b }: { b: BolumAnahtari }) {
  const bl = BOLUMLER.find((x) => x.anahtar === b)!;
  return <h3 tabIndex={-1}><Simge ad={bl.simge} boyut="k" /> {bl.baslik}</h3>;
}
const KapiSatiri = ({ b }: { b: 'motor' | 'oncelik' | CalismaBolumu }) => <p className="tc-pya-kilit"><Simge ad="lock" boyut="k" /> Bu bölümü {BOLUM_KAPILARI[b].kim} değiştirir; değerler salt okunur.</p>;

function OkumaDurumu({ okuma, yenile }: { okuma: { durum: string; ileti?: string }; yenile: () => void }) {
  if (okuma.durum === 'hata') return <DurumKutusu durum="hata" mesaj={okuma.ileti ?? 'Okunamadı.'} yenile={yenile} />;
  return <DurumKutusu durum="yukleniyor" />;
}

function Gruplar({ bolum, rozetler }: { bolum: BolumAnahtari; rozetler: Record<BolumAnahtari, number> }) {
  return (
    <nav className="tc-pya-liste" aria-label="Ayar grupları">
      <ul>
        {BOLUMLER.map((b) => (
          <li key={b.anahtar}>
            <Link to={`?bolum=${b.anahtar}`} aria-current={b.anahtar === bolum ? 'page' : undefined}>
              <Simge ad={b.simge} boyut="k" />
              <span>{b.baslik}</span>
              {rozetler[b.anahtar] > 0 && b.anahtar !== 'kontrol' && <small className="tc-pya-rozet">{rozetler[b.anahtar]} taslakta</small>}
              {rozetler[b.anahtar] > 0 && b.anahtar === 'kontrol' && <small className="tc-pya-rozet">{rozetler[b.anahtar]} fark</small>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// --- Kontrol: geçerli değer, kaynak, son değiştiren, taslakta fark ---
function KontrolTablosu({ calismaYok, satirlar, bekliyor, hatalar }: { calismaYok: boolean; satirlar: readonly KontrolSatiri[]; bekliyor: boolean; hatalar: readonly string[] }) {
  const [suzgec, setSuzgec] = useState<KontrolSuzgeci>('hepsi');
  const liste = suz(satirlar, suzgec);
  return (
    <section className="tc-pya-bolum" aria-label="Kontrol">
      <h3 tabIndex={-1}><Simge ad="list" boyut="k" /> Kontrol: tüm ayarlar</h3>
      <div className="tc-pya-ciplar" role="group" aria-label="Süzgeç">
        {([['hepsi', 'Hepsi'], ['taslakta', 'Taslakta fark']] as const).map(([k, ad]) => (
          <button key={k} type="button" aria-pressed={suzgec === k} onClick={() => { setSuzgec(k); }}>{ad}</button>
        ))}
      </div>
      {calismaYok && <p className="tc-pya-not">Planlama çalışması açılmadı: Zaman, Tampon ve Kısıtlar ayarları çalışma açılınca bu tabloda listelenir.</p>}
      {hatalar.map((h) => <p key={h} className="tc-pya-hata" role="alert">{h}</p>)}
      {bekliyor && <DurumKutusu durum="yukleniyor" />}
      {liste.length === 0 ? <p className="tc-pya-not">{suzgec === 'taslakta' ? 'Taslakta bekleyen ayar farkı yok.' : 'Gösterilecek ayar yok.'}</p> : (
        <table className="tc-pya-tablo" role="table">
          <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Ayar</th><th role="columnheader" scope="col">Geçerli değer</th><th role="columnheader" scope="col">Taslakta</th><th role="columnheader" scope="col">Kaynak</th><th role="columnheader" scope="col">Son değiştiren</th></tr></thead>
          <tbody role="rowgroup">
            {liste.map((s) => (
              <tr key={s.id} role="row" data-fark={s.taslakta !== null ? '' : undefined}>
                <th role="rowheader" scope="row"><Link to={`?bolum=${s.bolum}`}>{s.ad}</Link></th>
                <td role="cell" data-etiket="Geçerli değer">{s.deger}</td>
                <td role="cell" data-etiket="Taslakta" data-bos={s.taslakta === null ? '' : undefined}>{s.taslakta ?? '—'}</td>
                <td role="cell" data-etiket="Kaynak">{s.kaynak === 'Çalışma' ? `Çalışma · ${bolumBasligi(s.bolum)}` : s.kaynak}</td>
                <td role="cell" data-etiket="Son değiştiren" data-bos={s.degistiren === null && s.zaman === null ? '' : undefined}>{s.degistiren === null && s.zaman === null ? '—' : `${s.degistiren ?? 'bilinmeyen kişi'}${s.zaman === null ? '' : `, ${zamanYazisi(s.zaman)}`}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// --- Çalışma ayarları: zaman, tampon, kısıtlar (taslağa yazılır, etkisi gösterilir) ---
function CalismaFormu({ bolum, c, taslak, yazabilir, satirlar }: {
  bolum: CalismaBolumu; c: PlanlamaCalismasi; taslak: TaslakYazici | null; yazabilir: boolean; satirlar: readonly KontrolSatiri[];
}) {
  const { bildir } = useBildirim();
  const [t, setT] = useState<AyarTaslagi>(() => ayarTaslagi(c));
  const [tazele, setTazele] = useState(false);
  useEffect(() => { if (tazele) { setT(ayarTaslagi(c)); setTazele(false); } }, [c, tazele]);
  const { durum, setDurum, dene, uygula, vazgec } = useEtki({
    c, taslak, sonuc: (x) => { if (x === 'uygulandi') bildir('tamam', 'Ayar plana uygulandı; taslakta.'); setTazele(true); },
  });
  const cubuk = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (durum.tur === 'etki') [...(cubuk.current?.querySelectorAll<HTMLElement>('button') ?? [])].find((b) => b.textContent === 'Uygula')?.focus();
  }, [durum.tur]);
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const degisen = farklar(c, t);
  const hataVar = Object.keys(hatalar).length > 0;
  const kilitli = !yazabilir || taslak === null || durum.tur === 'hesap' || durum.tur === 'etki';
  const taslaktaki = useMemo(() => new Map(satirlar.map((s) => [s.id, s.taslakta])), [satirlar]);

  const etkisiniGor = async (): Promise<void> => {
    if (degisen.length === 0 || hataVar) return;
    const k = ayarKomutu(c, t, degisen.join('; '));
    if (k !== null) await dene(k);
  };

  const alan = (a: AyarAlani) => {
    const anahtar = alanAnahtari(a), v = alanDegeri(t, a), h = hatalar[anahtar], taslakta = taslaktaki.get(anahtar) ?? null;
    const id = `tc-pya-ayar-${a.yer}-${a.k}`;
    const ipucu = h ?? (a.tur === 'sec' && typeof v === 'string' ? a.ipucuSecim?.[v] : undefined) ?? a.ipucu;
    const rozet = taslakta !== null ? <small className="tc-pya-rozet">taslakta {taslakta}</small> : null;
    if (!yazabilir) {
      const yaz = a.tur === 'acik' ? (v === true ? 'Açık' : 'Kapalı') : a.tur === 'sec' ? (a.secenekler.find(([d]) => d === v)?.[1] ?? '—') : v === null ? 'Motor varsayılanı' : `${String(v).replace('.', ',')}${a.birim ? ` ${a.birim}` : ''}`;
      return (
        <div key={anahtar} className="tc-pya-alan tc-pya-salt-alan">
          <b id={id}>{a.etiket}{rozet}</b><span>{yaz}</span><small>{a.ipucu}</small>
        </div>
      );
    }
    if (a.tur === 'acik') {
      return (
        <div key={anahtar} className="tc-pya-alan">
          <IsaretKutusu etiket={a.etiket} checked={v === true} disabled={kilitli} onChange={(ev) => { setT(alanYaz(t, a, ev.target.checked)); }} />
          <small id={`${id}-ipucu`}>{a.ipucu}</small>{rozet}
        </div>
      );
    }
    return (
      <div key={anahtar} className="tc-pya-alan">
        <label htmlFor={id}>{a.etiket}{a.tur === 'sayi' && a.birim ? <small> ({a.birim})</small> : null}{rozet}</label>
        {a.tur === 'sec' ? (
          <select id={id} className="tc-alan-kutu" aria-describedby={`${id}-ipucu`} value={typeof v === 'string' ? v : ''} disabled={kilitli} onChange={(ev) => { setT(alanYaz(t, a, ev.target.value)); }}>
            {a.secenekler.map(([d, ad]) => <option key={d} value={d}>{ad}</option>)}
          </select>
        ) : (
          <input
            id={id} className="tc-alan-kutu" type="number" inputMode="decimal" min={a.min} max={a.max} step={a.adim} disabled={kilitli} aria-invalid={h ? true : undefined} aria-describedby={`${id}-ipucu`}
            key={String(v)} defaultValue={typeof v === 'number' ? String(v) : ''} placeholder={v === null ? 'Motor varsayılanı' : undefined}
            onBlur={(ev) => {
              const r = sayiOku(a, ev.target.value);
              if ('hata' in r) { setHatalar({ ...hatalar, [anahtar]: r.hata }); return; }
              const { [anahtar]: _, ...kalan } = hatalar; setHatalar(kalan); setT(alanYaz(t, a, r.deger));
            }}
          />
        )}
        <small id={`${id}-ipucu`} className={h ? 'tc-pya-hata' : undefined} role={h ? 'alert' : undefined}>{ipucu}</small>
      </div>
    );
  };

  return (
    <section className="tc-pya-bolum" aria-label={bolumBasligi(bolum)}>
      <Baslik b={bolum} />
      {!yazabilir && <KapiSatiri b={bolum} />}
      <div className="tc-pya-alanlar">{bolumAlanlari(bolum).map(alan)}</div>
      {bolum === 'kisitlar' && (
        <>
          <h4>Aparat, takım ve ölçü aleti</h4>
          <p className="tc-pya-kaynak-not">Eskiden "kapalı" işaretli aparat ve ölçü aleti Uyarı olarak okunur: plan sınırlamaz, kullanım izlenir. Kapalı yeni seçimdir: plan hiç saymaz.</p>
          <div className="tc-pya-kaynak-satir">
            {KAYNAK_KISITLARI.map((k) => (
              <div key={k} className="tc-pya-kisit tc-pya-kaynak-kisit">
                <b>{kaynakAdi(k)}</b>
                {taslaktaki.get(`kisit.${k}`) != null && <small className="tc-pya-rozet">taslakta {taslaktaki.get(`kisit.${k}`)}</small>}
                <KaynakSecimiGrubu kimlik={`pya-${k}`} kisit={k} deger={kaynakSecimi(t, k)} kilitli={!yazabilir || kilitli} sec={(s) => { setT(kipYaz(t, k, s)); }} />
              </div>
            ))}
          </div>
          <h4>Açılıp kapanan kısıtlar</h4>
          {yazabilir ? (
            <div className="tc-pya-kisitlar">
              {GENEL_KISITLAR.map((k) => (
                <div key={k} className="tc-pya-kisit">
                  <IsaretKutusu etiket={panelKisitAdi(k)} checked={t.acik[k] === true} disabled={kilitli} onChange={(ev) => { setT(kisitYaz(t, k, ev.target.checked)); }} />
                  {taslaktaki.get(`kisit.${k}`) != null && <small className="tc-pya-rozet">taslakta {taslaktaki.get(`kisit.${k}`)}</small>}
                </div>
              ))}
            </div>
          ) : (
            <ul className="tc-pya-kisit-salt">{GENEL_KISITLAR.map((k) => <li key={k}>{panelKisitAdi(k)}: <b>{t.acik[k] === true ? 'açık' : 'kapalı'}</b></li>)}</ul>
          )}
          <p className="tc-pya-not">Aç kapa olmayanlar: tezgâhta aynı anda tek iş (tezgâh iki işi birden yapamaz) ve vardiya saatleri (Takvim sayfasından değişir). Süren iş de taşınır: durdurulmuş sayılır, yapılan kısım yerinde kalır, kalan adet yeni yerine planlanır; biten iş taşınmaz. Elle taşıdığınız işin yeri sizin kararınızdır; Geri al ile kalkar. Veri sayfasındaki <Link to="/plan/veri?bolum=kisitlar">Kısıtlar</Link> doğrudan çalışmaya yazar; açıklamalar orada.</p>
        </>
      )}
      {yazabilir && (degisen.length > 0 || durum.tur !== 'duzen') && (
        <div className="tc-pya-cubuk" ref={cubuk}>
          <div role="status">{durum.tur === 'etki' && <EtkiBolumu ad="Ayarın etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} />}</div>
          {durum.tur !== 'etki' && (
            <section aria-label="Değişiklik">
              {degisen.length > 0 && <ul className="tc-pya-fark">{degisen.map((d) => <li key={d}>{d}</li>)}</ul>}
              {durum.tur === 'hata' && <p className="tc-pya-hata" role="alert">{durum.ileti}</p>}
              <div className="tc-pya-dugmeler">
                <Dugme tur="birincil" simge="play" disabled={kilitli || degisen.length === 0 || hataVar} onClick={() => { void etkisiniGor(); }}>
                  {durum.tur === 'hesap' ? 'Hesaplanıyor' : c.plan === null ? 'Kaydet' : `Etkisini gör (${String(degisen.length)})`}
                </Dugme>
                {degisen.length > 0 && durum.tur !== 'hesap' && <Dugme tur="ikincil" onClick={() => { setT(ayarTaslagi(c)); setHatalar({}); setDurum({ tur: 'duzen' }); }}>Sıfırla</Dugme>}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

// --- Öncelik ve bedel: okunur değerler; düzenleme Reçete ve Rota > Ayarlar'dadır (V6: o paneli çekmek modül sınırına takılır) ---
function OncelikBolumu({ okuma, okuyabilir, yazabilir, yenile, oncelikSayfasi }: {
  okuma: ReturnType<typeof useOku<Bedel>>['okuma']; okuyabilir: boolean; yazabilir: boolean; yenile: () => void; oncelikSayfasi: boolean;
}) {
  const satirlar: BedelSatiri[] = okuma.durum === 'tamam' ? bedelSatirlari(okuma.veri) : [];
  return (
    <section className="tc-pya-bolum">
      <Baslik b="oncelik" />
      {!yazabilir && <KapiSatiri b="oncelik" />}
      {!okuyabilir ? <p className="tc-pya-not">Öncelik ayarını görmek için planı yazma ya da maliyet görme yetkisi gerekir.</p>
        : okuma.durum === 'tamam' ? (
          <dl className="tc-pya-salt">{satirlar.map((s) => <div key={s.ad}><dt>{s.ad}</dt><dd>{s.deger}</dd></div>)}</dl>
        ) : <OkumaDurumu okuma={okuma} yenile={yenile} />}
      <p className="tc-pya-not">Öncelik ayarları bütün siparişlerin sırasını değiştirir; yalnız müdür ve üstü yazar. {oncelikSayfasi ? <>Değiştirmek için <Link to="/recete-rota/ayarlar">Reçete ve Rota &gt; Ayarlar</Link>.</> : null}</p>
    </section>
  );
}
