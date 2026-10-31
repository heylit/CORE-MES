import { useState, type FormEvent, type ReactNode } from 'react';
import { Dugme, OnayPenceresi, Pencere, Rozet } from '../../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import { saatYaz, type Derleme, type OkunanPlan } from '../../motor/kurallar.ts';
import type { PlanlamaCalismasi, Siparis, Tezgah } from '../../tipler.ts';
import {
  GUN_AD, LISTE_TANIMI, ONCELIK, SIPARIS_SUZGECLERI, aparatlar, devamsizliklar, kapasiteMatrisi, karsilama, listeFormuOku, listeYaz, listedenSil,
  satinalmalar, siparisDurumu, siparisSuz, silmeEngeli, tedarikciler, type Aparat, type Karsilama, type ListeTuru, type SatinAlma, type SiparisSuzgeci,
  type Tedarikci,
} from './kurallar.ts';
import { KucukDugme, SahipDugmesi, SahipNotu, VeriKarti, VeriTablosu, sayiYazi, type Sutun } from './ortak.tsx';

// Sahibinden gelen kayıtların listeleri (02-orta.betik sSiparisler, sTezgahlar, sPersonel, sMalzeme, sFason; listeTablosu, TANIM). Kaynak verisi
// (sipariş, tezgâh, personel, devamsızlık, malzeme, satın alma, fasoncu) her açılışta sahibinden yeniden kurulur ve burada yalnız okunur: Yeni,
// Sil ve satır düzenlemesi yerinde ve pasiftir (222 a). Yalnız planlama çalışmasında duran kayıtlar (tedarikçi gecikmesi, aparat) çalışma komutuyla
// yazılır. Saat ücreti ve birim fiyat maliyet görünümüdür (223 a: finans.maliyet-oku).

export interface ListeOzellikleri {
  c: PlanlamaCalismasi;
  p: OkunanPlan | null;
  cx: Derleme | null;
  komut: CalismaKomutu | null;
  planYaz: boolean;
  maliyet: boolean;
  uyar: (ileti: string) => void;
  cizelgede: (siparis: string) => void;
}

const mono = (x: string) => <b className="mono">{x}</b>;
const islem = <S,>(hucre: (s: S) => ReactNode): Sutun<S> => ({ anahtar: 'islem', baslik: 'İşlem', gizliBaslik: true, hucre: (s) => <div className="tc-pyi-dugmeler">{hucre(s)}</div> });

// --- Siparişler ---
export function SiparisListesi({ c, p, cizelgede }: ListeOzellikleri) {
  const [suz, suzYaz] = useState<SiparisSuzgeci>('hepsi');
  const [ara, araYaz] = useState('');
  const D = c.D; const J = p?.J ?? null;
  const urunAd = (id: string) => D.urunler.find((u) => u.id === id)?.ad ?? id;
  const l = siparisSuz(D.siparisler, J ?? {}, suz, ara, urunAd);
  const sutunlar: Sutun<Siparis>[] = [
    { anahtar: 'id', baslik: 'Sipariş', hucre: (s) => mono(s.id) },
    { anahtar: 'urun', baslik: 'Ürün', hucre: (s) => urunAd(s.urun) },
    { anahtar: 'adet', baslik: 'Adet', sag: true, hucre: (s) => sayiYazi(s.adet) },
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (s) => s.termin ?? '—' },
    { anahtar: 'oncelik', baslik: 'Öncelik', hucre: (s) => { const o = ONCELIK[Number(s.oncelik)]; return o ? <Rozet ton={o[1]}>{o[0]}</Rozet> : '—'; } },
    { anahtar: 'serbest', baslik: 'Serbest', kirilmaz: true, hucre: (s) => s.serbest ?? 'hemen' },
    { anahtar: 'bitis', baslik: 'Planlanan bitiş', kirilmaz: true, hucre: (s) => (J?.[s.id]?.C != null ? saatYaz(D, J[s.id]?.C) : '—') },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => { const d = siparisDurumu(J, s.id); return d ? <Rozet ton={d.ton}>{d.ad}</Rozet> : '—'; } },
    islem((s) => (
      <>
        {p && <KucukDugme ad="Çizelgede göster" simge="gantt" yap={() => { cizelgede(s.id); }} />}
        <SahipDugmesi ad="Sil" simge="trash" />
      </>
    )),
  ];
  return (
    <div className="tc-pyi-dik">
      <div className="tc-pyi-sira">
        <div className="tc-pyi-seg" role="group" aria-label="Süzgeç">
          {SIPARIS_SUZGECLERI.map(([k, ad]) => <button key={k} type="button" aria-pressed={suz === k} onClick={() => { suzYaz(k); }}>{ad}</button>)}
        </div>
        <input className="tc-alan-kutu tc-pyi-ara" type="search" placeholder="Sipariş no ya da ürün ara" aria-label="Sipariş ara" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
        <SahipDugmesi ad="Yeni sipariş" simge="plus" metin="Yeni sipariş" birincil />
      </div>
      <VeriKarti baslik="Siparişler" ek={`${l.length} / ${D.siparisler.length}`}>
        <VeriTablosu etiket="Siparişler" sutunlar={sutunlar} satirlar={l} anahtar={(s) => s.id} />
      </VeriKarti>
      <SahipNotu>Sipariş, termin ve adet Üretim emirlerinden gelir; önem ve fiyat Siparişler (plan) sayfasında değişir.</SahipNotu>
      <p className="tc-pyi-k">Öncelik gecikmenin ağırlığıdır: yüksek önceliğin bir saati normalin iki, düşüğün dört saati sayılır.</p>
    </div>
  );
}

