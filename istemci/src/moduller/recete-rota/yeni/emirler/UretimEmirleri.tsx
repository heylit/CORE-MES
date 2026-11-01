import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Secim, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { sayi } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { usePatlatmaOnizlemesi, type RrDurumu } from '../veri.ts';
import { BolmePaneli, bolmeSonucu, bosBolme, type BolmeDurumu } from './Bolme.tsx';
import { bosCokKatman, CokKatmanPaneli, type CokKatmanSecimi } from './CokKatman.tsx';
import { EmirAyrintisi, PlanHucresi } from './EmirAyrintisi.tsx';
import { planMetni, tamponRozeti, turAdi } from './gorunum.ts';
import { acilanEmir, guncelSurum, useEmirKomutu } from './komut.ts';
import {
  aramaUyar, bugun, DURUM_ADI, DURUM_SUZGECLERI, durumAdi, durumGosterimi, durumUyar, emirAdimlari, emirAgaci, ilerleme, isGunuEkle, miktarOku, ONCELIK_ADI, planOzeti, planSirasi, seritNo, uretilirMi, cokKatmanOzeti, yururlukteRevizyonId,
  type DurumSuzgeci, type Emir, type PlanOzeti,
} from './kurallar.ts';

const TUR_SECENEKLERI = Object.entries(EMIR_TURU_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

export function UretimEmirleri({ veri, yetki, git, kimlik }: EkranOzellikleri) {
  const d = veri.durum;
  const [durumSuzgeci, setDurumSuzgeci] = useState<DurumSuzgeci>('aktif');
  const [turSuzgeci, setTurSuzgeci] = useState('tum');
  const [arama, setArama] = useState('');
  const [acik, setAcik] = useState<string | null>(kimlik);
  const komut = useEmirKomutu();
  const emirler = useMemo(() => d.emirler?.orders ?? [], [d.emirler]);
  const acabilir = yetki.emirYaz || yetki.rotaEmreKopyala;
  const [sorgu] = useSearchParams();
  const [yeniAcik, setYeniAcik] = useState((emirler.length === 0 || sorgu.get('yeni') === '1') && acabilir);

  if (!d.emirler) {
    return (
      <div className="tc-rry-bolum tc-rr3" data-parca="R3">
        <DurumKutusu
          durum="bos"
          mesaj="Üretim emirlerine erişiminiz yok: emirler Üretim Emirleri sayfasının verisidir ve oradaki okuma yetkisi sizde yok. Yetki için yöneticiye başvurun."
        />
      </div>
    );
  }

  const urunBul = (o: Emir) => d.items?.find((i) => i.id === o.itemId) ?? null;
  const turUyar = (o: Emir) => turSuzgeci === 'tum' || o.tur === turSuzgeci;
  const sira = new Map(planSirasi(d).map((o, i) => [o.id, i]));
  const satirlar = emirAgaci(emirler, (o) => turUyar(o) && durumUyar(o, durumSuzgeci) && aramaUyar(o, urunBul(o), arama));
  const acikEmir = acik === null ? null : emirler.find((o) => o.id === acik) ?? null;
  // Tür listesinde yalnız emri olan türler (ve seçili olan) çıkar; sayı açılır listenin metnindedir.
  const turSayisi = (t: string) => emirler.filter((o) => t === 'tum' || o.tur === t).length;
  const turSecenekleri = [
    { deger: 'tum', baslik: `Tüm türler (${String(turSayisi('tum'))})` },
    ...Object.keys(EMIR_TURU_ADLARI).filter((t) => turSayisi(t) > 0 || t === turSuzgeci).map((t) => ({ deger: t, baslik: `${turAdi(t)} (${String(turSayisi(t))})` })),
  ];

  return (
    <div className="tc-rry-bolum tc-rr3" data-parca="R3">
      <p className="tc-rr3-ipucu tc-rr3-ipucu-simge">
        <Simge ad="help" boyut="k" />Emirler Üretim Emirleri sayfasıyla ortaktır; terminaldeki iş burada ilerleme olarak görünür.
      </p>
      {komut.uyari && (
        <div className="tc-rr3-uyari-kutu" role="alert">
          <b>{komut.uyari.eskiSurum ? 'Emir başka yerde değişti.' : 'İşlem yapılamadı.'}</b>
          <span>{komut.uyari.metin}{komut.uyari.eskiSurum ? ' Ekran güncel emirle yenilendi; işlemi yeniden yapın.' : ''}</span>
          <Dugme onClick={komut.uyariKapat}>Tamam</Dugme>
        </div>
      )}
      <div className="tc-rr3-suzgec">
        <span className="tc-rr3-seg" role="group" aria-label="Durum">
          {DURUM_SUZGECLERI.map((s) => (
            <button key={s.deger} type="button" aria-pressed={durumSuzgeci === s.deger} onClick={() => { setDurumSuzgeci(s.deger); }}>
              {s.baslik} <small>{emirler.filter((o) => turUyar(o) && durumUyar(o, s.deger)).length}</small>
            </button>
          ))}
        </span>
        <Secim etiket="Tür" value={turSuzgeci} secenekler={turSecenekleri} onChange={(o) => { setTurSuzgeci(o.target.value); }} />
        <Girdi etiket="Ara" type="search" placeholder="Emir no, ürün ya da not" value={arama} onChange={(o) => { setArama(o.target.value); }} />
        {acabilir && (
          <Dugme tur={yeniAcik ? 'ikincil' : 'birincil'} simge={yeniAcik ? 'x' : 'plus'} aria-expanded={yeniAcik} onClick={() => { setYeniAcik(!yeniAcik); }}>
            {yeniAcik ? 'Yeni emir formunu kapat' : 'Yeni üretim emri'}
          </Dugme>
        )}
      </div>
      {acabilir && yeniAcik && (
        <YeniEmirFormu
          durum={d} yetki={yetki} komut={komut} git={git}
          acildi={(id) => { setYeniAcik(false); setDurumSuzgeci('aktif'); setTurSuzgeci('tum'); setArama(''); setAcik(id); }}
        />
      )}
      {/* 1100 B: liste solda, seçili emrin ayrıntısı sağ panelde; dar alanda liste ve ayrıntı ayrı görünür (CSS kap sorgusu). */}
      <div className="tc-rr3-cift" data-secili={acikEmir ? '' : undefined}>
        <div className="tc-rr3-sol">
          {satirlar.length === 0
            ? <DurumKutusu durum="bos" mesaj="Bu süzgeçte emir yok." />
            : (
              <ul className="tc-rr3-liste" aria-label="Üretim emirleri">
                {satirlar.map((s) => (
                  <EmirSatiri
                    key={s.emir.id} durum={d} emir={s.emir} derinlik={s.derinlik} secili={acik === s.emir.id} sira={sira.get(s.emir.id) ?? null}
                    sec={() => { setAcik(acik === s.emir.id ? null : s.emir.id); }}
                  />
                ))}
              </ul>
            )}
        </div>
        {acikEmir
          ? <EmirAyrintisi key={acikEmir.id} durum={d} emir={acikEmir} yetki={yetki} git={git} komut={komut} emirAc={setAcik} kapat={() => { setAcik(null); }} />
          : <div className="tc-rr3-bos-panel"><DurumKutusu durum="bos" mesaj="Ayrıntı için listeden bir emir seçin." /></div>}
      </div>
    </div>
  );
}

// Sol şerit emrin plan sırasından renk alır (plandaki emirler ayırt edilsin); plan dışı emirde şerit çizgi rengidir.
// Satır emri seçer; ayrıntı satırın altında değil sağ paneldedir. Öncelik yalnız Acil ve Yüksek ise etiket olur (Normal varsayılandır).
function EmirSatiri({ durum: d, emir: o, derinlik, secili, sira, sec }: {
  durum: RrDurumu; emir: Emir; derinlik: number; secili: boolean; sira: number | null; sec: () => void;
}) {
  const urun = d.items?.find((i) => i.id === o.itemId) ?? null;
  const il = ilerleme(d, o);
  const ozet = planOzeti(d, d.planYerlesim, o);
  const plan = planMetni(ozet);
  const tampon = tamponRozeti(ozet);
  const gecikiyor = ozet.tur === 'planlanamiyor' || (ozet.tur === 'plan' && ozet.gecikiyor);
  const ana = o.parentId === null ? null : d.emirler?.orders.find((x) => x.id === o.parentId) ?? null;
  const rev = o.rev === null ? null : d.routeRevs?.find((r) => r.id === o.rev) ?? null;
  const yuzde = il.toplam ? Math.round((il.biten / il.toplam) * 100) : o.status === 'tamam' ? 100 : 0;
  const alt = [
    ana ? `${o.kol ? `Kol ${String(o.kol.n)}→${String(o.kol.m)}` : 'Alt emir'} · ${ana.no}` : null,
    turAdi(o.tur),
    rev ? `Rev ${rev.no}${rev.status === 'yururlukte' ? '' : ', eski rota'}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <li
      className="tc-rr3-satir-kap" data-acik={secili ? '' : undefined} data-gec={gecikiyor ? '' : undefined}
      data-serit={sira === null ? undefined : String(seritNo(sira))} data-derinlik={derinlik > 0 ? String(Math.min(derinlik, 3)) : undefined}
    >
      <button type="button" className="tc-rr3-emir" aria-pressed={secili} onClick={sec}>
        <span className="tc-rr3-no">
          <span className="tc-rr3-etiketler">
            {derinlik > 0 && <Simge ad={o.kol ? 'route' : 'layers'} boyut="k" />}
            <b className="tc-rr3-emirno">{o.no}</b>
            {o.priority <= 2 && <span className="tc-rr3-oncelik" data-oncelik={String(o.priority)}>{ONCELIK_ADI[o.priority] ?? ''}</span>}
          </span>
          <span className="tc-rr3-urun-ad">
            {urun ? <span><b>{urun.code}</b> <small>{urun.name}</small></span> : <small>Ürün okunamadı</small>}
            <small>{sayi(o.qty)} {urun?.unit ?? ''} · {alt}</small>
          </span>
          <span className="tc-rr3-ilerleme">
            <progress max={100} value={yuzde} aria-label={`İlerleme ${String(il.biten)}/${String(il.toplam)}`} />
            <small>{il.toplam ? `${String(il.biten)}/${String(il.toplam)}` : ''}</small>
          </span>
        </span>
        <span data-baslik="Plan bitiş" className="tc-rr3-plan-hucre">
          <PlanHucresi plan={plan} tampon={tampon} />
          {plan.alt && <small className="tc-rr3-plan-alt" data-ton={plan.altTon ?? undefined}>{plan.alt}</small>}
        </span>
        <span className="tc-rr3-durum-hucre"><span className="tc-rr3-durum" data-durum={o.status} data-ton={durumGosterimi(o).ton}>{durumAdi(o)}</span></span>
        <Simge ad="chev-right" boyut="k" />
      </button>
    </li>
  );
}

interface YeniFormDurumu { urun: string; miktar: string; baslangic: string; teslim: string; oncelik: string; durum: 'serbest' | 'taslak'; tur: string; not: string; rezerve: boolean }

function YeniEmirFormu({ durum: d, yetki, komut, acildi, git }: {
  durum: RrDurumu; yetki: EkranOzellikleri['yetki']; komut: ReturnType<typeof useEmirKomutu>; acildi: (id: string) => void; git: EkranOzellikleri['git'];
}) {
  // Emir yalnız mamul ya da yarı mamule açılır; rotası olan emre kopyalanır (rota.emre-kopyala), rotası olmayan rotasız açılır
  // (uretim-emirleri.yaz). İşlemi olmayan yolun ürünü listede yoktur.
  const urunler = useMemo(() => (d.items ?? [])
    .filter((i) => uretilirMi(d, i.id) ? yetki.rotaEmreKopyala : (i.type === 'mamul' || i.type === 'yari') && yetki.emirYaz)
    .sort((a, b) => Number(b.type === 'mamul') - Number(a.type === 'mamul')), [d, yetki]);
  const tatiller = d.cal.holidays;
  const ilk = isGunuEkle(bugun(), 0, tatiller);
  const [f, setF] = useState<YeniFormDurumu>({
    urun: urunler[0]?.id ?? '', miktar: '100', baslangic: ilk, teslim: isGunuEkle(ilk, 9, tatiller), oncelik: '3', durum: 'serbest', tur: 'seri', not: '', rezerve: true,
  });
  const [bolme, setBolme] = useState<BolmeDurumu>(bosBolme(true));
  const [cok, setCok] = useState<CokKatmanSecimi>(bosCokKatman);
  const [hata, setHata] = useState<string | null>(null);
  // 1476-F: çok katmanlı seçim yalnız emri rotadan açabilene ve rotalı alt parçası olan ürüne görünür (önizleme sunucudan).
  const kokRevizyon = yururlukteRevizyonId(d, f.urun);
  const onizleme = usePatlatmaOnizlemesi(kokRevizyon, yetki.rotaEmreKopyala && uretilirMi(d, f.urun)).data;
  const cokKatmanVar = onizleme !== undefined && onizleme.kokRevizyon.id === kokRevizyon && (onizleme.ileti !== null || onizleme.dugumler.length > 1);
  const cokAcik = cokKatmanVar && cok.acik && onizleme.ileti === null && onizleme.engel === null;
  const yaz = (alan: Partial<YeniFormDurumu>) => { setF({ ...f, ...alan }); setHata(null); };

  if (urunler.length === 0) {
    return <DurumKutusu durum="bos" mesaj={'Emir açmak için mamul ya da yarı mamul gerekli. "Ürün ve rotalar"dan başlayın.'} />;
  }
  const rotali = uretilirMi(d, f.urun);
  const cokOzet = cokAcik ? cokKatmanOzeti(onizleme.dugumler, cok.stoktan) : null;
  const adet = miktarOku(f.miktar);
  const sanal: Emir = {
    id: 'yeni', kayitNo: 0, no: 'Ana emir', itemId: f.urun, qty: adet.tamam && adet.deger !== null ? adet.deger : 0, start: f.baslangic, due: f.teslim,
    priority: Number(f.oncelik), note: null, rev: null, status: f.durum, created: 0, doneAt: null, tur: f.tur, parentId: null, kol: null, birlestigiId: null, surum: 1,
  };
  const adimlar = emirAdimlari(d, sanal);
  const girdi = { anaAd: 'Ana emir', miktar: sanal.qty, adimSayisi: adimlar.length, aralik: { ilk: 1, son: adimlar.length }, mevcutKollar: [], bitti: () => false };

  const olustur = async () => {
    if (!adet.tamam || adet.deger === null || !(adet.deger > 0)) { setHata('Miktar sıfırdan büyük olmalı.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.baslangic) || !/^\d{4}-\d{2}-\d{2}$/.test(f.teslim)) { setHata('Başlangıç ve teslim tarihini girin.'); return; }
    // Çok katmanlı emir açılırken bölünmez (sunucu bölmeyi reddeder); taslak koşulu 1476-C ile kalktı.
    const bolunur = !cokAcik && (bolme.tur === 'parti' || bolme.tur === 'kol');
    if (!rotali && bolunur) { setHata('Rotasız emir açılırken bölünmez; adımları ekledikten sonra bölün.'); return; }
    const b = bolunur ? bolmeSonucu(girdi, bolme) : null;
    if (b && !b.hazir) { setHata(b.ileti ?? b.ipucu ?? 'Bölmeyi tamamlayın.'); return; }
    const govde = {
      itemId: f.urun, qty: adet.deger, start: f.baslangic, due: f.teslim, priority: Number(f.oncelik), note: f.not.trim(), tur: f.tur, taslak: f.durum === 'taslak',
      ...(rotali ? { rezerve: f.rezerve } : { rotasiz: true }),
      ...(cokOzet ? { cokKatmanli: true, stoktanDugumler: cokOzet.gonderilecek } : {}),
    };
    const c = await komut.calistir('emir-ac', govde);
    const id = acilanEmir(c.sonuc);
    if (!c.tamam || id === null) return;
    let durum = c.durum;
    let tamam = true;
    // Bölme açılıştan sonra sahibinin bölme ucuyla yapılır; reddedilirse emir bölünmemiş kalır, iletisi uyarı satırındadır.
    if (b && bolme.tur === 'parti') {
      for (const q of b.partiler) {
        const r = await komut.calistir('emir-bol', { id, adet: q, surum: guncelSurum(durum, id) });
        if (!r.tamam) { tamam = false; break; }
        durum = r.durum;
      }
    } else if (b && bolme.tur === 'kol') {
      tamam = (await komut.calistir('emir-bol', { id, adet: b.partiler[0], kolN: bolme.n, kolM: bolme.m, surum: guncelSurum(durum, id) })).tamam;
    }
    acildi(id);
    if (!rotali) komut.bildir('tamam', 'Rotasız emir açıldı: adımlarını emrin içinden ekleyin.');
    else if (tamam) komut.bildir('tamam', b ? 'Emir açıldı: alt emirler bağlandı.' : 'Emir açıldı.');
    else komut.bildir('hata', 'Emir açıldı ama bölünemedi; emrin içinden yeniden bölün.');
  };

  return (
    <section className="tc-rr3-panel" aria-label="Yeni üretim emri">
      <h3>Yeni üretim emri</h3>
      <div className="tc-rr3-form">
        <Secim
          etiket="Ürün" value={f.urun} onChange={(o) => { yaz({ urun: o.target.value }); setBolme(bosBolme(true)); setCok(bosCokKatman()); }}
          secenekler={urunler.map((u) => ({ deger: u.id, baslik: `${u.code} ${u.name}${uretilirMi(d, u.id) ? '' : ' (rotasız)'}` }))}
        />
        <Girdi etiket="Miktar" inputMode="decimal" value={f.miktar} onChange={(o) => { yaz({ miktar: o.target.value }); }} />
        <Girdi etiket="Başlangıç" type="date" value={f.baslangic} onChange={(o) => { yaz({ baslangic: o.target.value }); }} />
        <Girdi etiket="Teslim" type="date" value={f.teslim} onChange={(o) => { yaz({ teslim: o.target.value }); }} />
        <Secim
          etiket="Öncelik" value={f.oncelik} onChange={(o) => { yaz({ oncelik: o.target.value }); }}
          secenekler={[1, 2, 3, 4].map((n) => ({ deger: String(n), baslik: ONCELIK_ADI[n] ?? '' }))}
        />
        <Secim
          etiket="Durum" value={f.durum} onChange={(o) => { yaz({ durum: o.target.value === 'taslak' ? 'taslak' : 'serbest' }); }}
          secenekler={[{ deger: 'serbest', baslik: `${DURUM_ADI.serbest} (plana girer)` }, { deger: 'taslak', baslik: DURUM_ADI.taslak }]}
        />
        <Secim etiket="Emir türü" value={f.tur} secenekler={TUR_SECENEKLERI} onChange={(o) => { yaz({ tur: o.target.value }); }} />
        <Girdi etiket="Not" placeholder="Müşteri, sipariş no…" value={f.not} onChange={(o) => { yaz({ not: o.target.value }); }} />
      </div>
      {rotali && (
        <IsaretKutusu
          etiket="Stoktan rezerve et" checked={f.rezerve} onChange={(o) => { yaz({ rezerve: o.target.checked }); }}
          title="Girdiler serbest stoktan bu emre ayrılır; yetmeyen kısım mal kabulde öncelik sırasıyla gelir."
        />
      )}
      {cokKatmanVar && (
        <CokKatmanPaneli onizleme={onizleme} durum={d} miktar={adet.tamam ? adet.deger : null} deger={cok} degistir={(s) => { setCok(s); setHata(null); }} git={git} />
      )}
      {rotali && cokAcik && <p className="tc-rr3-uyari" data-bilgi=""><Simge ad="alert" boyut="k" />Çok katmanlı emir açılırken bölünmez; sunucu bölmeyi bu emirde henüz kabul etmiyor.</p>}
      {rotali && !cokAcik && (
        <BolmePaneli
          yeni girdi={girdi} adimlar={adimlar} baslamis={[]} opdefs={d.opdefs} istasyonlar={d.stations} deger={bolme} degistir={setBolme}
        />
      )}
      {hata && <p className="tc-rr3-uyari" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
      <div className="tc-rr3-arac">
        <Dugme tur="birincil" boyut="ana" simge="check" yukleniyor={komut.mesgul} onClick={() => { void olustur(); }}>Emri oluştur</Dugme>
      </div>
    </section>
  );
}
