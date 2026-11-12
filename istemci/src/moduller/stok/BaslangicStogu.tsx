import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type {
  AraCevabi, BaslangicDenetleCevabi, BaslangicSatirDenetimi, BaslangicYukleCevabi, BaslangicYukleGovdesi, MalKabullerCevabi, MalKabulOzeti,
} from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Dugme, IsaretKutusu, Kart, OnayPenceresi, Pencere, Rozet, Secim, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { DosyaReddi } from '../../ortak/excel/kitap.ts';
import { baslikImzasi, eksikZorunlular, eslemeOner, ilkDegerler, sutunaAta, type SutunEslemesi } from '../../ortak/excel/esleme.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AramaSecici } from './AramaSecici.tsx';
import {
  BASLANGIC_ALANLARI, duzeltmeler, eslenecekKodlar, gidenSatirlar, haricDegistir, hucreDegistir, hucreDuzeltmeSayisi, kodaUygula, satirDurumu,
  satirlariKur, sayilar, secimiBirak, yuklenebilir, type BaslangicAlani, type BaslangicSatiri, type SatirDurumu,
} from './baslangic.ts';
import { baslangicDosyasiOku, baslangicSablonuIndir, duzeltilmisDosyaIndir, type OkunanDosya } from './baslangic-excel.ts';
import { sonTaslak, taslakSil, taslakYaz, type BaslangicTaslagi } from './baslangic-taslak.ts';
import { zamanMetni } from './gorunum.ts';
import { SayfaBasi, hataMetni, korumaliPost, useIslem } from './ortak.tsx';
import './stok.css';

// Başlangıç stoğu (3129, 3134 a, 3132 a, 3144 a): Excel'le toplu giriş. Dosya tarayıcıda okunur, sütunlar alanlarla eşlenir, satırlar tabloda
// düzeltilir; sunucu her değişiklikte son satırları denetler ve yüklemede yeniden denetleyip tek belge yazar. Dosyanın kendisi saklanmaz.

const ESLEME_ANAHTARI = 'tmi.stok.baslangic.esleme';
const DOSYA_ADI_EN_UZUN = 120;

// Eşleme bu tarayıcıda başlık dizisiyle hatırlanır (V24); okunamazsa öneri başlıktan gelir.
function hatirlananEsleme(basliklar: readonly string[]): (string | null)[] | null {
  try {
    const kayit = JSON.parse(window.localStorage.getItem(ESLEME_ANAHTARI) ?? 'null') as { imza: string; esleme: (string | null)[] } | null;
    return kayit && kayit.imza === baslikImzasi(basliklar) && kayit.esleme.length === basliklar.length ? kayit.esleme : null;
  } catch {
    return null;
  }
}
function eslemeyiHatirla(basliklar: readonly string[], esleme: SutunEslemesi): void {
  try { window.localStorage.setItem(ESLEME_ANAHTARI, JSON.stringify({ imza: baslikImzasi(basliklar), esleme })); } catch { /* hatırlanmazsa öneri gelir */ }
}
const telefonMu = (): boolean => { try { return window.matchMedia('(max-width: 600px)').matches; } catch { return false; } };

const DURUM: Record<SatirDurumu, { etiket: string; ton: RozetTonu }> = {
  eklenecek: { etiket: 'Eklenecek', ton: 'tamam' }, uyarili: { etiket: 'Uyarılı', ton: 'uyari' }, hatali: { etiket: 'Hatalı', ton: 'hata' },
  haric: { etiket: 'Hariç', ton: 'pasif' }, bekliyor: { etiket: 'Denetleniyor', ton: 'bilgi' },
};
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

