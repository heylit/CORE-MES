import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { AdimDurumuCevabi, AdimliListeCevabi, AdimStatusu, AdimTedariki, HazirlikMaddesi, ListeKanitiGirdisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Simge, useBildirim, type RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ADIM_DURUMU_YAZ, ELLE_YAZILIR, STATU, STATU_KAYNAGI, adimDurumuUcu, isEmriKomutu, listeFotografiUcu } from './adim-durumu.ts';
import {
  BOS_TASLAK, KanitGirisi, KanitHucresi, KontrolAlanlari, KontrolEtiketi, SablonSecenegi, eskiKanit, kanitGerekir, taslaktanKontrol,
  type KontrolTaslagi,
} from './AdimListesi.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, zamanMetni } from './gorunum.ts';
import { MADDE, halGorunumu } from './HazirlikListesi.tsx';
import './uretim-emirleri.css';
import './adim-durumu.css';

type Adim = AdimDurumuCevabi['adimlar'][number];
type Emir = AdimliListeCevabi['emirler'][number];
type AdimMaddesi = Adim['maddeler'][number];
// isEmriId verilmezse komut kancanın adımına gider; mesaj ve geri bildirimdedir, sonra başarıdan sonra çalışır.
type Komut = { yol: Parameters<typeof isEmriKomutu>[2]; govde: Record<string, unknown>; isEmriId?: number; mesaj?: string; geri?: Komut; sonra?: () => void };
const ACIK = new Set(['taslak', 'planli', 'basladi']);
// Sunucu kuralıyla aynı sınır (uretim-emirleri kurallar.ts GEREKCE_EN_AZ); sunucu kısa gerekçeyi 400 ile reddeder.
const GEREKCE_EN_AZ = 5;
// Termin bir gündür ('GGGG-AA-GG'); bugünden önceyse gecikmiştir (Atölye N2). Bugün tarayıcının yerel günüdür.
const bugun = (): string => {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const gecikti = (gun: string | null): boolean => gun !== null && gun < bugun();
const terminMetni = (termin: string | null): string => (termin === null ? '' : ` · termin ${tarihMetni(termin)}${gecikti(termin) ? ' · gecikti' : ''}`);
const tedarikMetni = (t: AdimTedariki): string => t.asama === 'talep'
  ? `${t.fason ? 'Fason talebi' : 'Talep'} ${t.talepNo} siparişe dönmedi`
  : `Sipariş ${t.siparisNo ?? t.talepNo} bekleniyor${terminMetni(t.termin)}`;

const gecerliStatu = (a: Adim): AdimStatusu => a.elle?.statu ?? a.sistemStatusu;
// Bir bakışta okunacak beş öbek; statünün kendisi satırda yazılıdır, öbek yalnız sayaçtır.
type Obek = 'bitti' | 'calisiyor' | 'baslayabilir' | 'bekliyor' | 'durdu';
const OBEK: Readonly<Record<AdimStatusu, Obek>> = {
  bitti: 'bitti', uretimde: 'calisiyor', fasonda: 'calisiyor', baslayabilir: 'baslayabilir',
  duraklatildi: 'durdu', durdu: 'durdu',
  program: 'bekliyor', cizim: 'bekliyor', yayin: 'bekliyor', makine: 'bekliyor', talep: 'bekliyor', siparis: 'bekliyor', malzeme: 'bekliyor',
  firma: 'bekliyor', onceki: 'bekliyor', diger: 'bekliyor', beklemede: 'bekliyor',
};
// Başlayabilir, Bitti ile aynı yeşildir; çizgi görünümle ayrılır (bitmiş adım dolu, başlamayı bekleyen boş).
const OBEKLER: readonly { obek: Obek; ad: string; simge: SimgeAdi; ton: RozetTonu; cizgi?: true }[] = [
  { obek: 'bitti', ad: 'Bitti', simge: 'check', ton: 'tamam' },
  { obek: 'calisiyor', ad: 'Üretimde', simge: 'play', ton: 'bilgi' },
  { obek: 'baslayabilir', ad: 'Başlayabilir', simge: 'next', ton: 'tamam', cizgi: true },
  { obek: 'bekliyor', ad: 'Bekliyor', simge: 'clock', ton: 'uyari' },
  { obek: 'durdu', ad: 'Durdu', simge: 'stop', ton: 'hata' },
];

// 3322: elle değer iki yönlüdür. Son kayıt geçerlidir: elle "hazır" (onay) ya da elle "hazır değil"; ikisi aynı maddede birlikte olmaz.
type ElleDeger = { tur: 'hazir' | 'eksik'; kisiAdi: string | null; zaman: string; gerekce: string | null };
const elleDegeri = (a: Adim, madde: HazirlikMaddesi): ElleDeger | null => {
  const e = a.elleEksikler.find((x) => x.madde === madde);
  if (e !== undefined) return { tur: 'eksik', kisiAdi: e.kisiAdi, zaman: e.zaman, gerekce: e.gerekce };
  const o = a.onaylar.find((x) => x.madde === madde);
  return o === undefined ? null : { tur: 'hazir', kisiAdi: o.kisiAdi, zaman: o.zaman, gerekce: o.gerekce };
};
const HAZIR_HALLER: ReadonlySet<string> = new Set(['tamam', 'muaf']);
const hazirMi = (a: Adim, m: AdimMaddesi): boolean => {
  const e = elleDegeri(a, m.madde);
  return e === null ? HAZIR_HALLER.has(m.hal) : e.tur === 'hazir';
};
// Hücrenin ve çipin görünüşü: elle değer hâlin yerine geçer, "Elle" işareti ve kişi adı erişilebilir adda.
const maddeGorunumu = (a: Adim, m: AdimMaddesi): { ad: string; simge: SimgeAdi; ton: RozetTonu; elle: ElleDeger | null } => {
  const e = elleDegeri(a, m.madde);
  if (e === null) return { ...halGorunumu(m.madde, m.hal), elle: null };
  if (e.tur === 'hazir') return { ad: 'Hazır', simge: 'check', ton: 'tamam', elle: e };
  return { ad: 'Hazır değil', simge: 'x', ton: MADDE[m.madde].uyarir ? 'uyari' : 'hata', elle: e };
};
const erisilebilirAd = (a: Adim, m: AdimMaddesi): string => {
  const g = maddeGorunumu(a, m);
  return `${MADDE[m.madde].ad}: ${g.ad}, ${g.elle === null ? 'otomatik' : `elle, ${g.elle.kisiAdi ?? 'kişi'}`}`;
};
// Satırda yalnız iş bekleten ve elle değiştirilen maddeler görünür; tamam, muaf, gerekmez ve bilinmiyor gürültü yapmaz.
const sorunluMaddeler = (a: Adim): AdimMaddesi[] => a.maddeler.filter((m) => m.hal === 'eksik' || elleDegeri(a, m.madde) !== null);
const nedenSatiri = (a: Adim): string | null => a.nedenler[0] ?? (a.tedarik[0] ? tedarikMetni(a.tedarik[0]) : null);

function Statu({ statu, elle }: { statu: AdimStatusu; elle: boolean }) {
  const g = STATU[statu];
  return (
    <span className="tc-adim-statu">
      <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" />{g.ad}</Rozet>
      {elle && <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet>}
    </span>
  );
}

function Cubuk({ yuzde, etiket }: { yuzde: number; etiket: string }) {
  return (
    <span className="tc-emir-ilerleme-cubuk">
      <progress max={100} value={yuzde} aria-label={`${etiket} yüzde ${String(yuzde)}`} />
      <b>%{yuzde}</b>
    </span>
  );
}

// 3322: çip düğmedir. Tık maddenin kaynak çubuğunu açar, çift tık kısayoldur (uyaranda hemen çevirir, durduranda onay sorar).
function MaddeCipi({ adim, m, secili, sec, kisayol }: { adim: Adim; m: AdimMaddesi; secili: boolean; sec: () => void; kisayol: (() => void) | null }) {
  const g = maddeGorunumu(adim, m);
  return (
    <button type="button" className={`tc-ad-cip tc-ad-hucre-${g.ton}${g.elle === null ? '' : ' tc-ad-elle'}`} aria-expanded={secili}
      aria-label={`OP ${String(adim.opNo)} ${erisilebilirAd(adim, m)}. Kaynağı ve elle değiştirmeyi aç`}
      onClick={sec} onDoubleClick={(o) => { o.preventDefault(); kisayol?.(); }}>
      <Simge ad={g.simge} boyut="k" />{MADDE[m.madde].kisa}{g.elle === null ? '' : <b className="tc-ad-elle-e" aria-hidden="true">E</b>}
    </button>
  );
}

// Adım Durumu (2893, tasarım 2955): solda açık emirler, sağda seçili emrin adımları rota sırasıyla. Her adımda son statü, ilerleme,
// bekleme nedeni ve yalnız sorunlu hazırlık maddeleri; ayrıntı ve elle işlemler yan pencerede. Statüyü sunucu türetir; yetkili kişi
// (2893-1 a) statüyü elle yazar ve hazırlık maddesini elle onaylar. Durduran maddede onay gerekçe ister ve başlatmayı açar (2893-2 b).
export function AdimDurumu() {
  const oturum = useOturum();
  const yazar = ((oturum.data?.islemler ?? []) as readonly string[]).includes(ADIM_DURUMU_YAZ);
  const [adres, adresYaz] = useSearchParams();
  const secili = Number(adres.get('emir')) || null;
  const [arama, aramaYaz] = useState('');
  const liste = useQuery({ queryKey: anahtarlar.adimliListe, queryFn: () => api.get<AdimliListeCevabi>('/adimli-emirler') });
  const acik = (liste.data?.emirler ?? []).filter((e) => ACIK.has(e.durum));
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const emirler = aranan === '' ? acik
    : acik.filter((e) => `${e.emirNo} ${e.urun.kod} ${e.urun.ad}`.toLocaleLowerCase('tr').includes(aranan));
  const sec = (id: number | null) => {
    adresYaz((a) => { const y = new URLSearchParams(a); if (id === null) y.delete('emir'); else y.set('emir', String(id)); return y; }, { replace: true });
  };
  return (
    <div className={`tc-ad${secili === null ? '' : ' tc-ad-secili'}`}>
      <div className="tc-ad-liste">
        <Kart baslik="Açık emirler" simge="list" baslikEki={liste.data && <Rozet ton="pasif">{acik.length}</Rozet>}>
          {liste.isPending && <DurumKutusu durum="yukleniyor" />}
          {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Emirler alınamadı.')} yenile={() => { void liste.refetch(); }} />}
          {liste.data && (
            <>
              <Girdi etiket="Ara" type="search" placeholder="Emir no, ürün" value={arama} onChange={(e) => aramaYaz(e.target.value)} />
              {emirler.length === 0 ? <DurumKutusu durum="bos" mesaj={acik.length === 0 ? 'Açık emir yok.' : 'Aramaya uyan emir yok.'} /> : (
                <ul className="tc-ad-emirler" aria-label="Açık emirler">
                  {emirler.map((e) => <EmirSatiri key={e.id} emir={e} secili={e.id === secili} sec={() => sec(e.id)} />)}
                </ul>
              )}
            </>
          )}
        </Kart>
      </div>
      <div className="tc-ad-ayrinti">
        {secili === null
          ? <Kart><DurumKutusu durum="bos" mesaj="Soldan bir emir seçin; adımları, bekleme nedenleri ve hazırlık burada görünür." /></Kart>
          : <EmrinAdimDurumu id={secili} yazar={yazar} geri={() => sec(null)} />}
      </div>
    </div>
  );
}

function EmirSatiri({ emir, secili, sec }: { emir: Emir; secili: boolean; sec: () => void }) {
  const yuzde = emir.adimSayisi === 0 ? 0 : Math.round((emir.tamamAdim / emir.adimSayisi) * 100);
  return (
    <li>
      <button type="button" className="tc-ad-emir" aria-current={secili ? 'true' : undefined} onClick={sec}>
        <span className="tc-ad-emir-ust">
          <span className="tc-emir-kod">{emir.emirNo}</span>
          <Rozet ton={emir.durum === 'basladi' ? 'bilgi' : 'pasif'}>{DURUM_ETIKETI[emir.durum]}</Rozet>
        </span>
        <span className="tc-ad-emir-urun">{emir.urun.ad}</span>
        <span className="tc-ad-emir-alt">
          <span>{emir.tamamAdim}/{emir.adimSayisi} adım</span>
          <progress max={100} value={yuzde} aria-hidden="true" />
          {emir.teslim !== null && (
            <span className={gecikti(emir.teslim) ? 'tc-ad-gec' : undefined}>
              <Simge ad="calendar" boyut="k" />{tarihMetni(emir.teslim)}{gecikti(emir.teslim) ? ' · gecikti' : ''}
            </span>
          )}
        </span>
        {emir.siradaki && <span className="tc-ad-emir-sira">Sıradaki: OP {emir.siradaki.opNo} {emir.siradaki.ad}</span>}
      </button>
    </li>
  );
}

type SeciliHucre = { isEmriId: number; madde: HazirlikMaddesi; yon: 'hazir' | 'eksik' | null };

// 3322: elle değeri hedefe götüren komut. Hedef maddenin otomatik hâliyse elle değer kaldırılır (otomatiğe döner), değilse elle yazılır.
const hedefKomutu = (a: Adim, m: AdimMaddesi, hedef: 'hazir' | 'eksik', gerekce: string | null): Komut => {
  const otomatik = hedef === 'hazir' ? HAZIR_HALLER.has(m.ham) : m.ham === 'eksik';
  if (otomatik && elleDegeri(a, m.madde) !== null) return { yol: 'hazirlik-onay-kaldir', isEmriId: a.isEmriId, govde: { madde: m.madde } };
  return { yol: hedef === 'hazir' ? 'hazirlik-onayla' : 'hazirlik-elle-eksik', isEmriId: a.isEmriId, govde: { madde: m.madde, gerekce, sistemHali: m.hal } };
};
// Geri al önceki elle değeri yeniden yazar; komuttan sonraki hâl öngörülür (sunucu eskiyse 409 verir, ekran yeniden okur).
const geriKomutu = (a: Adim, m: AdimMaddesi, ileri: Komut): Komut => {
  const sonraki = ileri.yol === 'hazirlik-onay-kaldir' ? m.ham : ileri.yol === 'hazirlik-elle-eksik' ? 'eksik' : HAZIR_HALLER.has(m.ham) ? m.ham : 'muaf';
  const once = elleDegeri(a, m.madde);
  if (once === null) return { yol: 'hazirlik-onay-kaldir', isEmriId: a.isEmriId, govde: { madde: m.madde } };
  return { yol: once.tur === 'hazir' ? 'hazirlik-onayla' : 'hazirlik-elle-eksik', isEmriId: a.isEmriId, govde: { madde: m.madde, gerekce: once.gerekce, sistemHali: sonraki } };
};
const hedefMesaji = (m: AdimMaddesi, hedef: 'hazir' | 'eksik'): string => `${MADDE[m.madde].ad}: elle ${hedef === 'hazir' ? 'hazır' : 'hazır değil'}`;

function EmrinAdimDurumu({ id, yazar, geri }: { id: number; yazar: boolean; geri: () => void }) {
  const d = useQuery({ queryKey: anahtarlar.adimDurumu(id), queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(id)) });
  const [seciliAdim, adimSec] = useState<number | null>(null);
  const [matris, matrisYaz] = useState(false);
  const [hucre, hucreYaz] = useState<SeciliHucre | null>(null);
  const [ekleme, eklemeYaz] = useState<{ isEmriId: number; kontrol: boolean } | null>(null);
  const [kanit, kanitYaz] = useState<{ isEmriId: number; adimId: number } | null>(null);
  const kisayolKomutu = useAdimKomutu(id, null, () => undefined);
  const geriDugmesi = <Dugme simge="chev-left" className="tc-ad-geri" onClick={geri}>Emirler</Dugme>;
  if (d.isPending) return <Kart>{geriDugmesi}<DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) return <Kart>{geriDugmesi}<DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Adım durumu alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  const v = d.data;
  const adim = v.adimlar.find((a) => a.isEmriId === seciliAdim) ?? null;
  const sayac = (o: Obek) => v.adimlar.filter((a) => OBEK[gecerliStatu(a)] === o).length;
  const elleSayisi = v.adimlar.filter((a) => a.elle !== null || a.onaylar.length > 0 || a.elleEksikler.length > 0).length;
  const emirAcik = ACIK.has(v.durum);
  const hucreAdimi = hucre === null ? null : v.adimlar.find((a) => a.isEmriId === hucre.isEmriId) ?? null;
  const eklemeAdimi = ekleme === null ? null : v.adimlar.find((a) => a.isEmriId === ekleme.isEmriId) ?? null;
  const kanitAdimi = kanit === null ? null : v.adimlar.find((a) => a.isEmriId === kanit.isEmriId) ?? null;
  const kanitMaddesi = kanit === null ? null : kanitAdimi?.liste.find((m) => m.adimId === kanit.adimId) ?? null;
  const yazilir = yazar && emirAcik;
  const secHucre = (a: Adim, madde: HazirlikMaddesi) => {
    hucreYaz((o) => (o !== null && o.isEmriId === a.isEmriId && o.madde === madde && o.yon === null ? null : { isEmriId: a.isEmriId, madde, yon: null }));
  };
  // Çift tık kısayoldur: uyaran madde hemen çevrilir ("Geri al" bildirimde); durduran madde çubukta onay ister (gerekçe).
  const kisayol = !yazilir ? null : (a: Adim, m: AdimMaddesi) => {
    if (m.ham === 'gerekmez' || kisayolKomutu.mesgul) return;
    const hedef = hazirMi(a, m) ? 'eksik' : 'hazir';
    if (!MADDE[m.madde].uyarir) { hucreYaz({ isEmriId: a.isEmriId, madde: m.madde, yon: hedef }); return; }
    const ileri = hedefKomutu(a, m, hedef, null);
    hucreYaz({ isEmriId: a.isEmriId, madde: m.madde, yon: null });
    kisayolKomutu.yap({ ...ileri, mesaj: hedefMesaji(m, hedef), geri: geriKomutu(a, m, ileri) });
  };
  const cubuk = hucreAdimi === null || hucre === null ? null : (
    <MaddeCubugu key={`${String(hucre.isEmriId)}-${hucre.madde}`} emirId={id} adim={hucreAdimi} madde={hucre.madde} yazar={yazilir}
      yon={hucre.yon} yonYaz={(yon) => hucreYaz({ ...hucre, yon })} kapat={() => hucreYaz(null)} />
  );
  return (
    <>
      <Kart baslik={v.emirNo} baslikEki={<Rozet ton="bilgi">{DURUM_ETIKETI[v.durum]}</Rozet>}
        sag={(
          <div className="tc-ad-gorunum" role="group" aria-label="Görünüm">
            <Dugme simge="list" aria-pressed={!matris} onClick={() => matrisYaz(false)}>Adımlar</Dugme>
            <Dugme simge="grid" aria-pressed={matris} onClick={() => matrisYaz(true)}>Matris</Dugme>
          </div>
        )}>
        {geriDugmesi}
        <p className="tc-ad-ozet">
          <b>{v.urun.ad}</b> <span className="tc-emir-kod">{v.urun.kod}</span>
          <span>{v.adet} adet</span>
          {v.teslim !== null && <span className={gecikti(v.teslim) ? 'tc-ad-gec' : undefined}>teslim {tarihMetni(v.teslim)}{gecikti(v.teslim) ? ' · gecikti' : ''}</span>}
        </p>
        {v.rotaYuzde !== null && <Cubuk yuzde={v.rotaYuzde} etiket="Rota" />}
        <ul className="tc-ad-sayaclar" aria-label="Adım özeti">
          {OBEKLER.map((o) => (
            <li key={o.obek} className={sayac(o.obek) === 0 ? 'tc-ad-sifir' : undefined}>
              <Rozet ton={sayac(o.obek) === 0 ? 'pasif' : o.ton} gorunum={o.cizgi ? 'cizgi' : 'dolu'}><Simge ad={o.simge} boyut="k" />{o.ad}</Rozet><b>{sayac(o.obek)}</b>
            </li>
          ))}
          {elleSayisi > 0 && <li><span className="tc-ad-elle-rozet"><Simge ad="edit" boyut="k" />Elle</span><b>{elleSayisi}</b></li>}
        </ul>
        <ElleLejant yazar={yazilir} />
        {v.adimlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu emrin adımı yok." />
          : matris ? (
            <Matris v={v} emirId={id} yazar={yazilir} sec={adimSec} seciliHucre={hucre} secHucre={secHucre} kisayol={kisayol} cubuk={cubuk}
              ekle={yazilir ? (a, kontrol) => eklemeYaz({ isEmriId: a.isEmriId, kontrol }) : null}
              kanitAc={yazilir ? (a, m) => kanitYaz({ isEmriId: a.isEmriId, adimId: m.adimId }) : null} />
          ) : (
            <ol className="tc-ad-adimlar" aria-label="Adımlar">
              {v.adimlar.map((a) => (
                <AdimSatiri key={a.isEmriId} adim={a} sec={() => adimSec(a.isEmriId)} seciliMadde={hucre?.isEmriId === a.isEmriId ? hucre.madde : null}
                  secHucre={(madde) => secHucre(a, madde)} kisayol={kisayol === null ? null : (m) => kisayol(a, m)}
                  cubuk={hucre?.isEmriId === a.isEmriId ? cubuk : null} />
              ))}
            </ol>
          )}
      </Kart>
      <Pencere acik={adim !== null} kapat={() => adimSec(null)} tur="yan" baslik={adim === null ? 'Adım' : `OP ${String(adim.opNo)} · ${adim.ad}`}>
        {adim !== null && <AdimAyrintisi emirId={id} adim={adim} yazar={yazilir} />}
      </Pencere>
      <Pencere acik={eklemeAdimi !== null && ekleme !== null} kapat={() => eklemeYaz(null)}
        baslik={eklemeAdimi === null || ekleme === null ? 'Madde' : `OP ${String(eklemeAdimi.opNo)} · ${ekleme.kontrol ? 'Kontrol adımı ekle' : 'Madde ekle'}`}>
        {eklemeAdimi !== null && ekleme !== null && (
          <MaddeEkle key={`${String(ekleme.isEmriId)}-${String(ekleme.kontrol)}`} emirId={id} adim={eklemeAdimi} kontrol={ekleme.kontrol} kapat={() => eklemeYaz(null)}
            sablon={v.yetki.sablon ? eklemeAdimi.sablon : null} />
        )}
      </Pencere>
      <Pencere acik={kanitAdimi !== null && kanitMaddesi !== null} kapat={() => kanitYaz(null)} baslik={kanitMaddesi?.ad ?? 'Kanıt'}>
        {kanitAdimi !== null && kanitMaddesi !== null && (
          <KanitPenceresi key={kanitMaddesi.adimId} emirId={id} adim={kanitAdimi} m={kanitMaddesi} kapat={() => kanitYaz(null)} />
        )}
      </Pencere>
    </>
  );
}

