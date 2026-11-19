import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ArsivCevabi, DosyaListesiCevabi, DosyalarCevabi, HazirListe, GecmisCevabi, GecmisOlayi, Klasor, KlasorAcGovdesi, KlasorDuzeyi, KlasorlerCevabi, OrtakDosya, SurumlerCevabi,
  KaliciSilGovdesi, SurumluGovde, VerilenDuzey, YetkiCevabi, YetkiGovdesi, YukleGovdesi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { DosyaHatasi, dosyaYukle } from '../belge-merkezi/disari.ts';
import { Dugme, DurumKutusu, Girdi, Kart, KayitSecici, Pencere, Rozet, Sekmeler, Simge, Tablo, useBildirim, type SeciliKayit, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useKorumaliKomut, useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { Ayarlar } from './Ayarlar.tsx';
import { HAZIR_LISTE_TANIMLARI, HazirListeGorunumu, HazirMenu } from './HazirListeler.tsx';
import './ortak-dosyalar.css';

export type Gorunum = 'klasorler' | 'son' | 'arsiv' | 'ayarlar' | 'hazir';
type SekmeAdi = 'dosyalar' | 'yetkiler' | 'gecmis';

const DUZEY_ADI: Record<KlasorDuzeyi, string> = { yok: 'Yok', gorur: 'Görür', ekler: 'Ekler', yonetir: 'Yönetir' };
const DUZEY_ACIKLAMASI: Record<KlasorDuzeyi, string> = {
  yok: 'Klasörü görmez', gorur: 'Açar, indirir', ekler: 'Görür, yükler, sürüm ekler', yonetir: 'Ekler, alt klasör açar, arşive kaldırır',
};
const DUZEYLER: readonly KlasorDuzeyi[] = ['yok', 'gorur', 'ekler', 'yonetir'];
const OLAY_ADI: Record<GecmisOlayi, string> = {
  'klasor-acildi': 'Klasör açtı', yuklendi: 'Yükledi', 'yeni-surum': 'Yeni sürüm yükledi', arsivlendi: 'Arşive kaldırdı',
  'geri-alindi': 'Arşivden geri aldı', 'yetki-degisti': 'Yetkiyi değiştirdi',
  'silme-istendi': 'Kalıcı silme istedi', silindi: 'Kalıcı sildi', 'silme-reddedildi': 'Silme isteğini reddetti',
  'silme-geri-cekildi': 'Silme isteğini geri çekti', 'silme-dustu': 'Silme isteği düştü (arşivden geri alındı)',
};
const enAz = (d: KlasorDuzeyi, gereken: KlasorDuzeyi): boolean => DUZEYLER.indexOf(d) >= DUZEYLER.indexOf(gereken);
const boyutMetni = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const projeMetni = (p: { kod: string; ad: string } | null): string => (p === null ? '' : `${p.kod} · ${p.ad}`);
const dosyaYolu = (d: { klasorId: number; id: number }): string => `/ortak-dosyalar/klasorler/${d.klasorId}/dosyalar/${d.id}`;

// İndirme sunucunun ekli cevabıdır (Content-Disposition); aynı köken ve çerezle bağlantı açılır, denetim kaydı sunucuda yazılır.
function indir(d: { klasorId: number; id: number }, sira: number): void {
  const a = document.createElement('a');
  a.href = `/api${dosyaYolu(d)}/surumler/${sira}/dosya`;
  a.rel = 'noopener';
  a.click();
}

// Kayda bağlı (sistem) klasör: adı kayıttan gelir, kişi değiştiremez (kart 3288, ADR 0030 eki).
const KAYDA_BAGLI = 'Kayda bağlı: adı kayıttan gelir';
const KAYNAK_ADI = { firma: 'müşteriye', siparis: 'siparişe', proje: 'projeye' } as const;
function kaynakBaglantisi(k: Klasor): { yol: string; metin: string; tur: keyof typeof KAYNAK_ADI } | null {
  const kaynak = k.kaynak;
  if (kaynak === null || kaynak.id === null) return null;
  if (kaynak.tur === 'firma') return { yol: `/musteri-tedarikci?firma=${kaynak.id}`, metin: 'Müşteri kartını aç', tur: 'firma' };
  if (kaynak.tur === 'siparis') return { yol: `/siparisler/${kaynak.id}`, metin: `Sipariş ${k.ad.split(' ')[0] ?? ''} aç`, tur: 'siparis' };
  if (kaynak.tur === 'proje') return { yol: `/projeler/${kaynak.id}`, metin: `Proje ${k.ad.split(' ')[0] ?? ''} aç`, tur: 'proje' };
  return null;
}

// Ağaç araması: adı uyan klasör, üstleri ve altları görünür kalır (her müşteriye klasör açıldığı için ağaç büyür).
function agacSuz(klasorler: readonly Klasor[], ara: string): readonly Klasor[] {
  const a = ara.trim().toLocaleLowerCase('tr-TR');
  if (a === '') return klasorler;
  const harita = new Map(klasorler.map((k) => [k.id, k]));
  const eslesen = new Set(klasorler.filter((k) => k.ad.toLocaleLowerCase('tr-TR').includes(a)).map((k) => k.id));
  let degisti = true;
  while (degisti) {
    degisti = false;
    for (const k of klasorler) if (!eslesen.has(k.id) && k.ustId !== null && eslesen.has(k.ustId)) { eslesen.add(k.id); degisti = true; }
  }
  const kalan = new Set(eslesen);
  for (const id of eslesen) {
    let u = harita.get(id);
    while (u !== undefined && u.ustId !== null && !kalan.has(u.ustId)) { kalan.add(u.ustId); u = harita.get(u.ustId); }
  }
  return klasorler.filter((k) => kalan.has(k.id));
}

function sirala(liste: readonly Klasor[]): Klasor[] {
  return [...liste].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

function Agac({ klasorler, secili, sec, aranan }: { klasorler: readonly Klasor[]; secili: number | null; sec: (id: number) => void; aranan: boolean }) {
  const dal = (ust: number | null) => {
    const altlar = sirala(klasorler.filter((k) => k.ustId === ust));
    if (altlar.length === 0) return null;
    return (
      <ul role={ust === null ? 'tree' : 'group'} aria-label={ust === null ? 'Klasör ağacı' : undefined}>
        {altlar.map((k) => (
          <li key={k.id}>
            <button type="button" className="tc-od-klasor" aria-current={secili === k.id ? 'true' : undefined} onClick={() => sec(k.id)}>
              <Simge ad="layers" boyut="k" />
              <span>{k.ad}</span>
              {k.kaynak !== null
                ? <span className="tc-od-kilit" title={KAYDA_BAGLI} aria-label={KAYDA_BAGLI}><Simge ad="pin" boyut="k" /></span>
                : k.ozelYetki && <span className="tc-od-kilit" title="Özel yetki"><Simge ad="lock" boyut="k" /></span>}
            </button>
            {dal(k.id)}
          </li>
        ))}
      </ul>
    );
  };
  return <nav className="tc-od-agac">{dal(null) ?? <p className="tc-od-bos">{aranan ? 'Eşleşen klasör yok' : 'Görebileceğiniz klasör yok'}</p>}</nav>;
}

function KlasorPenceresi({ ust, ustAdi, kapat, acildi }: { ust: number | null; ustAdi: string | null; kapat: () => void; acildi: (k: Klasor) => void }) {
  const istemci = useQueryClient();
  const [ad, adYaz] = useState('');
  const komut = useKorumaliKomut<KlasorAcGovdesi, Klasor>({
    gonder: (g, d) => api.post<Klasor>('/ortak-dosyalar/klasorler', g, d),
    onSuccess: async (k) => { await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); acildi(k); },
  });
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Yeni klasör"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={ad.trim() === ''} yukleniyor={komut.isPending} onClick={() => komut.mutate({ ustId: ust, ad: ad.trim() })}>Aç</Dugme>
        </>
      )}
    >
      <div className="tc-od-form">
        <Girdi etiket="Klasör adı" required maxLength={120} value={ad} onChange={(o) => adYaz(o.target.value)} autoFocus />
        <p className="tc-od-ipucu">
          {ust === null
            ? 'Üst düzey klasör özel yetkiyle açılır; yalnız yönetici görür, sonra Yetkiler sekmesinden verin.'
            : `Yeni klasör "${ustAdi ?? ''}" yetkisini alır.`}
        </p>
        {komut.isError && <p className="tc-od-hata" role="alert">{hataIletisi(komut.error, 'Klasör açılamadı')}</p>}
      </div>
    </Pencere>
  );
}

