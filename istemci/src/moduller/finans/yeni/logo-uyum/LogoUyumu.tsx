import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FaturaEslesmeCevabi, FaturaEslesmeSatiri } from '#paylasilan/sozlesme/logo.ts';
import { Dugme, Girdi, Sayfalama, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { tarihMetni, tarihSaatMetni } from '../../../../ortak/veri/zaman-metni.ts';
import {
  aciklama, ayrintiSatirlari, bayatMi, DURUM_SIRASI, DURUMLAR, farkEtiketi, farkKurusu, farkMetni, farkVar, GUNLER, ozetParcalari, paraMetni, satirAnahtari, TURLER, turAdi,
} from './kurallar.ts';
import './logo-uyum.css';

// 3675 D3: Logo faturaları ile finans faturaları yan yana (yalnız okuma). Düzen A: durum sayaçları süzgeçtir, satıra basınca altında ayrıntı
// açılır (akordeon). Karşılaştırma sunucudadır (GET /logo/fatura-eslesme); ekran hiçbir şey yazmaz.
const SAYFA_BOYU = 50;
const ARAMA_BEKLEME_MS = 300;
export const LOGO_UYUM_ANAHTARI = ['finans', 'logo-uyum'] as const;

const sorguMetni = (o: { gun: string; durum: string; tur: string; ara: string; sayfa: number }): string => {
  const q = new URLSearchParams({ gun: o.gun, sayfa: String(o.sayfa), sayfaBoyu: String(SAYFA_BOYU) });
  if (o.durum !== '') q.set('durum', o.durum);
  if (o.tur !== '') q.set('tur', o.tur);
  if (o.ara !== '') q.set('ara', o.ara);
  return q.toString();
};

function DurumNoktasi({ durum }: { durum: FaturaEslesmeSatiri['durum'] }) {
  const d = DURUMLAR[durum];
  return <span className="tc-lu-durum" data-ton={d.ton}>{d.ad}</span>;
}

// Hata her nedenle aynı cümleyi vermez: yetki, sunucu iletisi ve ulaşılamama ayrı söylenir.
function hataNedeni(hata: unknown): string {
  if (hata instanceof ApiHatasi && hata.durum === 403) return 'Bu karşılaştırmayı görmek için finans okuma yetkisi gerekir.';
  if (hata instanceof ApiHatasi && hata.sunucuIletisi !== null) return hata.sunucuIletisi;
  return hataIletisi(hata, 'Sunucuya ulaşılamadı. Bağlantıyı denetleyip yeniden deneyin.');
}

function Iskelet() {
  return (
    <section className="tc-lu" aria-busy="true" aria-label="Logo uyumu yükleniyor">
      <p className="tc-lu-soluk" role="status">Karşılaştırma yükleniyor</p>
      <div className="tc-lu-iskelet-sayaclar">{DURUM_SIRASI.map((d) => <span key={d} className="tc-lu-iskelet" />)}</div>
      <div className="tc-lu-kutu">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="tc-lu-iskelet tc-lu-iskelet-satir" />)}</div>
    </section>
  );
}

