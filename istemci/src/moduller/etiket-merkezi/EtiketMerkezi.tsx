import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BasCevabi, CiktiCevabi, IndirCevabi, KayitCiktiCevabi, KayitSecimi, Sablon, SablonlarCevabi, YaziciDili, YazicilarCevabi,
} from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KAYIT_BASLIKLARI, KAYIT_NOTLARI, kayitSablonTuru, kayitSecimiOku, kayitSecimiYaz } from './kayit-secimi.ts';
import { KayitSecici } from './KayitSecici.tsx';
import { Onizleme } from './Onizleme.tsx';
import './etiket-merkezi.css';

// Bölümü kabuğun ikinci menüsü seçer: hazır şablonlar ya da yazıcı denemesi. Adreste kayıt seçimi varsa (stoktan gelen
// /etiket-merkezi?tur=konum&id=1,2,3; lot ve istasyon da aynı biçimde) çıktı o kayıtlardan, yoksa örnek değerlerle üretilir.
type Bolum = 'sablonlar' | 'deneme';

function komutuIndir(c: Pick<CiktiCevabi, 'komut' | 'dosyaAdi'>) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([c.komut], { type: 'text/plain;charset=utf-8' }));
  a.download = c.dosyaAdi;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

type Secenekler = SablonlarCevabi['secenekler'];

// Ağ yazıcısına sunucu doğrudan gönderir (ayar açıksa); dosya yazıcısına komut dosyası iner. İkisi de baskı defterine yazılır ve
// yazıcının kendi dili ve çözünürlüğüyle üretilir.
function YaziciyaGonder({ sablon, adet, kayit }: { sablon: Sablon; adet: number | null; kayit: KayitSecimi | null }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.yazicilar, queryFn: () => api.get<YazicilarCevabi>('/etiket-merkezi/yazicilar') });
  const [yaziciId, setYaziciId] = useState('');
  // Kimlik başarıya ya da seçim değişene kadar korunur: elle yeniden gönderilen baskı ikinci kez basılmaz.
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const [sonuc, setSonuc] = useState<{ ton: 'tamam' | 'hata'; metin: string } | null>(null);
  const bitti = () => { setKimlik(yeniIstekKimligi()); void istemci.invalidateQueries({ queryKey: anahtarlar.baskilar }); };
  const hataGoster = (h: unknown) => setSonuc({ ton: 'hata', metin: hataIletisi(h, 'Baskı gönderilemedi; yeniden deneyin.') });
  const gonder = useMutation({
    mutationFn: (g: { yaziciId: number; adet: number; kayit?: KayitSecimi }) =>
      api.post<BasCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/bas`, g, { istekKimligi: kimlik, zamanAsimiMs: 15000 }),
    onSuccess: (c) => {
      bitti();
      if (c.sonuc === 'gonderildi') {
        bildir('tamam', 'Etiket yazıcıya gönderildi.');
        setSonuc({ ton: 'tamam', metin: 'Gönderildi. Etiketin çıktığını yazıcının başında kontrol edin.' });
      } else setSonuc({ ton: 'hata', metin: c.ileti ?? 'Yazıcıya ulaşılamadı.' });
    },
    onError: hataGoster,
  });
  const indir = useMutation({
    mutationFn: (g: { yaziciId: number; adet: number; kayit?: KayitSecimi }) =>
      api.post<IndirCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/indir`, g, { istekKimligi: kimlik }),
    onSuccess: (c) => {
      bitti();
      komutuIndir(c);
      setSonuc({ ton: 'tamam', metin: `İndirildi ve deftere yazıldı (${c.dosyaAdi}). Dosyayı yazıcının kendi aracıyla gönderin.` });
    },
    onError: hataGoster,
  });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return null;
  const { dogrudanBaski } = liste.data;
  const yazicilar = liste.data.yazicilar.filter((y) => y.aktif && (y.baglanti === 'dosya' || dogrudanBaski.acik));
  const kapaliNotu = !dogrudanBaski.acik && <p className="tc-etk-not"><Rozet ton="pasif">Doğrudan baskı kapalı</Rozet> {dogrudanBaski.neden}</p>;
  if (yazicilar.length === 0) {
    return kapaliNotu || <p className="tc-etk-not">Kullanımda yazıcı yok; Yazıcılar sayfasından eklenir.</p>;
  }
  const secili = yazicilar.find((y) => String(y.id) === yaziciId);
  const govde = secili && adet !== null ? { yaziciId: secili.id, adet, ...(kayit ? { kayit } : {}) } : null;
  return (
    <div className="tc-etk-gonder">
      {kapaliNotu}
      <Secim etiket="Yazıcı" value={yaziciId} bosSecenek="Yazıcı seçin" onChange={(e) => { setYaziciId(e.target.value); setKimlik(yeniIstekKimligi()); setSonuc(null); }}
        secenekler={yazicilar.map((y) => ({ deger: String(y.id), baslik: `${y.ad} · ${y.dpi} dpi · ${y.baglanti === 'ag' ? 'ağ' : 'dosya'}` }))} />
      <div className="tc-etk-dugmeler">
        {secili?.baglanti === 'dosya' ? (
          <Dugme tur="birincil" simge="download" disabled={govde === null} yukleniyor={indir.isPending}
            onClick={() => { if (govde) { setSonuc(null); indir.mutate(govde); } }}>
            Yazıcı için indir
          </Dugme>
        ) : (
          <Dugme tur="birincil" simge="upload" disabled={govde === null} yukleniyor={gonder.isPending}
            onClick={() => { if (govde) { setSonuc(null); gonder.mutate(govde); } }}>
            Yazıcıya gönder
          </Dugme>
        )}
      </div>
      {sonuc && <p className={sonuc.ton === 'hata' ? 'tc-etk-hata' : 'tc-etk-not'} role={sonuc.ton === 'hata' ? 'alert' : 'status'}>{sonuc.metin}</p>}
    </div>
  );
}