// --- Tezgâhlar ---
export function TezgahListesi({ c, maliyet }: ListeOzellikleri) {
  const l = c.D.tezgahlar;
  const sutunlar: Sutun<Tezgah>[] = [
    { anahtar: 'id', baslik: 'Kod', hucre: (x) => mono(x.id) },
    { anahtar: 'ad', baslik: 'Ad', hucre: (x) => x.ad ?? '—' },
    { anahtar: 'grup', baslik: 'Grup', hucre: (x) => <Rozet ton="pasif">{x.grup ?? '—'}</Rozet> },
    { anahtar: 'v', baslik: 'Vardiya', hucre: (x) => `${x.vardiyalar?.length ? x.vardiyalar.join(', ') : 'hepsi'}${x.isiksiz ? ' · ışıksız' : ''}` },
    { anahtar: 'verim', baslik: 'Verim', sag: true, hucre: (x) => sayiYazi(x.verim ?? 1, 2) },
    { anahtar: 'opOran', baslik: 'Operatör', sag: true, hucre: (x) => sayiYazi(x.opOran ?? 1, 2) },
    ...(maliyet ? [{ anahtar: 'ucret', baslik: 'TL/sa', sag: true, hucre: (x: Tezgah) => sayiYazi(x.ucret) }] : []),
    islem(() => <SahipDugmesi ad="Sil" simge="trash" />),
  ];
  return (
    <div className="tc-pyi-dik">
      <div className="tc-pyi-sira">
        <span className="tc-pyi-alt tc-pyi-ara">{l.length} tezgâh, {new Set(l.map((t) => t.grup)).size} grup. Tezgâh kodu rotada kullanılır; kod değişmez.</span>
        <SahipDugmesi ad="Yeni tezgâh" simge="plus" metin="Yeni tezgâh" birincil />
      </div>
      <VeriKarti baslik="Tezgâhlar"><VeriTablosu etiket="Tezgâhlar" sutunlar={sutunlar} satirlar={l} anahtar={(x) => x.id} /></VeriKarti>
      <SahipNotu />
    </div>
  );
}