// 3322: otomatik ve elle görünüşünün açıklaması ve nasıl değiştirileceği; görünümden bağımsız tek satır.
function ElleLejant({ yazar }: { yazar: boolean }) {
  return (
    <p className="tc-ad-elle-lejant">
      <span className="tc-ad-hucre tc-ad-hucre-tamam"><Simge ad="check" boyut="k" />Otomatik</span>
      <span className="tc-ad-hucre tc-ad-hucre-hata tc-ad-elle"><Simge ad="x" boyut="k" />Elle (kişi kayıtlı)<b className="tc-ad-elle-e" aria-hidden="true">E</b></span>
      <span>{yazar ? 'Tık: kaynak ve elle değiştir · Çift tık: kısayol' : 'Tık: maddenin kaynağı'}</span>
    </p>
  );
}

function AdimSatiri({ adim, sec, seciliMadde, secHucre, kisayol, cubuk }: {
  adim: Adim; sec: () => void; seciliMadde: HazirlikMaddesi | null; secHucre: (madde: HazirlikMaddesi) => void;
  kisayol: ((m: AdimMaddesi) => void) | null; cubuk: ReactNode;
}) {
  const [tumu, tumuYaz] = useState(false);
  const statu = gecerliStatu(adim);
  const neden = nedenSatiri(adim);
  const sorunlu = sorunluMaddeler(adim);
  const gorunen = tumu ? adim.maddeler.filter((m) => m.ham !== 'gerekmez' || elleDegeri(adim, m.madde) !== null) : sorunlu;
  const gizli = adim.maddeler.filter((m) => m.ham !== 'gerekmez').length - sorunlu.length;
  return (
    <li className={`tc-ad-adim tc-ad-adim-${OBEK[statu]}`}>
      <button type="button" className="tc-ad-adim-dugme" onClick={sec} aria-label={`OP ${String(adim.opNo)} ${adim.ad}: ${STATU[statu].ad}. Ayrıntı`}>
        <span className="tc-ad-op" aria-hidden="true">{adim.opNo}</span>
        <span className="tc-ad-adim-govde">
          <span className="tc-ad-adim-bas">
            <b>{adim.ad}</b>
            {adim.fason && <Rozet ton="pasif" gorunum="cizgi">Fason</Rozet>}
            <Statu statu={statu} elle={adim.elle !== null} />
          </span>
          <span className="tc-ad-kaynak"><Simge ad="layers" boyut="k" />{statuKaynagi(adim)}</span>
          {neden !== null && <span className="tc-ad-neden"><Simge ad="alert" boyut="k" />{neden}{adim.nedenler.length + adim.tedarik.length > 1 ? ` (+${String(adim.nedenler.length + adim.tedarik.length - 1)})` : ''}</span>}
        </span>
        <span className="tc-ad-adim-sag">
          <span className="tc-ad-adet">{adim.yapilan} / {adim.hedef}</span>
          <Cubuk yuzde={adim.yuzde} etiket={`OP ${String(adim.opNo)}`} />
        </span>
        <Simge ad="chev-right" boyut="k" />
      </button>
      <span className="tc-ad-maddeler">
        {gorunen.length === 0 && <span className="tc-ad-hazir"><Simge ad="clipboard-check" boyut="k" />Hazırlık tamam</span>}
        {gorunen.map((m) => (
          <MaddeCipi key={m.madde} adim={adim} m={m} secili={seciliMadde === m.madde} sec={() => secHucre(m.madde)} kisayol={kisayol === null ? null : () => kisayol(m)} />
        ))}
        {(tumu || gizli > 0) && (
          <button type="button" className="tc-ad-tumu" aria-expanded={tumu} onClick={() => tumuYaz(!tumu)}>
            {tumu ? 'Yalnız sorunlular' : `Tümünü göster (${String(gizli)} otomatik hazır)`}
          </button>
        )}
      </span>
      {cubuk}
    </li>
  );
}

