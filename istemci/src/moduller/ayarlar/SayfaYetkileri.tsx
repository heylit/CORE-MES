import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KisiEkIslemleri, KisiEkIslemleriCevabi, RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { islemAdi, islemGrubu } from '#paylasilan/islem-adlari.ts';
import { ATOLYE_YAZMA_ISLEMLERI, ETKISIZ_ISLEMLER, FINANS_YONETIM_YAZMA_ISLEMLERI, ISTASYON_YAZMA_ISLEMLERI, ROTA_YAZMA_ISLEMLERI, STOK_TANIM_YAZMA_ISLEMLERI, URETIM_EMRI_YAZMA_ISLEMLERI } from '#paylasilan/islemler.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Secim, Sekmeler, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DUZENLEME_ISARETI, grupla } from './Yetkiler.tsx';
import './yetkiler.css';

type Bakis = 'sayfa' | 'eylem';
type Kip = 'kisi' | 'rol';
type Rol = RolIslemleriCevabi['roller'][number];
type Grup = ReturnType<typeof grupla>[number];
// Kişide bir işlemin nereden geldiği: rolden, kişiye ayrıca (ek), rolde var ama bu kişiden alınmış ya da hiç yok.
export type Kaynak = 'rolden' | 'ek' | 'alindi' | 'yok';

const kucuk = (metin: string): string => metin.toLocaleLowerCase('tr');

// Sunucuyla aynı hesap (kisiler/sorgular.ts yetkiKaydiBul): alınan işlem rolden de ekten de gelse düşer.
export function kaynak(kisi: KisiEkIslemleri, islem: string): Kaynak {
  const rolden = kisi.roldenGelen.includes(islem);
  const ek = kisi.ek.includes(islem);
  if ((rolden || ek) && kisi.alinan.includes(islem)) return 'alindi';
  if (ek) return 'ek';
  return rolden ? 'rolden' : 'yok';
}
export const yapabilir = (k: Kaynak): boolean => k === 'rolden' || k === 'ek';

// Kişide tek dokunuş doğal olanı yapar: rolden geleni bu kişiden alır ya da geri verir, rolde olmayanı ek verir ya da kaldırır.
type Komut = { tur: 'kisit'; kisiId: number; islem: string; alindi: boolean } | { tur: 'ek'; kisiId: number; islem: string; verildi: boolean };
type RolKomutu = { rol: Rol; islem: string; verildi: boolean };
const kisiGonder = (k: Komut): Promise<KisiEkIslemleriCevabi> => (k.tur === 'kisit'
  ? api.post<KisiEkIslemleriCevabi>(`/kisiler/${k.kisiId}/islem-kisiti-degistir`, { islem: k.islem, alindi: k.alindi })
  : api.post<KisiEkIslemleriCevabi>(`/kisiler/${k.kisiId}/ek-islem-degistir`, { islem: k.islem, verildi: k.verildi }));
const rolGonder = ({ rol, islem, verildi }: RolKomutu): Promise<RolIslemleriCevabi> =>
  api.post<RolIslemleriCevabi>(`/roller/${rol.id}/islem-degistir`, { islem, verildi });
export function kisiKomutu(kisi: KisiEkIslemleri, islem: string): Komut {
  const k = kaynak(kisi, islem);
  if (k === 'alindi') return { tur: 'kisit', kisiId: kisi.id, islem, alindi: false };
  // Hem rolde hem ekte olan işlemde eki kaldırmak kişiyi durdurmaz (rolden yapmaya devam eder): kişiden alınır.
  if (k === 'rolden' || (k === 'ek' && kisi.roldenGelen.includes(islem))) return { tur: 'kisit', kisiId: kisi.id, islem, alindi: true };
  return { tur: 'ek', kisiId: kisi.id, islem, verildi: k === 'yok' };
}
const KOMUT_ILETISI = (k: Komut): string => (k.tur === 'kisit'
  ? (k.alindi ? 'Bu kişiden alındı; rolü değişmedi.' : 'Rolden gelen yetki geri verildi.')
  : (k.verildi ? 'Ek yetki verildi.' : 'Ek yetki kaldırıldı.'));