// --- Personel ---
export function PersonelListesi({ c }: ListeOzellikleri) {
  const D = c.D; const mx = kapasiteMatrisi(D);
  const per = D.personel ?? [];
  const devam = devamsizliklar(D);
  return (
    <div className="tc-pyi-dik">
      <div className="tc-pyi-iki">
        <VeriKarti baslik="Vardiya ve yetkinlik kapasitesi">
          <div className="tc-pyi-kap">
            <table className="tc-pyi-izgara" aria-label="Vardiya ve yetkinlik kapasitesi">
              <thead><tr><th scope="col">Grup</th>{mx.vardiyalar.map((v) => <th key={v} scope="col">{v}</th>)}</tr></thead>
              <tbody>
                {mx.gruplar.map((g) => (
                  <tr key={g}>
                    <th scope="row">{g}</th>
                    {mx.vardiyalar.map((v) => {
                      const h = mx.hucre(g, v);
                      return (
                        <td key={v} data-ton={h.ton ?? undefined} title={`${h.kisi} kişi · operatör ihtiyacı ${sayiYazi(h.ihtiyac, 1)}`}>
                          {h.acik ? <>{h.kisi} <span className="tc-pyi-k">/ {sayiYazi(h.ihtiyac, 1)}</span></> : <span className="tc-pyi-k">kapalı</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row">Ayarcı</th>
                  {mx.vardiyalar.map((v) => { const a = mx.ayarci(v); return <td key={v} data-ton={a.acik && !a.kisi ? 'hata' : undefined}>{a.acik ? a.kisi : <span className="tc-pyi-k">kapalı</span>}</td>; })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="tc-pyi-k">
            Hücre: yetkin kişi / o vardiyada açık tezgâhların operatör ihtiyacı. Kırmızı: tezgâh açık ama kimse yok, o vardiyada iş yerleşmez. Sarı: kişi tezgâhtan az,
            tezgâhlar sırayla çalışır.
          </p>
        </VeriKarti>
        <VeriKarti baslik="Devamsızlık">
          <VeriTablosu
            etiket="Devamsızlık" bos="Devamsızlık yok." satirlar={devam} anahtar={(d, i) => `${d.personel}|${d.gun}|${i}`}
            sutunlar={[{ anahtar: 'p', baslik: 'Personel', hucre: (d) => mono(d.personel) }, { anahtar: 'g', baslik: 'Gün', hucre: (d) => d.gun }, islem(() => <SahipDugmesi ad="Sil" simge="trash" />)]}
          />
          <div className="tc-pyi-sira tc-pyi-ust-pay"><SahipDugmesi ad="Devamsızlık ekle" simge="plus" metin="Devamsızlık ekle" /></div>
        </VeriKarti>
      </div>
      <VeriKarti baslik="Personel" ek={String(per.length)} sag={<SahipDugmesi ad="Yeni personel" simge="plus" metin="Yeni personel" birincil />}>
        <VeriTablosu
          etiket="Personel" satirlar={per} anahtar={(x) => x.id}
          sutunlar={[
            { anahtar: 'id', baslik: 'Kod', hucre: (x) => mono(x.id) }, { anahtar: 'ad', baslik: 'Ad', hucre: (x) => x.ad ?? '—' },
            { anahtar: 'vardiya', baslik: 'Vardiya', hucre: (x) => x.vardiya ?? '—' },
            { anahtar: 'gruplar', baslik: 'Yetkinlik', hucre: (x) => <span className="tc-pyi-cipler">{(x.gruplar ?? []).map((g) => <span key={g} className="tc-pyi-cip">{g}</span>)}</span> },
            { anahtar: 'ayar', baslik: 'Ayarcı', hucre: (x) => (x.ayar ? <Rozet ton="tamam">Ayarcı</Rozet> : '—') },
            islem(() => <SahipDugmesi ad="Sil" simge="trash" />),
          ]}
        />
      </VeriKarti>
      <SahipNotu />
    </div>
  );
}

// --- planlamaya özgü kaydın formu (formPenceresi, formOku) ---
function ListeFormu({ c, tur, eski, kapat, komut }: { c: PlanlamaCalismasi; tur: ListeTuru; eski: Record<string, unknown> | null; kapat: () => void; komut: CalismaKomutu }) {
  const T = LISTE_TANIMI[tur];
  const [deger, degerYaz] = useState<Record<string, string>>(() => Object.fromEntries(T.alanlar.map((a) => [a.k, String((eski ? eski[a.k] : a.vars) ?? '')])));
  const [hata, hataYaz] = useState<string[]>([]);
  const eskiId = eski && typeof eski.id === 'string' ? eski.id : null;
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const o = listeFormuOku(c, tur, deger, eskiId);
    if ('hata' in o) { hataYaz(o.hata); return; }
    const ok = komut.degistir(eskiId ? `${T.ad} güncellendi` : `${T.ad} eklendi`, (t) => { listeYaz(t, tur, o.kayit, eskiId); }, { ayrinti: String(o.kayit.id ?? '') });
    if (ok) kapat();
  };
  const formId = `tc-pyi-form-${tur}`;
  return (
    <Pencere
      acik kapat={kapat} tur="yan" baslik={eskiId ? `${T.ad} · ${eskiId}` : `Yeni ${T.ad.toLocaleLowerCase('tr-TR')}`}
      alt={<><Dugme onClick={kapat}>Vazgeç</Dugme><Dugme tur="birincil" type="submit" form={formId} simge="check">Kaydet</Dugme></>}
    >
      <form id={formId} className="tc-form tc-pyi-form" noValidate onSubmit={gonder} aria-label={T.ad}>
        {T.alanlar.map((a) => (
          <label key={a.k} className="tc-alan">
            <span className="tc-alan-etiket">{a.ad}{a.zorunlu && <span className="tc-alan-zorunlu"> *</span>}</span>
            <input
              className="tc-alan-kutu" name={a.k} type={a.tur === 'sayi' ? 'number' : 'text'} min={a.min} step={a.tur === 'sayi' ? a.adim ?? 'any' : undefined}
              value={deger[a.k] ?? ''} readOnly={a.k === 'id' && eskiId !== null} title={a.k === 'id' && eskiId !== null ? 'Kod değişmez; yeni kayıt açın' : undefined}
              onChange={(e) => { degerYaz((d) => ({ ...d, [a.k]: e.target.value })); }}
            />
          </label>
        ))}
        {hata.length > 0 && <p className="tc-pyi-hata" role="alert">{hata.join(' ')}</p>}
      </form>
    </Pencere>
  );
}

// Düzenlenebilir liste (planlamaya özgü kayıt): kartın Yeni düğmesi, satıra basınca düzenleme (kod hücresi klavyeyle de açar), Sil önce engeli
// denetler, sonra sorar.
function PlanlamaListesi<S extends { id: string; ad: string }>({ c, komut, uyar, tur, satirlar, sutunlar, baslik, children }: {
  c: PlanlamaCalismasi; komut: CalismaKomutu | null; uyar: (ileti: string) => void; tur: ListeTuru; satirlar: S[]; sutunlar: Sutun<S>[]; baslik: string; children?: ReactNode;
}) {
  const [form, formYaz] = useState<{ eski: Record<string, unknown> | null } | null>(null);
  const [silinecek, silinecekYaz] = useState<S | null>(null);
  const T = LISTE_TANIMI[tur];
  const ham = (id: string) => (Array.isArray(c.D[T.alan]) ? (c.D[T.alan] as Record<string, unknown>[]).find((x) => x.id === id) ?? null : null);
  const duzenle = (x: S) => { if (komut) formYaz({ eski: ham(x.id) }); };
  const sil = (x: S) => { const engel = silmeEngeli(c.D, tur, x.id); if (engel) { uyar(engel); return; } silinecekYaz(x); };
  const [kod, ...diger] = sutunlar;
  const tum: Sutun<S>[] = [
    ...(kod ? [{ ...kod, hucre: (x: S) => (komut ? <button type="button" className="tc-pyi-bag mono" onClick={(e) => { e.stopPropagation(); duzenle(x); }}>{x.id}</button> : kod.hucre(x)) }] : []),
    ...diger,
    islem((x) => (komut ? <KucukDugme ad="Sil" simge="trash" yap={() => { sil(x); }} /> : null)),
  ];
  const yeniAd = `Yeni ${T.ad.toLocaleLowerCase('tr-TR')}`;
  return (
    <VeriKarti baslik={baslik} sag={komut ? <KucukDugme ad={yeniAd} simge="plus" metin="Yeni" yap={() => { formYaz({ eski: null }); }} /> : undefined}>
      <VeriTablosu etiket={baslik} sutunlar={tum} satirlar={satirlar} anahtar={(x) => x.id} sec={komut ? duzenle : undefined} />
      {children}
      {komut && form && <ListeFormu c={c} tur={tur} eski={form.eski} komut={komut} kapat={() => { formYaz(null); }} />}
      <OnayPenceresi
        acik={silinecek !== null} baslik={`${T.ad} silinsin mi?`} onayMetni="Sil" tehlikeli
        vazgec={() => { silinecekYaz(null); }}
        onayla={() => {
          const x = silinecek; silinecekYaz(null);
          if (x && komut) komut.degistir(`${T.ad} silindi`, (t) => { listedenSil(t, tur, x.id); }, { ayrinti: x.id });
        }}
      >
        <p>{silinecek ? `${silinecek.id} ${silinecek.ad} silinecek. Geri al ile döndürebilirsiniz.` : ''}</p>
      </OnayPenceresi>
    </VeriKarti>
  );
}

// --- Malzeme ---
export function MalzemeListesi({ c, cx, komut, planYaz, maliyet, uyar }: ListeOzellikleri) {
  const D = c.D; const yaz = komut && planYaz ? komut : null;
  const ted = tedarikciler(D); const sa = satinalmalar(D);
  const kars: Karsilama[] | null = cx ? karsilama(cx) : null;
  const tedAd = (id: string | null) => ted.find((t) => t.id === id)?.ad ?? id ?? '—';
  return (
    <div className="tc-pyi-dik">
      <div className="tc-pyi-iki">
        <VeriKarti baslik="Malzemeler" sag={<SahipDugmesi ad="Yeni malzeme" simge="plus" metin="Yeni" />}>
          <VeriTablosu
            etiket="Malzemeler" satirlar={D.malzemeler ?? []} anahtar={(m) => m.kod}
            sutunlar={[
              { anahtar: 'kod', baslik: 'Kod', hucre: (m) => mono(m.kod) }, { anahtar: 'ad', baslik: 'Ad', hucre: (m) => m.ad ?? '—' },
              { anahtar: 'stok', baslik: 'Stok', sag: true, hucre: (m) => (m.stok == null ? 'bilinmiyor' : `${sayiYazi(m.stok, 1)} ${m.birim ?? ''}`) },
              ...(maliyet ? [{ anahtar: 'fiyat', baslik: 'TL/birim', sag: true, hucre: (m: NonNullable<typeof D.malzemeler>[number]) => sayiYazi(m.birimFiyat, 2) }] : []),
              { anahtar: 'tedarik', baslik: 'Tedarik', sag: true, hucre: (m) => (m.tedarikGun != null ? `${m.tedarikGun} gün` : '—') },
              islem(() => <SahipDugmesi ad="Sil" simge="trash" />),
            ]}
          />
          <SahipNotu />
        </VeriKarti>
        <PlanlamaListesi<Tedarikci>
            c={c} komut={yaz} uyar={uyar} tur="tedarikci" baslik="Tedarikçiler" satirlar={ted}
            sutunlar={[
              { anahtar: 'id', baslik: 'Kod', hucre: (t) => mono(t.id) }, { anahtar: 'ad', baslik: 'Ad', hucre: (t) => t.ad },
              { anahtar: 'gec', baslik: 'Ort. gecikme', sag: true, hucre: (t) => `${sayiYazi(t.ortGecikmeGun, 1)} gün` },
            ]}
          />
      </div>
      <VeriKarti baslik="Açık satın almalar" sag={<SahipDugmesi ad="Yeni satın alma" simge="plus" metin="Yeni" />}>
        <VeriTablosu<SatinAlma>
          etiket="Açık satın almalar" satirlar={sa} anahtar={(x, i) => `${x.kod}|${i}`}
          sutunlar={[
            { anahtar: 'kod', baslik: 'Malzeme', hucre: (x) => mono(x.kod) }, { anahtar: 'miktar', baslik: 'Miktar', sag: true, hucre: (x) => sayiYazi(x.miktar, 1) },
            { anahtar: 'gelis', baslik: 'Geliş', hucre: (x) => x.gelis ?? '—' }, { anahtar: 'ted', baslik: 'Tedarikçi', hucre: (x) => tedAd(x.tedarikci) },
            islem(() => <SahipDugmesi ad="Sil" simge="trash" />),
          ]}
        />
        <SahipNotu />
      </VeriKarti>
      <VeriKarti baslik="Siparişlere karşılama">
        {kars && (
          <>
            <VeriTablosu<Karsilama>
              etiket="Siparişlere karşılama" bos="Malzemeli sipariş yok." satirlar={kars} anahtar={(x, i) => `${x.siparis}|${x.kod}|${i}`}
              sutunlar={[
                { anahtar: 's', baslik: 'Sipariş', hucre: (x) => mono(x.siparis) }, { anahtar: 'm', baslik: 'Malzeme', hucre: (x) => x.kod },
                { anahtar: 'i', baslik: 'İhtiyaç', sag: true, hucre: (x) => `${sayiYazi(x.ihtiyac, 1)} ${x.birim}` },
                { anahtar: 'k', baslik: 'Kaynak', hucre: (x) => (x.kaynak === 'eksik' ? <Rozet ton="hata">{`Eksik ${sayiYazi(x.eksik, 1)}`}</Rozet>
                  : x.kaynak === 'stok' ? <Rozet ton="tamam">Stok</Rozet> : <Rozet ton="uyari">Satın alma</Rozet>) },
                { anahtar: 'h', baslik: 'Hazır', hucre: (x) => saatYaz(D, x.hazir) },
              ]}
            />
            <p className="tc-pyi-k">
              Dağıtım önce önceliğe, sonra termine göre. Hazır anı: söz tarihi + tedarikçinin ortalama gecikmesi + giriş muayenesi. Malzeme kuralı:{' '}
              {c.w.mat === 'sert' ? 'sert (iş malzemesiz başlamaz)' : 'uyarı (iş başlar, uyarı verilir; K3 kararı)'}.
            </p>
          </>
        )}
      </VeriKarti>
    </div>
  );
}

// --- Fason ve aparat ---
export function FasonListesi({ c, komut, planYaz, uyar }: ListeOzellikleri) {
  const yaz = komut && planYaz ? komut : null;
  return (
    <div className="tc-pyi-iki">
      <VeriKarti baslik="Fasoncular" sag={<SahipDugmesi ad="Yeni fasoncu" simge="plus" metin="Yeni" />}>
        <VeriTablosu
          etiket="Fasoncular" satirlar={c.D.fasoncular ?? []} anahtar={(f) => f.id}
          sutunlar={[
            { anahtar: 'id', baslik: 'Kod', hucre: (f) => mono(f.id) }, { anahtar: 'ad', baslik: 'Ad', hucre: (f) => f.ad ?? '—' },
            { anahtar: 'kap', baslik: 'Kapasite', sag: true, hucre: (f) => sayiYazi(f.kapasite) },
            { anahtar: 'sure', baslik: 'Süre', sag: true, hucre: (f) => `${sayiYazi(f.sureGun, 1)} gün` },
            { anahtar: 'cikis', baslik: 'Çıkış', hucre: (f) => `${(f.cikisGunleri ?? []).map((g) => GUN_AD[g as keyof typeof GUN_AD] ?? g).join(', ')} · ${f.cikisSaat ?? 16}:00` },
            islem(() => <SahipDugmesi ad="Sil" simge="trash" />),
          ]}
        />
        <p className="tc-pyi-k">Fason iş yalnız çıkış gününde ve saatinde gider, süre sonunda döner; aynı anda en çok &quot;kapasite&quot; kadar iş alır.</p>
        <SahipNotu />
      </VeriKarti>
      <PlanlamaListesi<Aparat>
        c={c} komut={yaz} uyar={uyar} tur="aparat" baslik="Aparatlar" satirlar={aparatlar(c.D)}
        sutunlar={[
          { anahtar: 'id', baslik: 'Kod', hucre: (a) => mono(a.id) }, { anahtar: 'ad', baslik: 'Ad', hucre: (a) => a.ad },
          { anahtar: 'adet', baslik: 'Adet', sag: true, hucre: (a) => sayiYazi(a.adet) },
        ]}
      >
        <p className="tc-pyi-k">Aynı aparatı isteyen adımlar aparat adedinden fazla aynı anda çalışmaz.</p>
      </PlanlamaListesi>
    </div>
  );
}