const statuKaynagi = (a: Adim): string => (a.elle === null ? `Kaynak: ${STATU_KAYNAGI[a.sistemStatusu]}` : `Elle: ${a.elle.kisiAdi ?? 'kişi'}`);

// Bütün maddeleri adım adım karşılaştırmak isteyen için: hücre yalnız simgedir, adı ipucunda ve ekran okuyucuda.
// 3322: hücreye tık (ya da Enter) maddenin kaynak çubuğunu tablonun altında açar; çevirme çubuktaki düğmeyledir, çift tık kısayoldur.
// 3249 b: her adımın satırı açılır, altında ön hazırlık ve hazırlık listesi tik kutusuyla durur; fare hangi liste maddesinin
// üstündeyse Boşluk onu işaretler ya da kaldırır, çift tık adımın ayrıntısını açar. Liste sütunu genişte sonda, telefonda adımın yanındadır.
// 3249-2 a: kanıt isteyen madde (ölçüm, fotoğraf, seçim) satırında kanıt hücresi durur; işaretsizini tiklemek ya da Boşluk kanıt penceresini
// açar. Üretim Hazırlık ek maddeleri adımın altında ayrı satırlardır; Üretim Hazırlık yetkisi olmayan yazarda kilitli görünür.
function Matris({ v, emirId, yazar, sec, seciliHucre, secHucre, kisayol, cubuk, ekle, kanitAc }: {
  v: AdimDurumuCevabi; emirId: number; yazar: boolean; sec: (id: number) => void;
  seciliHucre: SeciliHucre | null; secHucre: (a: Adim, madde: HazirlikMaddesi) => void; kisayol: ((a: Adim, m: AdimMaddesi) => void) | null;
  cubuk: ReactNode; ekle: ((a: Adim, kontrol: boolean) => void) | null; kanitAc: ((a: Adim, m: ListeMaddesi) => void) | null;
}) {
  const [acik, acikYaz] = useState<ReadonlySet<number>>(() => new Set());
  const [son, sonYaz] = useState<string | null>(null);
  const { mesgul, yap } = useAdimKomutu(emirId, null, () => undefined);
  const uzerinde = useRef<string | null>(null);
  const eylemler = useRef(new Map<string, () => void>());
  const harita = new Map<string, () => void>();
  const ac = (id: number) => acikYaz((o) => { const y = new Set(o); if (y.has(id)) y.delete(id); else y.add(id); return y; });
  const maddeIsaretle = (a: Adim, m: ListeMaddesi) => {
    if (mesgul) return;
    const anahtar = `l-${String(m.adimId)}`;
    const k = listeKomutu(a, m);
    if (k === null) { kanitAc?.(a, m); return; }
    yap({ ...k, sonra: () => sonYaz(anahtar) });
  };
  const secimYap = (a: Adim, m: ListeMaddesi, secim: string) => {
    const k = listeKomutu(a, m, { secim });
    if (!mesgul && k !== null) yap({ ...k, sonra: () => sonYaz(`l-${String(m.adimId)}`) });
  };
  useEffect(() => { eylemler.current = harita; });
  useEffect(() => {
    const dinle = (o: KeyboardEvent) => {
      if (o.key !== ' ' || o.ctrlKey || o.altKey || o.metaKey) return;
      // Pencere açıkken Boşluk pencereye aittir; yazı alanında boşluk yazılır.
      if (document.querySelector('[role="dialog"]') !== null) return;
      const hedef = o.target instanceof HTMLElement ? o.target : null;
      if (hedef?.closest('textarea, select, [contenteditable="true"], input:not([type="checkbox"])')) return;
      const anahtar = hedef?.closest<HTMLElement>('[data-bosluk]')?.dataset.bosluk ?? uzerinde.current;
      const eylem = anahtar === null ? undefined : eylemler.current.get(anahtar);
      if (eylem === undefined) return;
      o.preventDefault();
      if (!o.repeat) eylem();
    };
    document.addEventListener('keydown', dinle);
    return () => document.removeEventListener('keydown', dinle);
  }, []);
  // Sütunlar sunucunun madde sırasıyladır (sözleşmedeki liste); istemci listeyi ayrıca tutmaz.
  const maddeler = (v.adimlar[0]?.maddeler ?? []).map((m) => m.madde);
  const yaz = yazar;
  const hucre = (a: Adim, madde: HazirlikMaddesi) => {
    const m = a.maddeler.find((x) => x.madde === madde);
    if (m === undefined) return null;
    const g = maddeGorunumu(a, m);
    // Boşluk hücreyi çevirmez (3322, Arayüz): odaktaki öğeyi etkinleştirmek sanılıp kazayla durum değiştirmesin; liste maddesinde kalır.
    const cevrilir = kisayol !== null && m.ham !== 'gerekmez';
    const secili = seciliHucre !== null && seciliHucre.isEmriId === a.isEmriId && seciliHucre.madde === madde;
    return (
      <button type="button" className={`tc-ad-hucre tc-ad-hucre-${g.ton} tc-ad-hucre-dugme${g.elle === null ? '' : ' tc-ad-elle'}`} aria-expanded={secili}
        title={`${erisilebilirAd(a, m)}${cevrilir ? ' · Çift tık: elle çevir' : ''}`}
        aria-label={`OP ${String(a.opNo)} ${erisilebilirAd(a, m)}. Kaynağı ve elle değiştirmeyi aç`}
        onClick={(o) => { o.stopPropagation(); secHucre(a, madde); }}
        onDoubleClick={(o) => { o.stopPropagation(); o.preventDefault(); if (cevrilir) kisayol(a, m); }}>
        <Simge ad={g.simge} boyut="k" /><span className="tc-gizli-etiket">{g.ad}</span>
        {g.elle !== null && <b className="tc-ad-elle-e" aria-hidden="true">E</b>}
      </button>
    );
  };
  const listeHucresi = (a: Adim) => {
    const n = a.liste.length;
    const y = a.liste.filter((m) => m.tamam).length;
    const siradaki = a.liste.find((m) => !m.tamam);
    const anahtar = `o-${String(a.isEmriId)}`;
    if (yaz && siradaki !== undefined) harita.set(anahtar, () => maddeIsaretle(a, siradaki));
    return (
      <button type="button" className="tc-ad-liste-hucre" aria-expanded={acik.has(a.isEmriId)} data-bosluk={anahtar}
        aria-label={`OP ${String(a.opNo)} liste ${String(y)} / ${String(n)}. Maddeleri ${acik.has(a.isEmriId) ? 'kapat' : 'aç'}`}
        title={n === 0 ? 'Liste yok' : 'Tık: maddeleri aç · Boşluk: sıradaki maddeyi işaretle'}
        onClick={(o) => { o.stopPropagation(); ac(a.isEmriId); }}>
        {n === 0 ? <><Simge ad="plus" boyut="k" />Yok</> : <><progress max={n} value={y} aria-hidden="true" />{y}/{n}</>}
      </button>
    );
  };
  // Ekleme düğmeleri genişte geniş hücrede, telefonda sabit adım sütununda durur (yatay kaydırmadan görünsün); biri gizlidir.
  const eklemeDugmeleri = (a: Adim, yer: 'masa' | 'tel') => ekle !== null && (
    <span className={`tc-ad-mx-ekle tc-ad-mx-ekle-${yer}`}>
      <Dugme simge="plus" onClick={() => ekle(a, false)}>Madde</Dugme>
      <Dugme simge="ruler" onClick={() => ekle(a, true)}>Kontrol adımı</Dugme>
    </span>
  );
  const satirlar = v.adimlar.flatMap((a) => {
    const acikMi = acik.has(a.isEmriId);
    const ust = (
      <tr key={a.isEmriId} className="tc-ad-mx-satir" onDoubleClick={(o) => { if (!(o.target as HTMLElement).closest('button, input, label')) sec(a.isEmriId); }}>
        <th scope="row" className="tc-tablo-sabit-sol">
          <span className="tc-ad-mx-adim">
            <button type="button" className="tc-ad-mx-ac" aria-expanded={acikMi} aria-label={`OP ${String(a.opNo)} maddeleri`} onClick={() => ac(a.isEmriId)}>
              <Simge ad={acikMi ? 'down' : 'chev-right'} boyut="k" />
            </button>
            <button type="button" className="tc-ad-mx-ad" onClick={() => sec(a.isEmriId)} aria-label={`OP ${String(a.opNo)} ${a.ad}: ayrıntı`}>
              <span className="tc-emir-kod">OP {a.opNo}</span> {a.ad}
            </button>
          </span>
        </th>
        <td className="tc-ad-mx-liste-on">{listeHucresi(a)}</td>
        <td><Statu statu={gecerliStatu(a)} elle={a.elle !== null} /><small className="tc-ad-kaynak">{statuKaynagi(a)}</small></td>
        {maddeler.map((madde, i) => <td key={madde} className={i === 0 ? 'tc-ad-mx-ayrac' : undefined}>{hucre(a, madde)}</td>)}
        <td className="tc-ad-mx-liste-son tc-ad-mx-ayrac">{listeHucresi(a)}</td>
      </tr>
    );
    if (!acikMi) return [ust];
    const alt = a.liste.map((m) => {
      const anahtar = `l-${String(m.adimId)}`;
      if (yaz) harita.set(anahtar, () => maddeIsaretle(a, m));
      // Kanıt hücresi genişte geniş hücrede, telefonda sabit adım sütununda maddenin altında durur (yatay kaydırmadan); biri gizlidir.
      const kanit = kanitGerekir(m) && (
        <KanitHucresi m={m} yaz={yaz && !mesgul} ac={() => kanitAc?.(a, m)} secimYap={(x) => secimYap(a, m, x)}
          fotoAdresi={m.fotoOzet === null ? null : `/api${listeFotografiUcu(emirId, m.adimId, m.fotoOzet)}`} not={isaretKaydi(m, false)} />
      );
      return (
        <tr key={anahtar} className="tc-ad-mx-alt" data-bosluk={anahtar} data-son={son === anahtar ? '' : undefined}>
          <td className="tc-tablo-sabit-sol">
            <ListeKutusu adim={a} m={m} yaz={yaz} mesgul={mesgul} degistir={() => maddeIsaretle(a, m)} />
            {yaz && kaldirilir(m) && <KaldirDugmesi m={m} mesgul={mesgul} kaldir={() => yap(kaldirKomutu(a, m))} />}
            {kanit && <span className="tc-ad-kanit-tel">{kanit}</span>}
          </td>
          <td className="tc-ad-mx-liste-on" />
          <td colSpan={maddeler.length + 1} className="tc-ad-mx-kim">
            {kanit ? <span className="tc-ad-kanit-masa">{kanit}</span> : isaretKaydi(m)}
          </td>
          <td className="tc-ad-mx-liste-son" />
        </tr>
      );
    });
    const ekleme = (
      <tr key={`e-${String(a.isEmriId)}`} className="tc-ad-mx-alt">
        <td className="tc-tablo-sabit-sol">
          {a.liste.length === 0 ? <p className="tc-ad-mx-bos">Hazırlık listesi yok.</p> : null}
          {eklemeDugmeleri(a, 'tel')}
        </td>
        <td className="tc-ad-mx-liste-on" />
        <td colSpan={maddeler.length + 1}>{eklemeDugmeleri(a, 'masa')}</td>
        <td className="tc-ad-mx-liste-son" />
      </tr>
    );
    return [ust, ...alt, ekleme];
  });
  return (
    <>
      <div className="tc-tablo-kap" data-kaydir="">
        <table className="tc-tablo tc-ad-matris" aria-label="Hazırlık matrisi"
          onMouseOver={(o) => { uzerinde.current = (o.target as HTMLElement).closest<HTMLElement>('[data-bosluk]')?.dataset.bosluk ?? null; }}
          onMouseLeave={() => { uzerinde.current = null; }}>
          <thead>
            <tr>
              <th scope="col" className="tc-tablo-sabit-sol">Adım</th>
              <th scope="col" className="tc-ad-mx-liste-on">Liste</th>
              <th scope="col">Son durum</th>
              {maddeler.map((madde, i) => <th key={madde} scope="col" className={i === 0 ? 'tc-ad-mx-ayrac' : undefined} title={MADDE[madde].ad}>{MADDE[madde].kisa}</th>)}
              <th scope="col" className="tc-ad-mx-liste-son tc-ad-mx-ayrac">Liste</th>
            </tr>
          </thead>
          <tbody>{satirlar}</tbody>
        </table>
      </div>
      {cubuk}
      <p className="tc-ad-lejant">
        {(['tamam', 'eksik', 'muaf', 'gerekmez', 'bilinmiyor'] as const).map((h) => {
          const g = halGorunumu('cnc', h);
          return <span key={h} className={`tc-ad-hucre tc-ad-hucre-${g.ton}`}><Simge ad={g.simge} boyut="k" />{g.ad}</span>;
        })}
        <span className="tc-ad-hucre tc-ad-hucre-uyari"><Simge ad="alert" boyut="k" />Uyarı</span>
        <span className="tc-ad-hucre"><Simge ad="lock" boyut="k" />CNC, Çizim, Terminal: elle hazır gerekçe ister</span>
      </p>
      {kisayol === null
        ? <p className="tc-ad-ipucu"><Simge ad="lock" boyut="k" />Maddeyi elle değiştirme müdür ve planlama rollerindedir; hücreye tıklayınca kaynağı görünür.</p>
        : (
          <p className="tc-ad-ipucu">
            <Simge ad="edit" boyut="k" />
            <span className="tc-ad-masa"><kbd>Boşluk</kbd> fare üstündeki liste maddesini işaretler · </span>
            Hücreye tıklayıp kaynağı görün; <kbd>Çift tık</kbd> elle hazır ⇄ hazır değil çevirir. Satırın okuyla listeyi açın; adın üstüne çift tık ayrıntıdır.
          </p>
        )}
    </>
  );
}