function Ayrinti({ satir, kimlik }: { satir: FaturaEslesmeSatiri; kimlik: string }) {
  const not = aciklama(satir);
  return (
    <div className="tc-lu-ayrinti" id={kimlik} role="region" aria-label={`${satir.faturaNo} ayrıntısı`}>
      <table>
        <thead><tr><th scope="col"><span className="tc-lu-gizli">Alan</span></th><th scope="col">Logo</th><th scope="col">Finans</th><th scope="col">Fark (Logo − Finans)</th></tr></thead>
        <tbody>
          {ayrintiSatirlari(satir).map((a) => (
            <tr key={a.anahtar} data-farkli={a.farkli ? 'evet' : undefined}>
              <th scope="row">{a.ad}{a.farkli && <span className="tc-lu-isaret">farklı</span>}</th>
              <td className="mono" data-e="Logo">{a.logo}</td><td className="mono" data-e="Finans">{a.finans}</td><td className="mono" data-e="Fark">{a.fark}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {not !== null && <p className="tc-lu-aciklama">{not}</p>}
      <p className="tc-lu-soluk">Salt okunur: bu ekran Logo&apos;ya ya da finansa hiçbir şey yazmaz.</p>
    </div>
  );
}

function Satir({ satir, acik, degistir, kimlik }: { satir: FaturaEslesmeSatiri; acik: boolean; degistir: () => void; kimlik: string }) {
  const fark = farkKurusu(satir, 'toplam');
  const ozet = ozetParcalari(satir);
  return (
    <li className="tc-lu-satir" data-acik={acik}>
      <button type="button" className="tc-lu-ust" aria-expanded={acik} aria-controls={kimlik} onClick={degistir}>
        <span className="tc-lu-h-durum">
          <DurumNoktasi durum={satir.durum} />
          {satir.farklar.length > 0 && <span className="tc-lu-etiketler">{satir.farklar.map((k) => <span key={k} className="tc-lu-etiket">{farkEtiketi(satir, k)}</span>)}</span>}
        </span>
        <span className="tc-lu-h-no"><b className="mono">{satir.faturaNo}</b><span className="tc-lu-soluk">{turAdi(satir)}</span></span>
        <span className="tc-lu-h-tarih mono">{tarihMetni(satir.tarih)}</span>
        <span className="tc-lu-h-cari">
          <span>{satir.firmaAdi ?? satir.cariKodu ?? '—'}</span>
          <span className="tc-lu-soluk mono">{satir.cariKodu ?? 'Cari kodu yok'}</span>
          {ozet.length > 0 && <span className="tc-lu-h-ozet mono">{ozet.join(' · ')}</span>}
        </span>
        <span className="tc-lu-h-logo mono">{satir.logo === null ? '—' : paraMetni(satir.logo.toplam, satir.logo.paraBirimi)}</span>
        <span className="tc-lu-h-finans mono">{satir.finans === null ? '—' : paraMetni(satir.finans.toplam, satir.finans.paraBirimi)}</span>
        <span className="tc-lu-h-fark mono" data-fark={farkVar(fark) ? 'var' : undefined}>
          <span className="tc-lu-fark-etiket">Fark (Logo − Finans): </span>{farkMetni(fark, satir.logo?.paraBirimi)}
        </span>
        <span className="tc-lu-ok" aria-hidden="true"><Simge ad="down" /></span>
      </button>
      {acik && <Ayrinti satir={satir} kimlik={kimlik} />}
    </li>
  );
}

export function LogoUyumu() {
  const yetki = useYetki();
  const onek = useId();
  const [gun, gunYaz] = useState('90');
  const [durum, durumYaz] = useState('');
  const [tur, turYaz] = useState('');
  const [araGirdi, araGirdiYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const [acik, acikYaz] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => { araYaz(araGirdi.trim()); sayfaYaz(1); }, ARAMA_BEKLEME_MS);
    return () => { clearTimeout(t); };
  }, [araGirdi]);

  const sorgu = sorguMetni({ gun, durum, tur, ara, sayfa });
  const q = useQuery({
    queryKey: [...LOGO_UYUM_ANAHTARI, sorgu],
    queryFn: () => api.get<FaturaEslesmeCevabi>(`/logo/fatura-eslesme?${sorgu}`),
    placeholderData: keepPreviousData,
  });
  const suzgecli = durum !== '' || tur !== '' || ara !== '';
  const degistir = <T,>(yaz: (d: T) => void) => (d: T) => { yaz(d); sayfaYaz(1); };
  const temizle = () => { durumYaz(''); turYaz(''); araGirdiYaz(''); araYaz(''); sayfaYaz(1); };
  const ac = (anahtar: string) => acikYaz((onceki) => {
    const yeni = new Set(onceki);
    if (!yeni.delete(anahtar)) yeni.add(anahtar);
    return yeni;
  });

  // Yeni süzgeç anahtarı hata alırsa sorgunun verisi boşalır; son başarılı veri tutulur ki liste ve süzgeçler yerinde kalsın.
  const sonVeri = useRef<FaturaEslesmeCevabi | undefined>(undefined);
  if (q.data !== undefined) sonVeri.current = q.data;
  const gosterilen = q.data ?? sonVeri.current;

  if (q.isPending) return <Iskelet />;
  if (q.isError && gosterilen === undefined) {
    return (
      <section className="tc-lu">
        <div className="tc-lu-kutu tc-lu-bos" role="alert">
          <Simge ad="alert" />
          <b>Karşılaştırma yüklenemedi</b>
          <p>{hataNedeni(q.error)} Veriler değişmedi.</p>
          <Dugme simge="rotate" onClick={() => { void q.refetch(); }}>Yeniden dene</Dugme>
        </div>
      </section>
    );
  }
  const v = gosterilen as FaturaEslesmeCevabi;
  const sayi = (d: FaturaEslesmeSatiri['durum']): number => v.durumlar.find((x) => x.durum === d)?.sayi ?? 0;
  const hepsi = DURUM_SIRASI.reduce((t, d) => t + sayi(d), 0);
  const logoSatiri = sayi('eslesti') + sayi('farkli') + sayi('logoda-var-finansta-yok');
  const bayat = v.okuma.acik && bayatMi(v.okuma.sonOkuma, Date.now());
  const okumaUyarisi = bayat || !v.okuma.acik;

  // Okuma kapalıyken Logo tarafı boştur: her finans faturası "yalnız finansta" görünür, bu yalancı farktır; liste yerine açıklama gelir.
  if (!v.okuma.acik && logoSatiri === 0 && !suzgecli) {
    return (
      <section className="tc-lu">
        <div className="tc-lu-kutu tc-lu-bos">
          <Simge ad="lock" />
          <b>Logo okuması kapalı</b>
          <p>Fatura listesi okuması açılmadığı için Logo tarafı boş; karşılaştırma yapılmaz.</p>
          {yetki.var('sayfa.logo')
            ? <><p>Logo sayfasında &quot;Logo bağlantısı&quot; ve fatura listesi okuması açılınca burada görünür.</p><Link to="/logo"><Dugme tur="birincil" simge="gear">Logo sayfasını aç</Dugme></Link></>
            : <p>Okumayı yalnız sistem yöneticisi açabilir; açılması için yöneticinize başvurun.</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="tc-lu" aria-label="Logo uyumu">
      <div className="tc-lu-ust-satir">
        <p className="tc-lu-soluk">Logo faturaları ile finans faturaları yan yana. Yalnız okunur; finansa ve Logo&apos;ya hiçbir şey yazılmaz.</p>
        {!okumaUyarisi && <span className="tc-lu-soluk tc-lu-okuma"><Simge ad="clock" /> Son okuma: {v.okuma.sonOkuma === null ? 'Henüz okunmadı' : tarihSaatMetni(v.okuma.sonOkuma)}</span>}
      </div>
      {q.isError && <p className="tc-lu-serit" data-ton="uyari" role="alert"><Simge ad="alert" /><span>Liste yenilenemedi; son alınan veri gösteriliyor. Süzgeç değiştiyse liste önceki süzgece aittir.</span><Dugme simge="rotate" onClick={() => { void q.refetch(); }}>Yeniden dene</Dugme></p>}
      {!v.okuma.acik && <p className="tc-lu-serit" data-ton="uyari" role="status"><Simge ad="alert" /><span>Logo okuması şu an kapalı. Liste son okumaya göre; yeni Logo faturaları görünmez.</span></p>}
      {bayat && <p className="tc-lu-serit" data-ton="uyari" role="status"><Simge ad="alert" /><span>Son okuma {tarihSaatMetni(v.okuma.sonOkuma)} tarihinde yapıldı. Liste eski olabilir; Logo okuması durmuş ya da hata veriyor olabilir.</span></p>}

      <div>
        <p className="tc-lu-soluk tc-lu-sayac-baslik" id={`${onek}-sayac`}>Son {gun} günde; bir duruma dokununca liste o durumla süzülür</p>
        <div className="tc-lu-sayaclar" role="group" aria-labelledby={`${onek}-sayac`}>
          {DURUM_SIRASI.map((d) => (
            <button key={d} type="button" className="tc-lu-sayac" aria-pressed={durum === d} onClick={() => { degistir(durumYaz)(durum === d ? '' : d); }}>
              <DurumNoktasi durum={d} />
              <b className="mono">{sayi(d).toLocaleString('tr-TR')}</b>
            </button>
          ))}
        </div>
      </div>
      {durum === 'cari-kodu-yok' && (
        <p className="tc-lu-serit" data-ton="bilgi" role="status"><Simge ad="alert" /><span>Bu finans faturalarının firması için Logo cari kodu tanımlı değil; karşılaştırılamaz. Firma kartına Logo cari kodunu yazın.</span></p>
      )}

      <div className="tc-lu-suzgec">
        <Girdi etiket="Ara (fatura no, cari, firma)" type="search" value={araGirdi} onChange={(e) => { araGirdiYaz(e.target.value); }} placeholder="Fatura no ya da firma" />
        <Secim etiket="Dönem" value={gun} onChange={(e) => { degistir(gunYaz)(e.target.value); }} secenekler={GUNLER} />
        <Secim etiket="Fatura türü" value={tur} onChange={(e) => { degistir(turYaz)(e.target.value); }} bosSecenek="Hepsi" secenekler={TURLER} />
        {suzgecli && <Dugme simge="x" onClick={temizle}>Süzgeci temizle</Dugme>}
      </div>

      {v.satirlar.length === 0 ? (
        <div className="tc-lu-kutu tc-lu-bos" role="status">
          {suzgecli || hepsi > 0
            ? <><b>Bu süzgeçle fatura yok</b><p>Süzgeci değiştirin ya da temizleyin.</p><Dugme onClick={temizle}>Süzgeci temizle</Dugme></>
            : <><b>Karşılaştırılacak fatura yok</b><p>Son {gun} günde Logo&apos;dan okunmuş ya da finansa girilmiş fatura bulunmuyor.</p>{gun !== '365' && <Dugme onClick={() => { degistir(gunYaz)('365'); }}>Süreyi 365 güne çıkar</Dugme>}</>}
        </div>
      ) : (
        <div className="tc-lu-kutu" aria-busy={q.isPlaceholderData}>
          <div className="tc-lu-bas" aria-hidden="true">
            <span>Durum</span><span>Fatura</span><span>Tarih</span><span>Cari</span><span>Logo toplam</span><span>Finans toplam</span><span>Fark (Logo − Finans)</span><span />
          </div>
          <ul className="tc-lu-liste" aria-label="Fatura karşılaştırması">
            {v.satirlar.map((s) => {
              const anahtar = satirAnahtari(s);
              return <Satir key={anahtar} satir={s} acik={acik.has(anahtar)} degistir={() => { ac(anahtar); }} kimlik={`${onek}-${anahtar.replace(/[^\w-]/g, '_')}`} />;
            })}
          </ul>
          <Sayfalama sayfa={v.sayfa} sayfaBoyu={v.sayfaBoyu} toplam={v.toplam} satirSayisi={v.satirlar.length} degistir={sayfaYaz} etiket="Fatura sayfaları" />
        </div>
      )}
      <p className="tc-lu-soluk">Sıralama: tarih, yeni önce. Pencere {tarihMetni(v.baslangic)} tarihinden başlar; Logo aynası bundan eskiyi okumaz. Toplamlar KDV dahildir; 1 kuruşluk fark eşleşme sayılır.</p>
    </section>
  );
}
