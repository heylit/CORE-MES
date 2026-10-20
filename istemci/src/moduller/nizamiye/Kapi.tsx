import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { BosKart, CikisGovdesi, GirisGovdesi, KapiCevabi, KimlikTuru, Ziyaret } from '#paylasilan/sozlesme/nizamiye.ts';
import { Dugme, DurumKutusu, Girdi, Secim, Sekmeler, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useKomut } from './komut.ts';
import { KIMLIK_TURLERI, KIMLIK_TURU_ADLARI, NEDEN_ADLARI, NEDEN_SIMGELERI, adi, atolyeZorunlu as atolyeGerekir, saat, sureMetni, uyari } from './gorunum.ts';
import { EvetHayir } from './EvetHayir.tsx';
import './nizamiye.css';

type Suzgec = 'hepsi' | 'beklenen' | 'iceride';
type Panel = { tur: 'giris' | 'cikis'; ziyaret: Ziyaret } | null;
interface SonIslem { mesaj: string; ziyaretId: number; surum: number }

const eslesir = (z: Ziyaret, q: string): boolean =>
  q === '' || [z.ad, z.firmaAdi, z.plaka, z.kartNo, z.ziyaretNo].some((a) => a !== null && a.toLocaleLowerCase('tr').includes(q));

function Sayac({ simge, sayi, ad, secili, sec, ton }: { simge: SimgeAdi; sayi: number; ad: string; secili?: boolean; sec?: () => void; ton: string }) {
  const icerik = (
    <>
      <Simge ad={simge} />
      <span className="tc-nz-sayac-yazi"><strong>{sayi}</strong><span>{ad}</span></span>
    </>
  );
  return sec
    ? <button type="button" className={`tc-nz-sayac tc-nz-ton-${ton}`} aria-pressed={secili} onClick={sec}>{icerik}</button>
    : <div className={`tc-nz-sayac tc-nz-ton-${ton}`}>{icerik}</div>;
}

