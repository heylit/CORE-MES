import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { AcilisSecenekleri, EmirRevizyonu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Pencere, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, tarih } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { RR_ANAHTARI, usePatlatmaOnizlemesi, type RrDurumu } from '../veri.ts';
import { oneriAdaylari, oneriDegerleri, teslimBagsizMi } from './oneri.ts';
import { altEmirRotalari, altEmirTurleri, BolmePaneli, bolmeSonucu, bosBolme, type BolmeDurumu, type PartiRotaKaynagi } from './Bolme.tsx';
import { bosCokKatman, CokKatmanPaneli, type CokKatmanSecimi } from './CokKatman.tsx';
import { EmirAyrintisi, PlanHucresi } from './EmirAyrintisi.tsx';
import { revizyonSecenegi, revMetni, useParcaRevizyonlari } from './ParcaRevizyonu.tsx';
import { planMetni, tamponRozeti, turAdi } from './gorunum.ts';
import { acilanEmir, guncelSurum, useEmirKomutu } from './komut.ts';
import {
  aramaUyar, bugun, DURUM_ADI, DURUM_SUZGECLERI, durumAdi, durumGosterimi, durumUyar, emirAdimlari, emirAgaci, ilerleme, isGunuEkle, miktarOku, ONCELIK_ADI, planOzeti, planSirasi, seritNo, uretilirMi, cokKatmanOzeti, yururlukteRevizyonId, emirRotasi, tekRotaMetni, bolmeTurRotasi, yeniEmirAnaRotasi, anaRotaMetni,
  type DurumSuzgeci, type Emir,
} from './kurallar.ts';

