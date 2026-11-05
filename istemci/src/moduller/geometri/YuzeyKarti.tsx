import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  GeometriDurumu, GeometriYuzeyAdimi, GeometriYuzeyCevabi, GeometriYuzeyIslemi, GeometriYuzeyKaydetGovdesi,
} from '#paylasilan/sozlesme/geometri.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  ISLEM_RENKLERI, islemAnahtari, kuralYuzleri, m2Metni, MASKE_RENGI, suruyorMu, taslakAlanlari, uzunluk, YUZ_TURU_ADI,
  type TaslakIsaret, type YuzKurali,
} from './gorunum.ts';
import type { ResimAl, YuzBoyasi, YuzDurumu } from './Goruntu3B.tsx';

// Kartın görüntüye verdiği: yüz renkleri, seçim ve sahnenin üstündeki araç çubuğu.
export interface YuzeySahnesi { boyasi: Omit<YuzBoyasi, 'durumYaz'>; arac: ReactNode; bilgi: string | null }

type Yuz = GeometriYuzeyCevabi['yuzler'][number];
interface IslemSatiri {
  anahtar: string;
  islem: GeometriYuzeyIslemi;
  renk: string;
  ad: string;
  kisa: string;
  alt: string;
  // Rotadan kalkan adımın işareti: listede uyarıyla durur, yeni yüze atanamaz.
  kalkan: boolean;
}

const SAYFA_BOYU = 50;
const KURALLAR: readonly { kural: YuzKurali; baslik: string; simge: 'target' | 'cube' | 'layers' | 'list' }[] = [
  { kural: 'delik', baslik: 'Delik içleri', simge: 'target' },
  { kural: 'dis', baslik: 'Dış silindirler', simge: 'cube' },
  { kural: 'duzlem', baslik: 'Düzlemler', simge: 'layers' },
  { kural: 'bos', baslik: 'İşaretsizler', simge: 'list' },
];

const yetkiyse = (hata: unknown, ekran: string): string =>
  hata instanceof ApiHatasi && hata.durum === 403 ? 'Yüzey işaretleri için yetkiniz yok.' : hataIletisi(hata, ekran);

const adimSatiri = (a: GeometriYuzeyAdimi, k: number): IslemSatiri => {
  const islem: GeometriYuzeyIslemi = { tur: 'rota', opNo: a.opNo, sartnameId: a.sartname.id };
  return {
    anahtar: islemAnahtari(islem), islem, renk: ISLEM_RENKLERI[k % ISLEM_RENKLERI.length] ?? '--grafik',
    ad: `Adım ${String(a.opNo)} · ${a.sartname.ad}`, kisa: `Adım ${String(a.opNo)}`,
    alt: `${a.sartname.kod} · ${a.fason ? 'Fason' : 'İç'} · ${a.talimatVar ? 'talimat var' : 'talimat yok'}`, kalkan: false,
  };
};
const MASKE: IslemSatiri = {
  anahtar: 'maske', islem: { tur: 'maske' }, renk: MASKE_RENGI, ad: 'Maske', kisa: 'Maske', alt: 'Rotada adım değil; işlem uygulanmayacak yüzler', kalkan: false,
};

function sunucuTaslagi(c: GeometriYuzeyCevabi): Map<number, TaslakIsaret> {
  return new Map(c.isaretler.map((i) => [i.yuzSira, { islem: i.islem, oneri: i.oneri }]));
}

// Renk sınıfı değişkenin sırasıdır (geometri.css tc-g3b-yz-r0..4); maske taralıdır.
function RenkIsareti({ satir }: { satir: IslemSatiri }) {
  const no = ISLEM_RENKLERI.indexOf(satir.renk as (typeof ISLEM_RENKLERI)[number]);
  return <span className={`tc-g3b-yz-renk ${satir.islem.tur === 'maske' || no < 0 ? 'tc-g3b-yz-maske' : `tc-g3b-yz-r${String(no)}`}`} aria-hidden="true" />;
}