// Bu iki sayfada kimin ne yapacağını asıl belirleyen, modülün kendi ekranıdır; burada yalnız sayfa ve kaba işlem görünür.
const DIS_NOT: Record<string, string> = {
  arkon: 'Bu sayfada kimin ne yapacağını ayrıca Üretim Hazırlık içindeki roller belirler; asıl ayar oradadır.',
  'ortak-dosyalar': 'Bu sayfada klasör düzeyindeki yetki Ortak Dosyalar ekranından verilir; asıl ayar oradadır.',
};
const disNot = (grup: string): ReactNode => (DIS_NOT[grup] === undefined
  ? null
  : <p className="tc-sy-not"><Simge ad="help" boyut="k" /> {DIS_NOT[grup]}</p>);

// Eylemlere bölünmüş işlem sayfanın içinde başlıklı bölüm olur (3163 a, 3165 a); her bölme dilimi buraya bir satır ekler.
const BOLUMLER: readonly { ad: string; islemler: readonly string[] }[] = [
  { ad: 'İstasyon tanımları', islemler: ISTASYON_YAZMA_ISLEMLERI },
  { ad: 'Rota kayıtlarını düzenleme', islemler: ROTA_YAZMA_ISLEMLERI },
  { ad: 'Üretim emirlerini düzenleme', islemler: URETIM_EMRI_YAZMA_ISLEMLERI },
  { ad: 'Fabrika haritasını düzenleme', islemler: ATOLYE_YAZMA_ISLEMLERI },
  { ad: 'Stok tanımları', islemler: STOK_TANIM_YAZMA_ISLEMLERI },
  { ad: 'Finans yönetimi', islemler: FINANS_YONETIM_YAZMA_ISLEMLERI },
];
const BOLUMU = new Map(BOLUMLER.flatMap((b) => b.islemler.map((i) => [i, b.ad] as const)));
type Satirlar = { genel: string[]; bolumler: { ad: string; islemler: string[] }[] };
const satirlari = (g: Grup): Satirlar => {
  const genel: string[] = [];
  const bolumler: Satirlar['bolumler'] = [];
  for (const i of g.islemler) {
    const ad = BOLUMU.get(i);
    if (ad === undefined) { genel.push(i); continue; }
    const b = bolumler.find((x) => x.ad === ad);
    if (b) b.islemler.push(i); else bolumler.push({ ad, islemler: [i] });
  }
  return { genel, bolumler };
};
const ayrintiliMi = (g: Grup): boolean => g.islemler.some((i) => BOLUMU.has(i));

function gruplar(islemler: readonly string[], arama: string): Grup[] {
  const a = kucuk(arama.trim());
  const eslesir = (i: string) => a === '' || kucuk(islemAdi(i)).includes(a) || i.includes(a) || kucuk(BOLUMU.get(i) ?? '').includes(a);
  return grupla(islemler.filter((i) => !(ETKISIZ_ISLEMLER as readonly string[]).includes(i)))
    .map((g) => ({ ...g, islemler: kucuk(g.ad).includes(a) ? g.islemler : g.islemler.filter(eslesir) }))
    .filter((g) => g.islemler.length > 0);
}

interface Veri {
  islemler: string[];
  devredilmez: ReadonlySet<string>;
  kisiler: KisiEkIslemleri[];
  roller: Rol[];
  duzenler: boolean;
  bekliyor: boolean;
  kisiDegistir: (k: Komut) => void;
  rolDegistir: (rol: Rol, islem: string, verildi: boolean) => void;
  kisiToplu: (komutlar: Komut[]) => void;
  rolToplu: (komutlar: RolKomutu[]) => void;
}