type ListeMaddesi = Adim['liste'][number];
const ASAMA_ADI: Readonly<Record<ListeMaddesi['asama'], string>> = { on_hazirlik: 'Ön hazırlık', hazirlik: 'Hazırlık' };
const KAYNAK_ADI: Readonly<Record<NonNullable<ListeMaddesi['kaynak']>, string>> = { terminal: 'terminalden', 'adim-durumu': "Adım Durumu'ndan" };
const isaretKaydi = (m: ListeMaddesi, kanitla = true): string => {
  const isaret = m.tamam && m.zaman !== null ? `${m.kisiAdi ?? 'Kişi'} · ${zamanMetni(m.zaman)}${m.kaynak === null ? '' : ` · ${KAYNAK_ADI[m.kaynak]}`}` : '—';
  return `${isaret}${!kanitla || m.kanit === null ? '' : ` · ${m.kanit}`}${m.eklenme === null ? '' : ` · ekleyen ${m.ekleyenAdi ?? 'Kişi'}`}`;
};

// Tik ve geri alması (3249-2 a). Kanıt verilirse madde o kanıtla işaretlenir (işaretliyse değer değişir); geri alma önceki hâle döner.
// Kanıt isteyen işaretsiz madde kanıtsız işaretlenmez: null döner, çağıran kanıt penceresini açar. Kaldırılan kanıtlı işaretin geri
// alınması eski kanıtı yeniden gönderir; eski kanıt yoksa (terminalden kanıtsız) geri alma sunulmaz.
const listeKomutu = (a: Adim, m: ListeMaddesi, kanit?: ListeKanitiGirdisi): Komut | null => {
  const komut = (tamam: boolean, k: ListeKanitiGirdisi | null = null): Komut => ({
    yol: 'liste-isaretle', isEmriId: a.isEmriId, govde: { adimId: m.adimId, tamam, ...(k === null ? {} : { kanit: k }) },
  });
  const eski = kanitGerekir(m) ? eskiKanit(m) : null;
  const onceki: Komut | null = !m.tamam ? komut(false) : !kanitGerekir(m) ? komut(true) : eski === null ? null : komut(true, eski);
  const geri = onceki === null ? {} : { geri: onceki };
  if (kanit !== undefined) return { ...komut(true, kanit), mesaj: `Kaydedildi: ${m.ad}`, ...geri };
  if (!m.tamam && kanitGerekir(m)) return null;
  return { ...komut(!m.tamam), mesaj: m.tamam ? `İşaret kaldırıldı: ${m.ad}` : `İşaretlendi: ${m.ad}`, ...geri };
};