// Bulunamayan kart ya da konum için arama (stok içi arama; kod ya da adla). Kart ve konum bu ekrandan açılmaz.
function KodAra({ tur, etiket, sec }: { tur: 'malzeme' | 'konum'; etiket: string; sec: (x: { id: number; kod: string }) => void }) {
  const [metin, setMetin] = useState('');
  const q = metin.trim();
  const a = useQuery({ queryKey: [...anahtarlar.hepsi, 'baslangic-ara', tur, q], queryFn: () => api.get<AraCevabi>(`/stok/ara?q=${encodeURIComponent(q)}`), enabled: q.length >= 2 });
  const secenekler = q.length < 2 ? [] : (a.data?.sonuclar ?? []).flatMap((x) => {
    if (tur === 'malzeme' && x.tur === 'malzeme') return [{ deger: `${String(x.malzemeId)}\n${x.kod}`, baslik: x.kod, alt: x.ad ?? '' }];
    if (tur === 'konum' && x.tur === 'konum') return [{ deger: `${String(x.konumId)}\n${x.kod}`, baslik: x.kod, alt: x.ad ?? '' }];
    return [];
  }).slice(0, 8);
  const ipucu = q.length < 2 ? (tur === 'malzeme' ? 'Kart yoksa Malzemeler\'de açın, sonra yeniden eşleyin.' : 'Konum kodunu yazın.')
    : a.isPending ? 'Aranıyor…' : secenekler.length === 0 ? 'Eşleşen yok.' : 'Listeden seçin.';
  return (
    <AramaSecici etiket={etiket} deger={metin} degistir={setMetin} secili={null} secenekler={secenekler} ipucu={ipucu} yerTutucu={tur === 'malzeme' ? 'Ara: kod ya da ad' : 'Ara: konum kodu'}
      secildi={(x) => { const [id, kod] = x.deger.split('\n'); setMetin(''); sec({ id: Number(id), kod: kod ?? '' }); }} />
  );
}

// Hücre girdisi yazarken tabloyu yeniden çizmez: değer çıkışta (ya da Enter'da) işlenir; dışarıdan gelen değer girdiyi yeniler.
function HucreGirdisi({ deger, etiket, yerTutucu, sayi, isle }: { deger: string; etiket: string; yerTutucu?: string; sayi?: boolean; isle: (v: string) => void }) {
  const islendi = (e: { currentTarget: HTMLInputElement }) => { if (e.currentTarget.value !== deger) isle(e.currentTarget.value); };
  const tus = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') islendi(e); };
  return <input key={deger} className="tc-alan-kutu tc-baslangic-girdi" aria-label={etiket} defaultValue={deger} placeholder={yerTutucu} onBlur={islendi} onKeyDown={tus} {...(sayi ? { inputMode: 'decimal' as const } : {})} />;
}

// Değişen hücre işaretli; üzerine gelince dosyadaki değer görünür.
function Degisen({ degisti, dosyada, children }: { degisti: boolean; dosyada: string; children: ReactNode }) {
  return <span className="tc-baslangic-hucre" data-degisti={degisti || undefined} title={degisti ? `Dosyada: ${dosyada || '—'}` : undefined}>{children}</span>;
}