const PROJELER_YOLU = '/projeler';
const TUR_SECENEKLERI = Object.entries(EMIR_TURU_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

const URUN_ONEKI = 'urun:';

// Emrin ana yeri Üretim Emirleri'dir (3003 a): burada rotanın emirleri salt okunur görünür; açma ve işlemler oradadır. Açabilen kişiye
// "Yeni üretim emri" Üretim Emirleri'nin açma penceresini götürür, ürün seçili gelir.
const UE_YENI = '/uretim-emirleri?yeni=1';
const ueYeniAdresi = (urun: string | null) => (urun === null ? UE_YENI : `${UE_YENI}&urun=${encodeURIComponent(urun)}`);

const saltOkunur = (y: EkranOzellikleri['yetki']): EkranOzellikleri['yetki'] => ({
  ...y, yaz: false, rotaYaz: false, rotaGonder: false, rotaTaslakAc: false, rotaSureKabul: false, rotaOnayla: false, rotaEmreKopyala: false,
  emirAc: false, emirRotasizAc: false, emirDuzenle: false, emirAdimYaz: false, emirBol: false, emirPlanaAl: false, emirBeklet: false, emirIptal: false, stokStatuDegistir: false, stokSayim: false, stokGiris: false,
  istasyonYaz: false, kisiYaz: false, planYaz: false, maliyetYaz: false, herhangiYazma: false,
});

export function UretimEmirleri({ veri, yetki: tamYetki, git, kimlik }: EkranOzellikleri) {
  const d = veri.durum;
  const yetki = saltOkunur(tamYetki);
  const yonlen = useNavigate();
  const [durumSuzgeci, setDurumSuzgeci] = useState<DurumSuzgeci>('aktif');
  const [turSuzgeci, setTurSuzgeci] = useState('tum');
  const [arama, setArama] = useState('');
  // Ürün ve rotalar'dan gelen "urun:<id>" yeni emir formunu o ürünle açar; ürün ve emir kimlikleri ayrı sayaçtır, çıplak kimlik emirdir.
  const yeniUrun = kimlik?.startsWith(URUN_ONEKI) ? kimlik.slice(URUN_ONEKI.length) : null;
  const [acik, setAcik] = useState<string | null>(yeniUrun === null ? kimlik : null);
  const komut = useEmirKomutu();
  const emirler = useMemo(() => d.emirler?.orders ?? [], [d.emirler]);
  const acabilir = tamYetki.oku && (tamYetki.emirRotasizAc || tamYetki.rotaEmreKopyala);
  // "Ürün ve rotalar"dan gelen "Üretim emri oluştur" emri açma penceresine gider.
  useEffect(() => { if (yeniUrun !== null && acabilir) void yonlen(ueYeniAdresi(yeniUrun), { replace: true }); }, [yeniUrun, acabilir]);

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
        <Simge ad="help" boyut="k" />Emirler Üretim Emirleri sayfasında açılır ve yönetilir; burada salt okunur görünür. Terminaldeki iş ilerleme olarak görünür.
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
          <Dugme tur="birincil" simge="plus" onClick={() => { void yonlen(UE_YENI); }}>Yeni üretim emri</Dugme>
        )}
      </div>
      {(durumSuzgeci === 'tamam' || durumSuzgeci === 'tum') && (
        <p className="tc-rr3-ipucu tc-rr3-ipucu-simge">
          <Simge ad="clock" boyut="k" />Kapanan emirlerden son 30 gündekiler ve plandakiler görünür; daha eskiler <Link to="/uretim-emirleri">Üretim Emirleri</Link> sayfasının biten listesindedir.
        </p>
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
  const ozet = planOzeti(d, d.planYerlesim, o, d.planCanli);
  const plan = planMetni(ozet);
  const tampon = tamponRozeti(ozet);
  const gecikiyor = ozet.tur === 'planlanamiyor' || (ozet.tur === 'plan' && ozet.gecikiyor);
  const ana = o.parentId === null ? null : d.emirler?.orders.find((x) => x.id === o.parentId) ?? null;
  const rev = o.rev === null ? null : d.routeRevs?.find((r) => r.id === o.rev) ?? null;
  const yuzde = il.toplam ? Math.round((il.biten / il.toplam) * 100) : o.status === 'tamam' ? 100 : 0;
  const alt = [
    ana ? `${o.kol ? `Kol ${String(o.kol.n)}→${String(o.kol.m)}` : 'Alt emir'} · ${ana.no}` : null,
    turAdi(o.tur),
    revMetni(o.parcaRev),
    rev ? `Rota ${rev.no}${rev.status === 'yururlukte' ? '' : ', eski rota'}` : null,
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
            <b className="tc-rr3-emirno" title={o.no}>{o.no}</b>
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
          {plan.alt && <small className="tc-rr3-plan-alt" data-ton={plan.altTon ?? undefined} title={plan.alt}>{plan.alt}</small>}
        </span>
        <span className="tc-rr3-durum-hucre"><span className="tc-rr3-durum" data-durum={o.status} data-ton={durumGosterimi(o).ton}>{durumAdi(o)}</span></span>
        <Simge ad="chev-right" boyut="k" />
      </button>
    </li>
  );
}

// K19 a: bugünden önceki teslim uyarı ve onayla açılır, engellenmez. İki değer de ISO gün ("2026-11-02"); boş ya da bozuk teslim geçmiş sayılmaz.
export const gecmisTeslimMi = (teslim: string, bugunGun: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(teslim) && teslim < bugunGun;

// 3438 a: sipariş kalemindeki uyarıyla aynı sözcükler. Etiketi olmayan kartta kod yerine "Bu kartın revizyonu" denir.
export const eskiRevizyonUyarisi = (kod: string | null, r: EmirRevizyonu): string => {
  const secilen = r.etiket !== null && kod !== null ? `${kod} (${r.etiket})` : 'Bu kartın revizyonu';
  const yururlukteki = `${r.yururluktekiKodu}${r.yururluktekiEtiketi ? ` (${r.yururluktekiEtiketi})` : ''}`;
  return `${secilen} yürürlükte değil; yürürlükteki ${yururlukteki}. Emri eski revizyonla açmak için gerekçe yazın. Sipariş kaleminden açılıyorsa gerekçe gerekmez.`;
};

interface YeniFormDurumu { urun: string; miktar: string; baslangic: string; teslim: string; oncelik: string; durum: 'serbest' | 'taslak'; tur: string; not: string; rezerve: boolean; rota: string; revizyonGerekcesi: string; parcaRev: string }

export function YeniEmirFormu({ durum: d, yetki, komut, acildi, git, ilkUrun, ilkTur = null, ilkAdet = null, ilkRota = null }: {
  durum: RrDurumu; yetki: EkranOzellikleri['yetki']; komut: ReturnType<typeof useEmirKomutu>; acildi: (id: string) => void; git: EkranOzellikleri['git'];
  ilkUrun: string | null; ilkTur?: string | null; ilkAdet?: string | null; ilkRota?: string | null;
}) {
  // Emir yalnız mamul ya da yarı mamule açılır; rotası olan emre kopyalanır (rota.emre-kopyala), rotası olmayan rotasız açılır
  // (uretim-emirleri.rotasiz-ac). İşlemi olmayan yolun ürünü listede yoktur.
  const urunler = useMemo(() => (d.items ?? [])
    .filter((i) => uretilirMi(d, i.id) ? yetki.rotaEmreKopyala : (i.type === 'mamul' || i.type === 'yari') && yetki.emirRotasizAc)
    // Rotalı ürün önce gelir: formun ilk seçimi emri açılabilen üründür (B-2500-6).
    .sort((a, b) => Number(uretilirMi(d, b.id)) - Number(uretilirMi(d, a.id)) || Number(b.type === 'mamul') - Number(a.type === 'mamul')), [d, yetki]);
  const tatiller = d.cal.holidays;
  const ilk = isGunuEkle(bugun(), 0, tatiller);
  const [f, setF] = useState<YeniFormDurumu>({
    urun: (ilkUrun !== null && urunler.some((u) => u.id === ilkUrun) ? ilkUrun : urunler[0]?.id) ?? '', miktar: ilkAdet !== null && /^\d+$/.test(ilkAdet) ? ilkAdet : '100', baslangic: ilk, teslim: isGunuEkle(ilk, 9, tatiller), oncelik: '3', durum: 'serbest',
    tur: ilkTur !== null && ilkTur in EMIR_TURU_ADLARI ? ilkTur : 'seri', not: '', rezerve: true, rota: ilkRota !== null && /^\d+$/.test(ilkRota) ? ilkRota : '', revizyonGerekcesi: '', parcaRev: '',
  });
  // 3657: miktar ve teslim önerisi; elle değiştirilen alan öneriyle ezilmez. Birden çok aday satırda kullanıcı seçene kadar öneri yoktur.
  const [secilenSatir, setSecilenSatir] = useState<number | null>(null);
  const [elle, setElle] = useState({ miktar: ilkAdet !== null && /^\d+$/.test(ilkAdet), teslim: false });
  const [bolme, setBolme] = useState<BolmeDurumu>(bosBolme(true));
  const [cok, setCok] = useState<CokKatmanSecimi>(bosCokKatman);
  const [hata, setHata] = useState<string | null>(null);
  const [gecmisSorusu, setGecmisSorusu] = useState(false);
  // 3247 a: ürünün rotaları; birden çok rota varsa form "Rota" alanını gösterir.
  const urunNo = Number(f.urun);
  const rotalar = useQuery({
    queryKey: [...RR_ANAHTARI, 'urun-rotalari', urunNo] as const,
    enabled: yetki.rotaEmreKopyala && uretilirMi(d, f.urun) && Number.isInteger(urunNo) && urunNo > 0,
    queryFn: () => api.get<UrunRevizyonlariCevabi>(`/rota/urunler/${String(urunNo)}`),
  });
  const rotaSecimi = emirRotasi(rotalar.data, f.tur, turAdi(f.tur), f.rota);
  // 1476-F: çok katmanlı seçim yalnız emri rotadan açabilene ve rotalı alt parçası olan ürüne görünür (önizleme sunucudan).
  const kokRevizyon = rotaSecimi === null ? yururlukteRevizyonId(d, f.urun) : rotaSecimi.revizyonId;
  const onizleme = usePatlatmaOnizlemesi(kokRevizyon, yetki.rotaEmreKopyala && uretilirMi(d, f.urun)).data;
  const cokKatmanVar = onizleme !== undefined && onizleme.kokRevizyon.id === kokRevizyon && (onizleme.ileti !== null || onizleme.dugumler.length > 1);
  const cokAcik = cokKatmanVar && cok.acik && onizleme.ileti === null && onizleme.engel === null;
  // 3755: parça (çizim) revizyonu kartın Belge Merkezi çiziminden; elle seçilmediyse yayındaki. Rota çizimi farklıysa uyarı, engel değil.
  const parca = useParcaRevizyonlari(Number.isInteger(urunNo) && urunNo > 0 ? urunNo : null, uretilirMi(d, f.urun) ? kokRevizyon : null).data;
  const parcaSecili = f.parcaRev !== '' ? f.parcaRev : parca?.varsayilanRevizyonId == null ? '' : String(parca.varsayilanRevizyonId);
  const parcaUyarisi = parca?.revizyonlar.find((r) => String(r.revizyonId) === parcaSecili)?.rotaUyarisi ?? null;
  const yaz = (alan: Partial<YeniFormDurumu>) => { setF({ ...f, ...alan }); setHata(null); };
  // Proje şartı form açıkken bilinsin (B-2502-3): ürün ve türün açık projesi yoksa emir gönderimde değil burada durur. Okunamazsa
  // form eskisi gibi çalışır; şartı açılışta sahibi yine denetler.
  const malzemeNo = Number(f.urun);
  const acilis = useQuery({
    queryKey: [...RR_ANAHTARI, 'acilis-secenekleri', malzemeNo, f.tur] as const,
    enabled: Number.isInteger(malzemeNo) && malzemeNo > 0,
    queryFn: () => api.get<AcilisSecenekleri & { rotasizAcik?: boolean }>(`/adimli-emirler/acilis-secenekleri?malzemeNo=${String(malzemeNo)}&emirTuru=${encodeURIComponent(f.tur)}`),
  });
  const projeYok = acilis.data?.projeZorunlu === true && acilis.data.projeler.length === 0;
  // B-2500-6: rotasız emir ayarı kapalıyken rotasız ürün seçilse de emir açılamaz (sahibi 409 verir); form bunu baştan söyler ve rota
  // kurulacak yere götürür. Ayarı açılış seçenekleri taşır; alan yoksa (eski sunucu) karar yine sahibindedir.
  const rotasizKapali = acilis.data?.rotasizAcik === false && !uretilirMi(d, f.urun);
  // 3438 a: kart ailesinin yürürlükteki revizyonu değilse emir gerekçeyle açılır. Sipariş kalemi proje penceresinde seçildiği için
  // gerekçenin gerekip gerekmediğine sunucu karar verir; form yalnız uyarır ve alanı gösterir.
  const eskiRevizyon = acilis.data?.revizyon?.yururlukte === false ? acilis.data.revizyon : null;

  const adaylar = useMemo(() => oneriAdaylari(acilis.data), [acilis.data]);
  const tekAday = adaylar.length === 1 ? adaylar[0] ?? null : null;
  const oneri = tekAday ?? adaylar.find((a) => a.satirId === secilenSatir) ?? null;
  const adayAnahtari = adaylar.map((a) => String(a.satirId)).join(',');
  const varsayilanTeslim = isGunuEkle(ilk, 9, tatiller);
  useEffect(() => { setSecilenSatir(null); }, [adayAnahtari]);
  useEffect(() => {
    const deger = oneri === null ? null : oneriDegerleri(oneri);
    setF((g) => ({
      ...g,
      ...(elle.miktar ? {} : { miktar: deger?.miktar ?? '100' }),
      ...(elle.teslim ? {} : { teslim: deger?.teslim ?? varsayilanTeslim }),
    }));
  // Yalnız önerinin kaynağı (satır) ya da elle bayrakları değişince çalışır; kullanıcının yazdığı değer her çizimde ezilmez.
  }, [oneri?.satirId, elle.miktar, elle.teslim]);

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
  // 3578: Parti rotası alanının kaynağı; açılacak emrin rotası formdaki Rota seçimi (ya da türün rotası), partininki ayrıca seçilir.
  const anaRota = yeniEmirAnaRotasi(rotalar.data, f.tur, f.rota);
  const rotaKaynagi: PartiRotaKaynagi = {
    durum: rotalar.isError ? 'okunamadi' : rotalar.data === undefined ? 'yukleniyor' : 'hazir',
    yenile: () => { void rotalar.refetch(); },
    tekRota: tekRotaMetni(rotalar.data), ana: anaRotaMetni(rotalar.data, anaRota),
    coz: (tur, secilen) => bolmeTurRotasi(d, rotalar.data, sanal, anaRota, tur, secilen),
  };
  const girdi = { anaAd: 'Ana emir', miktar: sanal.qty, adimSayisi: adimlar.length, aralik: { ilk: 1, son: adimlar.length }, mevcutKollar: [], bitti: () => false };

  const gecmis = gecmisTeslimMi(f.teslim, bugun());
  const olustur = async (gecmisOnayli = false) => {
    if (!adet.tamam || adet.deger === null || !(adet.deger > 0)) { setHata('Miktar sıfırdan büyük olmalı.'); return; }
    // Emir adedi parça sayısıdır (2565): kesirli adet gönderilmez.
    if (!Number.isInteger(adet.deger)) { setHata('Miktar tam sayı olmalı.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.baslangic) || !/^\d{4}-\d{2}-\d{2}$/.test(f.teslim)) { setHata('Başlangıç ve teslim tarihini girin.'); return; }
    if (rotali && rotaSecimi?.uyari) { setHata(rotaSecimi.uyari); return; }
    // K19 a: geçmiş teslim engel değildir; emir kullanıcı onaylayınca açılır.
    if (gecmis && !gecmisOnayli) { setGecmisSorusu(true); return; }
    // Çok katmanlı emir açılırken bölünmez (sunucu bölmeyi reddeder); taslak koşulu 1476-C ile kalktı.
    const bolunur = !cokAcik && (bolme.tur === 'parti' || bolme.tur === 'kol');
    if (!rotali && bolunur) { setHata('Rotasız emir açılırken bölünmez; adımları ekledikten sonra bölün.'); return; }
    const b = bolunur ? bolmeSonucu(girdi, bolme) : null;
    if (b && !b.hazir) { setHata(b.ileti ?? b.ipucu ?? 'Bölmeyi tamamlayın.'); return; }
    const govde = {
      itemId: f.urun, qty: adet.deger, start: f.baslangic, due: f.teslim, priority: Number(f.oncelik), note: f.not.trim(), tur: f.tur, taslak: f.durum === 'taslak',
      // Proje penceresi bu satırı önseçili açar (kopru.ts); sunucuya gitmez.
      ...(oneri === null ? {} : { oneriSatiri: oneri.satirId }),
      ...(eskiRevizyon === null ? {} : { eskiRevizyonGerekcesi: f.revizyonGerekcesi.trim() }),
      ...(parcaSecili === '' ? {} : { parcaCizimRevizyonId: Number(parcaSecili) }),
      ...(rotali ? { rezerve: f.rezerve } : { rotasiz: true }),
      // Rota yalnız elle seçildiyse gider; seçilmediyse sahibi emrin türünün rotasını bulur. Proje penceresinde sipariş partisi seçilince
      // tür partiden gelir, rota da o türün rotası olur (formun ilk türüne göre seçilmiş rota partiye taşınmaz).
      ...(rotali && rotaSecimi && f.rota !== '' ? { rotaId: Number(rotaSecimi.secili) } : {}),
      // Risk N1: çok katmanlı seçim bu revizyonun önizlemesindendir; parti başka türün rotasına düşerse köprü emri açmaz.
      ...(cokOzet ? { cokKatmanli: true, stoktanDugumler: cokOzet.gonderilecek, onizlemeRevizyonId: kokRevizyon } : {}),
    };
    const c = await komut.calistir('emir-ac', govde);
    const id = acilanEmir(c.sonuc);
    if (!c.tamam || id === null) return;
    let durum = c.durum;
    let tamam = true;
    // Bölme açılıştan sonra sahibinin bölme ucuyla yapılır; reddedilirse emir bölünmemiş kalır, iletisi uyarı satırındadır.
    const turler = b ? altEmirTurleri(bolme, b.siralar, f.tur) : [];
    const rotaIdleri = b ? altEmirRotalari(bolme, b.siralar) : [];
    if (b && bolme.tur === 'parti') {
      for (const [i, q] of b.partiler.entries()) {
        const tur = turler[i];
        const rotaId = rotaIdleri[i];
        const r = await komut.calistir('emir-bol', { id, adet: q, surum: guncelSurum(durum, id), ...(tur === undefined ? {} : { emirTuru: tur }), ...(rotaId === undefined ? {} : { rotaId }) });
        if (!r.tamam) { tamam = false; break; }
        durum = r.durum;
      }
    } else if (b && bolme.tur === 'kol') {
      const tur = turler[0];
      tamam = (await komut.calistir('emir-bol', {
        id, adet: b.partiler[0], kolN: bolme.n, kolM: bolme.m, surum: guncelSurum(durum, id), ...(tur === undefined ? {} : { emirTuru: tur }),
      })).tamam;
    }
    acildi(id);
    const uyarilar = (c.sonuc as { uyarilar?: string[] } | null)?.uyarilar ?? [];
    if (!rotali) komut.bildir('tamam', 'Rotasız emir açıldı: adımlarını emrin içinden ekleyin.');
    else if (tamam && uyarilar.length > 0) komut.bildir('bilgi', `Emir açıldı. ${uyarilar.join(' ')}`);
    else if (tamam) komut.bildir('tamam', b ? 'Emir açıldı: alt emirler bağlandı.' : 'Emir açıldı.');
    else komut.bildir('hata', 'Emir açıldı ama bölünemedi; emrin içinden yeniden bölün.');
  };

  return (
    <section className="tc-rr3-panel" data-pencerede="" aria-label="Yeni üretim emri">
      <div className="tc-rr3-form">
        <Secim
          etiket="Ürün" value={f.urun} onChange={(o) => { yaz({ urun: o.target.value, rota: '', parcaRev: '' }); setElle({ miktar: false, teslim: false }); setBolme(bosBolme(true)); setCok(bosCokKatman()); }}
          secenekler={urunler.map((u) => ({ deger: u.id, baslik: `${u.code} ${u.name}${uretilirMi(d, u.id) ? '' : ' (rotasız)'}` }))}
        />
      </div>
      {adaylar.length > 1 && (
        <fieldset className="tc-rr-secenekler">
          <legend>Öneri kaynağı (proje ve sipariş satırı)</legend>
          {adaylar.map((a) => (
            <label key={a.satirId} className="tc-rr-secenek">
              <input type="radio" name="emir-oneri" checked={secilenSatir === a.satirId} onChange={() => { setSecilenSatir(a.satirId); setElle({ miktar: false, teslim: false }); }} />
              <strong>{a.projeKod}</strong>
              <span>{`${a.siparisNo} / satır ${String(a.satirNo)} · ${String(a.adet)} adet, açık emirlerde ${String(a.acik)}, kalan ${String(a.kalan)} · termin ${a.termin === null ? '—' : tarih(a.termin)}`}</span>
            </label>
          ))}
          <label className="tc-rr-secenek">
            <input type="radio" name="emir-oneri" checked={secilenSatir === null} onChange={() => { setSecilenSatir(null); }} />
            <strong>Seçmeden devam</strong>
            <span>Miktar ve teslim elle girilir; proje, Emri oluştur sonrası sorulur</span>
          </label>
        </fieldset>
      )}
      <div className="tc-rr3-form">
        <Girdi etiket="Miktar" inputMode="numeric" value={f.miktar} onChange={(o) => { setElle({ ...elle, miktar: true }); yaz({ miktar: o.target.value }); }}
          ipucu={oneri === null ? undefined : oneri.kalan > 0
            ? `Siparişten: kalan ${String(oneri.kalan)} (satır ${String(oneri.adet)}, açık emirlerde ${String(oneri.acik)})`
            : `Satırın ${String(oneri.adet)} adedi için emir açılmış; miktar elle girilir`} />
        <Girdi etiket="Başlangıç" type="date" value={f.baslangic} onChange={(o) => { yaz({ baslangic: o.target.value }); }} />
        <Girdi etiket="Teslim" type="date" value={f.teslim} onChange={(o) => { setElle({ ...elle, teslim: true }); yaz({ teslim: o.target.value }); }}
          ipucu={gecmis ? 'Teslim tarihi geçmişte: emir açılınca gecikmiş görünür.' : oneri?.termin == null ? undefined : `Siparişten: satır termini ${tarih(oneri.termin)}`} />
        <Secim
          etiket="Öncelik" value={f.oncelik} onChange={(o) => { yaz({ oncelik: o.target.value }); }}
          secenekler={[1, 2, 3, 4].map((n) => ({ deger: String(n), baslik: ONCELIK_ADI[n] ?? '' }))}
        />
        <Secim
          etiket="Durum" value={f.durum} onChange={(o) => { yaz({ durum: o.target.value === 'taslak' ? 'taslak' : 'serbest' }); }}
          secenekler={[{ deger: 'serbest', baslik: `${DURUM_ADI.serbest} (plana girer)` }, { deger: 'taslak', baslik: DURUM_ADI.taslak }]}
        />
        <Secim etiket="Emir türü" value={f.tur} secenekler={TUR_SECENEKLERI} onChange={(o) => { yaz({ tur: o.target.value, rota: '' }); }} />
        {rotali && rotaSecimi && (
          <Secim etiket="Rota" value={rotaSecimi.secili} secenekler={rotaSecimi.secenekler} ipucu={rotaSecimi.ipucu} hata={rotaSecimi.uyari ?? undefined}
            onChange={(o) => { yaz({ rota: o.target.value }); }} />
        )}
        {rotali && rotaSecimi === null && tekRotaMetni(rotalar.data) !== null && (
          <Girdi etiket="Rota" readOnly value={tekRotaMetni(rotalar.data) ?? ''} ipucu="Ürünün tek rotası; bütün emir türleri bunu kullanır" />
        )}
        {parca !== undefined && parca.revizyonlar.length > 0 && (
          <Secim
            etiket="Parça revizyonu (çizim)" value={parcaSecili} bosSecenek={parcaSecili === '' ? 'Revizyon seçin' : undefined}
            secenekler={parca.revizyonlar.map(revizyonSecenegi)} ipucu="Emre sabitlenir; kartta yeni revizyon yayınlansa da emir bu revizyonda kalır."
            onChange={(o) => { yaz({ parcaRev: o.target.value }); }}
          />
        )}
        <Girdi etiket="Not" placeholder="Müşteri, sipariş no…" value={f.not} onChange={(o) => { yaz({ not: o.target.value }); }} />
      </div>
      {oneri !== null && (
        <p className={teslimBagsizMi(f.teslim, oneri) ? 'tc-rr3-uyari-kutu' : 'tc-rr3-uyari'} data-bilgi={teslimBagsizMi(f.teslim, oneri) ? undefined : ''} role="status">
          <Simge ad={teslimBagsizMi(f.teslim, oneri) ? 'alert' : 'check'} boyut="k" />
          <span>{teslimBagsizMi(f.teslim, oneri)
            ? `Teslim sipariş terminden (${tarih(oneri.termin ?? '')}) farklı: emir ${oneri.siparisNo} / satır ${String(oneri.satirNo)} satırına bağsız açılır.`
            : `Öneri: ${oneri.projeKod} · ${oneri.siparisNo} / satır ${String(oneri.satirNo)}. Emir bu satıra bağlı açılır; proje penceresinde bu satır önseçili gelir.`}</span>
        </p>
      )}
      {eskiRevizyon !== null && (
        <>
          <p className="tc-rr3-uyari-kutu" role="status">
            <Simge ad="alert" />
            <span>{eskiRevizyonUyarisi(urunler.find((u) => u.id === f.urun)?.code ?? null, eskiRevizyon)}</span>
          </p>
          <div className="tc-rr3-form">
            <Girdi etiket="Eski revizyon gerekçesi" placeholder="Örnek: Müşteri bu revizyonu istedi" maxLength={300} value={f.revizyonGerekcesi}
              onChange={(o) => { yaz({ revizyonGerekcesi: o.target.value }); }} />
          </div>
        </>
      )}
      {parcaUyarisi && (
        <p className="tc-rr3-uyari-kutu" role="status"><Simge ad="alert" /><span>{parcaUyarisi}</span></p>
      )}
      {rotali && rotaSecimi?.seriyeDusus && (
        <p className="tc-rr3-uyari-kutu" data-ton="bilgi" role="status"><Simge ad="route" /><span>{rotaSecimi.seriyeDusus}</span></p>
      )}
      {rotali && (
        <IsaretKutusu
          etiket="Stoktan rezerve et" checked={f.rezerve} onChange={(o) => { yaz({ rezerve: o.target.checked }); }}
          title="Girdiler serbest stoktan bu emre ayrılır; yetmeyen kısım mal kabulde öncelik sırasıyla gelir."
        />
      )}
      {cokKatmanVar && (
        <CokKatmanPaneli onizleme={onizleme} durum={d} miktar={adet.tamam && adet.deger !== null && Number.isInteger(adet.deger) ? adet.deger : null} deger={cok} degistir={(s) => { setCok(s); setHata(null); }} git={git} />
      )}
      {rotali && cokAcik && <p className="tc-rr3-uyari" data-bilgi=""><Simge ad="alert" boyut="k" />Çok katmanlı emir açılırken bölünmez; sunucu bölmeyi bu emirde henüz kabul etmiyor.</p>}
      {rotali && !cokAcik && (
        <BolmePaneli
          yeni anaTur={f.tur} girdi={girdi} adimlar={adimlar} baslamis={[]} opdefs={d.opdefs} istasyonlar={d.stations} deger={bolme} degistir={setBolme}
          rota={rotaKaynagi}
        />
      )}
      {rotasizKapali && (
        <p className="tc-rr3-uyari" role="status">
          <Simge ad="alert" boyut="k" />Bu ürünün rotası yok; rotasız üretim emri ayarlardan kapalı. Önce rotasını kurun.{' '}
          <Dugme tur="ikincil" simge="route" onClick={() => { git('schema', f.urun); }}>Rotasını kur</Dugme>
        </p>
      )}
      {projeYok && (
        <p className="tc-rr3-uyari" role="status">
          <Simge ad="alert" boyut="k" />Bu ürün için açık proje yok; bu türde üretim emri bir projeyle açılır. <Link to={PROJELER_YOLU}>Projeler</Link>
        </p>
      )}
      {hata && <p className="tc-rr3-uyari" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
      <div className="tc-rr3-arac">
        <Dugme tur="birincil" boyut="ana" simge="check" yukleniyor={komut.mesgul} disabled={projeYok || rotasizKapali} onClick={() => { void olustur(); }}>Emri oluştur</Dugme>
      </div>
      {gecmisSorusu && (
        <Pencere acik kapat={() => { setGecmisSorusu(false); }} baslik="Teslim tarihi geçmişte" alt={(
          <>
            <Dugme onClick={() => { setGecmisSorusu(false); }}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" onClick={() => { setGecmisSorusu(false); void olustur(true); }}>Yine de aç</Dugme>
          </>
        )}>
          <p>{`Teslim ${tarih(f.teslim)}, bugünden önce. Emir açılınca plan onu gecikmiş gösterir. Yine de açılsın mı?`}</p>
        </Pencere>
      )}
    </section>
  );
}