// 3494-3 a: elle eklenmiş, işaretlenmemiş madde listeden kaldırılır. Kaldırma geri alınmaz (madde listeden, terminalden ve matristen
// düşer; iz olay defterinde kalır), bu yüzden düğme önce sorar. Talimattan gelen madde talimattan, işaretli madde önce geri alınarak değişir.
const kaldirilir = (m: ListeMaddesi): boolean => m.eklenme !== null && !m.tamam;
const kaldirKomutu = (a: Adim, m: ListeMaddesi): Komut => ({ yol: 'liste-kaldir', isEmriId: a.isEmriId, govde: { adimId: m.adimId }, mesaj: `Kaldırıldı: ${m.ad}` });
function KaldirDugmesi({ m, mesgul, kaldir }: { m: ListeMaddesi; mesgul: boolean; kaldir: () => void }) {
  const [soruyor, soruyorYaz] = useState(false);
  if (!soruyor) {
    return <span className="tc-ad-kaldir"><Dugme simge="trash" disabled={mesgul} onClick={() => soruyorYaz(true)} aria-label={`Kaldır: ${m.ad}`}>Kaldır</Dugme></span>;
  }
  return (
    <span className="tc-ad-kaldir" role="group" aria-label={`${m.ad} kaldırılsın mı?`}>
      <span>Kaldırılsın mı? Geri alınmaz.</span>
      <Dugme tur="tehlike" simge="trash" disabled={mesgul} onClick={() => { soruyorYaz(false); kaldir(); }}>Kaldır</Dugme>
      <Dugme onClick={() => soruyorYaz(false)}>Vazgeç</Dugme>
    </span>
  );
}