function GirisPaneli({ ziyaret, bosKartlar, kapat, bitti }: {
  ziyaret: Ziyaret; bosKartlar: BosKart[]; kapat: () => void; bitti: (s: SonIslem) => void;
}) {
  const [kimlik, kimlikYaz] = useState(false);
  const [kimlikTuru, kimlikTuruYaz] = useState<KimlikTuru | ''>('');
  const [son4, son4Yaz] = useState('');
  const [atolye, atolyeYaz] = useState(false);
  const [dizustu, dizustuYaz] = useState(false);
  const [kvkk, kvkkYaz] = useState(false);
  const [yemek, yemekYaz] = useState(ziyaret.ogleYemegi);
  const [kartSira, kartSiraYaz] = useState(0);
  const giris = useKomut<GirisGovdesi, Ziyaret>('Giriş kaydedilemedi.');
  const atolyeZorunlu = atolyeGerekir(ziyaret.neden);
  const kart = bosKartlar.length === 0 ? null : bosKartlar[kartSira % bosKartlar.length]!;
  const eksik = [!kimlik && 'kimlik', atolyeZorunlu && !atolye && 'kask ve gözlük', kart === null && 'boş kart'].filter(Boolean);

  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (eksik.length > 0 || kart === null) return;
    giris.mutate({
      yol: `/nizamiye/ziyaretler/${ziyaret.id}/giris`,
      govde: {
        surum: ziyaret.surum, kartId: kart.id, kimlikGoruldu: true, kimlikTuru: kimlikTuru === '' ? null : kimlikTuru, kimlikSon4: son4,
        atolye, dizustu, kvkkOnayi: kvkk, ogleYemegi: yemek,
      },
    }, {
      onSuccess: (z) => bitti({ mesaj: `${adi(z)} içeri alındı, kart ${z.kartNo ?? ''}. ${z.evSahibiAd ?? 'Ev sahibi'} görecek.`, ziyaretId: z.id, surum: z.surum }),
    });
  };

  return (
    <form className="tc-nz-panel-form" onSubmit={gonder} onKeyDown={(o) => { if (o.key === 'Escape') kapat(); }}>
      <h2 className="tc-nz-panel-baslik"><Simge ad="next" /> Giriş: {adi(ziyaret)}</h2>
      <p className="tc-nz-soluk">{[ziyaret.firmaAdi, NEDEN_ADLARI[ziyaret.neden], ziyaret.evSahibiAd && `ev sahibi ${ziyaret.evSahibiAd}`].filter(Boolean).join(' · ')}</p>
      <EvetHayir simge="user" ad="Kimlik görüldü" zorunlu deger={kimlik} degistir={kimlikYaz} />
      {kimlik && (
        <div className="tc-nz-iki">
          <Secim etiket="Kimlik türü (isteğe bağlı)" value={kimlikTuru} onChange={(o) => kimlikTuruYaz(o.target.value as KimlikTuru | '')}
            secenekler={[{ deger: '', baslik: 'Seçilmedi' }, ...KIMLIK_TURLERI.map((t) => ({ deger: t, baslik: KIMLIK_TURU_ADLARI[t] }))]} />
          <Girdi etiket="Son 4 hane" inputMode="numeric" maxLength={4} value={son4} onChange={(o) => son4Yaz(o.target.value)}
            ipucu="Tam numara yazılmaz." />
        </div>
      )}
      <EvetHayir simge="wrench" ad="Atölyeye girecek: kask ve gözlük verildi" zorunlu={atolyeZorunlu} deger={atolye} degistir={atolyeYaz} />
      <EvetHayir simge="cpu" ad="Dizüstü / kamera var" deger={dizustu} degistir={dizustuYaz} />
      <EvetHayir simge="book" ad="KVKK formu imzalandı" deger={kvkk} degistir={kvkkYaz} />
      <EvetHayir simge="coffee" ad="Öğle yemeğine kalacak" deger={yemek} degistir={yemekYaz} />
      <div className="tc-nz-kart-sec">
        <Simge ad="tag" />
        <span>Verilecek kart</span>
        <strong className="tc-nz-kartno">{kart?.kartNo ?? 'Boş kart yok'}</strong>
        <Dugme onClick={() => kartSiraYaz((s) => s + 1)} disabled={bosKartlar.length < 2}>Başka kart</Dugme>
      </div>
      <p className="tc-nz-soluk" role="status">{eksik.length > 0 ? `Eksik: ${eksik.join(', ')}` : 'Hazır. Enter ile de onaylanır.'}</p>
      <div className="tc-nz-panel-alt">
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" boyut="ana" type="submit" simge="check" disabled={eksik.length > 0} yukleniyor={giris.isPending}>
          {kart === null ? 'İçeri al' : `İçeri al · ${kart.kartNo}`}
        </Dugme>
      </div>
    </form>
  );
}

function CikisPaneli({ ziyaret, kapat, bitti }: { ziyaret: Ziyaret; kapat: () => void; bitti: (s: SonIslem) => void }) {
  const [kontrol, kontrolYaz] = useState(false);
  const [teslim, teslimYaz] = useState(true);
  const cikis = useKomut<CikisGovdesi, Ziyaret>('Çıkış kaydedilemedi.');
  const eksik = ziyaret.dizustu && !kontrol;
  const onayla = () => {
    cikis.mutate({
      yol: `/nizamiye/ziyaretler/${ziyaret.id}/cikis`,
      govde: { surum: ziyaret.surum, kartTeslim: teslim, ekipmanKontrol: ziyaret.dizustu ? kontrol : null },
    }, {
      onSuccess: (z) => bitti({
        mesaj: `${adi(z)} çıktı. ${teslim ? `${z.kartNo ?? ''} rafa döndü.` : `${z.kartNo ?? ''} kayıp sayıldı.`}`, ziyaretId: z.id, surum: z.surum,
      }),
    });
  };
  return (
    <div className="tc-nz-panel-form" onKeyDown={(o) => { if (o.key === 'Escape') kapat(); }}>
      <h2 className="tc-nz-panel-baslik"><Simge ad="back" /> Çıkış: {adi(ziyaret)}</h2>
      {ziyaret.dizustu && <EvetHayir simge="cpu" ad="Dizüstü ile girdi: çanta ve cihaz kontrol edildi" zorunlu deger={kontrol} degistir={kontrolYaz} />}
      <EvetHayir simge="tag" ad={`Kart ${ziyaret.kartNo ?? ''} geri alındı`} deger={teslim} degistir={teslimYaz} />
      <div className="tc-nz-panel-alt">
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" boyut="ana" simge="check" disabled={eksik} yukleniyor={cikis.isPending} onClick={onayla}>Çıkar</Dugme>
      </div>
    </div>
  );
}

