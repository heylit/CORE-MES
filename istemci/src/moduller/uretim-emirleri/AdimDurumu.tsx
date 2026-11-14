import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { AdimDurumuCevabi, AdimliListeCevabi, AdimStatusu, AdimTedariki, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Simge, useBildirim, type RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ADIM_DURUMU_YAZ, ELLE_YAZILIR, STATU, adimDurumuUcu, isEmriKomutu } from './adim-durumu.ts';
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

const elleOnayli = (a: Adim, m: AdimMaddesi): boolean => m.hal !== m.ham && a.onaylar.some((o) => o.madde === m.madde);
// Satırda yalnız iş bekleten maddeler görünür (eksik, uyarı, elle onay); tamam, muaf, gerekmez ve bilinmiyor gürültü yapmaz.
const sorunluMaddeler = (a: Adim): AdimMaddesi[] => a.maddeler.filter((m) => m.hal === 'eksik' || elleOnayli(a, m));
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

function MaddeCipi({ adim, m }: { adim: Adim; m: AdimMaddesi }) {
  const elle = elleOnayli(adim, m);
  const g = halGorunumu(m.madde, m.hal);
  return (
    <Rozet ton={elle ? 'uyari' : g.ton} gorunum="cizgi">
      <Simge ad={elle ? 'edit' : g.simge} boyut="k" />{MADDE[m.madde].kisa}{elle ? ' · elle onay' : g.ad === 'Uyarı' ? ' · uyarı' : ' · eksik'}
    </Rozet>
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

function EmrinAdimDurumu({ id, yazar, geri }: { id: number; yazar: boolean; geri: () => void }) {
  const d = useQuery({ queryKey: anahtarlar.adimDurumu(id), queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(id)) });
  const [seciliAdim, adimSec] = useState<number | null>(null);
  const [matris, matrisYaz] = useState(false);
  const [hucre, hucreYaz] = useState<{ isEmriId: number; madde: HazirlikMaddesi } | null>(null);
  const [ekleme, eklemeYaz] = useState<{ isEmriId: number; kontrol: boolean } | null>(null);
  const geriDugmesi = <Dugme simge="chev-left" className="tc-ad-geri" onClick={geri}>Emirler</Dugme>;
  if (d.isPending) return <Kart>{geriDugmesi}<DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) return <Kart>{geriDugmesi}<DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Adım durumu alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  const v = d.data;
  const adim = v.adimlar.find((a) => a.isEmriId === seciliAdim) ?? null;
  const sayac = (o: Obek) => v.adimlar.filter((a) => OBEK[gecerliStatu(a)] === o).length;
  const elleSayisi = v.adimlar.filter((a) => a.elle !== null).length;
  const emirAcik = ACIK.has(v.durum);
  const hucreAdimi = hucre === null ? null : v.adimlar.find((a) => a.isEmriId === hucre.isEmriId) ?? null;
  const eklemeAdimi = ekleme === null ? null : v.adimlar.find((a) => a.isEmriId === ekleme.isEmriId) ?? null;
  const yazilir = yazar && emirAcik;
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
          {elleSayisi > 0 && <li><Rozet ton="uyari" gorunum="cizgi"><Simge ad="edit" boyut="k" />Elle</Rozet><b>{elleSayisi}</b></li>}
        </ul>
        {v.adimlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu emrin adımı yok." />
          : matris ? (
            <Matris v={v} emirId={id} yazar={yazilir} sec={adimSec}
              isaretle={yazilir ? (a, madde) => hucreYaz({ isEmriId: a.isEmriId, madde }) : null}
              ekle={yazilir ? (a, kontrol) => eklemeYaz({ isEmriId: a.isEmriId, kontrol }) : null} />
          ) : (
            <ol className="tc-ad-adimlar" aria-label="Adımlar">
              {v.adimlar.map((a) => <AdimSatiri key={a.isEmriId} adim={a} sec={() => adimSec(a.isEmriId)} />)}
            </ol>
          )}
      </Kart>
      <Pencere acik={adim !== null} kapat={() => adimSec(null)} tur="yan" baslik={adim === null ? 'Adım' : `OP ${String(adim.opNo)} · ${adim.ad}`}>
        {adim !== null && <AdimAyrintisi emirId={id} adim={adim} yazar={yazilir} />}
      </Pencere>
      <Pencere acik={hucreAdimi !== null && hucre !== null} kapat={() => hucreYaz(null)}
        baslik={hucreAdimi === null || hucre === null ? 'Hazırlık' : `OP ${String(hucreAdimi.opNo)} · ${MADDE[hucre.madde].ad}`}>
        {hucreAdimi !== null && hucre !== null && (
          <HucreIsareti key={`${String(hucre.isEmriId)}-${hucre.madde}`} emirId={id} adim={hucreAdimi} madde={hucre.madde} kapat={() => hucreYaz(null)} />
        )}
      </Pencere>
      <Pencere acik={eklemeAdimi !== null && ekleme !== null} kapat={() => eklemeYaz(null)}
        baslik={eklemeAdimi === null || ekleme === null ? 'Madde' : `OP ${String(eklemeAdimi.opNo)} · ${ekleme.kontrol ? 'Kontrol adımı ekle' : 'Madde ekle'}`}>
        {eklemeAdimi !== null && ekleme !== null && (
          <MaddeEkle key={`${String(ekleme.isEmriId)}-${String(ekleme.kontrol)}`} emirId={id} adim={eklemeAdimi} kontrol={ekleme.kontrol} kapat={() => eklemeYaz(null)} />
        )}
      </Pencere>
    </>
  );
}

