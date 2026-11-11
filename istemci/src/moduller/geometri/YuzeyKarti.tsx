import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  GeometriDurumu, GeometriOzellikCevabi, GeometriYuzeyAdimi, GeometriYuzeyCevabi, GeometriYuzeyIslemi, GeometriYuzeyKaydetGovdesi,
} from '#paylasilan/sozlesme/geometri.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  ISLEM_RENKLERI, islemAnahtari, m2Kisa, m2Metni, MASKE_RENGI, pozitifSayi, sartnameSayisi, suruyorMu, taslakAlanlari, tozKg, tozMetni, uzunluk,
  YUZ_TURU_ADI, yuzGruplari, type HesapAlani, type TaslakIsaret, type Yon3, type YuzGrubu,
} from './gorunum.ts';
import type { ResimAl, YuzBoyasi, YuzDurumu } from './Goruntu3B.tsx';

// Kartın görüntüye verdiği: yüz renkleri, tıklama ve sahnenin üstündeki araç çubuğu.
export interface YuzeySahnesi { boyasi: Omit<YuzBoyasi, 'durumYaz'>; arac: ReactNode; bilgi: string | null }

type Yuz = GeometriYuzeyCevabi['yuzler'][number];
interface IslemSatiri {
  anahtar: string;
  islem: GeometriYuzeyIslemi;
  renk: string;
  ad: string;
  kisa: string;
  adim: GeometriYuzeyAdimi | null;
  // Rotadan kalkan adımın işareti: hesapta uyarıyla durur, fırça olamaz.
  kalkan: boolean;
}

const SAYFA_BOYU = 50;
const GECMIS_SINIRI = 50;
const SIL = 'sil';
const HESAP_ALANLARI: readonly { alan: HesapAlani; etiket: string; ornek: string }[] = [
  { alan: 'kalinlik', etiket: 'Kalınlık (µm)', ornek: 'örn. 70' },
  { alan: 'yogunluk', etiket: 'Toz yoğunluğu (g/cm³)', ornek: 'örn. 1,5' },
  { alan: 'verim', etiket: 'Verim (%)', ornek: 'örn. 60' },
];

const yetkiyse = (hata: unknown, ekran: string): string =>
  hata instanceof ApiHatasi && hata.durum === 403 ? 'Yüzey işaretleri için yetkiniz yok.' : hataIletisi(hata, ekran);

const adimSatiri = (a: GeometriYuzeyAdimi, k: number): IslemSatiri => {
  const islem: GeometriYuzeyIslemi = { tur: 'rota', opNo: a.opNo, sartnameId: a.sartname.id };
  return {
    anahtar: islemAnahtari(islem), islem, renk: ISLEM_RENKLERI[k % ISLEM_RENKLERI.length] ?? '--grafik',
    ad: `Adım ${String(a.opNo)} · ${a.sartname.ad}`, kisa: a.sartname.ad, adim: a, kalkan: false,
  };
};
const MASKE: IslemSatiri = { anahtar: 'maske', islem: { tur: 'maske' }, renk: MASKE_RENGI, ad: 'Maske', kisa: 'Maske', adim: null, kalkan: false };

function sunucuTaslagi(c: GeometriYuzeyCevabi): Map<number, TaslakIsaret> {
  return new Map(c.isaretler.map((i) => [i.yuzSira, { islem: i.islem, oneri: i.oneri }]));
}

// Renk sınıfı değişkenin sırasıdır (geometri.css tc-g3b-yz-r0..4); maske taralıdır.
function RenkIsareti({ satir }: { satir: IslemSatiri }) {
  const no = ISLEM_RENKLERI.indexOf(satir.renk as (typeof ISLEM_RENKLERI)[number]);
  return <span className={`tc-g3b-yz-renk ${satir.islem.tur === 'maske' || no < 0 ? 'tc-g3b-yz-maske' : `tc-g3b-yz-r${String(no)}`}`} aria-hidden="true" />;
}
function FircaIsareti({ satir }: { satir: IslemSatiri | null }) {
  return satir === null ? <Simge ad="trash" /> : <RenkIsareti satir={satir} />;
}

function AdimBasligi({ no, children }: { no: number; children: ReactNode }) {
  return <h3 className="tc-g3b-yz-adim"><span className="tc-g3b-yz-no" aria-hidden="true">{no}</span>{children}</h3>;
}