function EslemePenceresi({ dosya, esleme, setEsleme, devam, kapat }: {
  dosya: OkunanDosya | null; esleme: SutunEslemesi; setEsleme: (e: SutunEslemesi) => void; devam: () => void; kapat: () => void;
}) {
  const eksik = eksikZorunlular(esleme, BASLANGIC_ALANLARI);
  const alanSecenekleri = BASLANGIC_ALANLARI.map((a) => ({ deger: a.anahtar, baslik: a.baslik }));
  type Sutunu = { i: number; baslik: string };
  const sutunlar: Sutun<Sutunu>[] = [
    { anahtar: 'baslik', baslik: 'Dosyadaki sütun', hucre: (s) => <strong>{s.baslik}</strong> },
    { anahtar: 'ornek', baslik: 'İlk 5 satır', kes: true, hucre: (s) => (dosya ? ilkDegerler(dosya.satirlar.map((x) => x.hucreler), s.i).map((x) => x || '—').join(', ') : '') },
    { anahtar: 'alan', baslik: 'Sistemdeki alan', hucre: (s) => (
      <Secim etiket={`${s.baslik} sütunu`} value={esleme[s.i] ?? ''} bosSecenek="Kullanılmaz" secenekler={alanSecenekleri}
        onChange={(e) => setEsleme(sutunaAta(esleme, s.i, e.target.value === '' ? null : e.target.value))} />
    ) },
  ];
  return (
    <Pencere acik={dosya !== null} kapat={kapat} baslik="Sütunları eşleştir" genis
      ust={dosya ? <p className="tc-stok-not">{dosya.ad} · {dosya.satirlar.length} satır</p> : null}
      alt={<Dugme tur="birincil" disabled={eksik.length > 0} onClick={devam}>Devam</Dugme>}>
      <div className="tc-stok-form">
        <Tablo etiket="Sütun eşleme" kip="kaydir" sutunlar={sutunlar} satirlar={(dosya?.basliklar ?? []).map((baslik, i) => ({ i, baslik }))} satirAnahtari={(s) => s.i} />
        <p className="tc-stok-not">
          {eksik.length > 0 ? `Seçilmesi gereken: ${eksik.map((a) => a.baslik).join(', ')}. ` : ''}
          Zorunlu üç alan (Malzeme kodu, Miktar, Konum kodu) seçilmeden devam edilmez. Seçilmeyen alan boş sayılır.
        </p>
      </div>
    </Pencere>
  );
}

interface Duzenleme { dosyaAdi: string; ozet: string; basliklar: string[]; esleme: SutunEslemesi; satirlar: BaslangicSatiri[] }