// Kişiye ve role sayfa ve işlem yetkisi (kart 3163): "Sayfalar" sayfa sayfa düğmeler, "Eylemler" bir işlemin kimde olduğu.
// Kişide rolden gelen yetki rol değişmeden yalnız o kişiden alınabilir (kart 3166). Bütün rollerin tablosu Yetkiler'de kalır.
export function SayfaYetkileri() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const kisiListesi = useQuery({ queryKey: anahtarlar.kisiEkIslemleri, queryFn: () => api.get<KisiEkIslemleriCevabi>('/kisi-ek-islemleri') });
  const rolListesi = useQuery({ queryKey: anahtarlar.rolIslemleri, queryFn: () => api.get<RolIslemleriCevabi>('/rol-islemleri') });
  const duzenler = useOturum().data?.islemler.includes(DUZENLEME_ISARETI) === true;
  const kisiDegisim = useMutation({
    mutationFn: kisiGonder,
    onSuccess: (guncel, k) => { istemci.setQueryData(anahtarlar.kisiEkIslemleri, guncel); bildir('tamam', KOMUT_ILETISI(k)); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Yetki değiştirilemedi.')); },
  });
  const rolDegisim = useMutation({
    mutationFn: rolGonder,
    onSuccess: (guncel, d) => {
      istemci.setQueryData(anahtarlar.rolIslemleri, guncel);
      // Rol değişince o roldeki kişilerin rolden gelen listesi de değişir.
      void istemci.invalidateQueries({ queryKey: anahtarlar.kisiEkIslemleri });
      bildir('tamam', d.verildi ? `${d.rol.ad} rolüne verildi.` : `${d.rol.ad} rolünden alındı.`);
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Yetki değiştirilemedi.')); },
  });
  // "Hepsini ver / al": komutlar sırayla gider ki son cevap son durumu taşısın; yarıda hata olursa yapılanlar kalır, liste yenilenir.
  const topluDegisim = useMutation({
    mutationFn: async (is: { kisi: Komut[] } | { rol: RolKomutu[] }) => {
      if ('kisi' in is) { for (const k of is.kisi) istemci.setQueryData(anahtarlar.kisiEkIslemleri, await kisiGonder(k)); return is.kisi.length; }
      for (const k of is.rol) istemci.setQueryData(anahtarlar.rolIslemleri, await rolGonder(k));
      return is.rol.length;
    },
    onSuccess: (n) => { bildir('tamam', `${String(n)} işlem değişti.`); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Yetkilerin bir kısmı değiştirilemedi.')); },
    onSettled: () => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.kisiEkIslemleri });
      void istemci.invalidateQueries({ queryKey: anahtarlar.rolIslemleri });
    },
  });
  const [bakis, bakisYaz] = useState<Bakis>('sayfa');
  const [eylemAcildi, eylemAcildiYaz] = useState(false);

  if (kisiListesi.isPending || rolListesi.isPending) return <Kart baslik="Sayfa yetkileri"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (kisiListesi.isError || rolListesi.isError) {
    const hata = kisiListesi.error ?? rolListesi.error;
    return (
      <Kart baslik="Sayfa yetkileri">
        <DurumKutusu durum="hata" mesaj={hataIletisi(hata, 'Yetkiler alınamadı.')} yenile={() => { void kisiListesi.refetch(); void rolListesi.refetch(); }} />
      </Kart>
    );
  }
  const veri: Veri = {
    islemler: kisiListesi.data.islemler,
    devredilmez: new Set(kisiListesi.data.devredilmez),
    // Tüm yetkileri veren role sahip kişi her şeyi yapar; ona ne ek verilir ne ondan alınır.
    kisiler: kisiListesi.data.kisiler.filter((k) => !k.bayrakli),
    roller: rolListesi.data.roller,
    duzenler,
    bekliyor: kisiDegisim.isPending || rolDegisim.isPending || topluDegisim.isPending,
    kisiDegistir: (k) => kisiDegisim.mutate(k),
    rolDegistir: (rol, islem, verildi) => rolDegisim.mutate({ rol, islem, verildi }),
    kisiToplu: (komutlar) => { if (komutlar.length > 0) topluDegisim.mutate({ kisi: komutlar }); },
    rolToplu: (komutlar) => { if (komutlar.length > 0) topluDegisim.mutate({ rol: komutlar }); },
  };
  const sec = (b: Bakis) => { if (b === 'eylem') eylemAcildiYaz(true); bakisYaz(b); };
  return (
    <Kart baslik="Sayfa yetkileri">
      <div className="tc-sy">
        <Sekmeler etiket="Bakış" secili={bakis} sec={sec}
          sekmeler={[{ anahtar: 'sayfa', baslik: 'Sayfalar', simge: 'layers' }, { anahtar: 'eylem', baslik: 'Eylemler', simge: 'eye' }]} />
        {/* Öteki sekmeye gidip dönünce seçim ve arama kalsın diye görünüş kapanmaz, gizlenir. */}
        <div hidden={bakis !== 'sayfa'}><Sayfalar veri={veri} /></div>
        {eylemAcildi && <div hidden={bakis !== 'eylem'}><Eylemler veri={veri} /></div>}
      </div>
    </Kart>
  );
}