// Boya ve maske (2144, prototip v3; 2144-3 b). Fırça seçilir, modelde yüze tıklanınca yüz hemen boyanır; görünmeyen yüzler gruplardan
// ve ayrıntı listesinden. İşlem listesi yürürlükteki rotadandır (2140-3); bir yüz tek işleme atanır, maske "işlem uygulanmaz"
// demektir (2144-1 a). Önceki revizyondan taşınan işaretler öneridir, onaylanana kadar maske resmine girmez (2140-4 a). Hesap
// kaydedilmez; kalınlık, yoğunluk ve verim adımın şartnamesinden gelir, yoksa elle yazılır. Sunucuya yalnız Kaydet gider.
export function YuzeyKarti({ revizyonId, durum, revKodu, yuzDurumu, yuzNormalleri, sahneYaz, resimAl }: {
  revizyonId: number; durum: GeometriDurumu; revKodu: string | null; yuzDurumu: YuzDurumu; yuzNormalleri: readonly (Yon3 | null)[] | null;
  sahneYaz: (s: YuzeySahnesi | null) => void; resimAl: ResimAl | null;
}) {
  const surer = suruyorMu(durum);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yetki = useYetki();
  const git = useNavigate();
  const sorgu = useQuery({
    queryKey: [...anahtarlar.yuzey(revizyonId), durum],
    queryFn: () => api.get<GeometriYuzeyCevabi>(`/geometri/yuzey/${String(revizyonId)}`),
    enabled: !surer,
  });
  // Delik, pah ve radyüs grupları Özellikler kartının okuduğu cevaptan (aynı anahtar, tek istek).
  const ozellik = useQuery({
    queryKey: [...anahtarlar.ozellik(revizyonId), durum],
    queryFn: () => api.get<GeometriOzellikCevabi>(`/geometri/ozellikler/${String(revizyonId)}`),
    enabled: !surer,
  });
  const c = sorgu.data;
  // Düzenleme yoksa ekran sunucudaki işaretleri gösterir; ilk değişiklikte kopyası alınır.
  const [duzenleme, duzenlemeYaz] = useState<Map<number, TaslakIsaret> | null>(null);
  const [gecmis, gecmisYaz] = useState<Map<number, TaslakIsaret>[]>([]);
  const [cakisma, cakismaYaz] = useState(false);
  const [firca, fircaYaz] = useState<string | null>(null);
  const [gorunum, gorunumYaz] = useState<'islem' | 'maske'>('islem');
  const [sayfa, sayfaYaz] = useState(1);
  const [resimAliniyor, resimAliniyorYaz] = useState(false);
  const [adet, adetYaz] = useState('');
  // null: kullanıcı yazmadı, değer şartnameden.
  const [elle, elleYaz] = useState<Partial<Record<HesapAlani, string>>>({});

  const isaretler = useMemo(() => duzenleme ?? (c ? sunucuTaslagi(c) : new Map<number, TaslakIsaret>()), [duzenleme, c]);
  const yazabilir = yetki.var('geometri.yuzey-yaz') && c !== undefined && c.neden === null;

  const islemler = useMemo((): IslemSatiri[] => {
    if (c === undefined) return [];
    const rota = c.rota.adimlar.map(adimSatiri);
    const bilinen = new Set(rota.map((r) => r.anahtar));
    const kalkan = new Map<string, IslemSatiri>();
    for (const i of isaretler.values()) {
      if (i.islem.tur !== 'rota') continue;
      const a = islemAnahtari(i.islem);
      if (bilinen.has(a) || kalkan.has(a)) continue;
      kalkan.set(a, {
        anahtar: a, islem: i.islem, renk: ISLEM_RENKLERI[(rota.length + kalkan.size) % ISLEM_RENKLERI.length] ?? '--grafik',
        ad: `Adım ${String(i.islem.opNo)} (rotada yok)`, kisa: `Adım ${String(i.islem.opNo)} (rotada yok)`, adim: null, kalkan: true,
      });
    }
    return [...rota, ...kalkan.values(), MASKE];
  }, [c, isaretler]);
  const islemOf = useMemo(() => new Map(islemler.map((i) => [i.anahtar, i])), [islemler]);
  const fircalar = islemler.filter((i) => !i.kalkan);
  const etkinFirca = firca !== null && (firca === SIL || fircalar.some((i) => i.anahtar === firca)) ? firca : (fircalar[0]?.anahtar ?? 'maske');
  const fircaSatiri = etkinFirca === SIL ? null : (islemOf.get(etkinFirca) ?? MASKE);
  const alanlar = useMemo(() => taslakAlanlari(c?.yuzler ?? [], isaretler), [c, isaretler]);
  const oneriVar = [...isaretler.values()].some((i) => i.oneri);
  const yuzAlani = useMemo(() => new Map((c?.yuzler ?? []).map((y) => [y.sira, y.alanMm2])), [c]);
  const normaller = yuzDurumu === 'hazir' ? yuzNormalleri : null;
  const gruplar = useMemo(() => yuzGruplari(c?.yuzler ?? [], ozellik.data?.ozellikler ?? null, normaller), [c, ozellik.data, normaller]);

  // Her değişiklik geri alınabilir; geçmiş bu oturumdadır.
  const degistir = (f: (m: Map<number, TaslakIsaret>) => void) => {
    const m = new Map(isaretler);
    f(m);
    gecmisYaz((g) => [...g.slice(-(GECMIS_SINIRI - 1)), new Map(isaretler)]);
    duzenlemeYaz(m);
  };
  const uygula = (siralar: readonly number[], anahtar: string) => {
    const hedef = anahtar === SIL ? null : (islemOf.get(anahtar) ?? null);
    degistir((m) => { for (const s of siralar) { if (hedef === null) m.delete(s); else m.set(s, { islem: hedef.islem, oneri: false }); } });
  };
  // Modelde tıklanan yüz: fırçanın işlemi zaten oradaysa kalkar, değilse atanır.
  const yuzeDokun = (sira: number) => {
    const i = isaretler.get(sira);
    uygula([sira], i !== undefined && etkinFirca !== SIL && islemAnahtari(i.islem) === etkinFirca && !i.oneri ? SIL : etkinFirca);
  };
  const geriAl = () => {
    const son = gecmis.at(-1);
    if (son === undefined) return;
    gecmisYaz((g) => g.slice(0, -1));
    duzenlemeYaz(son);
  };

  const kaydet = useKorumaliKomut<GeometriYuzeyKaydetGovdesi, GeometriYuzeyCevabi>({
    gonder: (g, d) => api.post<GeometriYuzeyCevabi>(`/geometri/yuzey/${String(revizyonId)}/kaydet`, g, d),
    onSuccess: (yeni) => {
      istemci.setQueryData([...anahtarlar.yuzey(revizyonId), durum], yeni);
      duzenlemeYaz(null);
      gecmisYaz([]);
      cakismaYaz(false);
      bildir('tamam', 'Yüzey işaretleri kaydedildi.');
    },
    onError: (h) => {
      if (h instanceof ApiHatasi && h.durum === 409) { cakismaYaz(true); return; }
      bildir('hata', yetkiyse(h, 'Yüzey işaretleri kaydedilemedi.'));
    },
  });

  // Görüntüye renkler: işlem görünümünde her işaretli yüz işleminin rengiyle, maske görünümünde yalnız maskeli yüzler.
  const renkler = useMemo(() => {
    const m = new Map<number, string>();
    for (const [sira, i] of isaretler) {
      if (gorunum === 'maske' && i.islem.tur !== 'maske') continue;
      m.set(sira, islemOf.get(islemAnahtari(i.islem))?.renk ?? MASKE_RENGI);
    }
    return m;
  }, [isaretler, islemOf, gorunum]);

  const hazir = yuzDurumu === 'hazir';
  const tiklama = hazir && yazabilir;
  const bilgi = c === undefined || c.neden !== null ? null
    : yuzDurumu === 'yok' ? 'Bu dosyada modelde yüz gösterilmez; yüzleri aşağıdaki gruplardan boyayın.'
      : yuzDurumu === 'uyusmuyor' ? 'Modeldeki yüz sırası hesapla doğrulanamadı; modelde boyama ve tıklama kapalı. Yüzleri aşağıdaki gruplardan boyayın.'
        : !hazir ? null
          : !yazabilir ? 'Yalnız okuma: işaretler görünür, değiştirilemez.'
            : gorunum === 'maske' ? 'Taralı yüzler maskelenir. Boya istasyonunda bu görünüm kullanılır.'
              : etkinFirca === SIL ? 'Silgi: tıkladığınız yüzün işareti kalkar.'
                : `Fırça: ${fircaSatiri?.ad ?? ''}. Modelde yüze tıklayın, yüz hemen boyanır. Görünmeyen yüzler aşağıdaki gruplardan.`;
  const renkAnahtari = JSON.stringify([...renkler]);
  // Sahnedeki tıklama ve Geri al her çizimde güncel işaretlerle çalışsın diye ref üzerinden çağrılır; sahne yalnız görünen şey değişince yeniden kurulur.
  const guncel = useRef({ yuzeDokun, geriAl });
  guncel.current = { yuzeDokun, geriAl };
  const dokun = useCallback((sira: number) => guncel.current.yuzeDokun(sira), []);
  const geri = useCallback(() => guncel.current.geriAl(), []);
  const sahneAnahtari = `${String(tiklama)}:${etkinFirca}:${renkAnahtari}:${String(gecmis.length > 0)}:${fircalar.map((f) => f.anahtar).join(',')}`;
  useEffect(() => {
    if (c === undefined || c.neden !== null) { sahneYaz(null); return; }
    const arac = (
      <>
        {yazabilir && hazir ? (
          <div className="tc-g3b-yz-firca" role="group" aria-label="Fırça">
            {fircalar.map((f) => (
              <Dugme key={f.anahtar} aria-pressed={etkinFirca === f.anahtar} title={f.ad} onClick={() => fircaYaz(f.anahtar)}>
                <RenkIsareti satir={f} />{f.kisa}
              </Dugme>
            ))}
            <Dugme simge="trash" aria-pressed={etkinFirca === SIL} onClick={() => fircaYaz(SIL)}>Silgi</Dugme>
          </div>
        ) : <span />}
        {hazir && (
          <div className="tc-g3b-yz-firca">
            {yazabilir && <Dugme simge="back" disabled={gecmis.length === 0} onClick={geri}>Geri al</Dugme>}
            <Dugme simge="eye" aria-pressed={gorunum === 'maske'} onClick={() => gorunumYaz((g) => (g === 'maske' ? 'islem' : 'maske'))}>Yalnız maske</Dugme>
          </div>
        )}
      </>
    );
    sahneYaz({ boyasi: { alanlar: c.yuzler.map((y) => y.alanMm2), renkler, secili: new Set(), sec: tiklama ? dokun : null }, arac, bilgi });
    // renkler, fırça ve geçmiş içerikle izlenir (anahtar); her çizimde yeni nesne sahneyi yeniden kurdurmasın.
  }, [c, hazir, gorunum, yazabilir, bilgi, sahneAnahtari, sahneYaz, dokun, geri]);
  useEffect(() => () => sahneYaz(null), [sahneYaz]);

  const maskeResmi = async () => {
    if (resimAl === null) return;
    resimAliniyorYaz(true);
    gorunumYaz('maske');
    try {
      // Görünüm değişikliği çizilsin diye iki kare beklenir.
      await new Promise<void>((coz) => requestAnimationFrame(() => requestAnimationFrame(() => coz())));
      const resim = await resimAl();
      if (resim === null) { bildir('hata', 'Maske resmi alınamadı.'); return; }
      const adres = URL.createObjectURL(resim);
      const a = document.createElement('a');
      a.href = adres;
      a.download = `maske-${revKodu === null ? '' : `rev-${revKodu}-`}${String(revizyonId)}.png`;
      a.click();
      URL.revokeObjectURL(adres);
    } finally {
      resimAliniyorYaz(false);
    }
  };

  const rozetler = (
    <>
      {revKodu !== null && <Rozet ton={c?.tasima ? 'uyari' : 'pasif'}>Rev {revKodu}</Rozet>}
      <Rozet ton="uyari">Öneri</Rozet>
    </>
  );
  const kart = (govde: ReactNode) => (
    <div className="tc-g3b-yz">
      <Kart baslik="Boya ve maske" simge="edit" baslikEki={rozetler}>{govde}</Kart>
    </div>
  );
  if (surer) return kart(<p className="tc-g3b-soluk">Hesap sürüyor; yüzler gelince burada boyanabilir.</p>);
  if (sorgu.isPending) return kart(<DurumKutusu durum="yukleniyor" />);
  if (sorgu.isError) return kart(<DurumKutusu durum="hata" mesaj={yetkiyse(sorgu.error, 'Yüzey işaretleri okunamadı.')} yenile={() => { void sorgu.refetch(); }} />);
  const v = sorgu.data;
  if (v.neden === 'analiz-yok') return kart(<DurumKutusu durum="bos" mesaj="Analiz bitince modelin yüzleri burada boyanabilir." />);
  if (v.neden === 'yuz-yok') return kart(<DurumKutusu durum="bos" mesaj="Bu modelin yüzleri okunamadı; yüzey işaretlenemez. Ölçüler Analiz kartında." />);

  const rotaYok = v.rota.adimlar.length === 0;
  const tumYuzler = v.yuzler.map((y) => y.sira);
  const alanOf = (liste: readonly number[]) => liste.reduce((t, s) => t + (yuzAlani.get(s) ?? 0), 0);
  const yuzleri = (anahtar: string) => [...isaretler].filter(([, i]) => islemAnahtari(i.islem) === anahtar).map(([s]) => s);
  const tamMaske = (g: YuzGrubu) => g.yuzler.every((s) => isaretler.get(s)?.islem.tur === 'maske');
  // Tamamını boya: ilk boya adımı, yoksa rotanın ilk adımı.
  const boyaAdimi = fircalar.find((i) => i.adim?.sartname.kategoriKodu === 'BYA') ?? fircalar.find((i) => i.adim !== null) ?? null;
  const delikGruplari = gruplar.filter((g) => g.tapa > 0);
  const delikSayisi = delikGruplari.reduce((t, g) => t + g.tapa, 0);
  const altGrubu = gruplar.find((g) => g.bant) ?? null;
  const bos = v.yuzler.filter((y) => !isaretler.has(y.sira));
  const onayla = () => degistir((m) => { for (const [s, i] of m) if (i.oneri) m.set(s, { ...i, oneri: false }); });

  // Hesap: adet en az 1; kalınlık, yoğunluk ve verim yazıldıysa o, yazılmadıysa adımın şartnamesinden.
  const adetSayisi = Math.max(1, Math.floor(pozitifSayi(adet) ?? 1));
  const boyaAdimlari = islemler.filter((i) => i.adim?.sartname.kategoriKodu === 'BYA');
  const sartnameDegeri = (i: IslemSatiri, alan: HesapAlani) => (i.adim === null ? null : sartnameSayisi(i.adim.parametreler, alan));
  const degeri = (i: IslemSatiri, alan: HesapAlani): number | null => {
    const e = elle[alan];
    return e === undefined ? sartnameDegeri(i, alan) : pozitifSayi(e);
  };
  const ortakDeger = (alan: HesapAlani): { deger: number | null; kod: string | null; farkli: boolean } => {
    const d = boyaAdimlari.map((i) => ({ x: sartnameDegeri(i, alan), kod: i.adim?.sartname.kod ?? null })).filter((x) => x.x !== null);
    const farkli = new Set(d.map((x) => x.x)).size > 1;
    return { deger: farkli ? null : (d[0]?.x ?? null), kod: farkli ? null : (d[0]?.kod ?? null), farkli };
  };

  const sutunlar: Sutun<Yuz>[] = [
    { anahtar: 'no', baslik: 'No', hucre: (y) => y.sira, hizala: 'sag', mono: true },
    { anahtar: 'tur', baslik: 'Tür', hucre: (y) => `${YUZ_TURU_ADI[y.tur]}${y.ters ? ' iç' : ''}` },
    { anahtar: 'alan', baslik: 'Alan mm²', hucre: (y) => uzunluk(y.alanMm2), hizala: 'sag', mono: true },
    {
      anahtar: 'islem', baslik: 'İşlem',
      hucre: (y) => {
        const i = isaretler.get(y.sira);
        const s = i ? islemOf.get(islemAnahtari(i.islem)) : undefined;
        return s === undefined ? '—' : (
          <span className="tc-g3b-yz-hucre"><RenkIsareti satir={s} />{s.kisa}{i?.oneri ? <Rozet ton="uyari">Öneri</Rozet> : null}</span>
        );
      },
      csv: (y) => { const i = isaretler.get(y.sira); return i ? (islemOf.get(islemAnahtari(i.islem))?.kisa ?? null) : null; },
    },
    ...(yazabilir ? [{
      anahtar: 'firca', baslik: 'Fırça', csv: false as const,
      hucre: (y: Yuz) => (
        <Dugme aria-label={`Yüz ${String(y.sira)}: ${fircaSatiri?.kisa ?? 'Temizle'}`} onClick={() => uygula([y.sira], etkinFirca)}>
          <FircaIsareti satir={fircaSatiri} />{fircaSatiri?.kisa ?? 'Temizle'}
        </Dugme>
      ),
    }] : []),
  ];
  const sayfaSatirlari = v.yuzler.slice((sayfa - 1) * SAYFA_BOYU, sayfa * SAYFA_BOYU);
  const sonKayit = v.guncelleme === null ? 'Henüz kaydedilmedi.' : `Son kayıt: ${tarihSaatMetni(v.guncelleme)}${v.guncelleyen?.ad ? `, ${v.guncelleyen.ad}` : ''}`;
  const tapa = delikGruplari.filter(tamMaske).reduce((t, g) => t + g.tapa, 0);
  const bantYuzu = altGrubu !== null && tamMaske(altGrubu) ? altGrubu.yuzler.length : 0;
  const delikOzeti = delikGruplari.map((g) => g.ad.replace(/^Delik /, '').replace(/ × \d+$/, '')
    + ` × ${String(g.tapa)}`).join(', ');
  let adimNo = 0;

  return kart(
    <>
      {v.tasima !== null && oneriVar && (
        <div className="tc-g3b-yz-serit" role="status">
          <Simge ad="alert" />
          <span>Önceki revizyondaki işaretler öneri olarak getirildi: {v.tasima.eslesen} yüz eşleşti, {v.tasima.eslesmeyen} yüz eşleşmedi ve işaretsiz kaldı. Bakıp onaylayın; onaya kadar maske resmine ve boya istasyonuna gitmez.</span>
          {yazabilir && <Dugme tur="birincil" simge="check" onClick={onayla}>Onayla</Dugme>}
        </div>
      )}
      {v.tasima !== null && !oneriVar && duzenleme !== null && (
        <div className="tc-g3b-yz-serit tc-g3b-yz-tamam" role="status"><Simge ad="check" /><span>Getirilen öneriler onaylandı. Kaydedince bu revizyonun işaretleri geçerli olur.</span></div>
      )}
      {cakisma && (
        <div className="tc-g3b-yz-serit tc-g3b-yz-hata" role="alert">
          <Simge ad="alert" />
          <span>Bu işaretler siz açtıktan sonra başka biri tarafından değiştirildi. Kaydedilmedi; güncelini okuyup yeniden deneyin.</span>
          <Dugme simge="rotate" onClick={() => { duzenlemeYaz(null); gecmisYaz([]); cakismaYaz(false); void sorgu.refetch(); }}>Günceli oku</Dugme>
        </div>
      )}
      {!yetki.var('geometri.yuzey-yaz') && (
        <div className="tc-g3b-yz-serit" role="status"><Simge ad="lock" /><span>Yalnız okuma: işaretleri değiştirme yetkiniz yok.</span></div>
      )}
      {rotaYok && (
        <div className="tc-g3b-yz-serit" role="status">
          <Simge ad="route" />
          <span>{v.rota.durum === 'rota-bagli-degil'
            ? 'Rota bağlantısı kurulu değil; yalnız maske işaretlenebilir.'
            : 'Bu malzemenin rotasında boya, kaplama ya da yüzey hazırlama adımı yok. Önce rotaya adım ekleyin; o zamana kadar yalnız maske işaretlenir.'}</span>
          {v.rota.durum !== 'rota-bagli-degil' && <Dugme simge="route" onClick={() => { void git('/recete-rota/schema'); }}>Reçete ve Rota'yı aç</Dugme>}
        </div>
      )}
      <div className="tc-g3b-yz-adimlar">
        {yazabilir && (
          <section aria-label="Hızlı başla">
            <AdimBasligi no={++adimNo}>Hızlı başla</AdimBasligi>
            <div className="tc-g3b-yz-hizli">
              <Dugme simge="edit" disabled={boyaAdimi === null} onClick={() => { if (boyaAdimi !== null) uygula(tumYuzler, boyaAdimi.anahtar); }}>
                <span>Tamamını boya<small>{boyaAdimi === null ? 'Rotada adım yok' : `Bütün yüzler: ${boyaAdimi.ad}`}</small></span>
              </Dugme>
              <Dugme simge="target" disabled={delikSayisi === 0} onClick={() => uygula(delikGruplari.flatMap((g) => g.yuzler), 'maske')}>
                <span>Delikleri maskele<small>{delikSayisi === 0 ? 'Özelliklerde delik yok' : `${String(delikSayisi)} delik: ${delikOzeti} (tapa)`}</small></span>
              </Dugme>
              <Dugme simge="layers" disabled={altGrubu === null} onClick={() => { if (altGrubu !== null) uygula(altGrubu.yuzler, 'maske'); }}>
                <span>Oturma yüzünü maskele<small>{altGrubu === null ? 'Alt yüz modelden ayrılamadı' : 'Alt yüz (bant)'}</small></span>
              </Dugme>
              <Dugme tur="tehlike" simge="trash" disabled={isaretler.size === 0} onClick={() => uygula(tumYuzler, SIL)}>
                <span>Hepsini temizle<small>Bütün işaretler kalkar</small></span>
              </Dugme>
            </div>
          </section>
        )}
        <section aria-label="Yüz grupları">
          <AdimBasligi no={++adimNo}>Yüz grupları {yazabilir && <span className="tc-g3b-soluk">(dokununca fırça uygulanır)</span>}</AdimBasligi>
          <ul className="tc-g3b-yz-gruplar">
            {gruplar.map((g) => {
              const say = new Map<string, number>();
              for (const s of g.yuzler) { const i = isaretler.get(s); const a = i ? islemAnahtari(i.islem) : 'bos'; say.set(a, (say.get(a) ?? 0) + 1); }
              const cok = g.yuzler.length > 1;
              return (
                <li key={g.anahtar} className="tc-g3b-yz-grup">
                  <Simge ad={g.simge} />
                  <strong className="tc-g3b-yz-grup-ad">{g.ad}</strong>
                  <span className="tc-g3b-yz-sayi">{m2Metni(alanOf(g.yuzler))}</span>
                  <span className="tc-g3b-yz-grup-durum">
                    {[...say].map(([a, n]) => {
                      const s = islemOf.get(a);
                      return (
                        <span key={a} className="tc-g3b-yz-cip">
                          {s !== undefined && <RenkIsareti satir={s} />}{s?.kisa ?? 'İşaretsiz'}{cok ? ` ${String(n)}` : ''}
                        </span>
                      );
                    })}
                    {yazabilir && (
                      <Dugme className="tc-g3b-yz-grup-dugme" aria-label={`${g.ad}: ${fircaSatiri?.kisa ?? 'Temizle'}`} onClick={() => uygula(g.yuzler, etkinFirca)}>
                        <FircaIsareti satir={fircaSatiri} />{fircaSatiri?.kisa ?? 'Temizle'}
                      </Dugme>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {normaller === null && <p className="tc-g3b-soluk tc-g3b-oz-not">Üst, alt ve yan yüzler model görüntüde açılınca ayrılır.</p>}
        </section>
      </div>
      <section aria-label="Hesap">
        <AdimBasligi no={++adimNo}>Hesap</AdimBasligi>
        <div className="tc-g3b-yz-parti">
          <Girdi etiket="Adet (parti)" inputMode="numeric" placeholder="1" value={adet} onChange={(o) => adetYaz(o.target.value)} />
          {HESAP_ALANLARI.map(({ alan, etiket, ornek }) => {
            const o = ortakDeger(alan);
            const e = elle[alan];
            const ipucu = e !== undefined ? undefined : o.farkli ? 'Adıma göre şartnameden' : o.kod !== null ? `Şartnameden (${o.kod})` : undefined;
            return (
              <Girdi key={alan} etiket={etiket} inputMode="decimal" placeholder={ornek} ipucu={ipucu}
                value={e ?? (o.deger === null ? '' : uzunluk(o.deger))} onChange={(x) => elleYaz((m) => ({ ...m, [alan]: x.target.value }))} />
            );
          })}
        </div>
        <div className="tc-g3b-yz-hesap">
          {islemler.filter((i) => i.islem.tur !== 'maske').map((i) => {
            const a = alanlar.islemler.get(i.anahtar);
            const s = a?.alanMm2 ?? 0;
            const boya = i.adim?.sartname.kategoriKodu === 'BYA';
            const kg = boya ? tozKg(s, degeri(i, 'kalinlik'), degeri(i, 'yogunluk'), degeri(i, 'verim'), adetSayisi) : null;
            return (
              <div key={i.anahtar} className={`tc-g3b-yz-kutu${i.kalkan ? ' tc-g3b-yz-uyar' : ''}`}>
                <span className="tc-g3b-yz-etiket">{i.kalkan ? <Simge ad="alert" /> : <RenkIsareti satir={i} />}{i.ad}</span>
                <span className="tc-g3b-yz-buyuk">{m2Kisa(s * adetSayisi)}</span>
                <span className="tc-g3b-soluk">{adetSayisi > 1 ? `${m2Metni(s)} × ${String(adetSayisi)} adet · ` : ''}{a?.yuzSayisi ?? 0} yüz</span>
                {boya && <span className="tc-g3b-soluk">{kg === null ? 'Toz miktarı için kalınlık, yoğunluk ve verimi yazın' : `Toz ≈ ${tozMetni(kg)}`}</span>}
                {i.kalkan && <span className="tc-g3b-soluk">Adım ya da şartnamesi rotadan kalktı; işaret silinmedi, yeniden boyayın ya da silin.</span>}
              </div>
            );
          })}
          <div className="tc-g3b-yz-kutu">
            <span className="tc-g3b-yz-etiket"><RenkIsareti satir={MASKE} />Maske</span>
            <span className="tc-g3b-yz-buyuk">{m2Kisa(alanOf(yuzleri('maske')) * adetSayisi)}</span>
            <span className="tc-g3b-soluk">{tapa > 0 ? `${String(tapa * adetSayisi)} tapa` : 'Tapa yok'}{bantYuzu > 0 ? ` · ${String(bantYuzu * adetSayisi)} bant yüzü` : ''}</span>
            <span className="tc-g3b-soluk">{yuzleri('maske').length} yüz</span>
          </div>
          <div className={`tc-g3b-yz-kutu${bos.length > 0 ? ' tc-g3b-yz-uyar' : ''}`}>
            <span className="tc-g3b-yz-etiket"><Simge ad={bos.length > 0 ? 'alert' : 'check'} />İşaretsiz</span>
            <span className="tc-g3b-yz-buyuk">{bos.length} yüz</span>
            <span className="tc-g3b-soluk">{m2Metni(alanlar.isaretsizMm2)} · toplam yüzey {m2Metni(alanlar.toplamMm2)}</span>
            {bos.length > 0 && yazabilir && (
              <Dugme simge="edit" onClick={() => uygula(bos.map((y) => y.sira), etkinFirca === SIL ? (boyaAdimi?.anahtar ?? 'maske') : etkinFirca)}>Fırçayla doldur</Dugme>
            )}
          </div>
        </div>
        <p className="tc-g3b-soluk tc-g3b-oz-not">
          Toz miktarı = alan (m²) × kalınlık (µm) × yoğunluk (g/cm³) ÷ 1000 ÷ verim. Yalnız hesaptır, kaydedilmez. Kalınlık şartnamede yazılıysa oradan gelir.
        </p>
      </section>
      <details className="tc-g3b-yz-ayrinti">
        <summary><Simge ad="list" /> Yüz listesi (ayrıntı, {v.yuzler.length} yüz)</summary>
        <Tablo etiket="Yüzler" sutunlar={sutunlar} satirlar={sayfaSatirlari} satirAnahtari={(y) => y.sira}
          sayfalama={v.yuzler.length > SAYFA_BOYU ? { sayfa, sayfaBoyu: SAYFA_BOYU, toplam: v.yuzler.length, degistir: sayfaYaz } : undefined} />
      </details>
      <div className="tc-g3b-yz-alt-cubuk">
        <span className="tc-g3b-soluk">{duzenleme !== null ? 'Kaydedilmemiş değişiklik var.' : sonKayit}</span>
        <span className="tc-g3b-yz-eylem">
          <Dugme simge="download" yukleniyor={resimAliniyor} disabled={oneriVar || !hazir || resimAl === null}
            title={oneriVar ? 'Önce önerileri onaylayın' : !hazir ? 'Modelde yüz gösterilemiyor' : undefined} onClick={() => { void maskeResmi(); }}>
            Maske resmi (PNG)
          </Dugme>
          {yazabilir && (
            <Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} disabled={duzenleme === null || cakisma}
              onClick={() => kaydet.mutate({ surum: v.surum, isaretler: [...isaretler].map(([yuzSira, i]) => ({ yuzSira, islem: i.islem, oneri: i.oneri })) })}>
              Kaydet
            </Dugme>
          )}
        </span>
      </div>
    </>,
  );
}