function DuzenlemePenceresi({ d, setSatirlar, kapat, yuklendi }: {
  d: Duzenleme | null; setSatirlar: (f: (s: BaslangicSatiri[]) => BaslangicSatiri[]) => void; kapat: () => void; yuklendi: (b: MalKabulOzeti) => void;
}) {
  const { bildir } = useBildirim();
  const [denetim, setDenetim] = useState<ReadonlyMap<number, BaslangicSatirDenetimi>>(new Map());
  const [tekrar, setTekrar] = useState<BaslangicDenetleCevabi['tekrar']>(null);
  const [denetleniyor, setDenetleniyor] = useState(false);
  const [denetimHatasi, setDenetimHatasi] = useState<string | null>(null);
  const [yeniden, setYeniden] = useState(0);
  const [yalnizSorunlu, setYalnizSorunlu] = useState(telefonMu);
  const [onay, setOnay] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const satirlar = d?.satirlar ?? [];
  const giden = gidenSatirlar(satirlar);
  const gidenImza = JSON.stringify(giden);
  const sira = useRef(0);

  // Her değişiklikten kısa süre sonra son satırlar sunucuda denetlenir; geç gelen eski cevap yenisinin üstüne yazmaz.
  useEffect(() => {
    if (!d || giden.length === 0) return undefined;
    const no = ++sira.current;
    setDenetleniyor(true);
    const t = setTimeout(() => {
      korumaliPost<BaslangicDenetleCevabi>('/stok/baslangic-stogu/denetle', { satirlar: giden, dosyaOzeti: d.ozet })
        .then((c) => { if (no !== sira.current) return; setDenetim(new Map(c.satirlar.map((x) => [x.sira, x]))); setTekrar(c.tekrar); setDenetimHatasi(null); })
        .catch((e: unknown) => { if (no === sira.current) setDenetimHatasi(hataIletisi(e, 'Denetlenemedi. Bağlantıyı kontrol edip yeniden deneyin.')); })
        .finally(() => { if (no === sira.current) setDenetleniyor(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [d?.ozet, gidenImza, yeniden]);

  const say = sayilar(satirlar, denetleniyor ? new Map() : denetim);
  const sayHazir = sayilar(satirlar, denetim);
  const gorunen = yalnizSorunlu ? satirlar.filter((s) => { const x = satirDurumu(s, denetim.get(s.sira)); return x === 'hatali' || x === 'uyarili'; }) : satirlar;
  const kodlar = eslenecekKodlar(satirlar, denetim);
  const hucreSayisi = hucreDuzeltmeSayisi(satirlar);
  const hazir = !denetleniyor && denetimHatasi === null && tekrar === null && yuklenebilir(say);
  const degistir = (sira: number, alan: BaslangicAlani) => (v: string) => setSatirlar((l) => hucreDegistir(l, sira, alan, v));

  const iletiler = (s: BaslangicSatiri): string => {
    const x = denetim.get(s.sira);
    return x ? [...x.hatalar, ...x.uyarilar].map((h) => h.ileti).join(' ') : '';
  };
  const sutunlar: Sutun<BaslangicSatiri>[] = [
    { anahtar: 'sira', baslik: 'Satır', hizala: 'sag', hucre: (s) => s.sira },
    { anahtar: 'denetim', baslik: 'Denetim', hucre: (s) => { const x = DURUM[satirDurumu(s, denetim.get(s.sira))]; return <Rozet ton={x.ton}>{x.etiket}</Rozet>; } },
    { anahtar: 'kod', baslik: 'Malzeme kodu', mono: true, hucre: (s) => {
      const x = denetim.get(s.sira);
      const degisti = s.malzeme !== null || s.deger.malzemeKodu !== s.dosya.malzemeKodu;
      if (s.malzeme) return <Degisen degisti dosyada={s.dosya.malzemeKodu}>{s.malzeme.kod} <button type="button" className="tc-stok-bag" onClick={() => setSatirlar((l) => secimiBirak(l, 'malzeme', s.sira))}>Değiştir</button></Degisen>;
      if (s.haric || !x || x.malzeme !== null || s.deger.malzemeKodu === '') {
        return <Degisen degisti={degisti} dosyada={s.dosya.malzemeKodu}><HucreGirdisi deger={s.deger.malzemeKodu} etiket={`Satır ${String(s.sira)} malzeme kodu`} isle={degistir(s.sira, 'malzemeKodu')} /></Degisen>;
      }
      return <KodAra tur="malzeme" etiket={`Satır ${String(s.sira)} malzeme eşleştir (dosyada: ${s.deger.malzemeKodu})`} sec={(m) => setSatirlar((l) => kodaUygula(l, 'malzeme', s.deger.malzemeKodu, m, s.sira))} />;
    } },
    { anahtar: 'ad', baslik: 'Malzeme adı', kes: true, hucre: (s) => denetim.get(s.sira)?.malzeme?.ad ?? '—' },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (s) => (
      <Degisen degisti={s.deger.miktar !== s.dosya.miktar} dosyada={s.dosya.miktar}><HucreGirdisi sayi deger={s.deger.miktar} etiket={`Satır ${String(s.sira)} miktar`} isle={degistir(s.sira, 'miktar')} /></Degisen>
    ) },
    { anahtar: 'birim', baslik: 'Birim', hucre: (s) => denetim.get(s.sira)?.malzeme?.birim ?? '—' },
    { anahtar: 'konum', baslik: 'Konum', mono: true, hucre: (s) => {
      const x = denetim.get(s.sira);
      const degisti = s.konum !== null || s.deger.konumKodu !== s.dosya.konumKodu;
      if (s.konum) return <Degisen degisti dosyada={s.dosya.konumKodu}>{s.konum.kod} <button type="button" className="tc-stok-bag" onClick={() => setSatirlar((l) => secimiBirak(l, 'konum', s.sira))}>Değiştir</button></Degisen>;
      if (s.haric || !x || x.konum !== null || s.deger.konumKodu === '') {
        return <Degisen degisti={degisti} dosyada={s.dosya.konumKodu}><HucreGirdisi deger={s.deger.konumKodu} etiket={`Satır ${String(s.sira)} konum kodu`} isle={degistir(s.sira, 'konumKodu')} /></Degisen>;
      }
      return <KodAra tur="konum" etiket={`Satır ${String(s.sira)} konum seç (dosyada: ${s.deger.konumKodu})`} sec={(k) => setSatirlar((l) => kodaUygula(l, 'konum', s.deger.konumKodu, k, s.sira))} />;
    } },
    { anahtar: 'lot', baslik: 'Lot no', mono: true, hucre: (s) => (
      <Degisen degisti={s.deger.lotNo !== s.dosya.lotNo} dosyada={s.dosya.lotNo}><HucreGirdisi deger={s.deger.lotNo} yerTutucu="otomatik" etiket={`Satır ${String(s.sira)} lot no`} isle={degistir(s.sira, 'lotNo')} /></Degisen>
    ) },
    { anahtar: 'kart', baslik: 'Kalite · Durum · İşlem · Ölçü', kes: true, hucre: (s) => {
      const m = denetim.get(s.sira)?.malzeme;
      return [m?.kalite, m?.durum, m?.islem, m?.olcu].filter(Boolean).join(' · ') || '—';
    } },
    { anahtar: 'aciklama', baslik: 'Açıklama', csv: iletiler, hucre: (s) => {
      const x = denetim.get(s.sira);
      const skt = !s.haric && x?.hatalar.some((h) => h.alan === 'sonKullanma');
      return <span className="tc-baslangic-aciklama">{iletiler(s)}{skt && (
        <Degisen degisti={s.deger.sonKullanma !== s.dosya.sonKullanma} dosyada={s.dosya.sonKullanma}>
          <HucreGirdisi deger={s.deger.sonKullanma} yerTutucu="GG.AA.YYYY" etiket={`Satır ${String(s.sira)} son kullanma`} isle={degistir(s.sira, 'sonKullanma')} />
        </Degisen>
      )}</span>;
    } },
    { anahtar: 'haric', baslik: 'Hariç tut', sabit: 'sag', csv: false, hucre: (s) => <Dugme onClick={() => setSatirlar((l) => haricDegistir(l, s.sira))}>{s.haric ? 'Geri al' : 'Hariç tut'}</Dugme> },
  ];

  const yukle = async () => {
    if (!d) return;
    setOnay(false);
    setYukleniyor(true);
    try {
      const govde: BaslangicYukleGovdesi = { dosyaOzeti: d.ozet, dosyaAdi: d.dosyaAdi.slice(0, DOSYA_ADI_EN_UZUN), satirlar: giden, duzeltmeler: duzeltmeler(satirlar) };
      const c = await korumaliPost<BaslangicYukleCevabi>('/stok/baslangic-stogu', govde);
      if (c.belge) { yuklendi(c.belge); return; }
      // Arada kart ya da konum değiştiyse sunucu yazmaz; tablo hatalı satırları gösterir, düzenleme kaybolmaz.
      if (c.denetim) { setDenetim(new Map(c.denetim.satirlar.map((x) => [x.sira, x]))); setYalnizSorunlu(true); }
      bildir('hata', 'Sunucu denetiminde hatalı satır çıktı; hiçbir şey yazılmadı. Satırları düzeltin.');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Yüklenemedi. Bağlantıyı kontrol edip yeniden deneyin.'));
      setYeniden((n) => n + 1);
    } finally {
      setYukleniyor(false);
    }
  };
  const indir = () => {
    if (!d) return;
    void duzeltilmisDosyaIndir(d.dosyaAdi, satirlar, (s) => ({ durum: DURUM[satirDurumu(s, denetim.get(s.sira))].etiket, hata: iletiler(s) }))
      .catch((e: unknown) => bildir('hata', hataMetni(e)));
  };

  return (
    <>
      <Pencere acik={d !== null} kapat={kapat} baslik="Başlangıç stoğu: düzenle" tur="tam"
        ust={d ? <p className="tc-stok-not">{d.dosyaAdi} · {satirlar.length} satır</p> : null}
        alt={<>
          <Dugme simge="rotate" disabled={denetleniyor} onClick={() => setYeniden((n) => n + 1)}>Yeniden eşle</Dugme>
          <Dugme simge="download" onClick={indir}>Düzeltilmiş dosyayı indir</Dugme>
          <Dugme tur="birincil" simge="upload" disabled={!hazir} yukleniyor={yukleniyor} onClick={() => setOnay(true)}>
            {hazir ? `Yükle (${String(say.eklenecek + say.uyarili)} satır)` : 'Yükle'}
          </Dugme>
        </>}>
        <div className="tc-stok-form">
          <div className="tc-baslangic-ust">
            <IsaretKutusu etiket="Yalnız hatalı ve uyarılı" checked={yalnizSorunlu} onChange={(e) => setYalnizSorunlu(e.target.checked)} />
            <div className="tc-baslangic-sayac" aria-live="polite">
              <Rozet ton="tamam" gorunum="cizgi">Eklenecek {sayHazir.eklenecek}</Rozet>
              <Rozet ton="uyari" gorunum="cizgi">Uyarılı {sayHazir.uyarili}</Rozet>
              <Rozet ton="hata" gorunum="cizgi">Hatalı {sayHazir.hatali}</Rozet>
              <Rozet ton="pasif" gorunum="cizgi">Hariç {sayHazir.haric}</Rozet>
            </div>
          </div>
          {sayHazir.hatali > 0 && <p className="tc-stok-not">Hatalı satırları düzeltin ya da hariç tutun; hatalı satır varken hiçbir şey yazılmaz.</p>}
          {tekrar && <p className="tc-stok-not">Bu dosya <Link to={`/stok/mal-kabul/${String(tekrar.id)}`}>{tekrar.no}</Link> olarak yüklendi.</p>}
          {denetimHatasi && <DurumKutusu durum="hata" mesaj={denetimHatasi} yenile={() => setYeniden((n) => n + 1)} />}
          {kodlar.length > 0 && (
            <Kart baslik="Eşleştirilecek kodlar">
              <div className="tc-baslangic-panel">
                {kodlar.map((k) => (
                  <div key={`${k.tur}-${k.kod}`} className="tc-baslangic-esle">
                    <span>{k.tur === 'malzeme' ? 'Malzeme' : 'Konum'} <strong className="tc-baslangic-kod">{k.kod}</strong> · {k.satir} satır</span>
                    <KodAra tur={k.tur} etiket={`${k.kod} için ${k.tur === 'malzeme' ? 'malzeme' : 'konum'} seç`} sec={(x) => setSatirlar((l) => kodaUygula(l, k.tur, k.kod, x))} />
                  </div>
                ))}
              </div>
            </Kart>
          )}
          <Tablo etiket="Başlangıç stoğu satırları" kip="kaydir" sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(s) => s.sira}
            bosMesaj={yalnizSorunlu ? 'Hatalı ya da uyarılı satır yok.' : 'Satır yok.'} />
          <p className="tc-stok-not">Kalite, durum, işlem ve ölçü karttan gelir, düzenlenmez. Bütün satırlar serbest girer. Kart ya da konum bu ekrandan açılmaz; kart yoksa Malzemeler'de açıp "Yeniden eşle".</p>
        </div>
      </Pencere>
      <OnayPenceresi acik={onay} baslik="Başlangıç stoğunu yükle" onayMetni="Yükle" yukleniyor={yukleniyor} onayla={() => void yukle()} vazgec={() => setOnay(false)}>
        <p>{say.eklenecek + say.uyarili} satır girilecek, {say.haric} satır hariç, {hucreSayisi} hücre düzeltildi.</p>
      </OnayPenceresi>
    </>
  );
}

const LISTE_SUTUNLARI: Sutun<MalKabulOzeti>[] = [
  { anahtar: 'no', baslik: 'Belge no', mono: true, hucre: (b) => <Link to={`/stok/mal-kabul/${String(b.id)}`}>{b.no}</Link>, csv: (b) => b.no },
  { anahtar: 'zaman', baslik: 'Tarih', kirilmaz: true, hucre: (b) => zamanMetni(b.zaman) },
  { anahtar: 'kisi', baslik: 'Yükleyen', kes: true, hucre: (b) => b.kisiAd ?? '—' },
  { anahtar: 'satir', baslik: 'Satır', hizala: 'sag', hucre: (b) => b.satirSayisi },
  { anahtar: 'malzeme', baslik: 'Malzeme', hizala: 'sag', hucre: (b) => b.malzemeSayisi ?? '—' },
  { anahtar: 'durum', baslik: 'Durum', hucre: (b) => (b.duzeltenId === null ? <Rozet ton="tamam">Yüklendi</Rozet> : <Rozet ton="pasif">Geri alındı</Rozet>), csv: (b) => (b.duzeltenId === null ? 'Yüklendi' : 'Geri alındı') },
];

export function BaslangicStogu() {
  const girebilir = useIslem('stok.giris');
  const kisiId = useOturum().data?.id ?? null;
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  const git = useNavigate();
  const secici = useRef<HTMLInputElement>(null);
  const [okunuyor, setOkunuyor] = useState(false);
  const [okunan, setOkunan] = useState<OkunanDosya | null>(null);
  const [esleme, setEsleme] = useState<SutunEslemesi>([]);
  const [duzenleme, setDuzenleme] = useState<Duzenleme | null>(null);
  const [taslak, setTaslak] = useState<BaslangicTaslagi | null>(null);
  const l = useQuery({ queryKey: anahtarlar.liste('baslangic-stogu', {}), queryFn: () => api.get<MalKabullerCevabi>('/stok/mal-kabuller?tur=baslangic&asil=1&sayfaBoyu=50') });

  useEffect(() => {
    if (kisiId === null) return;
    void sonTaslak(kisiId).then(setTaslak);
  }, [kisiId]);
  // Yarım kalan düzenleme bu tarayıcıda saklanır (kişi + dosya özeti, 24 saat).
  useEffect(() => {
    if (!duzenleme || kisiId === null) return undefined;
    const t = setTimeout(() => { void taslakYaz({ kisiId, dosyaAdi: duzenleme.dosyaAdi, ozet: duzenleme.ozet, basliklar: duzenleme.basliklar, esleme: duzenleme.esleme, satirlar: duzenleme.satirlar }); }, 800);
    return () => clearTimeout(t);
  }, [duzenleme, kisiId]);

  const duzenlemeAc = (d: OkunanDosya, e: SutunEslemesi) => {
    setOkunan(null);
    setTaslak(null);
    setDuzenleme({ dosyaAdi: d.ad, ozet: d.ozet, basliklar: d.basliklar, esleme: e, satirlar: satirlariKur(d.satirlar, e) });
  };
  const dosyaSecildi = async (f: File | undefined) => {
    if (!f) return;
    setOkunuyor(true);
    try {
      const d = await baslangicDosyasiOku(f);
      const e = hatirlananEsleme(d.basliklar) ?? eslemeOner(d.basliklar, BASLANGIC_ALANLARI);
      if (d.sablon && eksikZorunlular(e, BASLANGIC_ALANLARI).length === 0) { duzenlemeAc(d, e); return; }
      setEsleme(e);
      setOkunan(d);
    } catch (e) {
      bildir('hata', e instanceof DosyaReddi ? e.message : hataMetni(e));
    } finally {
      setOkunuyor(false);
    }
  };
  const devam = () => {
    if (!okunan) return;
    eslemeyiHatirla(okunan.basliklar, esleme);
    duzenlemeAc(okunan, esleme);
  };
  const yuklendi = (b: MalKabulOzeti) => {
    if (duzenleme && kisiId !== null) void taslakSil(kisiId, duzenleme.ozet);
    setDuzenleme(null);
    bildir('tamam', `${b.no} açıldı; ${String(b.satirSayisi)} satır stoğa girdi.`);
    void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    void git(`/stok/mal-kabul/${String(b.id)}`);
  };
  // Kapatınca son hâl hemen saklanır (bekleyen gecikmeli yazım iptal olur) ve "Yarım kalan düzenleme" satırı görünür.
  const duzenlemeyiKapat = () => {
    const d = duzenleme;
    setDuzenleme(null);
    if (!d || kisiId === null) return;
    void taslakYaz({ kisiId, dosyaAdi: d.dosyaAdi, ozet: d.ozet, basliklar: d.basliklar, esleme: d.esleme, satirlar: d.satirlar })
      .then(() => sonTaslak(kisiId)).then(setTaslak);
  };
  const taslakSilVeKapat = () => {
    if (taslak && kisiId !== null) void taslakSil(kisiId, taslak.ozet);
    setTaslak(null);
  };

  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Başlangıç stoğu" alt="Fabrikada bugün duran malzemeyi Excel'le tek seferde stoğa girin."
        sag={girebilir ? <>
          <Dugme simge="download" onClick={() => void baslangicSablonuIndir().catch((e: unknown) => bildir('hata', hataMetni(e)))}>Şablonu indir</Dugme>
          <Dugme tur="birincil" simge="upload" yukleniyor={okunuyor} onClick={() => secici.current?.click()}>Dosya yükle</Dugme>
          <input ref={secici} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Excel dosyası seç"
            onChange={(e) => { void dosyaSecildi(e.target.files?.[0]); e.target.value = ''; }} />
        </> : null} />
      <p className="tc-stok-not">Müşterinin getirdiği malzeme bu dosyaya girmez; ayrı rafta, stoğa girmeden durur.</p>
      {taslak && girebilir && (
        <div className="tc-baslangic-taslak" role="status">
          <span>Yarım kalan düzenleme var ({taslak.dosyaAdi}, {SAAT.format(new Date(taslak.zaman))}).</span>
          <Dugme tur="birincil" onClick={() => { setDuzenleme({ dosyaAdi: taslak.dosyaAdi, ozet: taslak.ozet, basliklar: taslak.basliklar, esleme: taslak.esleme, satirlar: taslak.satirlar }); setTaslak(null); }}>Devam et</Dugme>
          <Dugme simge="trash" onClick={taslakSilVeKapat}>Sil</Dugme>
        </div>
      )}
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.data && <Kart><Tablo etiket="Başlangıç stoğu belgeleri" kip="kaydir" sutunlar={LISTE_SUTUNLARI} satirlar={l.data.satirlar} satirAnahtari={(b) => b.id} bosMesaj="Henüz başlangıç stoğu yüklenmedi." /></Kart>}
      <p className="tc-stok-not">Şablon sütunları: Malzeme kodu*, Miktar*, Konum kodu*, Lot no, Tedarikçi parti no, Döküm no, Sertifika no, Tedarikçi, Son kullanma, Not. (* zorunlu; son kullanma, son kullanma takipli kartta zorunlu.)</p>
      <EslemePenceresi dosya={okunan} esleme={esleme} setEsleme={setEsleme} devam={devam} kapat={() => setOkunan(null)} />
      <DuzenlemePenceresi d={duzenleme} kapat={duzenlemeyiKapat} yuklendi={yuklendi}
        setSatirlar={(f) => setDuzenleme((x) => (x ? { ...x, satirlar: f(x.satirlar) } : x))} />
    </section>
  );
}