function Sayfalar({ veri }: { veri: Veri }) {
  const [kip, kipYaz] = useState<Kip>('kisi');
  const [kisiSecimi, kisiSecimiYaz] = useState('');
  const [rolSecimi, rolSecimiYaz] = useState('');
  const [arama, aramaYaz] = useState('');
  const [aciklar, aciklarYaz] = useState<ReadonlySet<string>>(() => new Set());
  const [toplu, topluYaz] = useState<{ g: Grup; ver: boolean } | null>(null);
  const [yalnizAyrintili, yalnizAyrintiliYaz] = useState(true);
  const kisi = veri.kisiler.find((k) => String(k.id) === kisiSecimi);
  const rol = veri.roller.find((r) => String(r.id) === rolSecimi);
  const tum = gruplar(veri.islemler, arama);
  const liste = yalnizAyrintili ? tum.filter(ayrintiliMi) : tum;
  const acikMi = (a: string) => arama.trim() !== '' || aciklar.has(a);
  const cevir = (a: string) => aciklarYaz((o) => { const y = new Set(o); if (y.has(a)) y.delete(a); else y.add(a); return y; });

  const durumu = (i: string): Kaynak => {
    if (kip === 'rol') return rol !== undefined && (rol.yonetici || rol.islemler.includes(i)) ? 'rolden' : 'yok';
    return kisi === undefined ? 'yok' : kaynak(kisi, i);
  };
  // Devredilmez işlem kişiye verilmez ve kişiden alınmaz; kişide önceden verilmiş eki kaldırmak açık kalır.
  const kilitli = (i: string): boolean => {
    if (!veri.duzenler || veri.bekliyor) return true;
    if (kip === 'rol') return rol === undefined || rol.yonetici === true;
    return veri.devredilmez.has(i) && durumu(i) !== 'ek';
  };
  const bas = (i: string) => {
    if (kip === 'rol') { if (rol !== undefined) veri.rolDegistir(rol, i, !rol.islemler.includes(i)); return; }
    if (kisi !== undefined) veri.kisiDegistir(kisiKomutu(kisi, i));
  };
  const hepsi = (g: Grup, ver: boolean) => {
    const degisecek = g.islemler.filter((i) => !kilitli(i) && yapabilir(durumu(i)) !== ver);
    if (kip === 'rol') { if (rol !== undefined) veri.rolToplu(degisecek.map((islem) => ({ rol, islem, verildi: ver }))); return; }
    if (kisi !== undefined) veri.kisiToplu(degisecek.map((i) => kisiKomutu(kisi, i)));
  };
  const dugme = (i: string) => {
    const k = durumu(i);
    const ad = islemAdi(i);
    const ipucu = kip === 'kisi' && k === 'rolden' ? 'Rolden geliyor; basınca yalnız bu kişiden alınır'
      : k === 'alindi' ? 'Rolde var ama bu kişiden alındı; basınca geri verilir'
        : k === 'ek' ? 'Kişiye ayrıca verildi' : veri.devredilmez.has(i) && kip === 'kisi' ? 'Yalnız yönetici' : undefined;
    return (
      <button key={i} type="button" className="tc-sy-cip" data-kaynak={k} aria-pressed={yapabilir(k)} title={ipucu}
        aria-label={`${kip === 'kisi' ? kisi?.ad ?? '' : rol?.ad ?? ''}: ${ad}`} disabled={kilitli(i)} onClick={() => bas(i)}>
        <Simge ad={yapabilir(k) ? 'check' : k === 'alindi' ? 'x' : i.startsWith('sayfa.') ? 'eye' : 'tool'} boyut="k" />
        <span>{ad}</span>
        {kip === 'kisi' && k === 'ek' && <small>Ek</small>}
        {kip === 'kisi' && k === 'alindi' && <small>Alındı</small>}
      </button>
    );
  };
  const hedefVar = kip === 'kisi' ? kisi !== undefined : rol !== undefined;

  return (
    <div className="tc-sy-govde">
      <div className="tc-sy-kime-kutu">
        <span id="tc-sy-kime">Kimin yetkisi</span>
        <div className="tc-sy-kime" role="group" aria-labelledby="tc-sy-kime">
          <button type="button" aria-pressed={kip === 'kisi'} onClick={() => kipYaz('kisi')}><Simge ad="user" boyut="k" /><span>Tek kişi</span></button>
          <button type="button" aria-pressed={kip === 'rol'} onClick={() => kipYaz('rol')}><Simge ad="users" boyut="k" /><span>Bütün rol</span></button>
        </div>
        {kip === 'rol' && <p className="tc-sy-not"><Simge ad="users" boyut="k" /> Değişiklik bu roldeki herkesi etkiler.</p>}
      </div>
      <p className="tc-yetki-aciklama">
        {kip === 'kisi'
          ? 'Kişi seçin; her sayfanın işlemleri düğmedir. Rolden geleni yalnız bu kişiden alabilir, rolünde olmayanı ayrıca verebilirsiniz; rolü değişmez.'
          : 'Rol seçin; her sayfanın işlemleri düğmedir. Bütün rollerin yan yana tablosu Yetkiler sayfasındadır.'}
        {veri.duzenler && ' Değişiklik açık oturumlarda hemen geçerli olur.'}
      </p>
      <div className="tc-sy-gosterge" aria-label="Gösterge">
        <span className="tc-sy-cip" data-ornek="" aria-pressed="true"><Simge ad="check" boyut="k" /><span>Yapabilir</span></span>
        {kip === 'kisi' && <span className="tc-sy-cip" data-ornek="" data-kaynak="ek" aria-pressed="true"><Simge ad="check" boyut="k" /><span>Kişiye ayrıca verildi</span><small>Ek</small></span>}
        {kip === 'kisi' && <span className="tc-sy-cip" data-ornek="" data-kaynak="alindi"><Simge ad="x" boyut="k" /><span>Rolde var, bu kişiden alındı</span><small>Alındı</small></span>}
        <span className="tc-sy-cip" data-ornek=""><span>Yapamaz</span></span>
      </div>
      <div className="tc-yetki-arac">
        {kip === 'kisi'
          ? <Secim etiket="Kişi" value={kisiSecimi} onChange={(o) => kisiSecimiYaz(o.target.value)}
            secenekler={[{ deger: '', baslik: 'Kişi seçin' }, ...veri.kisiler.map((k) => ({ deger: String(k.id), baslik: `${k.ad} (${k.kullaniciAdi})` }))]} />
          : <Secim etiket="Rol" value={rolSecimi} onChange={(o) => rolSecimiYaz(o.target.value)}
            secenekler={[{ deger: '', baslik: 'Rol seçin' }, ...veri.roller.map((r) => ({ deger: String(r.id), baslik: r.ad }))]} />}
        <Girdi etiket="Sayfa ya da işlem ara" type="search" value={arama} onChange={(o) => aramaYaz(o.target.value)} placeholder="Örnek: stok" />
        {/* Düğmenin adı gideceği görünüşü söyler; basılı durumu (aria-pressed) ters okunurdu. */}
        <div className="tc-yetki-dugmeler">
          <Dugme simge="layers" onClick={() => yalnizAyrintiliYaz((v) => !v)}>{yalnizAyrintili ? 'Bütün sayfalar' : 'Ayrıntılı sayfalar'}</Dugme>
        </div>
      </div>
      {kip === 'rol' && rol?.yonetici === true && <p className="tc-sy-not"><Simge ad="lock" boyut="k" /> Bütün yetkileri veren rol değiştirilmez.</p>}
      {kip === 'kisi' && veri.kisiler.length === 0 && <DurumKutusu durum="bos" mesaj="Girişi olan kişi yok." />}
      {!hedefVar && (kip === 'rol' || veri.kisiler.length > 0) && <DurumKutusu durum="bos" mesaj={kip === 'kisi' ? 'Yetkilerini görmek için bir kişi seçin.' : 'Yetkilerini görmek için bir rol seçin.'} />}
      {hedefVar && tum.length === 0 && <DurumKutusu durum="bos" mesaj="Aramaya uyan sayfa ya da işlem yok." />}
      {/* Süzgeç eşleşeni gizliyorsa "yok" denmez; kaç sayfanın düğmeyle görüneceği söylenir. */}
      {hedefVar && tum.length > 0 && liste.length === 0 && (
        <DurumKutusu durum="bos" mesaj={`Ayrıntılı sayfalarda aramaya uyan yok; "Bütün sayfalar" ile ${String(tum.length)} sayfa görünür.`} />
      )}
      {hedefVar && (
        <div className="tc-sy-liste">
          {liste.map((g) => {
            const sayi = g.islemler.filter((i) => yapabilir(durumu(i))).length;
            const ac = acikMi(g.anahtar);
            return (
              <section key={g.anahtar} className="tc-sy-kart" data-acik={ac ? '' : undefined}>
                <header>
                  <button type="button" className="tc-yetki-ac" aria-expanded={ac} onClick={() => cevir(g.anahtar)}>
                    <Simge ad="chev-right" boyut="k" /><span>{g.ad}</span>
                  </button>
                  <span className="tc-sy-sayac" data-durum={sayi === 0 ? 'yok' : sayi === g.islemler.length ? 'tam' : 'kismi'}>{`${sayi}/${g.islemler.length}`}</span>
                  {g.islemler.some((i) => durumu(i) === 'alindi') && <Rozet ton="uyari">Kısıtlı</Rozet>}
                </header>
                {ac && (
                  <div className="tc-sy-kart-govde">
                    {disNot(g.anahtar)}
                    {(() => {
                      const { genel, bolumler } = satirlari(g);
                      return (
                        <>
                          {genel.length > 0 && <div className="tc-sy-bolum"><h3>Genel</h3><div className="tc-sy-cipler">{genel.map(dugme)}</div></div>}
                          {bolumler.map((b) => <div key={b.ad} className="tc-sy-bolum"><h3>{b.ad}</h3><div className="tc-sy-cipler">{b.islemler.map(dugme)}</div></div>)}
                        </>
                      );
                    })()}
                    {veri.duzenler && !(kip === 'rol' && rol?.yonetici === true) && (
                      <div className="tc-sy-alt">
                        <Dugme simge="check" disabled={veri.bekliyor} onClick={() => topluYaz({ g, ver: true })}>Hepsini ver</Dugme>
                        <Dugme simge="x" disabled={veri.bekliyor} onClick={() => topluYaz({ g, ver: false })}>Hepsini al</Dugme>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <OnayPenceresi acik={toplu !== null} tehlikeli={toplu?.ver === false}
        baslik={toplu === null ? '' : `${toplu.g.ad}: ${toplu.ver ? 'hepsi verilsin mi?' : 'hepsi alınsın mı?'}`}
        onayMetni={toplu?.ver === false ? 'Hepsini al' : 'Hepsini ver'}
        onayla={() => { if (toplu) hepsi(toplu.g, toplu.ver); topluYaz(null); }} vazgec={() => topluYaz(null)}>
        {toplu !== null && (
          <p>
            {`${toplu.g.ad} sayfasındaki ${String(toplu.g.islemler.length)} işlem `}
            {kip === 'rol' ? `${rol?.ad ?? ''} rolündeki herkes için ` : `yalnız ${kisi?.ad ?? ''} için `}
            {toplu.ver ? 'verilir.' : 'alınır; sayfayı görme de buna dahildir.'}
            {' Yalnız yöneticide kalan işlemler değişmez. Değişiklik açık oturumlarda hemen geçerli olur.'}
          </p>
        )}
      </OnayPenceresi>
    </div>
  );
}

function Eylemler({ veri }: { veri: Veri }) {
  const [arama, aramaYaz] = useState('');
  const [secili, seciliYaz] = useState<string | null>(null);
  const [digerRoller, digerRollerYaz] = useState(false);
  const [eklenecek, eklenecekYaz] = useState('');
  const [aciklar, aciklarYaz] = useState<ReadonlySet<string>>(() => new Set());
  const ayrinti = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLElement>(null);
  const ilk = useRef(true);
  // Liste ile ayrıntı dar alanda alt alta düşer (ekran genişliği değil, yerleşim belirler): o zaman seçince ayrıntıya kayılır
  // (ilk açılışta değil) ve "Listeye dön" görünür.
  const [altAlta, altAltaYaz] = useState(false);
  useEffect(() => {
    const olc = () => { const a = ayrinti.current; const l = liste.current; if (a && l) altAltaYaz(a.offsetTop > l.offsetTop); };
    olc();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const gozcu = new ResizeObserver(olc);
    if (ayrinti.current?.parentElement) gozcu.observe(ayrinti.current.parentElement);
    return () => { gozcu.disconnect(); };
  }, []);
  useEffect(() => {
    if (ilk.current) { ilk.current = false; return; }
    if (secili !== null && altAlta) ayrinti.current?.scrollIntoView({ block: 'start' });
  }, [secili, altAlta]);
  const cevir = (a: string) => aciklarYaz((o) => { const y = new Set(o); if (y.has(a)) y.delete(a); else y.add(a); return y; });
  const gruplu = gruplar(veri.islemler, arama);

  const ayrintiGovdesi = (islem: string) => {
    const ad = islemAdi(islem);
    const devredilmez = veri.devredilmez.has(islem);
    const roller = veri.roller.map((r) => ({ r, var_: r.yonetici || r.islemler.includes(islem) }));
    const varan = roller.filter((x) => x.var_);
    const kisiler = veri.kisiler.map((k) => ({ k, kay: kaynak(k, islem) }));
    const yapabilen = kisiler.filter((x) => yapabilir(x.kay));
    const alinan = kisiler.filter((x) => x.kay === 'alindi');
    const veremez = kisiler.filter((x) => x.kay === 'yok');
    const kapali = !veri.duzenler || veri.bekliyor;
    return (
      <>
        <div className="tc-sy-baslik">
          <Simge ad={islem.startsWith('sayfa.') ? 'eye' : 'tool'} boyut="o" />
          <div><h3>{ad}</h3><p className="mono">{islem}</p></div>
        </div>
        <div className="tc-sy-ozet">
          <span><strong>{yapabilen.length}</strong> kişi yapabilir</span>
          <span><strong>{varan.length}</strong> rolde var</span>
          {alinan.length > 0 && <span><strong>{alinan.length}</strong> kişiden alındı</span>}
        </div>
        {disNot(islemGrubu(islem))}
        {devredilmez && <p className="tc-sy-not"><Simge ad="lock" boyut="k" /> Bu yetki kişiye ayrıca verilmez ve kişiden alınmaz; yalnız rolüyle gelir.</p>}
        <h4>Roller</h4>
        <ul className="tc-sy-satirlar">
          {(digerRoller ? roller : varan).map(({ r, var_ }) => (
            <li key={r.id}>
              <span className="tc-sy-ad"><Simge ad="users" boyut="k" />{r.ad}</span>
              {r.yonetici ? <Rozet ton="pasif">Hep var</Rozet> : (
                <button type="button" className="tc-yetki-hucre" aria-pressed={var_} aria-label={`${r.ad}: ${ad}`} disabled={kapali}
                  onClick={() => veri.rolDegistir(r, islem, !var_)}>
                  {var_ ? <span className="tc-yetki-var"><Simge ad="check" boyut="k" /></span> : <span className="tc-yetki-gizli">Yok</span>}
                </button>
              )}
            </li>
          ))}
        </ul>
        <Dugme simge={digerRoller ? 'minus' : 'plus'} onClick={() => digerRollerYaz((v) => !v)}>
          {digerRoller ? 'Yalnız yetkili roller' : `Öteki ${String(roller.length - varan.length)} rolü göster`}
        </Dugme>
        <h4>Kişiler</h4>
        <ul className="tc-sy-satirlar">
          {yapabilen.map(({ k, kay }) => (
            <li key={k.id}>
              <span className="tc-sy-ad"><Simge ad="user" boyut="k" />{k.ad}</span>
              {kay === 'rolden' ? <Rozet ton="pasif">Rolden</Rozet> : <Rozet ton="bilgi">Ek</Rozet>}
              {veri.duzenler && !devredilmez && (
                <Dugme simge="x" disabled={kapali} onClick={() => veri.kisiDegistir(kisiKomutu(k, islem))}>
                  {kay === 'rolden' || k.roldenGelen.includes(islem) ? 'Bu kişiden al' : 'Eki kaldır'}
                </Dugme>
              )}
            </li>
          ))}
          {alinan.map(({ k }) => (
            <li key={k.id} data-alindi="">
              <span className="tc-sy-ad"><Simge ad="user" boyut="k" />{k.ad}</span>
              <Rozet ton="uyari">Bu kişiden alındı</Rozet>
              {veri.duzenler && <Dugme simge="rotate" disabled={kapali} onClick={() => veri.kisiDegistir(kisiKomutu(k, islem))}>Geri ver</Dugme>}
            </li>
          ))}
          {yapabilen.length + alinan.length === 0 && <li><span className="tc-sy-soluk">Rolü bütün yetkileri vermeyen kişilerden kimse yapamıyor.</span></li>}
        </ul>
        {veri.duzenler && !devredilmez && veremez.length > 0 && (
          <div className="tc-sy-ekle">
            <Secim etiket="Kişiye ayrıca ver" value={eklenecek} onChange={(o) => eklenecekYaz(o.target.value)}
              secenekler={[{ deger: '', baslik: 'Kişi seçin' }, ...veremez.map(({ k }) => ({ deger: String(k.id), baslik: `${k.ad} (${k.kullaniciAdi})` }))]} />
            <Dugme tur="birincil" simge="user-plus" disabled={eklenecek === '' || kapali} onClick={() => {
              const k = veremez.find((x) => String(x.k.id) === eklenecek)?.k;
              if (k === undefined) return;
              veri.kisiDegistir({ tur: 'ek', kisiId: k.id, islem, verildi: true });
              eklenecekYaz('');
            }}>Ver</Dugme>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="tc-sy-govde">
      <p className="tc-yetki-aciklama">Bir sayfayı açıp işlem seçin: kimlerin yapabildiği, rolden mi kişiye ayrıca mı geldiği görünür. Buradan role verir, kişiye verir ya da yalnız bir kişiden alırsınız.</p>
      <div className="tc-sy-ikili">
        <nav className="tc-sy-eylemler" aria-label="İşlemler" ref={liste}>
          <Girdi etiket="İşlem ara" type="search" value={arama} onChange={(o) => aramaYaz(o.target.value)} placeholder="Örnek: iptal, onay" />
          <div className="tc-sy-kaydir">
            {gruplu.length === 0 && <DurumKutusu durum="bos" mesaj="Aramaya uyan işlem yok." />}
            {gruplu.map((g) => {
              const ac = arama.trim() !== '' || aciklar.has(g.anahtar);
              return (
                <div key={g.anahtar} className="tc-sy-grup" data-acik={ac ? '' : undefined}>
                  <button type="button" className="tc-yetki-ac" aria-expanded={ac} onClick={() => cevir(g.anahtar)}>
                    <Simge ad="chev-right" boyut="k" /><span>{g.ad}</span><span className="tc-sy-soluk">{`${String(g.islemler.length)} işlem`}</span>
                  </button>
                  {ac && (
                    <ul>
                      {g.islemler.map((i) => {
                        const n = veri.kisiler.filter((k) => yapabilir(kaynak(k, i))).length;
                        return (
                          <li key={i}>
                            <button type="button" aria-current={i === secili ? 'true' : undefined} onClick={() => seciliYaz(i)}>
                              <Simge ad={i.startsWith('sayfa.') ? 'eye' : 'tool'} boyut="k" /><span>{islemAdi(i)}</span><small>{`${String(n)} kişi`}</small>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
        <div className="tc-sy-ayrinti" ref={ayrinti}>
          {secili !== null && altAlta && (
            <div className="tc-sy-don"><Dugme simge="chev-left" onClick={() => liste.current?.scrollIntoView({ block: 'start' })}>Listeye dön</Dugme></div>
          )}
          {secili === null ? <DurumKutusu durum="bos" mesaj="Kimin yapabildiğini görmek için soldan bir işlem seçin." /> : ayrintiGovdesi(secili)}
        </div>
      </div>
    </div>
  );
}
