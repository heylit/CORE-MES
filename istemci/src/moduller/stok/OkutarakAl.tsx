import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OkutarakAlCevabi, OkutarakAlGovdesi, TeslimCevabi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, KodOkuyucu, Pencere, Secim, useOkutmaGecmisi, type KomutIsleyici } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { miktarGirdisi, miktarMetni } from './gorunum.ts';
import { hataMetni, korumaliPost, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import { alOkutmasi } from './yerlestir-al.ts';

// Okutarak al (soru 96 b): malzeme başka birindeyse alan kişi malzemeyi ve aldığı istasyonun etiketini okutur; kaynak onayı yoktur.
// Telafi: kayıt işaretlidir, kaynak taraf bildirim alır ve süre bitene kadar itiraz eder. Sunucu iki kodu yeniden çözer.
// `gomulu` (1916, Okut panelinin Al modu): tek okuyucu; malzeme ya da lot etiketi "ne", başka her etiket "nereden" olur.
// Komutlar: Kaydet alır, Geri al son okutulanı siler, Miktar alınan miktarı yazar; bilinmeyen komut `komut`a (panel) gider.
type Okutulan = 'kod' | 'yerKodu';
export function OkutarakAl({ kutu, baslangic, gomulu = false, komut: ustKomut }: {
  kutu: TeslimKutusuCevabi; baslangic: { kod?: string; yerKodu?: string }; gomulu?: boolean; komut?: KomutIsleyici;
}) {
  const statuAdi = useStatuAdi();
  const [kodlar, setKodlar] = useState<Record<Okutulan, string>>({ kod: baslangic.kod ?? '', yerKodu: baslangic.yerKodu ?? '' });
  const [okutulan, setOkutulan] = useState<Okutulan | null>(null);
  const [satir, setSatir] = useState('0');
  const [istasyon, setIstasyon] = useState(() => String(kutu.buradakiIstasyonId ?? kutu.istasyonlar[0]?.id ?? ''));
  const [miktar, setMiktar] = useState('');
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const hazir = kodlar.kod !== '' && kodlar.yerKodu !== '';
  const onizleme = useQuery({
    queryKey: ['stok', 'teslim-kutusu', 'okutarak-al', kodlar.kod, kodlar.yerKodu],
    queryFn: () => api.get<OkutarakAlCevabi>(`/stok/teslim-kutusu/okutarak-al?${new URLSearchParams(kodlar)}`),
    enabled: hazir,
    retry: false,
  });
  const al = useStokKomutu((g: OkutarakAlGovdesi) => korumaliPost<TeslimCevabi>('/stok/teslim-kutusu/okutarak-al', g),
    'Alındı; malzeme istasyonunuza geçti. Kaynak istasyon bildirim aldı.', () => { setKimlik(yeniIstekKimligi()); setMiktar(''); setKodlar({ kod: '', yerKodu: '' }); });
  const o = onizleme.data;
  const secili = o?.satirlar[Number(satir)];
  const hedefler = kutu.istasyonlar.filter((i) => i.id !== o?.yer.istasyonId);
  const hedef = hedefler.some((i) => String(i.id) === istasyon) ? istasyon : '';
  // 1906: okutma pencere kapanınca biter; ses okunduğunu, önizleme hatası yanlış okutmayı söyler.
  const gecmis = useOkutmaGecmisi();
  const { bildir } = gecmis;
  const okut = (k: Okutulan, deger: string) => { bildir(deger, 'tamam', k === 'kod' ? 'Malzeme ya da lot' : 'Aldığın yer'); setKodlar((x) => ({ ...x, [k]: deger.trim() })); setOkutulan(null); setSatir('0'); };
  const gonder = (): boolean => {
    if (!secili || hedef === '' || miktar.trim() === '' || al.komut.isPending) return false;
    al.komut.mutate({ ...kodlar, istasyonId: Number(hedef), partiId: secili.partiId, statuId: secili.statuId, miktar: miktarGirdisi(miktar), uretimEmriId: secili.uretimEmriId, kaynakKimligi: kimlik });
    return true;
  };
  const okutGomulu = (ham: string) => {
    const yeni = alOkutmasi(kodlar, ham);
    bildir(ham, 'tamam', yeni.kod !== kodlar.kod ? 'Malzeme ya da lot' : 'Aldığın yer');
    setKodlar(yeni);
    setSatir('0');
  };
  const komut: KomutIsleyici = (k) => {
    switch (k.ad) {
      case 'KAYDET': return gonder() ? { ton: 'tamam', metin: 'Alınıyor' } : { ton: 'uyari', metin: 'Önce malzeme, yer ve miktar' };
      case 'GERI-AL':
        if (kodlar.yerKodu !== '') { setKodlar({ ...kodlar, yerKodu: '' }); return { ton: 'tamam', metin: 'Yer silindi' }; }
        if (kodlar.kod !== '') { setKodlar({ ...kodlar, kod: '' }); return { ton: 'tamam', metin: 'Malzeme silindi' }; }
        return { ton: 'uyari', metin: 'Geri alınacak yok' };
      case 'MIKTAR': setMiktar(String(k.miktar)); return { ton: 'tamam', metin: `Miktar ${k.miktar}` };
      case 'ARTI': case 'EKSI': case 'EVET': case 'VAZGEC': case 'MOD':
        return ustKomut?.(k) ?? null;
    }
  };
  const onizlemeHatasi = onizleme.isError ? hataMetni(onizleme.error) : null;
  useEffect(() => { if (onizlemeHatasi) bildir(`${kodlar.kod} · ${kodlar.yerKodu}`, 'hata', onizlemeHatasi); }, [onizlemeHatasi, bildir, kodlar.kod, kodlar.yerKodu]);
  return (
    <>
      {!gomulu && <h3 className="tc-stok-teslim-baslik">Okutarak al</h3>}
      <p className="tc-stok-not">Malzeme başka bir istasyondaysa malzemeyi ve aldığın istasyonun etiketini okut. Kaynak taraf bildirim alır, süresi içinde itiraz edebilir.</p>
      {gomulu && <KodOkuyucu kendiliginden dokunmatikteOdakYok okundu={okutGomulu} geribildirim={gecmis} komut={komut}
        ipucu={kodlar.kod === '' ? 'Önce malzemenin ya da lotun etiketi.' : 'Şimdi malzemeyi aldığın istasyonun etiketi.'} />}
      <ul className="tc-stok-satirlar tc-stok-okutulanlar" aria-label="Okutulanlar">
        <li><span>Malzeme ya da lot</span><span className="tc-stok-mono">{kodlar.kod || '—'}</span>{!gomulu && <Dugme simge="scan" onClick={() => setOkutulan('kod')}>Malzemeyi okut</Dugme>}</li>
        <li><span>Aldığın yer</span><span className="tc-stok-mono">{kodlar.yerKodu || '—'}</span>{!gomulu && <Dugme simge="scan" onClick={() => setOkutulan('yerKodu')}>Yeri okut</Dugme>}</li>
      </ul>
      {okutulan && (
        <Pencere acik kapat={() => setOkutulan(null)} baslik={okutulan === 'kod' ? 'Malzemeyi okut' : 'Aldığın yeri okut'}>
          <div className="tc-stok-form">
            <KodOkuyucu okundu={(k) => okut(okutulan, k)} ipucu={okutulan === 'kod' ? 'Malzemenin ya da lotun etiketi.' : 'Malzemeyi aldığın istasyonun etiketi.'} />
          </div>
        </Pencere>
      )}
      {hazir && (onizleme.isPending ? <DurumKutusu durum="yukleniyor" />
        : onizleme.isError ? <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(onizleme.error)}</p>
        : o && o.satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj={`${o.yer.ad} istasyonunda bu malzemeden serbest yok`} />
        : o && (
          <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); gonder(); }}>
            <p className="tc-stok-not"><strong>{o.malzeme.ad ?? o.malzeme.kod}</strong> · {o.yer.ad} ({o.yer.kod})</p>
            <Secim etiket="Satır" value={satir} onChange={(e) => setSatir(e.target.value)}
              secenekler={o.satirlar.map((x, n) => ({ deger: String(n), baslik: `${x.partiEtiketi ?? 'Partisiz'} · ${statuAdi(x.statuId)} · ${miktarMetni(x.miktar)}` }))} />
            <div className="tc-stok-iki">
              <Girdi etiket={`Alınan miktar${o.malzeme.birim ? ` (${o.malzeme.birim})` : ''}`} inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required
                ipucu={secili ? `Orada serbest ${miktarMetni(secili.miktar)}` : undefined} />
              <Secim etiket="Götürdüğün istasyon" bosSecenek="İstasyon seçin" value={hedef} onChange={(e) => setIstasyon(e.target.value)} required
                secenekler={hedefler.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} />
            </div>
            <div className="tc-stok-sag">
              <Dugme tur="birincil" simge="download" type="submit" yukleniyor={al.komut.isPending} disabled={!secili || hedef === '' || miktar.trim() === ''}>Okutarak al</Dugme>
            </div>
            {al.onayPenceresi}
          </form>
        ))}
    </>
  );
}