// Yüzey işlemleri (2144, prototip v2): boya, kaplama ve maske yüzleri. İşlem listesi yürürlükteki rotadandır (2140-3); bir yüz tek
// işleme atanır, maske "işlem uygulanmaz" demektir (2144-1 a). Önceki revizyondan taşınan işaretler öneridir, onaylanana kadar
// maske resmine girmez (2140-4 a). Sunucuya yalnız Kaydet gider; işaretler bütün olarak yazılır.
export function YuzeyKarti({ revizyonId, durum, harf, yuzDurumu, sahneYaz, resimAl }: {
  revizyonId: number; durum: GeometriDurumu; harf: string | null; yuzDurumu: YuzDurumu;
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
  const c = sorgu.data;
  // Düzenleme yoksa ekran sunucudaki işaretleri gösterir; ilk değişiklikte kopyası alınır.
  const [duzenleme, duzenlemeYaz] = useState<Map<number, TaslakIsaret> | null>(null);
  const [cakisma, cakismaYaz] = useState(false);
  const [secili, seciliYaz] = useState<ReadonlySet<number>>(new Set());
  const [etkin, etkinYaz] = useState<string | null>(null);
  const [gorunum, gorunumYaz] = useState<'islem' | 'maske'>('islem');
  const [seciyor, seciyorYaz] = useState(false);
  const [sayfa, sayfaYaz] = useState(1);
  const [resimAliniyor, resimAliniyorYaz] = useState(false);

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
        ad: `Adım ${String(i.islem.opNo)} (rotada yok)`, kisa: `Adım ${String(i.islem.opNo)}`,
        alt: 'Adım ya da şartnamesi rotadan kalktı; işaret silinmedi, yeniden atayın ya da kaldırın', kalkan: true,
      });
    }
    return [...rota, ...kalkan.values(), MASKE];
  }, [c, isaretler]);
  const islemOf = useMemo(() => new Map(islemler.map((i) => [i.anahtar, i])), [islemler]);
  const atanabilir = islemler.filter((i) => !i.kalkan);
  // 'kaldir': seçili yüzlerin işareti kalkar.
  const etkinAnahtar = etkin !== null && (etkin === 'kaldir' || atanabilir.some((i) => i.anahtar === etkin)) ? etkin : (atanabilir[0]?.anahtar ?? 'maske');
  const alanlar = useMemo(() => taslakAlanlari(c?.yuzler ?? [], isaretler), [c, isaretler]);
  const oneriVar = [...isaretler.values()].some((i) => i.oneri);
  const yuzAlani = useMemo(() => new Map((c?.yuzler ?? []).map((y) => [y.sira, y.alanMm2])), [c]);
  const seciliAlan = [...secili].reduce((t, s) => t + (yuzAlani.get(s) ?? 0), 0);

  const degistir = (f: (m: Map<number, TaslakIsaret>) => void) => {
    const m = new Map(isaretler);
    f(m);
    duzenlemeYaz(m);
  };
  const sec = (sira: number) => seciliYaz((s) => { const y = new Set(s); if (!y.delete(sira)) y.add(sira); return y; });

  const kaydet = useKorumaliKomut<GeometriYuzeyKaydetGovdesi, GeometriYuzeyCevabi>({
    gonder: (g, d) => api.post<GeometriYuzeyCevabi>(`/geometri/yuzey/${String(revizyonId)}/kaydet`, g, d),
    onSuccess: (yeni) => {
      istemci.setQueryData([...anahtarlar.yuzey(revizyonId), durum], yeni);
      duzenlemeYaz(null);
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
  const tiklama = hazir && yazabilir && seciyor;
  const bilgi = c === undefined || c.neden !== null ? null
    : yuzDurumu === 'yok' ? 'Bu dosyada modelde yüz gösterilmez; yüzleri aşağıdaki listeden seçin.'
      : yuzDurumu === 'uyusmuyor' ? 'Modeldeki yüz sırası hesapla doğrulanamadı; modelde boyama ve tıklama kapalı. Yüzleri aşağıdaki listeden seçin.'
        : !hazir ? null
          : tiklama ? `Yüz seçme açık: tıklanan yüz seçime girer ya da çıkar. ${String(secili.size)} yüz seçili. Görünmeyen yüzler listeden seçilir.`
            : gorunum === 'maske' ? 'Taralı yüzler maskelenir. Boya istasyonunda bu görünüm kullanılır.'
              : 'Yüzler atanan işlemin rengiyle boyanır; renk yalnız ekranda ayırt etmek içindir.';
  const seciliAnahtari = [...secili].join(',');
  const renkAnahtari = JSON.stringify([...renkler]);
  useEffect(() => {
    if (c === undefined || c.neden !== null) { sahneYaz(null); return; }
    const arac = hazir ? (
      <>
        <Dugme simge="drop" aria-pressed={gorunum === 'islem'} onClick={() => gorunumYaz('islem')}>İşlemler</Dugme>
        <Dugme simge="eye" aria-pressed={gorunum === 'maske'} onClick={() => gorunumYaz('maske')}>Yalnız maske</Dugme>
        {yazabilir && <Dugme simge="pin" aria-pressed={seciyor} onClick={() => seciyorYaz((x) => !x)}>Yüz seç</Dugme>}
      </>
    ) : null;
    sahneYaz({ boyasi: { alanlar: c.yuzler.map((y) => y.alanMm2), renkler, secili, sec: tiklama ? sec : null }, arac, bilgi });
    // renkler ve secili içerikle izlenir (anahtar); her çizimde yeni nesne sahneyi yeniden kurdurmasın.
  }, [c, hazir, gorunum, yazabilir, seciyor, tiklama, bilgi, renkAnahtari, seciliAnahtari, sahneYaz]);
  useEffect(() => () => sahneYaz(null), [sahneYaz]);

  const maskeResmi = async () => {
    if (resimAl === null) return;
    resimAliniyorYaz(true);
    gorunumYaz('maske');
    seciliYaz(new Set());
    try {
      // Görünüm değişikliği çizilsin diye iki kare beklenir.
      await new Promise<void>((coz) => requestAnimationFrame(() => requestAnimationFrame(() => coz())));
      const resim = await resimAl();
      if (resim === null) { bildir('hata', 'Maske resmi alınamadı.'); return; }
      const adres = URL.createObjectURL(resim);
      const a = document.createElement('a');
      a.href = adres;
      a.download = `maske-${harf === null ? '' : `rev-${harf}-`}${String(revizyonId)}.png`;
      a.click();
      URL.revokeObjectURL(adres);
    } finally {
      resimAliniyorYaz(false);
    }
  };

  const rozetler = (
    <>
      {harf !== null && <Rozet ton={c?.tasima ? 'uyari' : 'pasif'}>Rev {harf}</Rozet>}
      <Rozet ton="uyari">Öneri</Rozet>
    </>
  );
  const kart = (govde: ReactNode) => (
    <div className="tc-g3b-yz">
      <Kart baslik="Yüzey işlemleri" simge="drop" baslikEki={rozetler}>{govde}</Kart>
    </div>
  );
  if (surer) return kart(<p className="tc-g3b-soluk">Hesap sürüyor; yüzler gelince burada seçilebilir.</p>);
  if (sorgu.isPending) return kart(<DurumKutusu durum="yukleniyor" />);
  if (sorgu.isError) return kart(<DurumKutusu durum="hata" mesaj={yetkiyse(sorgu.error, 'Yüzey işaretleri okunamadı.')} yenile={() => { void sorgu.refetch(); }} />);
  const v = sorgu.data;
  if (v.neden === 'analiz-yok') return kart(<DurumKutusu durum="bos" mesaj="Analiz bitince modelin yüzleri burada seçilebilir." />);
  if (v.neden === 'yuz-yok') return kart(<DurumKutusu durum="bos" mesaj="Bu modelin yüzleri okunamadı; yüzey işaretlenemez. Ölçüler Analiz kartında." />);

  const rotaYok = v.rota.adimlar.length === 0;
  const sutunlar: Sutun<Yuz>[] = [
    ...(yazabilir ? [{
      anahtar: 'sec', baslik: 'Seç', csv: false as const,
      hucre: (y: Yuz) => <input type="checkbox" aria-label={`Yüz ${String(y.sira)}`} checked={secili.has(y.sira)} onChange={() => sec(y.sira)} />,
    }] : []),
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
  ];
  const sayfaSatirlari = v.yuzler.slice((sayfa - 1) * SAYFA_BOYU, sayfa * SAYFA_BOYU);
  const sonKayit = v.guncelleme === null ? 'Henüz kaydedilmedi.' : `Son kayıt: ${tarihSaatMetni(v.guncelleme)}${v.guncelleyen?.ad ? `, ${v.guncelleyen.ad}` : ''}`;
  const onayla = (anahtar: string | null) => degistir((m) => {
    for (const [s, i] of m) if (i.oneri && (anahtar === null || islemAnahtari(i.islem) === anahtar)) m.set(s, { ...i, oneri: false });
  });
  const ata = (anahtar: string) => {
    const hedef = islemOf.get(anahtar);
    degistir((m) => { for (const s of secili) { if (hedef === undefined) m.delete(s); else m.set(s, { islem: hedef.islem, oneri: false }); } });
    seciliYaz(new Set());
  };

  return kart(
    <>
      {v.tasima !== null && oneriVar && (
        <div className="tc-g3b-yz-serit" role="status">
          <Simge ad="alert" />
          <span>Önceki revizyondaki işaretler öneri olarak taşındı: {v.tasima.eslesen} yüz eşleşti, {v.tasima.eslesmeyen} yüz eşleşmedi ve işaretsiz kaldı. Öneriler onaylanana kadar maske resmine ve boya istasyonuna gitmez.</span>
          {yazabilir && <Dugme simge="check" onClick={() => onayla(null)}>Tümünü onayla</Dugme>}
        </div>
      )}
      {v.tasima !== null && !oneriVar && duzenleme !== null && (
        <div className="tc-g3b-yz-serit tc-g3b-yz-tamam" role="status"><Simge ad="check" /><span>Taşınan öneriler onaylandı. Kaydedince bu revizyonun işaretleri geçerli olur.</span></div>
      )}
      {cakisma && (
        <div className="tc-g3b-yz-serit tc-g3b-yz-hata" role="alert">
          <Simge ad="alert" />
          <span>Bu işaretler siz açtıktan sonra başka biri tarafından değiştirildi. Kaydedilmedi; güncelini okuyup yeniden deneyin.</span>
          <Dugme simge="rotate" onClick={() => { duzenlemeYaz(null); cakismaYaz(false); void sorgu.refetch(); }}>Günceli oku</Dugme>
        </div>
      )}
      {!yetki.var('geometri.yuzey-yaz') && (
        <div className="tc-g3b-yz-serit" role="status"><Simge ad="lock" /><span>Yalnız okuma: işaretleri değiştirme yetkiniz yok.</span></div>
      )}
      <div className="tc-g3b-yz-ikili">
        <section aria-label="İşlemler">
          <h3 className="tc-g3b-oz-grup"><Simge ad="drop" /> İşlemler</h3>
          {rotaYok && (
            <div className="tc-g3b-mo-bos">
              <p className="tc-g3b-soluk">{v.rota.durum === 'rota-bagli-degil'
                ? 'Rota bağlantısı kurulu değil; yalnız maske işaretlenebilir.'
                : 'Bu malzemenin rotasında boya, kaplama ya da yüzey hazırlama adımı yok. Önce rotaya adım ekleyin.'}</p>
              {v.rota.durum !== 'rota-bagli-degil' && <Dugme simge="route" onClick={() => { void git('/recete-rota/schema'); }}>Reçete ve Rota'yı aç</Dugme>}
            </div>
          )}
          <ul className="tc-g3b-yz-islemler">
            {islemler.map((i) => {
              const a = alanlar.islemler.get(i.anahtar);
              const oneriSay = [...isaretler.values()].filter((x) => x.oneri && islemAnahtari(x.islem) === i.anahtar).length;
              // Satıra dokunmak işlemi atanacak işlem yapar (prototip v2); rotadan kalkan adım atanamaz.
              const secilir = yazabilir && !i.kalkan;
              return (
                <li key={i.anahtar} className={`tc-g3b-yz-islem${secilir ? ' tc-g3b-yz-secilir' : ''}`} aria-current={i.anahtar === etkinAnahtar ? 'true' : undefined}
                  onClick={secilir ? () => etkinYaz(i.anahtar) : undefined}>
                  <RenkIsareti satir={i} />
                  <span className="tc-g3b-yz-ad">
                    {i.kalkan && <Simge ad="alert" />}
                    {secilir
                      ? <button type="button" className="tc-g3b-yz-ad-dugme" aria-pressed={i.anahtar === etkinAnahtar} title="Atanacak işlem yap">{i.ad}</button>
                      : <strong>{i.ad}</strong>}
                    {oneriSay > 0 && <Rozet ton="uyari">Öneri</Rozet>}
                  </span>
                  <span className="tc-g3b-yz-alan">{m2Metni(a?.alanMm2 ?? 0)}</span>
                  <span className="tc-g3b-yz-alt tc-g3b-soluk">{i.alt} · {a?.yuzSayisi ?? 0} yüz</span>
                  {yazabilir && (oneriSay > 0 || (a?.yuzSayisi ?? 0) > 0) && (
                    <span className="tc-g3b-yz-eylem" onClick={(o) => o.stopPropagation()}>
                      {oneriSay > 0 && <Dugme simge="check" onClick={() => onayla(i.anahtar)}>Onayla</Dugme>}
                      {(a?.yuzSayisi ?? 0) > 0 && (
                        <Dugme simge="pin" onClick={() => seciliYaz(new Set([...isaretler].filter(([, x]) => islemAnahtari(x.islem) === i.anahtar).map(([s]) => s)))}>
                          Yüzlerini seç
                        </Dugme>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {!rotaYok && <p className="tc-g3b-soluk tc-g3b-oz-not">Liste yürürlükteki rotadan gelir. Adım eklemek ya da şartnameyi değiştirmek rotada yapılır.</p>}
          <dl className="tc-g3b-degerler tc-g3b-yz-toplam">
            {islemler.filter((i) => i.islem.tur !== 'maske').map((i) => (
              <div key={i.anahtar}><dt>{i.ad}</dt><dd>{m2Metni(alanlar.islemler.get(i.anahtar)?.alanMm2 ?? 0)}</dd></div>
            ))}
            <div><dt>Maskelenen</dt><dd>{m2Metni(alanlar.islemler.get('maske')?.alanMm2 ?? 0)}</dd></div>
            <div><dt>İşaretsiz</dt><dd>{m2Metni(alanlar.isaretsizMm2)}</dd></div>
            <div><dt>Toplam yüzey</dt><dd>{m2Metni(alanlar.toplamMm2)}</dd></div>
          </dl>
        </section>
        <section aria-label="Yüz seçimi">
          <h3 className="tc-g3b-oz-grup"><Simge ad="pin" /> Yüz seçimi</h3>
          {yazabilir && (
            <>
              <div className="tc-g3b-yz-kurallar">
                {KURALLAR.map((k) => (
                  <Dugme key={k.kural} simge={k.simge} onClick={() => seciliYaz((s) => new Set([...s, ...kuralYuzleri(k.kural, v.yuzler, isaretler)]))}>{k.baslik}</Dugme>
                ))}
                <Dugme simge="x" disabled={secili.size === 0} onClick={() => seciliYaz(new Set())}>Seçimi kaldır</Dugme>
              </div>
              <div className="tc-g3b-yz-ata">
                <span><strong>{secili.size} yüz</strong> <span className="tc-g3b-soluk">{m2Metni(seciliAlan)}</span></span>
                <Secim etiket="Atanacak işlem" value={etkinAnahtar} onChange={(o) => etkinYaz(o.target.value)}
                  secenekler={[...atanabilir.map((i) => ({ deger: i.anahtar, baslik: i.ad })), { deger: 'kaldir', baslik: 'İşlemi kaldır' }]} />
                <Dugme tur="birincil" simge="drop" disabled={secili.size === 0} onClick={() => ata(etkinAnahtar)}>Ata</Dugme>
              </div>
            </>
          )}
          <Tablo etiket="Yüzler" sutunlar={sutunlar} satirlar={sayfaSatirlari} satirAnahtari={(y) => y.sira}
            sayfalama={v.yuzler.length > SAYFA_BOYU ? { sayfa, sayfaBoyu: SAYFA_BOYU, toplam: v.yuzler.length, degistir: sayfaYaz } : undefined} />
        </section>
      </div>
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
      <p className="tc-g3b-soluk tc-g3b-oz-not">
        Alanlar B-rep yüzlerinden hesaplanır. Bir yüz tek işleme atanır; maske bu yüze işlem uygulanmaz demektir. Rotadan kalkan adımın işaretleri
        uyarıyla gösterilir, kendiliğinden silinmez. İşaretler bu revizyona aittir; yeni revizyona öneri olarak taşınır.
      </p>
    </>,
  );
}