function SurumPenceresi({ dosya, kapat }: { dosya: OrtakDosya; kapat: () => void }) {
  const q = useQuery({
    queryKey: anahtarlar.surumler(dosya.id),
    queryFn: () => api.get<SurumlerCevabi>(`${dosyaYolu(dosya)}/surumler`),
  });
  return (
    <Pencere acik kapat={kapat} baslik={`${dosya.ad} · sürümler`}>
      {q.isPending && <DurumKutusu durum="yukleniyor" />}
      {q.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Sürümler okunamadı')} />}
      {q.data && (
        <ul className="tc-od-olaylar">
          {q.data.surumler.map((s) => (
            <li key={s.sira}>
              <span className="mono">s{s.sira}</span>
              <span>{[s.yukleyenAd, boyutMetni(s.boyut)].filter(Boolean).join(' · ')}</span>
              <span className="tc-od-satir-is">
                <time className="mono">{zamanMetni(s.zaman)}</time>
                <Dugme simge="download" aria-label={`s${s.sira} indir`} title="İndir" onClick={() => indir(dosya, s.sira)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Pencere>
  );
}

function DosyaTablosu({ dosyalar, klasorSutunu, duzey, bosMesaj }: {
  dosyalar: readonly OrtakDosya[]; klasorSutunu: boolean; duzey: (klasorId: number) => KlasorDuzeyi; bosMesaj: string;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [surumleri, surumleriYaz] = useState<OrtakDosya | null>(null);
  const yeniSurum = useRef<{ dosya: OrtakDosya | null; input: HTMLInputElement | null }>({ dosya: null, input: null });
  const yukleme = useYukleme();
  const arsivle = useTekGonderim<OrtakDosya, OrtakDosya>({
    mutationFn: (d) => api.post<OrtakDosya>(`${dosyaYolu(d)}/arsivle`, { surum: d.surum } satisfies SurumluGovde),
    onSuccess: async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); bildir('tamam', 'Arşive kaldırıldı; Arşivden geri alınabilir.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Arşive kaldırılamadı')),
  });
  const sutunlar: Sutun<OrtakDosya>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (d) => <span className="tc-od-ad"><Simge ad="file" boyut="k" /><span title={d.ad}>{d.ad}</span></span> },
    ...(klasorSutunu ? [{ anahtar: 'klasor', baslik: 'Klasör', hucre: (d: OrtakDosya) => d.klasorYolu.join(' / ') }] : []),
    {
      anahtar: 'surum', baslik: 'Sürüm', mono: true,
      hucre: (d) => (d.surumSirasi > 1
        ? <button type="button" className="tc-od-surum" onClick={() => surumleriYaz(d)} title="Sürümleri göster">s{d.surumSirasi}</button>
        : `s${d.surumSirasi}`),
    },
    { anahtar: 'musteri', baslik: 'Müşteri', hucre: (d) => d.firma?.ad ?? '' },
    { anahtar: 'proje', baslik: 'Proje', hucre: (d) => projeMetni(d.proje) },
    { anahtar: 'boyut', baslik: 'Boyut', hizala: 'sag', mono: true, hucre: (d) => boyutMetni(d.boyut) },
    { anahtar: 'yukleyen', baslik: 'Yükleyen', hucre: (d) => d.yukleyenAd ?? '' },
    { anahtar: 'tarih', baslik: 'Tarih', mono: true, hucre: (d) => zamanMetni(d.zaman) },
    {
      anahtar: 'is', baslik: '', csv: false,
      hucre: (d) => (
        <span className="tc-od-satir-is">
          <Dugme simge="download" title="İndir" aria-label={`${d.ad} indir`} onClick={() => indir(d, d.surumSirasi)} />
          {enAz(duzey(d.klasorId), 'ekler') && (
            <Dugme
              simge="upload" title="Yeni sürüm yükle" aria-label={`${d.ad} yeni sürüm`} yukleniyor={yukleme.suruyor}
              onClick={() => { yeniSurum.current.dosya = d; yeniSurum.current.input?.click(); }}
            />
          )}
          {enAz(duzey(d.klasorId), 'yonetir') && (
            <Dugme simge="lock" title="Arşive kaldır" aria-label={`${d.ad} arşive kaldır`} onClick={() => arsivle.mutate(d)} />
          )}
        </span>
      ),
    },
  ];
  return (
    <>
      <Tablo etiket="Dosyalar" sutunlar={sutunlar} satirlar={dosyalar} satirAnahtari={(d) => d.id} bosMesaj={bosMesaj} />
      <input
        ref={(e) => { yeniSurum.current.input = e; }} type="file" hidden
        onChange={(o) => { const d = yeniSurum.current.dosya; if (d !== null) void yukleme.yukle(d.klasorId, o, d.ad); }}
      />
      {surumleri && <SurumPenceresi dosya={surumleri} kapat={() => surumleriYaz(null)} />}
    </>
  );
}

// Yüklemede müşteri ve proje (3443 a): yalnız dosya ilk kez yazılırken alınır; yeni sürüm dosyanın seçimini değiştirmez.
interface Secim { firmaId: number | null; projeId: number | null }
const SECIMSIZ: Secim = { firmaId: null, projeId: null };
// Boş seçim gövdeye yazılmaz: kayda bağlı klasörde ve yeni sürümde gövde bugünküyle aynı kalır.
const secimAlanlari = (s: Secim): Pick<YukleGovdesi, 'firmaId' | 'projeId'> => ({
  ...(s.firmaId === null ? {} : { firmaId: s.firmaId }), ...(s.projeId === null ? {} : { projeId: s.projeId }),
});

// Seçilen her dosya yüklenir (özet, parça) ve klasöre bağlanır. Aynı ad yeni sürüm olur; ad, yeni sürümde mevcut dosyanın adıdır.
function useYukleme() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [suruyor, suruyorYaz] = useState(false);
  const yukle = async (klasorId: number, o: ChangeEvent<HTMLInputElement>, sabitAd?: string): Promise<void> => {
    const secilen = [...(o.target.files ?? [])];
    o.target.value = '';
    await yukleListe(klasorId, secilen, SECIMSIZ, sabitAd);
  };
  const yukleListe = async (klasorId: number, secilen: readonly File[], secim: Secim, sabitAd?: string): Promise<void> => {
    if (secilen.length === 0 || suruyor) return;
    suruyorYaz(true);
    let tamam = 0;
    try {
      for (const f of secilen) {
        try {
          const ozet = await dosyaYukle(new Uint8Array(await f.arrayBuffer()), () => {});
          const govde: YukleGovdesi = { ad: sabitAd ?? f.name, ozet, ...secimAlanlari(secim) };
          await api.post<OrtakDosya>(`/ortak-dosyalar/klasorler/${klasorId}/yukle`, govde, { istekKimligi: yeniIstekKimligi() });
          tamam += 1;
        } catch (h) {
          bildir('hata', `${f.name}: ${h instanceof DosyaHatasi ? h.message : hataIletisi(h, 'Yüklenemedi')}`);
        }
      }
    } finally {
      suruyorYaz(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    }
    if (tamam > 0) bildir('tamam', `${tamam} dosya yüklendi.`);
  };
  // Ad önerisi penceresinden gelen tek dosya.
  const yukleDosya = async (klasorId: number, f: File, ad: string, secim: Secim = SECIMSIZ): Promise<void> => {
    if (suruyor) return;
    suruyorYaz(true);
    try {
      const ozet = await dosyaYukle(new Uint8Array(await f.arrayBuffer()), () => {});
      await api.post<OrtakDosya>(`/ortak-dosyalar/klasorler/${klasorId}/yukle`, { ad, ozet, ...secimAlanlari(secim) } satisfies YukleGovdesi, { istekKimligi: yeniIstekKimligi() });
      bildir('tamam', `${ad} yüklendi.`);
    } catch (h) {
      bildir('hata', `${ad}: ${h instanceof DosyaHatasi ? h.message : hataIletisi(h, 'Yüklenemedi')}`);
    } finally {
      suruyorYaz(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    }
  };
  return { yukle, yukleListe, yukleDosya, suruyor };
}

// Yükleme adı önerisi (zorunlu değil): "<no>_<alt klasör>_r1.<uzantı>"; aynı ad yeni sürüm olur.
function oneriAdi(o: { onek: string; altKlasor: string | null }, dosyaAdi: string): string {
  const nokta = dosyaAdi.lastIndexOf('.');
  const uzanti = nokta > 0 ? dosyaAdi.slice(nokta) : '';
  return `${[o.onek, o.altKlasor].filter(Boolean).join('_')}_r1${uzanti}`;
}

// Müşteri ve proje seçicisi (3443 a, 1): müşteri yalnız müşteri ve ikisi türü firmalar; proje seçilen müşteriye göre süzülür.
// Müşteri değişince proje temizlenir; önce proje seçilirse müşterisi dolar. Sunucu her yüklemede yeniden denetler.
function MusteriProjeSecimi({ musteri, proje, degistir, bosEtiket }: {
  musteri: SeciliKayit | null; proje: SeciliKayit | null; degistir: (m: SeciliKayit | null, p: SeciliKayit | null, temizlendi: boolean) => void;
  bosEtiket?: boolean;
}) {
  const musteriEtiketi = bosEtiket === true ? 'Müşteri' : 'Müşteri (isteğe bağlı)';
  const projeEtiketi = bosEtiket === true ? 'Proje' : 'Proje (isteğe bağlı)';
  // Seçici etiketini yalnız erişilebilir ad olarak taşır; pencerede görünür etiket alan sınıflarıyla yazılır.
  return (
    <>
      <div className="tc-alan">
        <span className="tc-alan-etiket" aria-hidden="true">{musteriEtiketi}</span>
        <KayitSecici
          etiket={musteriEtiketi} simge="building" yol="/ortak-dosyalar/secim/musteriler" bosaltilabilir
          yerTutucu={bosEtiket === true ? 'Müşteri: tümü' : 'Seçilmedi'} deger={musteri}
          sec={(k) => {
            const yeni = k === null ? null : { id: k.id, kod: k.kod, ad: k.ad };
            const temizle = proje !== null && yeni?.id !== musteri?.id;
            degistir(yeni, temizle ? null : proje, temizle);
          }}
        />
      </div>
      <div className="tc-alan">
        <span className="tc-alan-etiket" aria-hidden="true">{projeEtiketi}</span>
        <KayitSecici
          etiket={projeEtiketi} simge="kanban" yol="/ortak-dosyalar/secim/projeler" bosaltilabilir
          yerTutucu={bosEtiket === true ? 'Proje: tümü' : 'Seçilmedi'} deger={proje} suzgec={{ firmaId: musteri?.id }}
          sec={(k) => {
            const yeni = k === null ? null : { id: k.id, kod: k.kod, ad: k.ad };
            degistir(musteri ?? (k?.ust ?? null), yeni, false);
          }}
        />
      </div>
    </>
  );
}

// Yükleme penceresi: tek dosyada ad, müşteri ve proje; çok dosyada yalnız müşteri ve proje (hepsine uygulanır). Kayda bağlı
// klasörde seçim klasörden gelir: pencere seçici göstermez, yalnız ad önerisi için açılır.
function YuklemePenceresi({ dosyalar, oneri, kayitli, kapat, yukle }: {
  dosyalar: readonly File[]; oneri: string | null; kayitli: DosyalarCevabi['kayitSecimi'];
  kapat: () => void; yukle: (ad: string | null, secim: Secim) => void;
}) {
  const tek = dosyalar.length === 1 ? dosyalar[0] ?? null : null;
  const [ad, adYaz] = useState(oneri ?? tek?.name ?? '');
  const [musteri, musteriYaz] = useState<SeciliKayit | null>(null);
  const [proje, projeYaz] = useState<SeciliKayit | null>(null);
  const [temizlendi, temizlendiYaz] = useState(false);
  const adGecersiz = tek !== null && ad.trim() === '';
  return (
    <Pencere
      acik kapat={kapat} baslik={`Dosya yükle · ${dosyalar.length} dosya`}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme
            tur="birincil" simge="upload" disabled={adGecersiz}
            onClick={() => yukle(tek === null ? null : ad.trim(), kayitli !== null ? SECIMSIZ : { firmaId: musteri?.id ?? null, projeId: proje?.id ?? null })}
          >
            Yükle
          </Dugme>
        </>
      )}
    >
      <div className="tc-od-form">
        {tek !== null && (
          <>
            <Girdi etiket="Dosya adı" required maxLength={120} value={ad} onChange={(o) => adYaz(o.target.value)} autoFocus />
            {oneri !== null && (
              <p className="tc-od-ipucu tc-od-oneri">
                Önerilen ad: sipariş ya da proje no, alt klasör, revizyon. Değiştirebilirsiniz.{' '}
                <button type="button" className="tc-od-baglanti" onClick={() => adYaz(tek.name)}>Özgün adı kullan</button>
              </p>
            )}
            <p className="tc-od-ipucu">Bu klasörde aynı adlı dosya varsa yeni sürüm olarak eklenir.</p>
          </>
        )}
        {kayitli !== null ? (
          <p className="tc-od-ipucu">
            {`Müşteri ve proje klasörün kaydından yazılır: ${[kayitli.firma?.ad, projeMetni(kayitli.proje)].filter(Boolean).join(' · ') || 'kayıt bulunamadı'}.`}
          </p>
        ) : (
          <>
            {tek === null && <p className="tc-od-ipucu">{`Dosyalar kendi adlarıyla yüklenir; seçim ${dosyalar.length} dosyanın hepsine uygulanır.`}</p>}
            <MusteriProjeSecimi
              musteri={musteri} proje={proje}
              degistir={(m, p, t) => { musteriYaz(m); projeYaz(p); temizlendiYaz(t); }}
            />
            <p className="tc-od-ipucu" aria-live="polite">
              {temizlendi ? 'Proje temizlendi: seçilen müşterinin projesi değildi.' : musteri !== null ? `Yalnız ${musteri.ad} projeleri listelenir.` : 'Seçim isteğe bağlıdır; dosyanın bütün sürümleri için geçerlidir.'}
            </p>
          </>
        )}
      </div>
    </Pencere>
  );
}

function DosyalarSekmesi({ klasorId, ara, sec, yeniKlasor }: { klasorId: number; ara: string; sec: (id: number) => void; yeniKlasor: () => void }) {
  const q = useQuery({
    queryKey: anahtarlar.dosyalar(klasorId, ara),
    queryFn: () => api.get<DosyalarCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/dosyalar${ara.trim() === '' ? '' : `?ara=${encodeURIComponent(ara.trim())}`}`),
  });
  const secim = useRef<HTMLInputElement | null>(null);
  const yukleme = useYukleme();
  const [bekleyen, bekleyenYaz] = useState<readonly File[] | null>(null);
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Klasör okunamadı')} yenile={() => { void q.refetch(); }} />;
  const { klasor, altKlasorler, dosyalar, adOnerisi, kayitSecimi } = q.data;
  const kaynak = kaynakBaglantisi(klasor);
  // Serbest klasörde her yüklemede pencere açılır (ad, müşteri, proje). Kayda bağlı klasörde seçim klasördendir: pencere yalnız
  // tek dosyada ad önerisi için açılır, birden çok dosya doğrudan kendi adlarıyla yüklenir.
  const secildi = (o: ChangeEvent<HTMLInputElement>) => {
    const f = [...(o.target.files ?? [])];
    if (f.length === 0) return;
    if (kayitSecimi === null || (adOnerisi !== null && f.length === 1)) { bekleyenYaz(f); o.target.value = ''; return; }
    void yukleme.yukle(klasor.id, o);
  };
  return (
    <div>
      <div className="tc-od-arac">
        <Dugme tur="birincil" simge="upload" disabled={!enAz(klasor.duzey, 'ekler')} yukleniyor={yukleme.suruyor} onClick={() => secim.current?.click()}>Dosya yükle</Dugme>
        {enAz(klasor.duzey, 'yonetir') && <Dugme simge="plus" onClick={yeniKlasor}>Alt klasör</Dugme>}
        <span className="tc-od-bilgi"><Simge ad="lock" boyut="k" />Yetkiniz: {DUZEY_ADI[klasor.duzey]}</span>
        <input ref={secim} type="file" multiple hidden onChange={secildi} />
      </div>
      {klasor.kaynak !== null && (
        <div className="tc-od-kaynak">
          <Rozet ton="bilgi">{KAYDA_BAGLI}</Rozet>
          {kaynak !== null && (
            <span>
              {`Bu klasör ${KAYNAK_ADI[kaynak.tur]} bağlı: `}
              <Link to={kaynak.yol}>{kaynak.metin}</Link>
            </span>
          )}
        </div>
      )}
      {bekleyen !== null && (
        <YuklemePenceresi
          dosyalar={bekleyen} kayitli={kayitSecimi} kapat={() => bekleyenYaz(null)}
          oneri={adOnerisi !== null && bekleyen.length === 1 && bekleyen[0] !== undefined ? oneriAdi(adOnerisi, bekleyen[0].name) : null}
          yukle={(ad, secim) => {
            const f = bekleyen;
            bekleyenYaz(null);
            if (ad !== null && f.length === 1 && f[0] !== undefined) void yukleme.yukleDosya(klasor.id, f[0], ad, secim);
            else void yukleme.yukleListe(klasor.id, f, secim);
          }}
        />
      )}
      {altKlasorler.length > 0 && (
        <ul className="tc-od-altlar">
          {sirala(altKlasorler).map((k) => (
            <li key={k.id}>
              <button type="button" className="tc-od-klasor" onClick={() => sec(k.id)}><Simge ad="layers" boyut="k" /><span>{k.ad}</span></button>
              <span className="tc-od-ipucu">{k.dosyaSayisi} dosya</span>
            </li>
          ))}
        </ul>
      )}
      <DosyaTablosu
        dosyalar={dosyalar} klasorSutunu={false} duzey={() => klasor.duzey}
        bosMesaj={ara.trim() === '' ? 'Bu klasörde dosya yok.' : 'Aramaya uyan dosya yok.'}
      />
    </div>
  );
}

function YetkilerSekmesi({ klasorId, ustVar }: { klasorId: number; ustVar: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const q = useQuery({ queryKey: anahtarlar.yetki(klasorId), queryFn: () => api.get<YetkiCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/yetki`) });
  const [taslak, taslakYaz] = useState<{ surum: number; ozelYetki: boolean; satirlar: Map<number, VerilenDuzey> } | null>(null);
  const kaydet = useTekGonderim<YetkiGovdesi, YetkiCevabi>({
    mutationFn: (g) => api.post<YetkiCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/yetki`, g),
    onSuccess: async () => {
      taslakYaz(null);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', 'Yetki kaydedildi; denetim kaydına yazıldı.');
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Yetki kaydedilemedi')),
  });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Yetki okunamadı')} />;
  const y = q.data;
  const gecerli = taslak !== null && taslak.surum === y.surum ? taslak : { surum: y.surum, ozelYetki: y.ozelYetki, satirlar: new Map(y.satirlar.map((s) => [s.rolId, s.duzey])) };
  const kirli = taslak !== null && taslak.surum === y.surum;
  const degistir = (yeni: Partial<typeof gecerli>) => taslakYaz({ ...gecerli, ...yeni });
  return (
    <div>
      <div className="tc-od-yetki-ust">
        {ustVar ? (
          <label className="tc-od-anahtar">
            <input type="checkbox" checked={gecerli.ozelYetki} onChange={(o) => degistir({ ozelYetki: o.target.checked })} />
            Özel yetki (üst klasörden alma)
          </label>
        ) : <span>Üst düzey klasör: yetkiyi kendisi taşır.</span>}
        {!gecerli.ozelYetki && ustVar && <Rozet ton="pasif">Kaynak: {y.kaynakAd}</Rozet>}
        <span className="tc-od-sag">
          <Dugme disabled={!kirli} onClick={() => taslakYaz(null)}>Vazgeç</Dugme>
          <Dugme
            tur="birincil" simge="check" disabled={!kirli} yukleniyor={kaydet.isPending}
            onClick={() => kaydet.mutate({
              surum: y.surum, ozelYetki: gecerli.ozelYetki,
              satirlar: gecerli.ozelYetki ? [...gecerli.satirlar].map(([rolId, duzey]) => ({ rolId, duzey })) : [],
            })}
          >
            Kaydet
          </Dugme>
        </span>
      </div>
      <table className="tc-od-yetkiler">
        <thead><tr><th>Rol</th><th>Düzey</th><th>Ne yapabilir</th></tr></thead>
        <tbody>
          {y.roller.map((r) => {
            const v: KlasorDuzeyi = r.yonetici ? 'yonetir' : gecerli.satirlar.get(r.id) ?? 'yok';
            const pasif = !gecerli.ozelYetki;
            return (
              <tr key={r.id}>
                <td>{r.ad}</td>
                <td>
                  {r.yonetici ? <Rozet ton="bilgi">Her klasörü yönetir</Rozet> : (
                    <div className="tc-od-duzey" role="group" aria-label={`${r.ad} yetki düzeyi`} aria-disabled={pasif ? 'true' : undefined}>
                      {DUZEYLER.map((d) => (
                        <button
                          key={d} type="button" aria-pressed={v === d} disabled={pasif}
                          onClick={() => {
                            const m = new Map(gecerli.satirlar);
                            if (d === 'yok') m.delete(r.id); else m.set(r.id, d);
                            degistir({ satirlar: m });
                          }}
                        >
                          {DUZEY_ADI[d]}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="tc-od-ipucu">{DUZEY_ACIKLAMASI[v]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tc-od-ipucu tc-od-aciklama">
        Özel yetkisi olmayan alt klasörler bu ayarı alır. Yetki sunucuda her istekte denetlenir; ekranda gizlemek yetki değildir.
      </p>
    </div>
  );
}

function GecmisSekmesi({ klasorId }: { klasorId: number }) {
  const q = useQuery({ queryKey: anahtarlar.gecmis(klasorId), queryFn: () => api.get<GecmisCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/gecmis`) });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Geçmiş okunamadı')} />;
  if (q.data.olaylar.length === 0) return <p className="tc-od-bos">Bu klasörde kayıtlı olay yok.</p>;
  return (
    <ul className="tc-od-olaylar">
      {q.data.olaylar.map((o, i) => (
        <li key={`${o.zaman}-${i}`}>
          <Simge ad="clock" boyut="k" />
          <span>
            {`${o.kisiAd ?? 'Bilinmeyen kişi'}: ${OLAY_ADI[o.olay]}`}
            {o.dosyaAdi !== null && ` ${o.dosyaAdi}`}
            {o.olay === 'yeni-surum' && o.surumSirasi !== null && ` (s${o.surumSirasi})`}
          </span>
          <time className="mono">{zamanMetni(o.zaman)}</time>
        </li>
      ))}
    </ul>
  );
}

const sorgu = (s: Record<string, string | number | null>): string => {
  const p = new URLSearchParams(Object.entries(s).flatMap(([a, d]) => (d === null || d === '' ? [] : [[a, String(d)]])));
  const m = p.toString();
  return m === '' ? '' : `?${m}`;
};

function SonEklenenler({ ara, klasorler }: { ara: string; klasorler: readonly Klasor[] }) {
  const [musteri, musteriYaz] = useState<SeciliKayit | null>(null);
  const [proje, projeYaz] = useState<SeciliKayit | null>(null);
  const firmaId = musteri?.id ?? null;
  const projeId = proje?.id ?? null;
  const q = useQuery({
    queryKey: anahtarlar.son(ara.trim(), firmaId, projeId),
    queryFn: () => api.get<DosyaListesiCevabi>(`/ortak-dosyalar/son-eklenenler${sorgu({ ara: ara.trim(), firmaId, projeId })}`),
  });
  const suzulu = ara.trim() !== '' || firmaId !== null || projeId !== null;
  const duzey = (id: number): KlasorDuzeyi => klasorler.find((k) => k.id === id)?.duzey ?? 'gorur';
  return (
    <div>
      <div className="tc-od-arac tc-od-suzgecler">
        <MusteriProjeSecimi musteri={musteri} proje={proje} bosEtiket degistir={(m, p) => { musteriYaz(m); projeYaz(p); }} />
        {(firmaId !== null || projeId !== null) && <Dugme simge="x" onClick={() => { musteriYaz(null); projeYaz(null); }}>Temizle</Dugme>}
      </div>
      {q.isPending && <DurumKutusu durum="yukleniyor" />}
      {q.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Son eklenenler okunamadı')} />}
      {q.data && <DosyaTablosu dosyalar={q.data.dosyalar} klasorSutunu duzey={duzey} bosMesaj={suzulu ? 'Süzgece uyan dosya yok.' : 'Henüz dosya yok.'} />}
    </div>
  );
}

const silmeAdiUyar = (yazilan: string, ad: string): boolean =>
  yazilan.trim().normalize('NFC').toLocaleLowerCase('tr-TR') === ad.trim().normalize('NFC').toLocaleLowerCase('tr-TR');

// Kalıcı silme onayı (3443 a, 4 ve 6): kişi dosyanın adını yazar; sunucu adı, arşivi ve sürümü yeniden denetler.
function SilmePenceresi({ dosya, onay, kapat, sil, bekliyor, hata }: {
  dosya: OrtakDosya; onay: boolean; kapat: () => void; sil: (ad: string) => void; bekliyor: boolean; hata: string | null;
}) {
  const [ad, adYaz] = useState('');
  const surumMetni = dosya.surumSirasi > 1 ? `Dosya ve ${dosya.surumSirasi} sürümü` : 'Dosya';
  return (
    <Pencere
      acik kapat={() => { if (!bekliyor) kapat(); }} baslik={`${dosya.ad} kalıcı silinsin mi?`}
      alt={(
        <>
          <Dugme disabled={bekliyor} onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="trash" disabled={!silmeAdiUyar(ad, dosya.ad)} yukleniyor={bekliyor} onClick={() => sil(ad)}>
            {onay ? 'Onayla ve sil' : 'Kalıcı sil'}
          </Dugme>
        </>
      )}
    >
      <div className="tc-od-form">
        <p className="tc-od-uyari"><Simge ad="alert" boyut="k" />{`${surumMetni} geri alınamaz; yalnız tüm veritabanı yedeğinden döner.`}</p>
        <p className="tc-od-ipucu">Klasörün Geçmiş'inde dosyanın adı ve silen kişi kalır.</p>
        <Girdi etiket={onay ? 'Onaylamak için dosya adını yazın' : 'Silmek için dosya adını yazın'} maxLength={120} value={ad} onChange={(o) => adYaz(o.target.value)} autoFocus />
        <p className="tc-od-ipucu mono">{dosya.ad}</p>
        {hata !== null && <p className="tc-od-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

type SilmeEylemi = 'silme-iste' | 'silme-reddet' | 'silme-geri-cek';
const SILME_BILDIRIMI: Record<SilmeEylemi, string> = {
  'silme-iste': 'Silme istendi; klasörde Yönetir düzeyi olan başka bir kişinin onayını bekliyor.',
  'silme-reddet': 'Silme isteği reddedildi; dosya arşivde kalır.',
  'silme-geri-cek': 'Silme isteği geri çekildi.',
};

function Arsiv() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [onayBekleyen, onayBekleyenYaz] = useState(false);
  const [silinecek, silinecekYaz] = useState<OrtakDosya | null>(null);
  const tum = useQuery({ queryKey: anahtarlar.arsiv(false), queryFn: () => api.get<ArsivCevabi>('/ortak-dosyalar/arsiv') });
  const suzulu = useQuery({
    queryKey: anahtarlar.arsiv(true), enabled: onayBekleyen,
    queryFn: () => api.get<ArsivCevabi>('/ortak-dosyalar/arsiv?onayBekleyen=true'),
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.kok });
  const geriAl = useTekGonderim<OrtakDosya, OrtakDosya>({
    mutationFn: (d) => api.post<OrtakDosya>(`${dosyaYolu(d)}/arsivden-cikar`, { surum: d.surum } satisfies SurumluGovde),
    onSuccess: async (_c, d) => { await yenile(); bildir('tamam', d.silmeIstegi === null ? 'Geri alındı.' : 'Geri alındı; silme isteği düştü.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Geri alınamadı')),
  });
  const istek = useTekGonderim<{ d: OrtakDosya; eylem: SilmeEylemi }, OrtakDosya>({
    mutationFn: ({ d, eylem }) => api.post<OrtakDosya>(`${dosyaYolu(d)}/${eylem}`, { surum: d.surum } satisfies SurumluGovde),
    onSuccess: async (_c, { eylem }) => { await yenile(); bildir('tamam', SILME_BILDIRIMI[eylem]); },
    onError: (h) => bildir('hata', hataIletisi(h, 'İşlem yapılamadı')),
  });
  const sil = useTekGonderim<{ d: OrtakDosya; ad: string }, undefined>({
    mutationFn: ({ d, ad }) => api.post<undefined>(`${dosyaYolu(d)}/${d.silmeIstegi === null ? 'kalici-sil' : 'silme-onayla'}`, { surum: d.surum, ad } satisfies KaliciSilGovdesi),
    onSuccess: async (_c, { d }) => { silinecekYaz(null); await yenile(); bildir('tamam', `${d.ad} kalıcı silindi; denetim kaydına ve klasörün Geçmiş'ine yazıldı.`); },
  });
  const q = onayBekleyen ? suzulu : tum;
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Arşiv okunamadı')} />;
  const { dosyalar, silmeDortGoz } = q.data;
  const bekleyenSayisi = tum.data?.dosyalar.filter((d) => d.silmeIstegi !== null).length ?? 0;
  const silmeDugmeleri = (d: OrtakDosya) => {
    const i = d.silmeIstegi;
    if (i === null) {
      return silmeDortGoz
        ? <Dugme simge="trash" onClick={() => istek.mutate({ d, eylem: 'silme-iste' })}>Silme iste</Dugme>
        : <Dugme tur="tehlike" simge="trash" onClick={() => { sil.reset(); silinecekYaz(d); }}>Kalıcı sil</Dugme>;
    }
    if (i.kendi) return <Dugme simge="x" onClick={() => istek.mutate({ d, eylem: 'silme-geri-cek' })}>İsteği geri çek</Dugme>;
    return (
      <>
        <Dugme tur="tehlike" simge="trash" onClick={() => { sil.reset(); silinecekYaz(d); }}>Onayla ve sil</Dugme>
        <Dugme simge="x" onClick={() => istek.mutate({ d, eylem: 'silme-reddet' })}>Reddet</Dugme>
      </>
    );
  };
  const sutunlar: Sutun<OrtakDosya>[] = [
    {
      anahtar: 'ad', baslik: 'Ad', kartTamSatir: true,
      hucre: (d) => (
        <span className="tc-od-arsiv-ad">
          <span className="tc-od-ad"><Simge ad="lock" boyut="k" /><span title={d.ad}>{d.ad}</span></span>
          {d.silmeIstegi !== null && (
            <span className="tc-od-istek">
              <Rozet ton="uyari"><Simge ad="clock" boyut="k" />Silme onayı bekliyor</Rozet>
              <span className="tc-od-ipucu">
                {d.silmeIstegi.kendi ? 'Kendi isteğiniz' : `${d.silmeIstegi.isteyenAd ?? 'Bilinmeyen kişi'} istedi`}
                {' · '}<time className="mono">{zamanMetni(d.silmeIstegi.zaman)}</time>
              </span>
            </span>
          )}
        </span>
      ),
    },
    { anahtar: 'klasor', baslik: 'Klasör', hucre: (d) => d.klasorYolu.join(' / ') },
    { anahtar: 'musteri', baslik: 'Müşteri', hucre: (d) => d.firma?.ad ?? '' },
    {
      anahtar: 'is', baslik: '', csv: false, kartTamSatir: true,
      hucre: (d) => (
        <span className="tc-od-satir-is">
          <Dugme simge="back" onClick={() => geriAl.mutate(d)}>Geri al</Dugme>
          {silmeDugmeleri(d)}
        </span>
      ),
    },
  ];
  return (
    <div>
      <div className="tc-od-arac">
        <div className="tc-od-duzey" role="group" aria-label="Arşiv süzgeci">
          <button type="button" aria-pressed={!onayBekleyen} onClick={() => onayBekleyenYaz(false)}>Tümü</button>
          <button type="button" aria-pressed={onayBekleyen} onClick={() => onayBekleyenYaz(true)}>{`Onay bekleyen · ${bekleyenSayisi}`}</button>
        </div>
        <span className="tc-od-ipucu">
          {silmeDortGoz
            ? 'Kalıcı silme dört gözle: klasörde Yönetir düzeyi olan başka bir kişi onaylar.'
            : 'Kalıcı silinen dosya geri alınamaz; arşive kaldırma geri alınabilir.'}
        </span>
      </div>
      <Tablo
        etiket="Arşiv" sutunlar={sutunlar} satirlar={dosyalar} satirAnahtari={(d) => d.id}
        bosMesaj={onayBekleyen ? 'Onay bekleyen silme isteği yok.' : 'Arşivde geri alabileceğiniz dosya yok.'}
      />
      {silinecek !== null && (
        <SilmePenceresi
          key={silinecek.id} dosya={silinecek} onay={silinecek.silmeIstegi !== null} kapat={() => silinecekYaz(null)}
          bekliyor={sil.isPending} hata={sil.isError ? hataIletisi(sil.error, 'Silinemedi') : null}
          sil={(ad) => sil.mutate({ d: silinecek, ad })}
        />
      )}
    </div>
  );
}

function yolu(klasorler: readonly Klasor[], id: number | null): Klasor[] {
  const y: Klasor[] = [];
  let k = klasorler.find((x) => x.id === id);
  while (k !== undefined && !y.includes(k)) {
    y.unshift(k);
    const ust = k.ustId;
    k = ust === null ? undefined : klasorler.find((x) => x.id === ust);
  }
  return y;
}

export function OrtakDosyalar({ gorunum, liste = null }: { gorunum: Gorunum; liste?: HazirListe | null }) {
  const git = useNavigate();
  // Kayıt ekranındaki "Klasör" bağlantısı klasörü `?klasor=` ile açar (kart 3288-2); görünmeyen kimlik seçimi değiştirmez.
  const [adres] = useSearchParams();
  const [secili, seciliYaz] = useState<number | null>(() => { const n = Number(adres.get('klasor')); return Number.isInteger(n) && n > 0 ? n : null; });
  const [sekme, sekmeYaz] = useState<SekmeAdi>('dosyalar');
  const [ara, araYaz] = useState('');
  const [agacAcik, agacAcikYaz] = useState(false);
  const [agacAra, agacAraYaz] = useState('');
  const [pencere, pencereYaz] = useState<{ ust: number | null } | null>(null);
  const q = useQuery({ queryKey: anahtarlar.klasorler, queryFn: () => api.get<KlasorlerCevabi>('/ortak-dosyalar/klasorler') });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Klasörler okunamadı')} yenile={() => { void q.refetch(); }} />;
  const { klasorler, yonetici } = q.data;
  const ilk = sirala(klasorler.filter((k) => k.ustId === null))[0] ?? null;
  const seciliKlasor = klasorler.find((k) => k.id === secili) ?? ilk;
  const sec = (id: number) => { seciliYaz(id); agacAcikYaz(false); if (gorunum !== 'klasorler') void git('/ortak-dosyalar'); };
  const gecerliSekme: SekmeAdi = !yonetici && sekme === 'yetkiler' ? 'dosyalar' : sekme;
  let govde;
  if (gorunum === 'ayarlar') govde = yonetici ? <Ayarlar /> : <p className="tc-od-bos">Ayarlar yalnız yöneticidedir.</p>;
  else if (gorunum === 'son') govde = <SonEklenenler ara={ara} klasorler={klasorler} />;
  else if (gorunum === 'arsiv') govde = <Arsiv />;
  else if (gorunum === 'hazir' && liste !== null) govde = <HazirListeGorunumu liste={liste} anahtar={adres.get('kayit')} />;
  else if (seciliKlasor === null) govde = <p className="tc-od-bos">Bu rolün görebildiği klasör yok.</p>;
  else if (gecerliSekme === 'yetkiler') govde = <YetkilerSekmesi key={seciliKlasor.id} klasorId={seciliKlasor.id} ustVar={seciliKlasor.ustId !== null} />;
  else if (gecerliSekme === 'gecmis') govde = <GecmisSekmesi klasorId={seciliKlasor.id} />;
  else govde = <DosyalarSekmesi klasorId={seciliKlasor.id} ara={ara} sec={sec} yeniKlasor={() => pencereYaz({ ust: seciliKlasor.id })} />;
  return (
    <div className="tc-od-sayfa">
      <div className="tc-od-bas">
        <h1><Simge ad="file" />Ortak Dosyalar</h1>
        {gorunum !== 'ayarlar' && gorunum !== 'hazir' && (
          <label className="tc-od-ara">
            <Simge ad="search" boyut="k" />
            <input type="search" placeholder="Dosya ara" aria-label="Dosya ara" value={ara} onChange={(o) => araYaz(o.target.value)} />
          </label>
        )}
      </div>
      {gorunum === 'ayarlar' ? govde : (
      <div className={`tc-od-izgara${gorunum === 'hazir' ? ' tc-od-izgara-hazir' : ''}`}>
        <div className={`tc-od-agac-kart${agacAcik ? ' tc-od-acik' : ''}`}>
          <Kart
            baslik="Klasörler" simge="layers"
            sag={yonetici ? <Dugme simge="plus" title="Üst düzeyde klasör aç" aria-label="Üst düzeyde klasör aç" onClick={() => pencereYaz({ ust: null })} /> : undefined}
          >
            <label className="tc-od-ara tc-od-agac-ara">
              <Simge ad="search" boyut="k" />
              <input type="search" placeholder="Klasör ara (müşteri, sipariş no, proje)" aria-label="Klasör ara" value={agacAra} onChange={(o) => agacAraYaz(o.target.value)} />
            </label>
            <Agac klasorler={agacSuz(klasorler, agacAra)} aranan={agacAra.trim() !== ''} secili={gorunum === 'klasorler' ? seciliKlasor?.id ?? null : null} sec={sec} />
          </Kart>
          <HazirMenu secili={gorunum === 'hazir' ? liste : null} />
        </div>
        <Kart>
          <div className="tc-od-arac tc-od-cizgili">
            <span className="tc-od-agac-ac"><Dugme simge="layers" onClick={() => agacAcikYaz((a) => !a)}>Klasörler ve listeler</Dugme></span>
            <nav className="tc-od-yol" aria-label="Klasör yolu">
              {gorunum === 'klasorler'
                ? yolu(klasorler, seciliKlasor?.id ?? null).map((k, i) => (
                  <span key={k.id}>
                    {i > 0 && <span aria-hidden="true">/</span>}
                    <button type="button" onClick={() => seciliYaz(k.id)}>{k.ad}</button>
                  </span>
                ))
                : <button type="button">{gorunum === 'son' ? 'Son eklenenler' : gorunum === 'hazir' && liste !== null ? HAZIR_LISTE_TANIMLARI[liste].baslik : 'Arşiv'}</button>}
            </nav>
          </div>
          {gorunum === 'klasorler' && seciliKlasor !== null && (
            <Sekmeler<SekmeAdi>
              etiket="Klasör sekmeleri"
              sekmeler={[
                { anahtar: 'dosyalar', baslik: 'Dosyalar', simge: 'file' },
                ...(yonetici ? [{ anahtar: 'yetkiler' as const, baslik: 'Yetkiler', simge: 'lock' as const }] : []),
                { anahtar: 'gecmis', baslik: 'Geçmiş', simge: 'clock' },
              ]}
              secili={gecerliSekme}
              sec={sekmeYaz}
            />
          )}
          {govde}
        </Kart>
      </div>
      )}
      {pencere && (
        <KlasorPenceresi
          ust={pencere.ust}
          ustAdi={klasorler.find((k) => k.id === pencere.ust)?.ad ?? null}
          kapat={() => pencereYaz(null)}
          acildi={(k) => { pencereYaz(null); seciliYaz(k.id); sekmeYaz(k.ustId === null ? 'yetkiler' : 'dosyalar'); }}
        />
      )}
    </div>
  );
}