function AdimSatiri({ adim, sec }: { adim: Adim; sec: () => void }) {
  const statu = gecerliStatu(adim);
  const neden = nedenSatiri(adim);
  const sorunlu = sorunluMaddeler(adim);
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
          {neden !== null && <span className="tc-ad-neden"><Simge ad="alert" boyut="k" />{neden}{adim.nedenler.length + adim.tedarik.length > 1 ? ` (+${String(adim.nedenler.length + adim.tedarik.length - 1)})` : ''}</span>}
          <span className="tc-ad-maddeler">
            {sorunlu.length === 0
              ? <span className="tc-ad-hazir"><Simge ad="clipboard-check" boyut="k" />Hazırlık tamam</span>
              : sorunlu.map((m) => <MaddeCipi key={m.madde} adim={adim} m={m} />)}
          </span>
        </span>
        <span className="tc-ad-adim-sag">
          <span className="tc-ad-adet">{adim.yapilan} / {adim.hedef}</span>
          <Cubuk yuzde={adim.yuzde} etiket={`OP ${String(adim.opNo)}`} />
        </span>
        <Simge ad="chev-right" boyut="k" />
      </button>
    </li>
  );
}

// Bütün maddeleri adım adım karşılaştırmak isteyen için: hücre yalnız simgedir, adı ipucunda ve ekran okuyucuda.
// Yetkili kişi (adim-durumu-yaz) hücreye tıklayıp maddeyi elle onaylar ya da onayı kaldırır; hesaplanan hâl silinmez, onay yanında durur.
// 3249 b: her adımın satırı açılır, altında ön hazırlık ve hazırlık listesi tik kutusuyla durur; fare hangi hücre ya da maddenin
// üstündeyse Boşluk onu işaretler ya da kaldırır, çift tık adımın ayrıntısını açar. Liste sütunu genişte sonda, telefonda adımın yanındadır.
function Matris({ v, emirId, yazar, sec, isaretle, ekle }: {
  v: AdimDurumuCevabi; emirId: number; yazar: boolean; sec: (id: number) => void;
  isaretle: ((a: Adim, madde: HazirlikMaddesi) => void) | null; ekle: ((a: Adim, kontrol: boolean) => void) | null;
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
    const komut = (tamam: boolean): Komut => ({ yol: 'liste-isaretle', isEmriId: a.isEmriId, govde: { adimId: m.adimId, tamam } });
    yap({ ...komut(!m.tamam), mesaj: m.tamam ? `İşaret kaldırıldı: ${m.ad}` : `İşaretlendi: ${m.ad}`, geri: komut(m.tamam), sonra: () => sonYaz(anahtar) });
  };
  // Uyaran madde Boşlukla doğrudan onaylanır; durduran madde gerekçe ister, pencereyi açar (2893-2 b).
  const hucreIsaretle = (a: Adim, m: AdimMaddesi) => {
    if (mesgul || isaretle === null) return;
    const anahtar = `h-${String(a.isEmriId)}-${m.madde}`;
    const onayla: Komut = { yol: 'hazirlik-onayla', isEmriId: a.isEmriId, govde: { madde: m.madde, gerekce: null, sistemHali: m.ham } };
    const kaldir: Komut = { yol: 'hazirlik-onay-kaldir', isEmriId: a.isEmriId, govde: { madde: m.madde } };
    if (!MADDE[m.madde].uyarir) { isaretle(a, m.madde); return; }
    if (a.onaylar.some((o) => o.madde === m.madde)) {
      yap({ ...kaldir, mesaj: `Elle onay kaldırıldı: ${MADDE[m.madde].ad}`, geri: onayla, sonra: () => sonYaz(anahtar) });
    } else if (onaylanirMi(a, m)) {
      yap({ ...onayla, govde: { ...onayla.govde, sistemHali: m.hal }, mesaj: `Elle onaylandı: ${MADDE[m.madde].ad}`, geri: kaldir, sonra: () => sonYaz(anahtar) });
    }
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
  const yaz = yazar && isaretle !== null;
  const hucre = (a: Adim, madde: HazirlikMaddesi) => {
    const m = a.maddeler.find((x) => x.madde === madde);
    if (m === undefined) return null;
    const g = halGorunumu(madde, m.hal);
    const elle = elleOnayli(a, m);
    const ad = elle ? 'Elle onay' : g.ad;
    const sinif = `tc-ad-hucre tc-ad-hucre-${elle ? 'uyari' : g.ton}`;
    const ic = <><Simge ad={elle ? 'edit' : g.simge} boyut="k" /><span className="tc-gizli-etiket">{ad}</span></>;
    const onayVar = a.onaylar.some((o) => o.madde === madde);
    if (isaretle !== null && (onayVar || onaylanirMi(a, m))) {
      const eylem = onayVar ? 'Elle onayı aç' : 'Elle onayla';
      const anahtar = `h-${String(a.isEmriId)}-${madde}`;
      harita.set(anahtar, () => hucreIsaretle(a, m));
      return (
        <button type="button" className={`${sinif} tc-ad-hucre-dugme`} title={`${MADDE[madde].ad}: ${ad}. ${eylem} · Boşluk: işaretle`}
          aria-label={`OP ${String(a.opNo)} ${MADDE[madde].ad}: ${ad}. ${eylem}`} data-bosluk={anahtar} data-son={son === anahtar ? '' : undefined}
          onClick={(o) => { o.stopPropagation(); isaretle(a, madde); }}>
          {ic}
        </button>
      );
    }
    return <span className={sinif} title={`${MADDE[madde].ad}: ${ad}`}>{ic}</span>;
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
        <td><Statu statu={gecerliStatu(a)} elle={a.elle !== null} /></td>
        {maddeler.map((madde, i) => <td key={madde} className={i === 0 ? 'tc-ad-mx-ayrac' : undefined}>{hucre(a, madde)}</td>)}
        <td className="tc-ad-mx-liste-son tc-ad-mx-ayrac">{listeHucresi(a)}</td>
      </tr>
    );
    if (!acikMi) return [ust];
    const alt = a.liste.map((m) => {
      const anahtar = `l-${String(m.adimId)}`;
      if (yaz) harita.set(anahtar, () => maddeIsaretle(a, m));
      return (
        <tr key={anahtar} className="tc-ad-mx-alt" data-bosluk={anahtar} data-son={son === anahtar ? '' : undefined}>
          <td className="tc-tablo-sabit-sol"><ListeKutusu adim={a} m={m} yaz={yaz} mesgul={mesgul} degistir={() => maddeIsaretle(a, m)} /></td>
          <td className="tc-ad-mx-liste-on" />
          <td colSpan={maddeler.length + 1} className="tc-ad-mx-kim">{isaretKaydi(m)}</td>
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
      <p className="tc-ad-lejant">
        {(['tamam', 'eksik', 'muaf', 'gerekmez', 'bilinmiyor'] as const).map((h) => {
          const g = halGorunumu('cnc', h);
          return <span key={h} className={`tc-ad-hucre tc-ad-hucre-${g.ton}`}><Simge ad={g.simge} boyut="k" />{g.ad}</span>;
        })}
        <span className="tc-ad-hucre tc-ad-hucre-uyari"><Simge ad="alert" boyut="k" />Uyarı</span>
        <span className="tc-ad-hucre tc-ad-hucre-uyari"><Simge ad="edit" boyut="k" />Elle onay</span>
        <span className="tc-ad-hucre"><Simge ad="lock" boyut="k" />CNC, Çizim, Yayın: gerekçe ister</span>
      </p>
      {isaretle === null
        ? <p className="tc-ad-ipucu"><Simge ad="lock" boyut="k" />Hücreyi elle işaretleme müdür ve planlama rollerindedir.</p>
        : (
          <p className="tc-ad-ipucu">
            <Simge ad="edit" boyut="k" />
            <span className="tc-ad-masa"><kbd>Boşluk</kbd> fare üstündeki hücreyi ya da maddeyi işaretler, kaldırır · <kbd>Çift tık</kbd> ayrıntı · </span>
            Satırın okuyla listeyi açın; maddeyi tikleyin. Eksik hücreye tıklayıp elle onaylayın, elle onaylıya tıklayıp onayı kaldırın.
          </p>
        )}
    </>
  );
}

type ListeMaddesi = Adim['liste'][number];
const ASAMA_ADI: Readonly<Record<ListeMaddesi['asama'], string>> = { on_hazirlik: 'Ön hazırlık', hazirlik: 'Hazırlık' };
const KAYNAK_ADI: Readonly<Record<NonNullable<ListeMaddesi['kaynak']>, string>> = { terminal: 'terminalden', 'adim-durumu': "Adım Durumu'ndan" };
const isaretKaydi = (m: ListeMaddesi): string => {
  const isaret = m.tamam && m.zaman !== null ? `${m.kisiAdi ?? 'Kişi'} · ${zamanMetni(m.zaman)}${m.kaynak === null ? '' : ` · ${KAYNAK_ADI[m.kaynak]}`}` : '—';
  return `${isaret}${m.kanit === null ? '' : ` · ${m.kanit}`}${m.eklenme === null ? '' : ` · ekleyen ${m.ekleyenAdi ?? 'Kişi'}`}`;
};

// Tik kutusu: tıklamak ve Boşluk aynı komutu gönderir. Okuyucu ve kapalı emirde kutu yalnız durumu gösterir.
function ListeKutusu({ adim, m, yaz, mesgul, degistir }: { adim: Adim; m: ListeMaddesi; yaz: boolean; mesgul: boolean; degistir: () => void }) {
  return (
    <label className="tc-ad-madde">
      <input type="checkbox" checked={m.tamam} disabled={!yaz || mesgul} onChange={degistir}
        aria-label={`OP ${String(adim.opNo)} ${m.ad}`} />
      <span>{m.ad}<small>{ASAMA_ADI[m.asama]}{m.aciklama === null ? '' : ` · ${m.aciklama}`}</small></span>
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

// Elle onaylanabilen madde: eksik ya da bilinmiyor ve henüz açık onayı yok. Sunucu aynı kuralı ayrıca denetler.
const onaylanirMi = (a: Adim, m: AdimMaddesi): boolean => (m.hal === 'eksik' || m.hal === 'bilinmiyor') && !a.onaylar.some((o) => o.madde === m.madde);

function AdimAyrintisi({ emirId, adim, yazar }: { emirId: number; adim: Adim; yazar: boolean }) {
  const [statu, statuYaz] = useState<AdimStatusu | ''>('');
  const [not, notYaz] = useState('');
  const [madde, maddeYaz] = useState<HazirlikMaddesi | ''>('');
  const [gerekce, gerekceYaz] = useState('');
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, () => { statuYaz(''); notYaz(''); maddeYaz(''); gerekceYaz(''); });
  const onaylanir = adim.maddeler.filter((m) => onaylanirMi(adim, m));
  const seciliMadde = adim.maddeler.find((m) => m.madde === madde);
  const gerekceGerek = madde !== '' && !MADDE[madde].uyarir;
  const nedenler = [...adim.nedenler, ...adim.tedarik.map(tedarikMetni)];
  // Önce iş bekletenler (eksik, elle onay), sonra ötekiler; gerekmeyen maddeler tek satırda.
  const sorunlu = sorunluMaddeler(adim);
  const gerekenler = [...sorunlu, ...adim.maddeler.filter((m) => m.hal !== 'gerekmez' && !sorunlu.includes(m))];
  const gerekmeyenler = adim.maddeler.filter((m) => m.hal === 'gerekmez' && !sorunlu.includes(m));
  return (
    <div className="tc-ad-pencere">
      <div className="tc-ad-pencere-ust">
        <Statu statu={gecerliStatu(adim)} elle={adim.elle !== null} />
        <Cubuk yuzde={adim.yuzde} etiket={`OP ${String(adim.opNo)}`} />
      </div>
      <dl className="tc-emir-liste">
        <dt>Sistemin dediği</dt><dd>{STATU[adim.sistemStatusu].ad}</dd>
        <dt>Sağlam / hedef</dt><dd>{adim.yapilan} / {adim.hedef}</dd>
        {adim.elle !== null && (
          <><dt>Elle statü</dt><dd>{STATU[adim.elle.statu].ad} · {adim.elle.kisiAdi ?? 'Kişi'} · {zamanMetni(adim.elle.zaman)}{adim.elle.not === null ? '' : ` · ${adim.elle.not}`}</dd></>
        )}
      </dl>
      <h3 className="tc-kapanis-alt"><Simge ad="alert" boyut="k" />Neden bekliyor</h3>
      {nedenler.length === 0 ? <p className="tc-emir-not">Bekleten neden yok.</p> : (
        <ul className="tc-ad-nedenler">{nedenler.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      <h3 className="tc-kapanis-alt"><Simge ad="clipboard-check" boyut="k" />Hazırlık</h3>
      <ul className="tc-ad-hazirlik">
        {gerekenler.map((m) => {
          const elle = elleOnayli(adim, m);
          const g = halGorunumu(m.madde, m.hal);
          return (
            <li key={m.madde}>
              <span>{MADDE[m.madde].ad}<small>{MADDE[m.madde].sahip}</small></span>
              <Rozet ton={elle ? 'uyari' : g.ton}><Simge ad={elle ? 'edit' : g.simge} boyut="k" />{elle ? 'Elle onay' : g.ad}</Rozet>
            </li>
          );
        })}
      </ul>
      {gerekmeyenler.length > 0 && <p className="tc-ad-gerekmez">Bu adımda gerekmez: {gerekmeyenler.map((m) => MADDE[m.madde].ad).join(', ')}</p>}
      <h3 className="tc-kapanis-alt"><Simge ad="list" boyut="k" />Hazırlık listesi</h3>
      {adim.liste.length === 0 ? <p className="tc-emir-not">Liste yok.</p> : (
        <ul className="tc-ad-liste-maddeleri" aria-label="Hazırlık listesi">
          {adim.liste.map((m) => (
            <li key={m.adimId}>
              <ListeKutusu adim={adim} m={m} yaz={yazar} mesgul={mesgul}
                degistir={() => yap({ yol: 'liste-isaretle', govde: { adimId: m.adimId, tamam: !m.tamam }, mesaj: m.tamam ? `İşaret kaldırıldı: ${m.ad}` : `İşaretlendi: ${m.ad}`,
                  geri: { yol: 'liste-isaretle', govde: { adimId: m.adimId, tamam: m.tamam } } })} />
              <small>{isaretKaydi(m)}</small>
            </li>
          ))}
        </ul>
      )}
      {yazar ? (
        <div className="tc-ad-islemler">
          <section className="tc-kapanis-onay" aria-label="Statüyü elle yaz">
            <h3 className="tc-kapanis-alt"><Simge ad="edit" boyut="k" />Statüyü elle yaz</h3>
            <Secim etiket="Statü" bosSecenek="Seçiniz" value={statu} onChange={(e) => statuYaz(e.target.value as AdimStatusu | '')}
              secenekler={ELLE_YAZILIR.map((s) => ({ deger: s, baslik: STATU[s].ad }))} />
            <CokSatir etiket="Not" placeholder="İsteğe bağlı" rows={2} value={not} onChange={(e) => notYaz(e.target.value)} />
            <div className="tc-emir-ust">
              {/* Pencerede tek birincil eylem kalır: hazırlık onayı işi başlatır, elle statü yalnız bilgi yazar. */}
              <Dugme simge="check" disabled={statu === '' || mesgul}
                onClick={() => yap({ yol: 'statu-yaz', govde: { statu, not: not.trim() === '' ? null : not.trim(), sistemStatusu: adim.sistemStatusu } })}>Yaz</Dugme>
              {adim.elle !== null && <Dugme simge="x" disabled={mesgul} onClick={() => yap({ yol: 'statu-kaldir', govde: {} })}>Elle statüyü kaldır</Dugme>}
            </div>
          </section>
          <section className="tc-kapanis-onay" aria-label="Hazırlığı elle onayla">
            <h3 className="tc-kapanis-alt"><Simge ad="clipboard-check" boyut="k" />Hazırlığı elle onayla</h3>
            {onaylanir.length === 0 ? <p className="tc-emir-not">Onay bekleyen eksik madde yok.</p> : (
              <>
                <Secim etiket="Madde" bosSecenek="Seçiniz" value={madde} onChange={(e) => maddeYaz(e.target.value as HazirlikMaddesi | '')}
                  secenekler={onaylanir.map((m) => ({ deger: m.madde, baslik: MADDE[m.madde].ad }))} />
                <CokSatir etiket="Gerekçe" placeholder={gerekceGerek ? 'Zorunlu, en az 5 karakter: bu madde eksikken iş başlamaz, onay başlatmayı açar' : 'İsteğe bağlı'}
                  rows={2} value={gerekce} onChange={(e) => gerekceYaz(e.target.value)} />
                <div className="tc-emir-ust">
                  <Dugme tur="birincil" simge="check" disabled={seciliMadde === undefined || (gerekceGerek && gerekce.trim().length < GEREKCE_EN_AZ) || mesgul}
                    onClick={() => { if (seciliMadde) yap({ yol: 'hazirlik-onayla', govde: { madde: seciliMadde.madde, gerekce: gerekce.trim() === '' ? null : gerekce.trim(), sistemHali: seciliMadde.hal } }); }}>
                    Onayla
                  </Dugme>
                </div>
              </>
            )}
          </section>
        </div>
      ) : <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Statüyü elle yazma ve hazırlığı elle onaylama müdür ve planlama rollerindedir.</p>}
      {adim.onaylar.length > 0 && (
        <>
          <h3 className="tc-kapanis-alt">Elle onaylar</h3>
          <ul className="tc-kapanis-defter">
            {adim.onaylar.map((o) => (
              <li key={o.madde}>
                <time dateTime={o.zaman}>{zamanMetni(o.zaman)}</time>
                {MADDE[o.madde].ad} · {o.kisiAdi ?? 'Kişi'}{o.gerekce === null ? '' : ` · ${o.gerekce}`}
                {yazar && <> <Dugme simge="x" disabled={mesgul} onClick={() => yap({ yol: 'hazirlik-onay-kaldir', govde: { madde: o.madde } })}>Onayı kaldır</Dugme></>}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="tc-kapanis-alt"><Simge ad="clock" boyut="k" />Geçmiş</h3>
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
    </div>
  );
}

// 3249 b: Adım Durumu'ndan emre madde ekleme; yalnız bu emrin bu adımına yazılır, şablon değişmez. Kontrol adımı hazırlık aşamasındadır
// (ilk parça kontrolü, Risk K5); ölçüm, fotoğraf ve seçim türü kartın sonraki diliminde.
function MaddeEkle({ emirId, adim, kontrol, kapat }: { emirId: number; adim: Adim; kontrol: boolean; kapat: () => void }) {
  const [ad, adYaz] = useState('');
  const [asama, asamaYaz] = useState<ListeMaddesi['asama']>('hazirlik');
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, kapat);
  const gonder = () => { if (ad.trim() !== '') yap({ yol: 'liste-ekle', govde: { ad: ad.trim(), asama: kontrol ? 'hazirlik' : asama }, mesaj: `Eklendi: ${ad.trim()}` }); };
  return (
    <div className="tc-ad-hucre-pencere">
      <Girdi etiket={kontrol ? 'Kontrol adımı' : 'Madde adı'} placeholder={kontrol ? 'Örn. İlk parça ölçüldü' : 'Örn. Bağlama aparatı hazır'} maxLength={120} value={ad}
        onChange={(e) => adYaz(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') gonder(); }} />
      {kontrol
        ? <p className="tc-emir-not"><Simge ad="ruler" boyut="k" /> Aşama: Hazırlık · kontrol. Operatör terminalde de görür ve işaretler.</p>
        : (
          <Secim etiket="Aşama" value={asama} onChange={(e) => asamaYaz(e.target.value as ListeMaddesi['asama'])}
            secenekler={(Object.keys(ASAMA_ADI) as ListeMaddesi['asama'][]).map((a) => ({ deger: a, baslik: ASAMA_ADI[a] }))} />
        )}
      <p className="tc-emir-not">Yalnız bu emrin bu adımına eklenir; şablon değişmez.</p>
      <div className="tc-emir-ust">
        <Dugme tur="birincil" simge="plus" disabled={ad.trim() === '' || mesgul} onClick={gonder}>Ekle</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}

function HucreIsareti({ emirId, adim, madde, kapat }: { emirId: number; adim: Adim; madde: HazirlikMaddesi; kapat: () => void }) {
  const [gerekce, gerekceYaz] = useState('');
  const { mesgul, yap } = useAdimKomutu(emirId, adim.isEmriId, kapat);
  const m = adim.maddeler.find((x) => x.madde === madde);
  const onay = adim.onaylar.find((o) => o.madde === madde) ?? null;
  if (m === undefined) return <p className="tc-emir-not">Bu adımda madde yok.</p>;
  const ham = halGorunumu(madde, m.ham);
  const gerekceGerek = !MADDE[madde].uyarir;
  return (
    <div className="tc-ad-hucre-pencere">
      <dl className="tc-emir-liste">
        <dt>Adım</dt><dd>OP {adim.opNo} · {adim.ad}</dd>
        <dt>Sistemin dediği</dt><dd><Rozet ton={ham.ton}><Simge ad={ham.simge} boyut="k" />{ham.ad}</Rozet></dd>
        <dt>Sahibi</dt><dd>{MADDE[madde].sahip}</dd>
      </dl>
      {onay !== null ? (
        <>
          <p className="tc-emir-not"><Simge ad="edit" boyut="k" /> Elle onaylandı: {onay.kisiAdi ?? 'Kişi'} · {zamanMetni(onay.zaman)}{onay.gerekce === null ? '' : ` · ${onay.gerekce}`}</p>
          <p className="tc-emir-not">Onay kaldırılınca hücre sistemin dediğine döner; kayıt geçmişte kalır.</p>
          <div className="tc-emir-ust">
            <Dugme simge="x" disabled={mesgul} onClick={() => yap({ yol: 'hazirlik-onay-kaldir', govde: { madde } })}>Onayı kaldır</Dugme>
          </div>
        </>
      ) : (
        <>
          <p className="tc-emir-not">
            Elle onay sistemin dediğini silmez, yanına işaret koyar; kim, ne zaman ve gerekçe kaydedilir, sonra kaldırılabilir.
            {gerekceGerek ? ' Bu madde eksikken iş başlamaz; onay başlatmayı açar.' : ''}
          </p>
          <CokSatir etiket="Gerekçe" placeholder={gerekceGerek ? 'Zorunlu, en az 5 karakter' : 'İsteğe bağlı'} rows={2} value={gerekce} onChange={(e) => gerekceYaz(e.target.value)} />
          <div className="tc-emir-ust">
            <Dugme tur="birincil" simge="check" disabled={(gerekceGerek && gerekce.trim().length < GEREKCE_EN_AZ) || mesgul}
              onClick={() => yap({ yol: 'hazirlik-onayla', govde: { madde, gerekce: gerekce.trim() === '' ? null : gerekce.trim(), sistemHali: m.hal } })}>
              Elle onayla
            </Dugme>
            <Dugme onClick={kapat}>Vazgeç</Dugme>
          </div>
        </>
      )}
    </div>
  );
}

const gecmisMetni = (g: Adim['gecmis'][number]): string => {
  if (g.olay === 'statu') return `Statü elle yazıldı: ${g.deger in STATU ? STATU[g.deger as AdimStatusu].ad : g.deger}`;
  if (g.olay === 'statu-kaldir') return 'Elle statü kaldırıldı';
  const ad = g.deger in MADDE ? MADDE[g.deger as HazirlikMaddesi].ad : g.deger;
  return g.olay === 'onay' ? `${ad} elle onaylandı` : `${ad} onayı kaldırıldı`;
};
