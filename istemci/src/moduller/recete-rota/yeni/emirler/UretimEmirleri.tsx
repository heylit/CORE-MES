import { useMemo, useState } from 'react';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Rozet, Secim, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { sayi, tarih } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { RrDurumu } from '../veri.ts';
import { BolmePaneli, bolmeSonucu, bosBolme, type BolmeDurumu } from './Bolme.tsx';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { DURUM_TONU, planMetni, tamponRozeti, turAdi } from './gorunum.ts';
import { acilanEmir, guncelSurum, useEmirKomutu } from './komut.ts';
import {
  bugun, DURUM_ADI, DURUM_SUZGECLERI, durumUyar, emirAdimlari, emirAgaci, ilerleme, isGunuEkle, miktarOku, ONCELIK_ADI, planOzeti, planSirasi, uretilirMi,
  type DurumSuzgeci, type Emir, type PlanOzeti,
} from './kurallar.ts';

const TUR_KISA: Readonly<Record<string, string>> = { ham: 'HM', yari: 'YM', mamul: 'MM' };
const TUR_SECENEKLERI = Object.entries(EMIR_TURU_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

export function UretimEmirleri({ veri, yetki, git, kimlik }: EkranOzellikleri) {
  const d = veri.durum;
  const [durumSuzgeci, setDurumSuzgeci] = useState<DurumSuzgeci>('aktif');
  const [turSuzgeci, setTurSuzgeci] = useState('tum');
  const [acik, setAcik] = useState<string | null>(kimlik);
  const komut = useEmirKomutu();
  const emirler = useMemo(() => d.emirler?.orders ?? [], [d.emirler]);
  const acabilir = yetki.emirYaz || yetki.rotaEmreKopyala;
  const [yeniAcik, setYeniAcik] = useState(emirler.length === 0 && acabilir);

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

  const turUyar = (o: Emir) => turSuzgeci === 'tum' || o.tur === turSuzgeci;
  const turler = Object.keys(EMIR_TURU_ADLARI);
  const sira = new Map(planSirasi(d).map((o, i) => [o.id, i]));
  const satirlar = emirAgaci(emirler, (o) => turUyar(o) && durumUyar(o, durumSuzgeci));

  return (
    <div className="tc-rry-bolum tc-rr3" data-parca="R3">
      <p className="tc-rr3-ipucu">
        Serbest ve üretimdeki emirler birlikte planlanır: önce öncelik, sonra teslim tarihi sırasıyla istasyonlara yerleştirilir ve stok emirler
        arasında bu sırayla paylaştırılır. Taslak emirler plana girmez.
      </p>
      <p className="tc-rr3-ipucu">
        Emirler Üretim Emirleri sayfasıyla ortaktır; terminalde başlatılan, sayılan ve biten iş burada ilerleme olarak görünür. Emir yürürlükteki
        rotadan açılır.
      </p>
      {komut.uyari && (
        <div className="tc-rr3-uyari-kutu" role="alert">
          <b>{komut.uyari.eskiSurum ? 'Emir başka yerde değişti.' : 'İşlem yapılamadı.'}</b>
          <span>{komut.uyari.metin}{komut.uyari.eskiSurum ? ' Ekran güncel emirle yenilendi; işlemi yeniden yapın.' : ''}</span>
          <Dugme onClick={komut.uyariKapat}>Tamam</Dugme>
        </div>
      )}
      {acabilir && (
        <div className="tc-rr3-arac">
          <Dugme tur={yeniAcik ? 'ikincil' : 'birincil'} simge={yeniAcik ? 'x' : 'plus'} aria-expanded={yeniAcik} onClick={() => { setYeniAcik(!yeniAcik); }}>
            {yeniAcik ? 'Yeni emir formunu kapat' : 'Yeni üretim emri'}
          </Dugme>
        </div>
      )}
      {acabilir && yeniAcik && (
        <YeniEmirFormu
          durum={d} yetki={yetki} komut={komut}
          acildi={(id) => { setYeniAcik(false); setDurumSuzgeci('aktif'); setTurSuzgeci('tum'); setAcik(id); }}
        />
      )}
      <div className="tc-rr3-secici" role="group" aria-label="Tür">
        {['tum', ...turler].map((t) => (
          <Dugme key={t} aria-pressed={turSuzgeci === t} onClick={() => { setTurSuzgeci(t); }}>
            {t === 'tum' ? 'Tüm türler' : turAdi(t)} <small>{emirler.filter((o) => t === 'tum' || o.tur === t).length}</small>
          </Dugme>
        ))}
      </div>
      <div className="tc-rr3-secici" role="group" aria-label="Durum">
        {DURUM_SUZGECLERI.map((s) => (
          <Dugme key={s.deger} aria-pressed={durumSuzgeci === s.deger} onClick={() => { setDurumSuzgeci(s.deger); }}>
            {s.baslik} <small>{emirler.filter((o) => turUyar(o) && durumUyar(o, s.deger)).length}</small>
          </Dugme>
        ))}
      </div>
      {satirlar.length === 0
        ? <DurumKutusu durum="bos" mesaj="Bu süzgeçte emir yok." />
        : (
          <ul className="tc-rr3-liste" aria-label="Üretim emirleri">
            <li className="tc-rr3-bas" aria-hidden="true">
              <span>Öncelik / No</span><span>Ürün</span><span className="tc-rr3-sag">Miktar</span><span>Teslim</span><span>Plan bitiş</span><span>İlerleme</span><span>Durum</span>
            </li>
            {satirlar.map((s) => (
              <EmirSatiri
                key={s.emir.id} durum={d} emir={s.emir} derinlik={s.derinlik} acik={acik === s.emir.id} sira={sira.get(s.emir.id) ?? null}
                ac={() => { setAcik(acik === s.emir.id ? null : s.emir.id); }}
              >
                <EmirAyrintisi durum={d} emir={s.emir} yetki={yetki} git={git} komut={komut} emirAc={setAcik} />
              </EmirSatiri>
            ))}
          </ul>
        )}
    </div>
  );
}

// Sol şerit emrin plan sırasından renk alır (plandaki emirler ayırt edilsin); plan dışı emirde şerit çizgi rengidir.
const SERIT_SAYISI = 6;

function EmirSatiri({ durum: d, emir: o, derinlik, acik, sira, ac, children }: {
  durum: RrDurumu; emir: Emir; derinlik: number; acik: boolean; sira: number | null; ac: () => void; children: React.ReactNode;
}) {
  const urun = d.items?.find((i) => i.id === o.itemId) ?? null;
  const il = ilerleme(d, o);
  const ozet = planOzeti(d, d.planYerlesim, o);
  const plan = planMetni(ozet);
  const tampon = tamponRozeti(ozet);
  const gecikiyor = ozet.tur === 'planlanamiyor' || (ozet.tur === 'plan' && ozet.gecikiyor);
  const ana = o.parentId === null ? null : d.emirler?.orders.find((x) => x.id === o.parentId) ?? null;
  const rev = o.rev === null ? null : d.routeRevs?.find((r) => r.id === o.rev) ?? null;
  const revEski = rev !== null && rev.status !== 'yururlukte';
  const yuzde = il.toplam ? Math.round((il.biten / il.toplam) * 100) : o.status === 'tamam' ? 100 : 0;
  return (
    <li
      className="tc-rr3-satir-kap" data-acik={acik ? '' : undefined} data-gec={gecikiyor ? '' : undefined}
      data-serit={sira === null ? undefined : String((sira * 3 + 1) % SERIT_SAYISI)} data-derinlik={derinlik > 0 ? String(Math.min(derinlik, 3)) : undefined}
    >
      <button type="button" className="tc-rr3-emir" aria-expanded={acik} onClick={ac}>
        <span className="tc-rr3-no">
          <Rozet ton={o.priority === 1 ? 'hata' : o.priority === 2 ? 'uyari' : 'pasif'}>{ONCELIK_ADI[o.priority] ?? ''}</Rozet>
          <b className="mono">{o.no}</b>
          <span className="tc-rr3-etiketler">
            <span className="tc-rr3-tur">{turAdi(o.tur)}</span>
            {ana && <small>{o.kol ? `Kol ${String(o.kol.n)}→${String(o.kol.m)}` : 'Alt emir'} · {ana.no}</small>}
            {rev && <Rozet ton={revEski ? 'uyari' : 'tamam'}>Rev {rev.no} {revEski ? 'eski rota' : 'sabit'}</Rozet>}
          </span>
        </span>
        <span className="tc-rr3-urun">
          {derinlik > 0 && <Simge ad={o.kol ? 'route' : 'layers'} boyut="k" />}
          {urun && derinlik === 0 && <span className="tc-rr3-slot" data-tur={urun.type}>{TUR_KISA[urun.type] ?? ''}</span>}
          <span className="tc-rr3-urun-ad">
            {urun ? <><b>{urun.code}</b> <small>{urun.name}</small></> : <small>Ürün okunamadı</small>}
            {o.note && <small className="tc-rr3-not">{o.note}</small>}
          </span>
        </span>
        <span className="tc-rr3-sag" data-baslik="Miktar"><b>{sayi(o.qty)}</b> <small>{urun?.unit ?? ''}</small></span>
        <span data-baslik="Teslim">{tarih(o.due)}</span>
        <span data-baslik="Plan bitiş">
          {plan.ton ? <Rozet ton={plan.ton}>{plan.metin}</Rozet> : plan.metin}
          {tampon && <span title={tampon.ipucu}><Rozet ton={tampon.ton}>{tampon.metin}</Rozet></span>}
          {plan.alt && <small>{plan.alt}</small>}
        </span>
        <span className="tc-rr3-ilerleme" data-baslik="İlerleme">
          <progress max={100} value={yuzde} aria-label={`İlerleme ${String(il.biten)}/${String(il.toplam)}`} />
          <small>{il.toplam ? `${String(il.biten)}/${String(il.toplam)}` : ''}</small>
        </span>
        <span data-baslik="Durum"><Rozet ton={DURUM_TONU[o.status]}>{DURUM_ADI[o.status]}</Rozet></span>
        <Simge ad={acik ? 'down' : 'chev-right'} boyut="k" />
      </button>
      {acik && <div className="tc-rr3-govde">{children}</div>}
    </li>
  );
}

interface YeniFormDurumu { urun: string; miktar: string; baslangic: string; teslim: string; oncelik: string; durum: 'serbest' | 'taslak'; tur: string; not: string; rezerve: boolean }

function YeniEmirFormu({ durum: d, yetki, komut, acildi }: {
  durum: RrDurumu; yetki: EkranOzellikleri['yetki']; komut: ReturnType<typeof useEmirKomutu>; acildi: (id: string) => void;
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
  const [hata, setHata] = useState<string | null>(null);
  const yaz = (alan: Partial<YeniFormDurumu>) => { setF({ ...f, ...alan }); setHata(null); };

  if (urunler.length === 0) {
    return <DurumKutusu durum="bos" mesaj={'Emir açmak için mamul ya da yarı mamul gerekli. "Ürün ve rotalar"dan başlayın.'} />;
  }
  const rotali = uretilirMi(d, f.urun);
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
    const bolunur = bolme.tur === 'parti' || bolme.tur === 'kol';
    if (!rotali && bolunur) { setHata('Rotasız emir açılırken bölünmez; adımları ekledikten sonra bölün.'); return; }
    const b = bolunur ? bolmeSonucu(girdi, bolme) : null;
    if (b && !b.hazir) { setHata(b.ileti ?? b.ipucu ?? 'Bölmeyi tamamlayın.'); return; }
    const govde = {
      itemId: f.urun, qty: adet.deger, start: f.baslangic, due: f.teslim, priority: Number(f.oncelik), note: f.not.trim(), tur: f.tur, taslak: f.durum === 'taslak',
      ...(rotali ? { rezerve: f.rezerve } : { rotasiz: true }),
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
          etiket="Ürün" value={f.urun} onChange={(o) => { yaz({ urun: o.target.value }); setBolme(bosBolme(true)); }}
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
          secenekler={[{ deger: 'serbest', baslik: 'Serbest (plana girer)' }, { deger: 'taslak', baslik: 'Taslak' }]}
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
      {rotali && (
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
