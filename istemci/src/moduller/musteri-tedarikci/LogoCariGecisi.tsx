import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  LOGO_CARI_OKUMA_PARTISI, LOGO_CARI_SAYFA_BOYU, LOGO_CARI_TOPLU_SINIRI,
} from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type {
  LogoCariGeriAlCevabi, LogoCariKartlariCevabi, LogoCariListeCevabi, LogoCariListeDurumu, LogoCariListeSatiri, LogoCariSatiri,
  LogoCariSonIslemCevabi, LogoCariTopluCevabi, LogoCariTopluSonucu,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { csvIndir } from '../../ortak/veri/csv.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CrmDenetimi } from './CrmDenetimi.tsx';
import { CrmRozeti, useLogoCrmKodla } from './logo-crm.tsx';
import {
  islemDegeri, islemSecenekleri, oneriIslemi, onKontrolPlani, type CariIslemi, type OnKontrolPlani,
} from './logo-cari-gecisi.ts';
import './musteri-tedarikci.css';

// Logo geçişi, cariler sekmesi (3343, 3474-1 C). Liste Logo cari aynasından gelir (Logo'ya gitmez); her satırda Logo carisi, CORE karşılığı ve
// "Ne yapılsın". Seçilenler ön kontrolde Logo'dan okunur (vergi no dahil), sonra tek komutla işlenir; son toplu işlem geri alınabilir
// (açılan firma pasife alınır, bağlama çözülür). Logo'ya bir şey yazılmaz.
const DURUM: Record<LogoCariListeDurumu, { ad: string; ton: RozetTonu; simge: SimgeAdi }> = {
  yeni: { ad: 'Yeni', ton: 'uyari', simge: 'plus' },
  baglanabilir: { ad: 'Bağlanabilir', ton: 'bilgi', simge: 'tag' },
  bagli: { ad: 'Bağlı', ton: 'tamam', simge: 'check' },
  eslesik: { ad: 'Elle bakılmalı', ton: 'pasif', simge: 'help' },
  alinamaz: { ad: 'Alınamaz', ton: 'hata', simge: 'alert' },
};
type Suzgec = LogoCariListeDurumu | 'tumu';
const SUZGEC_SIRASI: readonly Suzgec[] = ['tumu', 'yeni', 'baglanabilir', 'bagli', 'eslesik', 'alinamaz'];
const NEDEN_ADI = { 'cari-kodu': 'aynı Logo cari kodu', kod: 'aynı kod' } as const;
const YAZMA_YETKISI = 'musteri-tedarikci.yaz';

export const LOGO_CARI_ANAHTARI = ['musteri-tedarikci', 'logo-cari'] as const;

export function LogoCariGecisi() {
  const oturum = useOturum();
  const istemci = useQueryClient();
  const navigate = useNavigate();
  const { bildir } = useBildirim();
  const [metin, metinYaz] = useState('');
  const [suzgec, suzgecYaz] = useState<Suzgec>('tumu');
  const [sayfa, sayfaYaz] = useState(0);
  const [secim, secimYaz] = useState<ReadonlyMap<string, CariIslemi>>(new Map());
  const [tercih, tercihYaz] = useState<ReadonlyMap<string, CariIslemi>>(new Map());
  const [kontrol, kontrolYaz] = useState(false);
  const [sonuc, sonucYaz] = useState<readonly LogoCariTopluSonucu[] | null>(null);
  const [geriAl, geriAlYaz] = useState<{ islem: string; acilan: number; baglanan: number } | null>(null);
  const yazabilir = oturum.data?.islemler.includes(YAZMA_YETKISI) === true;
  const ara = metin.trim().length >= 2 ? metin.trim() : undefined;
  const sorgu = { suzgec, ara, sayfa };
  const liste = useQuery({
    queryKey: anahtarlar.logoCariListe(sorgu),
    queryFn: () => {
      const p = new URLSearchParams({ suzgec, sayfa: String(sayfa) });
      if (ara !== undefined) p.set('ara', ara);
      return api.get<LogoCariListeCevabi>(`/musteri-tedarikci/logo-cari/liste?${p.toString()}`);
    },
    enabled: yazabilir,
    placeholderData: keepPreviousData,
  });
  const son = useQuery({
    queryKey: anahtarlar.logoCariSonIslem(),
    queryFn: () => api.get<LogoCariSonIslemCevabi>('/musteri-tedarikci/logo-cari/son-islem'),
    enabled: yazabilir,
  });
  const yenile = async () => { await istemci.invalidateQueries({ queryKey: ['musteri-tedarikci'] }); };
  const geriAlKomutu = useKorumaliKomut({
    gonder: (islem: string, deneme) => api.post<LogoCariGeriAlCevabi>('/musteri-tedarikci/logo-cari/geri-al', { islem }, deneme),
    onSuccess: async (c) => {
      geriAlYaz(null);
      bildir(c.atlanan.length === 0 ? 'tamam' : 'bilgi', `${c.geriAlinan} satır geri alındı${c.atlanan.length > 0 ? `, ${c.atlanan.length} satır atlandı: ${c.atlanan.map((a) => `${a.logoKodu} ${a.neden}`).join('; ')}` : ''}. Pasife alınan firmalar Logo kaydına bağlı kalır.`);
      await yenile();
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Geri alınamadı.')),
  });

  const satirlar = liste.data?.satirlar ?? [];
  // 3480: CRM bağı Logo carisinin kendisinden; bağlanmamış satırda da görünür (alınamaz cari sorulmaz).
  const crm = useLogoCrmKodla(satirlar.filter((s) => s.durum !== 'alinamaz').map((s) => s.kod), yazabilir);

  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (!yazabilir) {
    return <Kart><p className="tc-mt-yok">Logo'dan cari almak ve bağlamak firma yazma yetkisi ister; yetkiniz yok.</p></Kart>;
  }

  const secimEkle = (eklenecek: readonly (readonly [string, CariIslemi])[]) => {
    const yeni = new Map(secim);
    let tasan = 0;
    for (const [kod, islem] of eklenecek) {
      if (islem.tur === 'atla') continue;
      if (!yeni.has(kod) && yeni.size >= LOGO_CARI_TOPLU_SINIRI) { tasan += 1; continue; }
      yeni.set(kod, islem);
    }
    secimYaz(yeni);
    if (tasan > 0) bildir('bilgi', `Bir seferde en çok ${LOGO_CARI_TOPLU_SINIRI} cari işlenir; ${tasan} cari seçime eklenmedi.`);
  };
  const satirIslemi = (s: LogoCariListeSatiri): CariIslemi =>
    secim.get(s.kod) ?? tercih.get(s.kod) ?? oneriIslemi(s) ?? { tur: 'atla' };
  const islemDegistir = (s: LogoCariListeSatiri, deger: string) => {
    const secenek = islemSecenekleri(s).find((o) => o.deger === deger);
    if (!secenek) return;
    tercihYaz(new Map(tercih).set(s.kod, secenek.islem));
    if (secenek.islem.tur === 'atla') {
      if (secim.has(s.kod)) { const y = new Map(secim); y.delete(s.kod); secimYaz(y); }
    } else {
      secimEkle([[s.kod, secenek.islem]]);
    }
  };
  const isaretle = (s: LogoCariListeSatiri, secili: boolean) => {
    if (secili) { secimEkle([[s.kod, satirIslemi(s)]]); return; }
    const y = new Map(secim);
    y.delete(s.kod);
    secimYaz(y);
  };
  const onerileriKabulEt = () => {
    secimEkle(satirlar.flatMap((s) => { const o = oneriIslemi(s); return o ? [[s.kod, o] as const] : []; }));
  };
  const suzgectekileriSec = (c: LogoCariListeCevabi) => {
    secimEkle(c.secilebilir.map((s) => [s.kod, s.islem === 'al' || s.firmaId === null || s.surum === null
      ? { tur: 'al' as const } : { tur: 'bagla' as const, firmaId: s.firmaId, surum: s.surum }] as const));
  };
  const suzgecSec = (d: Suzgec) => { suzgecYaz(d); sayfaYaz(0); };

  const veri = liste.data;
  const sayac = (d: Suzgec) => (veri ? veri.sayilar[d] : 0);
  const secilen = [...secim.values()];
  const alinacak = secilen.filter((i) => i.tur === 'al').length;

  const sutunlar: readonly Sutun<LogoCariListeSatiri>[] = [
    {
      anahtar: 'sec', baslik: 'Seç', csv: false,
      hucre: (s) => {
        const islem = satirIslemi(s);
        return (
          <input
            type="checkbox"
            className="tc-mt-cari-kutu"
            aria-label={`${s.kod} seç`}
            checked={secim.has(s.kod)}
            disabled={islem.tur === 'atla' && !secim.has(s.kod)}
            onChange={(o) => isaretle(s, o.target.checked)}
          />
        );
      },
    },
    {
      anahtar: 'logo', baslik: 'Logo carisi',
      hucre: (s) => (
        <span className="tc-mt-gecis-taraf">
          <span className={s.durum === 'alinamaz' ? 'tc-mt-gecis-kod' : 'tc-mt-gecis-kod tc-mt-cari-kod'}>{s.kod}</span>
          <span className="tc-mt-gecis-ek">{s.ad ?? '—'}</span>
          <CrmRozeti bilgi={crm.durum(s.kod)} />
        </span>
      ),
      csv: (s) => `${s.kod} ${s.ad ?? ''}`.trim(),
    },
    {
      anahtar: 'core', baslik: 'CORE karşılığı', kartTamSatir: true,
      hucre: (s) => <CoreKarsiligi satir={s} />,
      csv: (s) => [DURUM[s.durum].ad, ...s.adaylar.map((a) => `${a.kod ?? ''} ${a.ad}`.trim())].join(' / '),
    },
    {
      anahtar: 'islem', baslik: 'Ne yapılsın', csv: false, kartTamSatir: true,
      hucre: (s) => {
        const secenekler = islemSecenekleri(s);
        const firma = s.adaylar[0];
        if (secenekler.length === 0) {
          return firma ? (
            <Dugme simge="next" aria-label={`${s.kod} firmayı aç`} onClick={() => { void navigate(`/musteri-tedarikci?firma=${firma.firmaId}`); }}>
              Firmayı aç
            </Dugme>
          ) : <span className="tc-mt-gecis-ek">—</span>;
        }
        return (
          <select
            className="tc-alan-kutu tc-mt-cari-islem"
            aria-label={`${s.kod} ne yapılsın`}
            value={islemDegeri(satirIslemi(s))}
            onChange={(o) => islemDegistir(s, o.target.value)}
          >
            {secenekler.map((o) => <option key={o.deger} value={o.deger}>{o.baslik}</option>)}
          </select>
        );
      },
    },
  ];

  return (
    <>
      <SonIslemSeridi
        cevap={son.data ?? null}
        ac={(s) => sonucYaz(s)}
        geriAl={(g) => geriAlYaz(g)}
      />
      {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Liste okunamadı.')} yenile={() => { void liste.refetch(); }} />}
      {liste.isPending && <DurumKutusu durum="yukleniyor" />}
      {veri && !veri.baglanti && <Kart><p className="tc-mt-yok">Logo bağlantısı kurulu değil; cari listesi gelmez.</p></Kart>}
      {veri?.baglanti && (
        <Kart>
          <OkumaNotu cevap={veri} />
          <div className="tc-mt-cari-ust">
            <Girdi
              etiket="Listede ara"
              ipucu="Kod ya da ad; en az 2 karakter. Arama CORE'daki Logo listesinde yapılır, Logo'ya gitmez."
              value={metin}
              maxLength={100}
              autoComplete="off"
              onChange={(o) => { metinYaz(o.target.value); sayfaYaz(0); }}
            />
            <div className="tc-mt-cari-dugmeler">
              <Dugme simge="check" onClick={onerileriKabulEt} disabled={!satirlar.some((s) => oneriIslemi(s) !== null)}>Önerileri kabul et</Dugme>
              <Dugme simge="list" onClick={() => suzgectekileriSec(veri)} disabled={veri.secilebilir.length === 0}>
                {`Süzgeçtekilerin tümünü seç (${veri.secilebilir.length >= LOGO_CARI_TOPLU_SINIRI ? `ilk ${LOGO_CARI_TOPLU_SINIRI}` : veri.secilebilir.length})`}
              </Dugme>
            </div>
          </div>
          <Tablo
            etiket="Logo carileri"
            sutunlar={sutunlar}
            satirlar={satirlar}
            satirAnahtari={(s) => s.kod}
            mesgul={liste.isFetching}
            bosMesaj={veri.sayilar.tumu === 0 ? 'Logo listesinde cari yok.' : 'Bu süzgece ya da aramaya uyan cari yok.'}
            arac={{
              suzgec: {
                etiket: 'Süzgeç',
                secenekler: SUZGEC_SIRASI.map((d) => ({ deger: d, baslik: `${d === 'tumu' ? 'Tümü' : DURUM[d].ad} (${sayac(d)})` })),
                secili: suzgec,
                sec: (d) => suzgecSec(d as Suzgec),
              },
              csv: { ad: 'logo-gecisi-cariler' },
            }}
            sayfalama={{ sayfa: sayfa + 1, sayfaBoyu: LOGO_CARI_SAYFA_BOYU, toplam: veri.uyan, degistir: (s) => sayfaYaz(s - 1), etiket: 'Cari sayfaları' }}
          />
        </Kart>
      )}
      {secim.size > 0 && (
        <div className="tc-mt-cari-secim" role="region" aria-label="Seçim">
          <span role="status">{`${secim.size} seçili: ${secim.size - alinacak} bağla, ${alinacak} yeni firma`}</span>
          <span className="tc-mt-cari-dugmeler">
            <Dugme onClick={() => secimYaz(new Map())}>Seçimi temizle</Dugme>
            <Dugme tur="birincil" simge="search" onClick={() => kontrolYaz(true)}>Ön kontrol</Dugme>
          </span>
        </div>
      )}
      <CrmDenetimi />
      {kontrol && (
        <OnKontrolPenceresi
          secim={secim}
          kapat={() => kontrolYaz(false)}
          bitti={async (c) => { kontrolYaz(false); secimYaz(new Map()); tercihYaz(new Map()); sonucYaz(c.sonuclar); await yenile(); }}
        />
      )}
      {sonuc && <SonucPenceresi sonuclar={sonuc} kapat={() => sonucYaz(null)} />}
      <OnayPenceresi
        acik={geriAl !== null}
        baslik="Son toplu işlemi geri al"
        onayMetni="Geri al"
        tehlikeli
        yukleniyor={geriAlKomutu.isPending}
        onayla={() => { if (geriAl) geriAlKomutu.mutate(geriAl.islem); }}
        vazgec={() => geriAlYaz(null)}
      >
        <ul className="tc-mt-gecis-liste">
          <li><Simge ad="minus" boyut="k" /><span>{`${geriAl?.acilan ?? 0} firma pasife alınır; silinmez. Açık kaydı olan firma atlanır.`}</span></li>
          <li><Simge ad="alert" boyut="k" /><span>Pasife alınan firma Logo kaydına bağlı kalır; aynı cari yeniden toplu alınamaz, gerekirse firmayı yeniden aktifleştirin.</span></li>
          <li><Simge ad="tag" boyut="k" /><span>{`${geriAl?.baglanan ?? 0} bağlama çözülür; firmanın önceki kodu ve Logo cari kodu geri yazılır.`}</span></li>
          <li><Simge ad="alert" boyut="k" /><span>İşlemden sonra değiştirilen firma atlanır ve nedeni gösterilir.</span></li>
          <li><Simge ad="eye" boyut="k" /><span>Logo'ya hiçbir şey yazılmaz.</span></li>
        </ul>
      </OnayPenceresi>
    </>
  );
}

function OkumaNotu({ cevap }: { cevap: LogoCariListeCevabi }) {
  if (!cevap.okuma.acik) {
    return (
      <p className="tc-mt-hata" role="alert">
        Logo liste okuması kapalı; liste güncel olmayabilir. <Link to="/logo">Logo yönetiminden</Link> açılır.
      </p>
    );
  }
  return (
    <p className="tc-mt-yok">
      {cevap.okuma.sonOkuma === null ? 'Liste henüz Logo\'dan okunmadı.' : `Liste Logo'dan en son ${zamanMetni(cevap.okuma.sonOkuma)} okundu.`}
      {' '}Vergi no ön kontrolde her cari Logo'dan okunurken denetlenir.
    </p>
  );
}

function CoreKarsiligi({ satir: s }: { satir: LogoCariListeSatiri }) {
  const d = DURUM[s.durum];
  return (
    <span className="tc-mt-gecis-taraf">
      <span className="tc-mt-logo-bag"><Rozet ton={d.ton}><Simge ad={d.simge} boyut="k" />{d.ad}</Rozet></span>
      {s.durum === 'alinamaz' && <span className="tc-mt-gecis-ek">{s.alinamaz} Logo'da kodu düzeltin.</span>}
      {s.durum === 'yeni' && <span className="tc-mt-gecis-ek">CORE'da yok; kod Logo kodu olur.</span>}
      {s.adaylar.map((a) => (
        <span key={a.firmaId} className="tc-mt-logo-bag">
          <span className="tc-mt-gecis-kod">{a.kod ?? '—'}</span>
          <span>{a.ad}</span>
          <span className="tc-mt-gecis-ek">
            {NEDEN_ADI[a.neden]}{!a.aktif ? ', pasif' : ''}{a.logoyaBagli && s.durum !== 'bagli' ? ', başka Logo carisine bağlı' : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

function SonIslemSeridi({ cevap, ac, geriAl }: {
  cevap: LogoCariSonIslemCevabi | null; ac: (s: readonly LogoCariTopluSonucu[]) => void;
  geriAl: (g: { islem: string; acilan: number; baglanan: number }) => void;
}) {
  const i = cevap?.islem;
  if (!i) return null;
  const tamam = i.satirlar.filter((s) => s.tamam);
  const bagli = tamam.filter((s) => s.islem === 'bagla').length;
  const geri = i.satirlar.filter((s) => s.geriAlindi).length;
  const bekleyen = i.satirlar.filter((s) => s.tamam && !s.geriAlindi && s.geriIleti === null);
  const acilan = bekleyen.filter((s) => s.islem === 'al').length;
  return (
    <div className="tc-mt-cari-serit" role="region" aria-label="Son toplu işlem">
      <span>
        {`Son toplu işlem ${zamanMetni(i.zaman)}: ${bagli} bağlandı, ${tamam.length - bagli} firma açıldı, ${i.satirlar.length - tamam.length} işlenemedi.`}
        {geri > 0 ? ` ${geri} satır geri alındı.` : ''}
      </span>
      <span className="tc-mt-cari-dugmeler">
        <Dugme simge="eye" onClick={() => ac(i.satirlar)}>Sonucu aç</Dugme>
        {i.geriAlinabilir && <Dugme simge="back" onClick={() => geriAl({ islem: i.islem, acilan, baglanan: bekleyen.length - acilan })}>Geri al</Dugme>}
      </span>
    </div>
  );
}

type Okuma = { tur: 'okunuyor'; okunan: number } | { tur: 'hata'; ileti: string } | { tur: 'hazir'; plan: OnKontrolPlani };

// Seçilen cariler partiler hâlinde Logo'dan okunur; pencere kapanırsa okuma durur ve hiçbir şey yazılmaz. Yazma tek kısa komuttur.
function OnKontrolPenceresi({ secim, kapat, bitti }: {
  secim: ReadonlyMap<string, CariIslemi>; kapat: () => void; bitti: (c: LogoCariTopluCevabi) => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [okuma, okumaYaz] = useState<Okuma>({ tur: 'okunuyor', okunan: 0 });
  const secimRef = useRef(secim);
  const kodlar = [...secim.keys()];
  useEffect(() => {
    const kesici = new AbortController();
    const hepsi = [...secimRef.current.keys()];
    void (async () => {
      const okunan: LogoCariSatiri[] = [];
      const okunamayan: { kod: string; ileti: string }[] = [];
      try {
        for (let i = 0; i < hepsi.length; i += LOGO_CARI_OKUMA_PARTISI) {
          const parti = hepsi.slice(i, i + LOGO_CARI_OKUMA_PARTISI);
          const c = await api.get<LogoCariKartlariCevabi>(
            `/musteri-tedarikci/logo-cari/kartlar?kodlar=${encodeURIComponent(parti.join(','))}`, { sinyal: kesici.signal },
          );
          if (c.durum !== 'tamam') { okumaYaz({ tur: 'hata', ileti: c.ileti ?? 'Logo okunamadı.' }); return; }
          okunan.push(...c.cariler);
          okunamayan.push(...c.okunamayan);
          if (!kesici.signal.aborted) okumaYaz({ tur: 'okunuyor', okunan: Math.min(i + parti.length, hepsi.length) });
        }
        if (!kesici.signal.aborted) okumaYaz({ tur: 'hazir', plan: onKontrolPlani(secimRef.current, okunan, okunamayan) });
      } catch (e) {
        if (!kesici.signal.aborted) okumaYaz({ tur: 'hata', ileti: hataIletisi(e, 'Logo\'dan okunamadı.') });
      }
    })();
    return () => kesici.abort();
  }, []);
  const plan = okuma.tur === 'hazir' ? okuma.plan : null;
  const gonder = useKorumaliKomut({
    gonder: (_: void, deneme) => api.post<LogoCariTopluCevabi>('/musteri-tedarikci/logo-cari/toplu', plan?.govde, deneme),
    onSuccess: async (s) => { await bitti(s); },
    onError: (e) => bildir('hata', hataIletisi(e, 'Yapılamadı.')),
  });
  const bagla = plan?.govde.bagla.length ?? 0;
  const al = plan?.govde.al.length ?? 0;
  const atlanan = plan?.satirlar.filter((s) => s.islem === 'atla') ?? [];
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Ön kontrol"
      genis
      alt={(
        <>
          <Dugme onClick={kapat} disabled={gonder.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge={plan === null ? 'clock' : 'check'} disabled={plan === null || bagla + al === 0} yukleniyor={gonder.isPending} onClick={() => gonder.mutate()}>
            {plan === null ? 'Okunuyor' : bagla + al === 0 ? 'İşlenecek cari yok' : `${bagla} bağla, ${al} al`}
          </Dugme>
        </>
      )}
    >
      {okuma.tur === 'okunuyor' && (
        <p className="tc-mt-yok" role="status">
          {`Logo'dan okunuyor ${okuma.okunan}/${kodlar.length}. Pencereyi kapatırsanız okuma durur, hiçbir şey yazılmaz.`}
        </p>
      )}
      {okuma.tur === 'hata' && <p className="tc-mt-hata" role="alert">{okuma.ileti}</p>}
      {plan && (
        <>
          <p className="tc-mt-yok" role="status">
            {`${bagla} cari CORE firmasına bağlanacak, ${al} firma açılacak, ${atlanan.length} cari atlanacak. Logo'ya hiçbir şey yazılmaz.`}
          </p>
          <ul className="tc-mt-gecis-liste" aria-label="Ön kontrol satırları">
            {[...atlanan, ...plan.satirlar.filter((s) => s.islem !== 'atla')].map((s) => (
              <li key={s.kod}>
                <Simge ad={s.islem === 'atla' ? 'minus' : s.islem === 'al' ? 'download' : 'tag'} boyut="k" />
                <span>
                  <span className="tc-mt-gecis-kod">{s.kod}</span>{' '}
                  {s.islem === 'atla' ? `Atlanacak: ${s.neden ?? ''}` : `${s.islem === 'al' ? 'Açılacak' : 'Bağlanacak'}${s.karsilik ? `: ${s.karsilik}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Pencere>
  );
}

const SONUC_ADI = (s: LogoCariTopluSonucu): string =>
  (s.tamam ? (s.islem === 'bagla' ? 'Bağlandı' : 'Açıldı') : 'İşlenemedi');

function SonucPenceresi({ sonuclar, kapat }: { sonuclar: readonly LogoCariTopluSonucu[]; kapat: () => void }) {
  const tamam = sonuclar.filter((s) => s.tamam);
  const bagli = tamam.filter((s) => s.islem === 'bagla').length;
  const indir = () => csvIndir(
    'logo-gecisi-cari-sonucu',
    ['Logo kodu', 'Sonuç', 'CORE kodu', 'CORE adı', 'Neden'],
    sonuclar.map((s) => [s.logoKodu, SONUC_ADI(s), s.firma?.kod ?? null, s.firma?.ad ?? null, s.ileti]),
  );
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Sonuç"
      alt={(
        <>
          <Dugme simge="download" onClick={indir}>CSV indir</Dugme>
          <Dugme tur="birincil" onClick={kapat}>Tamam</Dugme>
        </>
      )}
    >
      <p className="tc-mt-yok" role="status">
        {`${bagli} bağlandı, ${tamam.length - bagli} firma açıldı, ${sonuclar.length - tamam.length} işlenemedi.`}
      </p>
      <ul className="tc-mt-gecis-liste" aria-label="Satır sonuçları">
        {sonuclar.map((s) => (
          <li key={s.logoKodu}>
            <Simge ad={s.tamam ? 'check' : 'alert'} boyut="k" />
            <span>
              <span className="tc-mt-gecis-kod">{s.logoKodu}</span>{' '}
              {s.tamam ? `${SONUC_ADI(s)}: ${s.firma?.kod ?? ''} ${s.firma?.ad ?? ''}`.trim() : s.ileti ?? 'İşlenemedi.'}
            </span>
          </li>
        ))}
      </ul>
    </Pencere>
  );
}