// Tik kutusu: tıklamak ve Boşluk aynı komutu gönderir. Okuyucu ve kapalı emirde kutu yalnız durumu gösterir.
function ListeKutusu({ adim, m, yaz, mesgul, degistir }: { adim: Adim; m: ListeMaddesi; yaz: boolean; mesgul: boolean; degistir: () => void }) {
  return (
    <label className="tc-ad-madde">
      <input type="checkbox" checked={m.tamam} disabled={!yaz || mesgul} onChange={degistir}
        aria-label={`OP ${String(adim.opNo)} ${m.ad}`} />
      <span>{m.ad}<small>{ASAMA_ADI[m.asama]}{m.kontrol !== null && m.kontrol.tur !== 'onay' ? ' · kontrol · ' : ''}<KontrolEtiketi k={m.kontrol} />{m.aciklama === null ? '' : ` · ${m.aciklama}`}</small></span>
    </label>
  );
}

// Yan pencere ve matris hücresi aynı komutları aynı yoldan gönderir.
// Geri alınabilen komut (3249 b: tik, Boşlukla onay) bildirimde "Geri al" taşır; geri alma da aynı yoldan, yeni kimlikle gider.
function useAdimKomutu(emirId: number, isEmriId: number | null, bitti: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const komut = useMutation({
    mutationFn: ({ yol, govde, isEmriId: hedef, istekKimligi }: Komut & { istekKimligi: string }) =>
      api.post<AdimDurumuCevabi>(isEmriKomutu(emirId, hedef ?? isEmriId ?? 0, yol), govde, { istekKimligi }),
    onSuccess: (c, k) => {
      istemci.setQueryData(anahtarlar.adimDurumu(emirId), c);
      const geri = k.geri;
      bildir('tamam', k.mesaj ?? 'Kaydedildi.', geri ? { eylem: { etiket: 'Geri al', yap: () => yap({ ...geri, mesaj: 'Geri alındı.' }) } } : undefined);
      k.sonra?.();
      bitti();
    },
    onError: async (x) => { bildir('hata', hataIletisi(x, 'Kaydedilemedi.')); await istemci.invalidateQueries({ queryKey: anahtarlar.adimDurumu(emirId) }); },
  });
  // Kimlik tıklamada üretilir: sunucu aynı tıklamanın yeniden gönderimini ikinci kez uygulamaz (tekrarKorumali uçlar).
  const yap = (k: Komut) => komut.mutate({ ...k, istekKimligi: yeniIstekKimligi() });
  return { mesgul: komut.isPending, yap };
}