function Cikti({ sablon, secenekler, basabilir, kayit, kayitCikar }: {
  sablon: Sablon; secenekler: Secenekler; basabilir: boolean; kayit: KayitSecimi | null; kayitCikar: (id: number) => void;
}) {
  const enCokAdet = secenekler.enCokAdet;
  const [dil, setDil] = useState<YaziciDili>('zpl');
  const [dpi, setDpi] = useState<string>('203');
  const [adet, setAdet] = useState('1');
  const [sade, setSade] = useState(false);
  // 1287 a: giden ambalaj kaydı yok; sevk kolisinde koli sayısı ve koli içi adet burada girilir, her koli ayrı etikettir (n/N).
  const koliMi = kayit?.tur === 'sevk-koli';
  const [koliSayisi, setKoliSayisi] = useState('1');
  const [koliIci, setKoliIci] = useState('');
  const koliSayi = koliMi ? Math.trunc(Number(koliSayisi)) : 1;
  const koliSayiGecerli = Number.isFinite(koliSayi) && koliSayi >= 1 && koliSayi <= enCokAdet;
  const iciSayi = koliIci.trim() === '' ? null : Number(koliIci.replace(',', '.'));
  const iciGecerli = iciSayi === null || (Number.isFinite(iciSayi) && iciSayi > 0);
  const adetSayi = Math.trunc(Number(adet));
  // Bir baskıda kayıt sayısı x koli x adet en çok enCokAdet etikettir; sunucu da reddeder.
  const etiketSayisi = (kayit?.idler.length ?? 1) * (koliSayiGecerli ? koliSayi : 1) * adetSayi;
  const adetGecerli = Number.isFinite(adetSayi) && adetSayi >= 1 && etiketSayisi <= enCokAdet;
  const adetHatasi = adetGecerli ? undefined : kayit && adetSayi >= 1 && adetSayi <= enCokAdet
    ? `Bir baskıda en çok ${enCokAdet} etiket (${kayit.idler.length} kayıt${koliMi ? ` x ${koliSayi} koli` : ''} x ${adetSayi}).`
    : `Adet 1 ile ${enCokAdet} arasında olur.`;
  const koliGecerli = !koliMi || (koliSayiGecerli && iciGecerli);
  const secim: KayitSecimi | null = kayit && koliMi && koliGecerli ? { ...kayit, koli: { sayi: koliSayi, ici: iciSayi } } : kayit;
  const parametre = new URLSearchParams({ dil, dpi, adet: String(adetGecerli ? adetSayi : 1), sade: String(sade) });
  if (kayit) { parametre.set('tur', kayit.tur); parametre.set('id', kayit.idler.join(',')); }
  if (secim?.koli) { parametre.set('koliSayisi', String(secim.koli.sayi)); if (secim.koli.ici !== null) parametre.set('koliIci', String(secim.koli.ici)); }
  const sorgu = parametre.toString();
  const c = useQuery({
    queryKey: anahtarlar.cikti(sablon.anahtar, sorgu),
    queryFn: () => api.get<CiktiCevabi | KayitCiktiCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/${kayit ? 'kayit-cikti' : 'cikti'}?${sorgu}`),
  });
  const kayitlar = c.data && 'kayitlar' in c.data ? c.data : null;
  // Sevk kolisinde bir kalemin her kolisi ayrı etikettir; çip kalem başına birdir.
  const cipler = kayitlar ? [...new Map(kayitlar.kayitlar.map((k) => [k.id, k])).values()] : [];
  return (
    <div className="tc-etk-cikti">
      <div className="tc-etk-secimler">
        <Secim etiket="Yazıcı dili" value={dil} onChange={(e) => setDil(e.target.value as YaziciDili)}
          secenekler={secenekler.diller.map((d) => ({ deger: d.deger, baslik: d.ad }))} />
        <Secim etiket="Çözünürlük" value={dpi} onChange={(e) => setDpi(e.target.value)}
          secenekler={secenekler.cozunurlukler.map((d) => ({ deger: String(d), baslik: `${d} dpi` }))} />
        {koliMi && (
          <>
            <Girdi etiket="Koli sayısı" inputMode="numeric" value={koliSayisi} onChange={(e) => setKoliSayisi(e.target.value)}
              hata={koliSayiGecerli ? undefined : `Koli sayısı 1 ile ${enCokAdet} arasında olur.`} />
            <Girdi etiket="Koli içi adet" inputMode="decimal" value={koliIci} onChange={(e) => setKoliIci(e.target.value)}
              ipucu="Boş bırakılırsa kalemin adedi basılır." hata={iciGecerli ? undefined : 'Koli içi adet sıfırdan büyük bir sayı olur.'} />
          </>
        )}
        <Girdi etiket={kayit ? 'Kayıt başına adet' : 'Adet'} inputMode="numeric" value={adet} onChange={(e) => setAdet(e.target.value)} hata={adetHatasi} />
        <IsaretKutusu etiket="Türkçe harfleri sadeleştir (ş -> s)" checked={sade} onChange={(e) => setSade(e.target.checked)} />
      </div>
      {c.isPending && <DurumKutusu durum="yukleniyor" />}
      {c.isError && <DurumKutusu durum="hata" yenile={() => { void c.refetch(); }} />}
      {kayitlar && (
        <div className="tc-etk-kayitlar">
          <ul className="tc-etk-ciplar" aria-label="Seçili kayıtlar">
            {cipler.map((k) => (
              <li key={k.id} className="tc-etk-cip">
                <span>{k.baslik}</span>
                {/* Mal kabulde çip lottur, seçim kabul belgesidir: tek lot çıkarılamaz. */}
                {cipler.length > 1 && kayit?.tur !== 'mal-kabul' && (
                  <button type="button" className="tc-etk-cip-sil" aria-label={`${k.baslik} çıkar`} onClick={() => kayitCikar(k.id)}>×</button>
                )}
              </li>
            ))}
          </ul>
          {kayitlar.eksikler.length > 0 && (
            <p className="tc-etk-not" role="status"><Rozet ton="uyari">{kayitlar.eksikler.length} kayıt bulunamadı</Rozet> Silinmiş ya da kimliği yanlış; basılmaz.</p>
          )}
        </div>
      )}
      {c.data && (
        <>
          <div className="tc-etk-kagit-alani"><Onizleme cikti={c.data} /></div>
          <p className="tc-etk-not">
            {c.data.sablon.genislik}x{c.data.sablon.yukseklik} mm · {kayitlar ? `${kayitlar.kayitlar.length} etiket, önizleme ilk kayıt` : 'örnek değerlerle'}. Dosyayı yazıcının kendi aracıyla gönderin.
          </p>
          <div className="tc-etk-dugmeler">
            {/* Elle seçilen dil ve çözünürlükle iner, deftere yazılmaz; deftere yazılan indirme aşağıda dosya yazıcısı seçilerek yapılır. */}
            <Dugme simge="download" disabled={!adetGecerli || !koliGecerli} onClick={() => komutuIndir(c.data)}>Önizleme için indir ({c.data.dosyaAdi}, deftere yazılmaz)</Dugme>
          </div>
          <details className="tc-etk-komut">
            <summary>Komutu göster</summary>
            <pre>{c.data.komut}</pre>
          </details>
        </>
      )}
      {/* Çıktı bloğunun dışında: adet değişip önizleme yeniden yüklenince seçilen yazıcı sıfırlanmaz. */}
      {basabilir && <YaziciyaGonder sablon={sablon} adet={adetGecerli && koliGecerli ? adetSayi : null} kayit={secim} />}
    </div>
  );
}

function EtiketMerkezi({ bolum }: { bolum: Bolum }) {
  const oturum = useOturum();
  const [adres, adresYaz] = useSearchParams();
  const kayit = bolum === 'sablonlar' ? kayitSecimiOku(adres) : null;
  const basabilir = (bolum === 'deneme' || kayit !== null) && (oturum.data?.islemler.includes('etiket-merkezi.bas') ?? false);
  const liste = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const [secili, setSecili] = useState<string | null>(null);
  const baslik = bolum === 'deneme' ? 'Yazıcı denemesi' : kayit ? KAYIT_BASLIKLARI[kayit.tur] : 'Hazır şablonlar';
  const kayitCikar = (id: number) => {
    if (!kayit) return;
    adresYaz(kayitSecimiYaz(adres, { ...kayit, idler: kayit.idler.filter((x) => x !== id) }), { replace: true });
  };
  if (liste.isPending) return <Kart baslik={baslik}><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) return <Kart baslik={baslik}><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} /></Kart>;
  const sablonlar = liste.data.sablonlar.filter((s) => (kayit ? s.tur === kayitSablonTuru(kayit.tur) : (bolum === 'deneme') === (s.tur === 'deneme')));
  const sablon = sablonlar.find((s) => s.anahtar === secili) ?? sablonlar[0];
  return (
    <>
    {bolum === 'sablonlar' && !kayit && oturum.data?.islemler.includes('etiket-merkezi.oku') === true && (
      <KayitSecici sec={(s) => adresYaz(kayitSecimiYaz(adres, s))} />
    )}
    <Kart baslik={baslik}>
      {kayit && (
        <p className="tc-etk-not">
          {kayit.idler.length} kayıt seçili. {KAYIT_NOTLARI[kayit.tur]}{' '}
          <button type="button" className="tc-etk-baglanti" onClick={() => adresYaz(kayitSecimiYaz(adres, null), { replace: true })}>Seçimi kaldır</button>
        </p>
      )}
      {bolum === 'deneme' && (
        <p className="tc-etk-not">Deneme etiketi Türkçe harfleri, iki yazı boyunu, çerçeveyi ve QR'ı basar. Harfler eksik çıkarsa "sadeleştir"i açın; QR'ı telefonla okutun.</p>
      )}
      <div className="tc-etk-duzen">
        <ul className="tc-etk-liste" aria-label="Şablonlar">
          {sablonlar.map((s) => (
            <li key={s.anahtar}>
              <button type="button" className="tc-etk-satir" aria-pressed={s.anahtar === sablon?.anahtar} onClick={() => setSecili(s.anahtar)}>
                <strong>{s.ad}</strong>
                <span className="tc-etk-satir-alt"><Rozet ton="bilgi">{liste.data.secenekler.turAdlari[s.tur] ?? s.tur}</Rozet>{s.genislik}x{s.yukseklik} mm</span>
              </button>
            </li>
          ))}
        </ul>
        {sablon ? <Cikti key={sablon.anahtar} sablon={sablon} secenekler={liste.data.secenekler} basabilir={basabilir} kayit={kayit} kayitCikar={kayitCikar} /> : <DurumKutusu durum="bos" mesaj="Şablon yok." />}
      </div>
    </Kart>
    </>
  );
}

export const HazirSablonlar = () => <EtiketMerkezi bolum="sablonlar" />;
export const YaziciDenemesi = () => <EtiketMerkezi bolum="deneme" />;