export function Kapi() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('nizamiye.yaz') === true;
  const veri = useQuery({ queryKey: anahtarlar.kapi, queryFn: () => api.get<KapiCevabi>('/nizamiye/kapi'), refetchInterval: 30_000 });
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [ara, araYaz] = useState('');
  const [panel, panelYaz] = useState<Panel>(null);
  const [son, sonYaz] = useState<SonIslem | null>(null);
  const geriAl = useKomut<{ surum: number }, Ziyaret>('Geri alınamadı.');

  const simdi = veri.data ? Date.parse(veri.data.simdi) : 0;
  const q = ara.trim().toLocaleLowerCase('tr');
  const satirlar = useMemo(() => {
    if (!veri.data) return [];
    const { beklenen, iceride } = veri.data;
    const liste = suzgec === 'beklenen' ? beklenen : suzgec === 'iceride' ? iceride : [...beklenen, ...iceride];
    return liste.filter((z) => eslesir(z, q));
  }, [veri.data, suzgec, q]);

  if (veri.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (veri.isError) return <DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} />;
  const { beklenen, iceride, bosKartlar } = veri.data;
  const dikkat = [...beklenen, ...iceride].filter((z) => uyari(z, simdi) !== null).length;

  const bitti = (s: SonIslem) => { panelYaz(null); sonYaz(s); };
  const eylem = (z: Ziyaret) => panelYaz({ tur: z.durum === 'iceride' ? 'cikis' : 'giris', ziyaret: z });

  // Okuyucu kart numarasını yazıp Enter'a basar: içerideki kartsa çıkış paneli açılır.
  const tus = (o: KeyboardEvent<HTMLInputElement>) => {
    if (o.key !== 'Enter' || !yazabilir) return;
    const kartli = iceride.find((z) => z.kartNo !== null && z.kartNo.toLocaleLowerCase('tr') === q);
    const tek = satirlar.length === 1 ? satirlar[0] : undefined;
    const hedef = kartli ?? tek;
    if (hedef) { o.preventDefault(); eylem(hedef); araYaz(''); }
  };

  return (
    <div className="tc-nz">
      <div className="tc-nz-ust">
        <Sayac simge="users" sayi={iceride.length} ad="İçeride" ton="run" secili={suzgec === 'iceride'} sec={() => suzgecYaz(suzgec === 'iceride' ? 'hepsi' : 'iceride')} />
        <Sayac simge="clock" sayi={beklenen.length} ad="Bekleniyor" ton="bilgi" secili={suzgec === 'beklenen'} sec={() => suzgecYaz(suzgec === 'beklenen' ? 'hepsi' : 'beklenen')} />
        <Sayac simge="tag" sayi={bosKartlar.length} ad="Boş kart" ton="notr" />
        <Sayac simge="alert" sayi={dikkat} ad="Dikkat isteyen" ton="hold" />
        <Link to="/nizamiye/acil-durum" className="tc-dugme tc-dugme-tehlike tc-dugme-ana tc-nz-acil"><Simge ad="alert" />ACİL DURUM</Link>
      </div>

      {son && (
        <div className="tc-nz-serit" role="status">
          <Simge ad="check" />
          <span>{son.mesaj}</span>
          <Dugme simge="rotate" yukleniyor={geriAl.isPending} onClick={() => geriAl.mutate(
            { yol: `/nizamiye/ziyaretler/${son.ziyaretId}/geri-al`, govde: { surum: son.surum } },
            { onSuccess: () => sonYaz(null) },
          )}>Geri al</Dugme>
          <button type="button" className="tc-nz-serit-kapat" aria-label="Kapat" onClick={() => sonYaz(null)}><Simge ad="x" /></button>
        </div>
      )}

      <div className="tc-nz-govde">
        <main className="tc-nz-liste">
          <div className="tc-nz-arama">
            <label className="tc-nz-arama-kutu">
              <Simge ad="scan" />
              <input type="search" aria-label="Ad, firma, plaka yaz ya da kartı okut" placeholder="Ad, firma, plaka yaz ya da kartı okut"
                value={ara} onChange={(o) => araYaz(o.target.value)} onKeyDown={tus} />
            </label>
            {yazabilir && <Link to="/nizamiye/habersiz" className="tc-dugme tc-dugme-birincil tc-dugme-ana"><Simge ad="plus" />Habersiz ziyaretçi</Link>}
          </div>
          <Sekmeler etiket="Liste" secili={suzgec} sec={suzgecYaz} sekmeler={[
            { anahtar: 'hepsi', baslik: `Hepsi ${beklenen.length + iceride.length}` },
            { anahtar: 'beklenen', baslik: `Bekleniyor ${beklenen.length}`, simge: 'clock' },
            { anahtar: 'iceride', baslik: `İçeride ${iceride.length}`, simge: 'users' },
          ]} />
          {satirlar.length === 0 && <p className="tc-nz-bos">Eşleşen kayıt yok. Yeni gelen biriyse "Habersiz ziyaretçi"ye bas.</p>}
          {satirlar.map((z) => {
            const ic = z.durum === 'iceride';
            const u = uyari(z, simdi);
            return (
              <article key={z.id} className={`tc-nz-satir${panel?.ziyaret.id === z.id ? ' tc-nz-secili' : ''}`}>
                <span className={`tc-nz-satir-simge${ic ? ' tc-nz-ton-run' : ' tc-nz-ton-bilgi'}`} aria-hidden="true"><Simge ad={NEDEN_SIMGELERI[z.neden]} /></span>
                <div className="tc-nz-satir-ad">
                  <strong>{adi(z)}</strong>
                  <span className="tc-nz-soluk">{[z.firmaAdi, NEDEN_ADLARI[z.neden], z.evSahibiAd && `ev sahibi ${z.evSahibiAd}`].filter(Boolean).join(' · ')}</span>
                  {u && <span className="tc-nz-uyari"><Simge ad="alert" boyut="k" />{u}</span>}
                </div>
                <div className="tc-nz-satir-zaman">
                  <span className="tc-nz-kartno">{ic ? z.kartNo : saat(z.beklenenZaman)}</span>
                  <span className="tc-nz-soluk">{ic && z.giris ? sureMetni(z.giris, simdi) : 'bekleniyor'}</span>
                </div>
                {yazabilir && (
                  <Dugme tur={ic ? 'ikincil' : 'birincil'} boyut="ana" simge={ic ? 'back' : 'next'} onClick={() => eylem(z)}>{ic ? 'Çıkış' : 'Giriş'}</Dugme>
                )}
              </article>
            );
          })}
        </main>
        <aside className="tc-nz-panel" aria-label="İşlem paneli">
          {panel?.tur === 'giris' && <GirisPaneli key={panel.ziyaret.id} ziyaret={panel.ziyaret} bosKartlar={bosKartlar.filter((k) => k.tur === 'ziyaretci')} kapat={() => panelYaz(null)} bitti={bitti} />}
          {panel?.tur === 'cikis' && <CikisPaneli key={panel.ziyaret.id} ziyaret={panel.ziyaret} kapat={() => panelYaz(null)} bitti={bitti} />}
          {panel === null && (
            <div className="tc-nz-ipucu">
              <strong>Ne yapmak istiyorsun?</strong>
              <span><Simge ad="next" />Gelen biri: listede adına <b>Giriş</b>.</span>
              <span><Simge ad="back" />Çıkan biri: kartını okut ya da <b>Çıkış</b>.</span>
              <span><Simge ad="alert" />Alarm: üstte <b>ACİL DURUM</b>.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
