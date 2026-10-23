import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { EvSahipleriCevabi, HabersizGovdesi, KapiCevabi, KimlikTuru, Neden, OnerilerCevabi, Ziyaret } from '#paylasilan/sozlesme/nizamiye.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EvetHayir } from './EvetHayir.tsx';
import { useKomut } from './komut.ts';
import { KIMLIK_TURLERI, KIMLIK_TURU_ADLARI, NEDENLER, NEDEN_ADLARI, NEDEN_SIMGELERI, adi, atolyeZorunlu as atolyeGerekir } from './gorunum.ts';
import './nizamiye.css';

// Öne çıkan ev sahibi sayısı: geri kalanı "Başka kişi" listesinden seçilir.
const ONDE_KISI = 5;

function Adim({ no, tamam, baslik }: { no: number; tamam: boolean; baslik: string }) {
  return <h2 className="tc-nz-adim"><span className={`tc-nz-adim-no${tamam ? ' tc-nz-ton-run' : ''}`}>{tamam ? <Simge ad="check" boyut="k" /> : no}</span>{baslik}</h2>;
}

export function Habersiz() {
  const [ad, adYaz] = useState('');
  const [firma, firmaYaz] = useState('');
  const [telefon, telefonYaz] = useState('');
  const [plaka, plakaYaz] = useState('');
  const [neden, nedenYaz] = useState<Neden | null>(null);
  const [evSahibi, evSahibiYaz] = useState<number | null>(null);
  const [kimlik, kimlikYaz] = useState(false);
  const [kimlikTuru, kimlikTuruYaz] = useState<KimlikTuru | ''>('');
  const [son4, son4Yaz] = useState('');
  const [atolye, atolyeYaz] = useState(false);
  const [dizustu, dizustuYaz] = useState(false);
  const [kvkk, kvkkYaz] = useState(false);
  const [yemek, yemekYaz] = useState(false);
  const [kartSira, kartSiraYaz] = useState(0);
  const [bitti, bittiYaz] = useState<Ziyaret | null>(null);

  // Habersiz giriş yazmadır (195 a): adresle açan okuyucu formu ve ev sahibi listesini istemez; sunucu da reddeder.
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('nizamiye.yaz') === true;
  const kapi = useQuery({ queryKey: anahtarlar.kapi, queryFn: () => api.get<KapiCevabi>('/nizamiye/kapi'), enabled: yazabilir });
  const evler = useQuery({ queryKey: anahtarlar.evSahipleri, queryFn: () => api.get<EvSahipleriCevabi>('/nizamiye/ev-sahipleri'), enabled: yazabilir });
  const aranan = ad.trim();
  const oneri = useQuery({
    queryKey: anahtarlar.oneriler(aranan),
    queryFn: () => api.get<OnerilerCevabi>(`/nizamiye/oneriler?ara=${encodeURIComponent(aranan)}`),
    enabled: aranan.length >= 2,
  });
  const kaydet = useKomut<HabersizGovdesi, Ziyaret>('Ziyaretçi içeri alınamadı.', { tekrarKorumali: true });

  if (bitti) {
    return (
      <Kart baslik="Habersiz ziyaretçi">
        <div className="tc-nz-bitti" role="status">
          <span className="tc-nz-bitti-simge"><Simge ad="check" boyut="b" /></span>
          <strong>İçeri alındı</strong>
          <span>Kart <b className="tc-nz-kartno">{bitti.kartNo}</b> verildi. {bitti.evSahibiAd ?? 'Ev sahibi'} ziyaretçisini görecek.</span>
          <Link to="/nizamiye" className="tc-dugme tc-dugme-birincil tc-dugme-ana"><Simge ad="building" />Kapıya dön</Link>
        </div>
      </Kart>
    );
  }
  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (!yazabilir) {
    return (
      <DurumKutusu durum="bos" mesaj="Habersiz ziyaretçi girişi için yetkiniz yok.">
        <Link to="/nizamiye" className="tc-dugme tc-dugme-ikincil tc-dugme-normal"><Simge ad="chev-left" />Kapıya dön</Link>
      </DurumKutusu>
    );
  }
  if (kapi.isPending || evler.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (kapi.isError || evler.isError) return <DurumKutusu durum="hata" yenile={() => { void kapi.refetch(); void evler.refetch(); }} />;

  const kartlar = kapi.data.bosKartlar.filter((k) => k.tur === 'ziyaretci');
  const kart = kartlar.length === 0 ? null : kartlar[kartSira % kartlar.length]!;
  const atolyeZorunlu = neden !== null && atolyeGerekir(neden);
  const kisiler = evler.data.kisiler;
  const onde = kisiler.slice(0, ONDE_KISI);
  const secilenKisi = kisiler.find((k) => k.id === evSahibi);
  const eksik = [
    aranan === '' && 'ad', neden === null && 'neden', evSahibi === null && 'ziyaret edilen kişi', !kimlik && 'kimlik',
    atolyeZorunlu && !atolye && 'kask ve gözlük', kart === null && 'boş kart',
  ].filter(Boolean);

  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (eksik.length > 0 || neden === null || evSahibi === null || kart === null) return;
    kaydet.mutate({
      yol: '/nizamiye/ziyaretler/habersiz',
      govde: {
        ad: aranan, firmaAdi: firma, telefon, plaka, neden, aciklama: null, evSahibiKisiId: evSahibi, kartId: kart.id, kimlikGoruldu: true,
        kimlikTuru: kimlikTuru === '' ? null : kimlikTuru, kimlikSon4: son4, atolye, dizustu, kvkkOnayi: kvkk, ogleYemegi: yemek,
      },
    }, { onSuccess: bittiYaz });
  };

  return (
    <Kart baslik="Habersiz ziyaretçi" sag={<Link to="/nizamiye" className="tc-dugme tc-dugme-ikincil tc-dugme-normal"><Simge ad="chev-left" />Kapıya dön</Link>}>
      <form className="tc-nz-form" onSubmit={gonder}>
        <section className="tc-nz-bolum">
          <Adim no={1} tamam={aranan !== ''} baslik="Kim geldi?" />
          <div className="tc-nz-iki">
            <Girdi etiket="Ad soyad" required value={ad} onChange={(o) => adYaz(o.target.value)} list="tc-nz-oneriler" autoComplete="off" />
            <Girdi etiket="Firma (boş bırakılabilir)" value={firma} onChange={(o) => firmaYaz(o.target.value)} />
            <Girdi etiket="Telefon (isteğe bağlı)" inputMode="tel" value={telefon} onChange={(o) => telefonYaz(o.target.value)} />
            <Girdi etiket="Araç plakası (isteğe bağlı)" value={plaka} onChange={(o) => plakaYaz(o.target.value)} />
          </div>
          {(oneri.data?.oneriler.length ?? 0) > 0 && (
            <div className="tc-nz-oneriler">
              <span className="tc-nz-soluk"><Simge ad="clock" boyut="k" />Daha önce gelenler:</span>
              {oneri.data!.oneriler.map((o) => (
                <button key={o.ad} type="button" className="tc-nz-cip" onClick={() => {
                  adYaz(o.ad); firmaYaz(o.firmaAdi ?? ''); telefonYaz(o.telefon ?? ''); plakaYaz(o.plaka ?? '');
                }}>{o.ad}{o.firmaAdi ? ` · ${o.firmaAdi}` : ''}</button>
              ))}
            </div>
          )}
        </section>

        <section className="tc-nz-bolum">
          <Adim no={2} tamam={neden !== null} baslik="Neden geldi?" />
          <div className="tc-nz-nedenler">
            {NEDENLER.map((n) => (
              <button key={n} type="button" className="tc-nz-neden" aria-pressed={neden === n} onClick={() => nedenYaz(n)}>
                <Simge ad={NEDEN_SIMGELERI[n]} boyut="b" />{NEDEN_ADLARI[n]}
              </button>
            ))}
          </div>
        </section>

        <section className="tc-nz-bolum">
          <Adim no={3} tamam={evSahibi !== null} baslik="Kimi görecek?" />
          <div className="tc-nz-cipler">
            {onde.map((k) => (
              <button key={k.id} type="button" className="tc-nz-cip" aria-pressed={evSahibi === k.id} onClick={() => evSahibiYaz(k.id)}>{k.ad}</button>
            ))}
          </div>
          <Secim etiket="Başka kişi" bosSecenek="Listeden seç" value={secilenKisi && !onde.includes(secilenKisi) ? String(secilenKisi.id) : ''}
            onChange={(o) => evSahibiYaz(o.target.value === '' ? null : Number(o.target.value))}
            secenekler={kisiler.slice(ONDE_KISI).map((k) => ({ deger: String(k.id), baslik: k.ad }))} />
        </section>

        <section className="tc-nz-bolum">
          <Adim no={4} tamam={kimlik && (!atolyeZorunlu || atolye)} baslik="Kontrol" />
          <EvetHayir simge="user" ad="Kimlik görüldü" zorunlu deger={kimlik} degistir={kimlikYaz} />
          {kimlik && (
            <div className="tc-nz-iki">
              <Secim etiket="Kimlik türü (isteğe bağlı)" value={kimlikTuru} onChange={(o) => kimlikTuruYaz(o.target.value as KimlikTuru | '')}
                secenekler={[{ deger: '', baslik: 'Seçilmedi' }, ...KIMLIK_TURLERI.map((t) => ({ deger: t, baslik: KIMLIK_TURU_ADLARI[t] }))]} />
              <Girdi etiket="Son 4 hane" inputMode="numeric" maxLength={4} value={son4} onChange={(o) => son4Yaz(o.target.value)} ipucu="Tam numara yazılmaz." />
            </div>
          )}
          {atolyeZorunlu && <EvetHayir simge="wrench" ad="Atölyeye girecek: kask ve gözlük verildi" zorunlu deger={atolye} degistir={atolyeYaz} />}
          <EvetHayir simge="cpu" ad="Dizüstü / kamera var" deger={dizustu} degistir={dizustuYaz} />
          <EvetHayir simge="book" ad="KVKK formu imzalandı" deger={kvkk} degistir={kvkkYaz} />
          <EvetHayir simge="coffee" ad="Öğle yemeğine kalacak" deger={yemek} degistir={yemekYaz} />
        </section>

        <div className="tc-nz-alt-cubuk">
          <span className="tc-nz-soluk" role="status">{eksik.length > 0 ? `Eksik: ${eksik.join(', ')}` : `Hazır: ${adi({ ad: aranan })}`}</span>
          <Dugme onClick={() => kartSiraYaz((s) => s + 1)} disabled={kartlar.length < 2} simge="tag">Başka kart</Dugme>
          <Dugme tur="birincil" boyut="ana" type="submit" simge="check" disabled={eksik.length > 0} yukleniyor={kaydet.isPending}>
            {kart === null ? 'Boş kart yok' : `İçeri al · ${kart.kartNo}`}
          </Dugme>
        </div>
      </form>
    </Kart>
  );
}