// 3322: ayrıntı dört bölümdür: neden bekliyor (kaynaklı), elle değiştirilenler (elle statü yazma burada), hazırlık ve listeler (kapalı),
// geçmiş (kapalı). Maddenin elle değeri satırdaki çipten ya da matris hücresinden değişir; burada yalnız listelenir ve kaldırılır.
function AdimAyrintisi({ emirId, adim, yazar }: { emirId: number; adim: Adim; yazar: boolean }) {
  const [statu, statuYaz] = useState<AdimStatusu | ''>('');
  const [not, notYaz] = useState('');
  // Yan pencerede kanıt girişi maddenin altında açılır (pencere üstüne pencere açılmaz).
  const [kanitAcik, kanitAcikYaz] = useState<number | null>(null);
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, () => { statuYaz(''); notYaz(''); kanitAcikYaz(null); });
  const listeDegistir = (m: ListeMaddesi, kanit?: ListeKanitiGirdisi) => {
    const k = listeKomutu(adim, m, kanit);
    if (k === null) kanitAcikYaz(m.adimId); else yap(k);
  };
  const nedenler = [...adim.nedenler, ...adim.tedarik.map(tedarikMetni)];
  const elleMaddeler = adim.maddeler.filter((m) => elleDegeri(adim, m.madde) !== null);
  const sorunlu = sorunluMaddeler(adim);
  const gerekenler = [...sorunlu, ...adim.maddeler.filter((m) => m.ham !== 'gerekmez' && !sorunlu.includes(m))];
  const gerekmeyenler = adim.maddeler.filter((m) => m.ham === 'gerekmez' && !sorunlu.includes(m));
  const otomatige = (m: AdimMaddesi) => {
    const ileri: Komut = { yol: 'hazirlik-onay-kaldir', govde: { madde: m.madde } };
    yap({ ...ileri, mesaj: `${MADDE[m.madde].ad}: otomatiğe döndü`, geri: geriKomutu(adim, m, ileri) });
  };
  return (
    <div className="tc-ad-pencere">
      <div className="tc-ad-pencere-ust">
        <Statu statu={gecerliStatu(adim)} elle={adim.elle !== null} />
        <Cubuk yuzde={adim.yuzde} etiket={`OP ${String(adim.opNo)}`} />
      </div>
      <dl className="tc-emir-liste">
        <dt>Sistemin dediği</dt><dd>{STATU[adim.sistemStatusu].ad} · kaynak: {STATU_KAYNAGI[adim.sistemStatusu]}</dd>
        <dt>Sağlam / hedef</dt><dd>{adim.yapilan} / {adim.hedef}</dd>
      </dl>
      <h3 className="tc-kapanis-alt"><Simge ad="alert" boyut="k" />Neden bekliyor</h3>
      {nedenler.length === 0 ? <p className="tc-emir-not">Bekleten neden yok.</p> : (
        <ul className="tc-ad-nedenler">{nedenler.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      <h3 className="tc-kapanis-alt"><Simge ad="edit" boyut="k" />Elle değiştirilenler</h3>
      {adim.elle === null && elleMaddeler.length === 0 ? <p className="tc-emir-not">Elle değiştirilen yok; hepsi kaynağından.</p> : (
        <ul className="tc-kapanis-defter tc-ad-elle-liste">
          {adim.elle !== null && (
            <li className="tc-ad-elle">
              <span>Statü: <b>{STATU[adim.elle.statu].ad}</b> · {adim.elle.kisiAdi ?? 'Kişi'} · <time dateTime={adim.elle.zaman}>{zamanMetni(adim.elle.zaman)}</time>
                {adim.elle.not === null ? '' : ` · ${adim.elle.not}`}<small>Sistem statüsü değişince düşer.</small></span>
              {yazar && <Dugme simge="rotate" disabled={mesgul} onClick={() => yap({ yol: 'statu-kaldir', govde: {}, mesaj: 'Statü otomatiğe döndü' })}>Otomatiğe dön</Dugme>}
            </li>
          )}
          {elleMaddeler.map((m) => {
            const e = elleDegeri(adim, m.madde);
            if (e === null) return null;
            return (
              <li key={m.madde} className="tc-ad-elle">
                <span>{MADDE[m.madde].ad}: <b>{e.tur === 'hazir' ? 'hazır' : 'hazır değil'}</b> · {e.kisiAdi ?? 'Kişi'} · <time dateTime={e.zaman}>{zamanMetni(e.zaman)}</time>
                  {e.gerekce === null ? '' : ` · ${e.gerekce}`}<small>Kaynak ({MADDE[m.madde].sahip}) şimdi: {halGorunumu(m.madde, m.ham).ad}</small></span>
                {yazar && <Dugme simge="rotate" disabled={mesgul} onClick={() => otomatige(m)}>Otomatiğe dön</Dugme>}
              </li>
            );
          })}
        </ul>
      )}
      {yazar ? (
        <section className="tc-kapanis-onay" aria-label="Elle statü">
          <Secim etiket="Statüyü elle yaz" bosSecenek="Seçiniz" value={statu} onChange={(e) => statuYaz(e.target.value as AdimStatusu | '')}
            secenekler={ELLE_YAZILIR.map((x) => ({ deger: x, baslik: STATU[x].ad }))} />
          <CokSatir etiket="Not" placeholder="İsteğe bağlı" rows={2} value={not} onChange={(e) => notYaz(e.target.value)} />
          <div className="tc-emir-ust">
            <Dugme simge="check" disabled={statu === '' || mesgul}
              onClick={() => yap({ yol: 'statu-yaz', govde: { statu, not: not.trim() === '' ? null : not.trim(), sistemStatusu: adim.sistemStatusu } })}>Yaz</Dugme>
          </div>
          <p className="tc-emir-not">Hazırlık maddesini elle çevirmek için satırdaki maddeye ya da matris hücresine tıklayın.</p>
        </section>
      ) : <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Elle değiştirme müdür ve planlama rollerindedir.</p>}
      <details className="tc-ad-ac">
        <summary><Simge ad="clipboard-check" boyut="k" />Hazırlık ve liste</summary>
        <ul className="tc-ad-hazirlik">
          {gerekenler.map((m) => {
            const g = maddeGorunumu(adim, m);
            return (
              <li key={m.madde}>
                <span>{MADDE[m.madde].ad}<small>Kaynak: {MADDE[m.madde].sahip}</small></span>
                <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" />{g.ad}{g.elle === null ? '' : ' · Elle'}</Rozet>
              </li>
            );
          })}
        </ul>
        {gerekmeyenler.length > 0 && <p className="tc-ad-gerekmez">Bu adımda gerekmez: {gerekmeyenler.map((m) => MADDE[m.madde].ad).join(', ')}</p>}
        <h4 className="tc-kapanis-alt"><Simge ad="list" boyut="k" />Hazırlık listesi</h4>
        {adim.liste.length === 0 ? <p className="tc-emir-not">Liste yok.</p> : (
          <ul className="tc-ad-liste-maddeleri" aria-label="Hazırlık listesi">
            {adim.liste.map((m) => (
              <li key={m.adimId}>
                <ListeKutusu adim={adim} m={m} yaz={yazar} mesgul={mesgul} degistir={() => listeDegistir(m)} />
                {kanitGerekir(m)
                  ? <KanitHucresi m={m} yaz={yazar && !mesgul} ac={() => kanitAcikYaz(m.adimId)} secimYap={(x) => listeDegistir(m, { secim: x })}
                      fotoAdresi={m.fotoOzet === null ? null : `/api${listeFotografiUcu(emirId, m.adimId, m.fotoOzet)}`} not={isaretKaydi(m, false)} />
                  : <small>{isaretKaydi(m)}</small>}
                {yazar && kaldirilir(m) && <KaldirDugmesi m={m} mesgul={mesgul} kaldir={() => yap(kaldirKomutu(adim, m))} />}
                {kanitAcik === m.adimId && yazar && (
                  <KanitGirisi m={m} mesgul={mesgul} gonder={(k) => listeDegistir(m, k)} kapat={() => kanitAcikYaz(null)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
      <details className="tc-ad-ac">
        <summary><Simge ad="clock" boyut="k" />Geçmiş ({adim.gecmis.length})</summary>
        {adim.gecmis.length === 0 ? <p className="tc-emir-not">Kayıt yok.</p> : (
          <ol className="tc-kapanis-defter">
            {adim.gecmis.map((g, i) => (
              <li key={`${g.zaman}-${String(i)}`}>
                <time dateTime={g.zaman}>{zamanMetni(g.zaman)}</time>
                {gecmisMetni(g)} · {g.kisiAdi ?? 'Kişi'}{g.not === null ? '' : ` · ${g.not}`}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}

// 3249 b: Adım Durumu'ndan emre madde ekleme; yalnız bu emrin bu adımına yazılır. Kontrol adımı hazırlık aşamasındadır (Risk K5) ve
// 3249-2 a ile türlüdür: onay, ölçüm, fotoğraf, seçim. "Şablona da ekle" seçilirse madde adımın tipinin emre gelen şablonuna da yeni
// sürümle eklenir; seçenek yalnız talimat yazma yetkisi de olana ve şablonu olan adımda görünür, varsayılan kapalıdır.
function MaddeEkle({ emirId, adim, kontrol, kapat, sablon }: {
  emirId: number; adim: Adim; kontrol: boolean; kapat: () => void; sablon: { kod: string; ad: string } | null;
}) {
  const [ad, adYaz] = useState('');
  const [asama, asamaYaz] = useState<ListeMaddesi['asama']>('hazirlik');
  const [taslak, taslakYaz] = useState<KontrolTaslagi>(BOS_TASLAK);
  const [sablonaEkle, sablonaEkleYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, kapat);
  const gonder = () => {
    if (ad.trim() === '') return;
    const sonuc = kontrol ? taslaktanKontrol(taslak, ad) : { kontrol: { tur: 'onay' as const } };
    if ('hata' in sonuc) { hataYaz(sonuc.hata); return; }
    hataYaz(null);
    yap({
      yol: 'liste-ekle', govde: { ad: ad.trim(), asama: kontrol ? 'hazirlik' : asama, kontrol: sonuc.kontrol, sablonaEkle: sablon !== null && sablonaEkle },
      mesaj: `Eklendi: ${ad.trim()}${sablon !== null && sablonaEkle ? ` · ${sablon.kod} şablonuna da` : ''}`,
    });
  };
  return (
    <div className="tc-ad-hucre-pencere">
      <Girdi etiket={kontrol ? 'Kontrol adımı' : 'Madde adı'} placeholder={kontrol ? 'Örn. İlk parça ölçüldü' : 'Örn. Bağlama aparatı hazır'} maxLength={120} value={ad}
        onChange={(e) => adYaz(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') gonder(); }} />
      {kontrol
        ? (
          <>
            <KontrolAlanlari t={taslak} degistir={(t) => { taslakYaz(t); hataYaz(null); }} hata={hata} />
            <p className="tc-emir-not"><Simge ad="ruler" boyut="k" /> Aşama: Hazırlık · kontrol. Operatör terminalde de görür ve işaretler.</p>
          </>
        )
        : (
          <Secim etiket="Aşama" value={asama} onChange={(e) => asamaYaz(e.target.value as ListeMaddesi['asama'])}
            secenekler={(Object.keys(ASAMA_ADI) as ListeMaddesi['asama'][]).map((a) => ({ deger: a, baslik: ASAMA_ADI[a] }))} />
        )}
      {sablon !== null && <SablonSecenegi sablon={sablon} secili={sablonaEkle} degistir={sablonaEkleYaz} />}
      {!(sablon !== null && sablonaEkle) && <p className="tc-emir-not">Yalnız bu emrin bu adımına eklenir; şablon değişmez.</p>}
      <div className="tc-emir-ust">
        <Dugme tur="birincil" simge="plus" disabled={ad.trim() === '' || mesgul} onClick={gonder}>Ekle</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}

// Matristen açılan kanıt penceresi: kaydedince madde kanıtla işaretlenir, bildirimde "Geri al" önceki hâle döner.
function KanitPenceresi({ emirId, adim, m, kapat }: { emirId: number; adim: Adim; m: ListeMaddesi; kapat: () => void }) {
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, kapat);
  return (
    <>
      <p className="tc-emir-not">OP {adim.opNo} · {adim.ad}</p>
      <KanitGirisi m={m} mesgul={mesgul} gonder={(k) => { const c = listeKomutu(adim, m, k); if (c !== null) yap(c); }} kapat={kapat} />
    </>
  );
}

// 3322: maddenin kaynak çubuğu: kaynağın dediği, elle değer (kim, ne zaman, gerekçe), iki yönlü elle değiştirme ve otomatiğe dönüş.
// Durduran maddede elle hazır gerekçe ister (2893-2 b); elle hazır değil gerekçesi isteğe bağlıdır. Uyaran madde onaysız çevrilir.
function MaddeCubugu({ emirId, adim, madde, yazar, yon, yonYaz, kapat }: {
  emirId: number; adim: Adim; madde: HazirlikMaddesi; yazar: boolean; yon: 'hazir' | 'eksik' | null;
  yonYaz: (yon: 'hazir' | 'eksik' | null) => void; kapat: () => void;
}) {
  const [gerekce, gerekceYaz] = useState('');
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, () => { gerekceYaz(''); yonYaz(null); });
  const m = adim.maddeler.find((x) => x.madde === madde);
  if (m === undefined) return null;
  const tanim = MADDE[madde];
  const g = maddeGorunumu(adim, m);
  const ham = halGorunumu(madde, m.ham);
  const durduran = !tanim.uyarir;
  const temiz = gerekce.trim() === '' ? null : gerekce.trim();
  const gonder = (hedef: 'hazir' | 'eksik') => {
    const k = hedefKomutu(adim, m, hedef, temiz);
    yap({ ...k, mesaj: hedefMesaji(m, hedef), geri: geriKomutu(adim, m, k) });
  };
  const iste = (hedef: 'hazir' | 'eksik') => {
    if (durduran && hedefKomutu(adim, m, hedef, null).yol !== 'hazirlik-onay-kaldir') yonYaz(hedef); else gonder(hedef);
  };
  const zorunlu = yon === 'hazir' && durduran;
  const hedef: 'hazir' | 'eksik' = hazirMi(adim, m) ? 'eksik' : 'hazir';
  return (
    <section className="tc-ad-cubuk" aria-label={`OP ${String(adim.opNo)} ${tanim.ad}: kaynak ve elle değiştirme`}>
      <div className="tc-ad-cubuk-ust">
        <b>OP {adim.opNo} · {tanim.ad}</b>
        <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" />{g.ad}</Rozet>
        {g.elle === null ? <Rozet ton="pasif" gorunum="cizgi">Otomatik</Rozet> : <span className="tc-ad-elle-rozet"><Simge ad="edit" boyut="k" />Elle</span>}
        <Rozet ton="pasif" gorunum="cizgi">{durduran ? 'Hazır değilse iş başlamaz' : 'Hazır değilse yalnız uyarır'}</Rozet>
        <Dugme simge="x" className="tc-ad-cubuk-kapat" aria-label="Kapat" onClick={kapat} />
      </div>
      <p className="tc-ad-kaynak"><Simge ad="layers" boyut="k" />Kaynak: {tanim.sahip} · {ham.ad}</p>
      {g.elle !== null && (
        <p className="tc-emir-not">
          <Simge ad="edit" boyut="k" /> Elle {g.elle.tur === 'hazir' ? 'hazır' : 'hazır değil'}: {g.elle.kisiAdi ?? 'Kişi'} · {zamanMetni(g.elle.zaman)}
          {g.elle.gerekce === null ? '' : ` · ${g.elle.gerekce}`}. Otomatiğe dönülene kadar kalır{g.elle.tur === 'hazir' ? '; kaynak yeni sürüme geçerse düşer' : ''}.
        </p>
      )}
      {madde === 'yayin' && (
        <p className="tc-emir-not">Terminale gönderme Arkon'da denetlenir: elle hazır değil yalnız bu ekranda görünür, elle hazır terminalde başlatmaya izin verir.</p>
      )}
      {m.ham === 'gerekmez' ? <p className="tc-emir-not">Bu adımda gerekmez; elle çevrilmez.</p>
        : !yazar ? <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Elle değiştirme müdür ve planlama rollerindedir.</p>
        : yon === null ? (
          <div className="tc-emir-ust">
            <Dugme tur="birincil" simge={hedef === 'hazir' ? 'check' : 'x'} disabled={mesgul} onClick={() => iste(hedef)}>
              {hedef === 'hazir' ? 'Elle hazır yap' : 'Elle hazır değil yap'}
            </Dugme>
            {g.elle !== null && (
              <Dugme simge="rotate" disabled={mesgul} onClick={() => {
                const k: Komut = { yol: 'hazirlik-onay-kaldir', isEmriId: adim.isEmriId, govde: { madde } };
                yap({ ...k, mesaj: `${tanim.ad}: otomatiğe döndü`, geri: geriKomutu(adim, m, k) });
              }}>Otomatiğe dön</Dugme>
            )}
          </div>
        ) : (
          <div className="tc-ad-cubuk-onay">
            <p className="tc-emir-not">
              {yon === 'hazir' ? `${tanim.ad} elle hazır sayılacak; bu adım başlatılabilir.` : `${tanim.ad} elle hazır değil sayılacak; bu adımda iş başlamaz.`}
            </p>
            <CokSatir etiket="Gerekçe" placeholder={zorunlu ? `Zorunlu, en az ${String(GEREKCE_EN_AZ)} karakter` : 'İsteğe bağlı'} rows={2} value={gerekce}
              onChange={(e) => gerekceYaz(e.target.value)} />
            <div className="tc-emir-ust">
              <Dugme tur="birincil" simge={yon === 'hazir' ? 'check' : 'x'} disabled={(zorunlu && gerekce.trim().length < GEREKCE_EN_AZ) || mesgul}
                onClick={() => gonder(yon)}>
                {yon === 'hazir' ? 'Elle hazır yap' : 'Elle hazır değil yap'}
              </Dugme>
              <Dugme onClick={() => yonYaz(null)}>Vazgeç</Dugme>
            </div>
          </div>
        )}
    </section>
  );
}

const gecmisMetni = (g: Adim['gecmis'][number]): string => {
  if (g.olay === 'statu') return `Statü elle yazıldı: ${g.deger in STATU ? STATU[g.deger as AdimStatusu].ad : g.deger}`;
  if (g.olay === 'statu-kaldir') return 'Elle statü kaldırıldı';
  // 3338-4 a: atlanan madde adları notta yazar.
  if (g.olay === 'talimat-atlama') return g.deger === 'bitir' ? 'Zorunlu talimat eksikken bitirildi' : 'Zorunlu talimat eksikken başlatıldı';
  const ad = g.deger in MADDE ? MADDE[g.deger as HazirlikMaddesi].ad : g.deger;
  if (g.olay === 'eksik') return `${ad} elle "hazır değil" yazıldı`;
  return g.olay === 'onay' ? `${ad} elle hazır yazıldı` : `${ad}: elle değer kaldırıldı`;
};
