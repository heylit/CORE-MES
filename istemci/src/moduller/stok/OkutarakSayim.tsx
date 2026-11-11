import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KodCozCevabi, SayimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { okutmaDuzelt, type Komut } from '#paylasilan/kod-sozlugu.ts';
import {
  CokSatir, DurumKutusu, Dugme, Kart, KodOkuyucu, KOMUT_YOK, OnayPenceresi, Pencere, Rozet, Simge, useBildirim, useOkuyucuKomutu, type KomutIsleyici, type KomutSonucu,
} from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { hataMetni, korumaliPost, SayfaBasi, useIslem } from './ortak.tsx';
import {
  aktarimKodlari, eksikMiktar, miktarDegistir, okutmaUygula, okutulmayanlar, SAYIM_BASI, sayimGovdesi,
  type OkutmaSonucu, type SayimDurumu, type SonucTonu,
} from './okutarak-sayim.ts';
import { okutmaSesi } from './okutma-sesi.ts';
import './stok.css';

interface SonOkutma { kod: string; ton: SonucTonu; not: string }
const SON_SAYISI = 5;
const SONUC_SINIFI: Record<SonucTonu, string> = { tamam: 'tc-stok-is-tamam', uyari: 'tc-stok-is-uyari', hata: 'tc-stok-is-hata' };
const SONUC_SIMGESI = { tamam: 'check', uyari: 'alert', hata: 'x' } as const;

// Okutarak sayım (1905): göz, sonra o gözün etiketleri; okuyucunun hafızasından aktarılan okutmalar da aynı yoldan geçer.
// Kayıt göz başına mevcut kör sayım ucudur (POST /stok/sayim); eşiği aşan fark Sayım onaylarına düşer.
// Komut barkodları (1909): Kaydet, Geri al; Artı, Eksi ve Miktar son okutulan satıra yazılır; onay penceresinde Evet ve Vazgeç.
// `gomulu` (1912, Okut panelinin Say modu): sayfa başlığı yerine düğme satırı; bu ekranın bilmediği komut `ustKomut`a gider.
interface SonSatir { konumId: number; malzemeId: number; partiId: number | null | undefined }
export function OkutarakSayim({ gomulu = false, ustKomut }: { gomulu?: boolean; ustKomut?: KomutIsleyici } = {}) {
  const sayabilir = useIslem('stok.sayim');
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [durum, setDurumu] = useState<SayimDurumu>(SAYIM_BASI);
  const durumRef = useRef(durum);
  const setDurum = (d: SayimDurumu) => { durumRef.current = d; setDurumu(d); };
  const [onceki, setOnceki] = useState<SayimDurumu | null>(null);
  const [sonuc, setSonuc] = useState<OkutmaSonucu | null>(null);
  const [son, setSon] = useState<SonOkutma[]>([]);
  const [cozuluyor, setCozuluyor] = useState(false);
  const [aktarim, setAktarim] = useState<string | null>(null);
  const [kayitOnayi, setKayitOnayi] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const sonSatir = useRef<SonSatir | null>(null);
  useOkuyucuKomutu(kayitOnayi, (k: Komut) => {
    if (k.ad === 'EVET') { void kaydet(); return true; }
    if (k.ad === 'VAZGEC') { setKayitOnayi(false); return true; }
    return false;
  });
  if (!sayabilir) return <DurumKutusu durum="hata" mesaj="Sayım için stok sayım yetkisi gerekir." />;

  // Okutmalar sırayla çözülür: göz okutmasının sonucu bir sonraki etiketin hangi göze yazılacağını belirler.
  const cozVeUygula = async (ham: string): Promise<OkutmaSonucu> => {
    const kod = okutmaDuzelt(ham.trim());
    let r: { durum: SayimDurumu; sonuc: OkutmaSonucu };
    try {
      const c = await api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod)}`);
      r = okutmaUygula(durumRef.current, kod, c);
      if (r.sonuc.ton !== 'hata' && (c.tur === 'lot' || c.tur === 'malzeme') && r.durum.acik !== null) {
        sonSatir.current = { konumId: r.durum.acik, malzemeId: c.ozet.id, partiId: c.tur === 'lot' ? c.parti.id : undefined };
      }
    } catch (hata) {
      r = { durum: durumRef.current, sonuc: { ton: 'hata', baslik: 'Kod çözülemedi', alt: hataMetni(hata) } };
    }
    setDurum(r.durum);
    setSon((s) => [{ kod, ton: r.sonuc.ton, not: r.sonuc.baslik }, ...s].slice(0, SON_SAYISI));
    return r.sonuc;
  };
  const okundu = (ham: string) => {
    if (cozuluyor || ham.trim() === '') return;
    setCozuluyor(true);
    setOnceki(durumRef.current);
    void cozVeUygula(ham).then((s) => { setSonuc(s); okutmaSesi(s.ton); }).finally(() => setCozuluyor(false));
  };
  const aktar = async (metin: string) => {
    const kodlar = aktarimKodlari(metin);
    setAktarim(null);
    setCozuluyor(true);
    setOnceki(durumRef.current);
    let hatali = 0;
    for (const kod of kodlar) if ((await cozVeUygula(kod)).ton === 'hata') hatali += 1;
    setCozuluyor(false);
    const s: OkutmaSonucu = hatali
      ? { ton: 'uyari', baslik: `${kodlar.length} okutma aktarıldı`, alt: `${hatali} kod eklenmedi; son okutmalarda kırmızı görünür.` }
      : { ton: 'tamam', baslik: `${kodlar.length} okutma aktarıldı`, alt: 'Hepsi listeye eklendi.' };
    setSonuc(s);
    okutmaSesi(s.ton);
  };
  const geriAl = () => {
    if (!onceki) return;
    setDurum(onceki);
    setOnceki(null);
    setSonuc({ ton: 'uyari', baslik: 'Son okutma geri alındı', alt: 'Liste okutmadan önceki haline döndü.' });
  };
  const vazgec = () => { setDurum(SAYIM_BASI); setOnceki(null); setSon([]); setSonuc(null); };

  const okutulmayan = durum.gozler.reduce((t, g) => t + okutulmayanlar(g).length, 0);
  const eksik = durum.gozler.reduce((t, g) => t + eksikMiktar(g).length, 0);
  const kaydet = async () => {
    setKayitOnayi(false);
    setKaydediliyor(true);
    let onayaGiden = 0;
    const kalan = [...durum.gozler];
    try {
      while (kalan.length > 0) {
        const g = kalan[0]!;
        onayaGiden += (await korumaliPost<SayimCevabi>('/stok/sayim', sayimGovdesi(g))).onayaGiden;
        kalan.shift();
      }
      bildir('tamam', `Sayım kaydedildi: ${durum.gozler.length} göz.`);
      if (onayaGiden > 0) bildir('bilgi', `${onayaGiden} fark eşiği aştı; ikinci yetkilinin onayını bekliyor.`);
      vazgec();
    } catch (hata) {
      // Kaydedilen gözler listeden çıkar; hata veren göz ve sonrası yeniden gönderilebilir.
      setDurum({ gozler: kalan, acik: kalan.some((g) => g.konumId === durum.acik) ? durum.acik : null });
      bildir('hata', `Göz ${kalan[0]?.kod ?? ''}: ${hataMetni(hata)}`);
    } finally {
      setKaydediliyor(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    }
  };
  const kaydetBas = () => (okutulmayan > 0 ? setKayitOnayi(true) : void kaydet());

  const goster = (s: KomutSonucu, ham: string) => {
    setSonuc({ ton: s.ton, baslik: s.metin, alt: '' });
    setSon((l) => [{ kod: ham, ton: s.ton, not: s.metin }, ...l].slice(0, SON_SAYISI));
    okutmaSesi(s.ton);
  };
  const uyari = (metin: string): KomutSonucu => ({ ton: 'uyari', metin });
  const satirMiktari = (k: Komut): KomutSonucu => {
    const ss = sonSatir.current;
    const g = ss ? durum.gozler.find((x) => x.konumId === ss.konumId) : undefined;
    const i = ss && g ? g.satirlar.findIndex((x) => x.malzemeId === ss.malzemeId && (ss.partiId === undefined || x.partiId === ss.partiId)) : -1;
    const s = g?.satirlar[i];
    if (!g || !s) return uyari('Önce bir lot ya da malzeme okut');
    if (!('miktar' in k) && s.elle) return uyari(`${s.birim ?? 'Bu'} birimde miktar yazılır; Miktar kartını okut`);
    const yeni = 'miktar' in k ? k.miktar : Math.max(0, Number(s.miktar || '0') + (k.ad === 'ARTI' ? 1 : -1));
    setDurum(miktarDegistir(durum, g.konumId, i, String(yeni)));
    return { ton: 'tamam', metin: `${s.malzemeAd ?? `Kart ${s.malzemeId}`}: ${yeni}` };
  };
  const komutIsle = (k: Komut): KomutSonucu | null => {
    switch (k.ad) {
      case 'KAYDET':
        if (durum.gozler.length === 0) return uyari('Kaydedilecek sayım yok');
        if (eksik > 0) return uyari(`${eksik} satırın miktarı yazılmadı`);
        if (cozuluyor || kaydediliyor) return uyari('Önceki iş bitmedi; biraz sonra yeniden okut');
        kaydetBas();
        return okutulmayan > 0 ? uyari('Okutulmayan satır var: Evet ya da Vazgeç okut') : { ton: 'tamam', metin: 'Sayım kaydediliyor' };
      case 'GERI-AL':
        if (!onceki || cozuluyor) return uyari('Geri alınacak okutma yok');
        geriAl();
        return { ton: 'tamam', metin: 'Son okutma geri alındı' };
      case 'ARTI': case 'EKSI': case 'MIKTAR':
        return satirMiktari(k);
      case 'EVET': case 'VAZGEC': case 'MOD':
        return ustKomut?.(k) ?? null;
    }
  };
  const komut: KomutIsleyici = (k) => {
    const s = komutIsle(k);
    // MOD gibi panelin komutu sonucu kendi gösterir; burada yalnız bu ekranın sonucu yazılır.
    if (k.ad !== 'MOD') goster(s ?? uyari(KOMUT_YOK), `CMD:${k.ad}`);
    return s;
  };
  const eylemler = <>
    <Dugme simge="list" onClick={() => setAktarim('')} disabled={cozuluyor}>Hafızadan aktar</Dugme>
    <Dugme simge="x" onClick={vazgec} disabled={durum.gozler.length === 0 || kaydediliyor}>Vazgeç</Dugme>
    <Dugme tur="birincil" simge="check" onClick={kaydetBas} yukleniyor={kaydediliyor} disabled={durum.gozler.length === 0 || eksik > 0 || cozuluyor}>
      {durum.gozler.length ? `Sayımı kaydet (${durum.gozler.length} göz)` : 'Sayımı kaydet'}
    </Dugme>
  </>;

  return (
    <section className="tc-stok">
      {gomulu ? <div className="tc-stok-eylem">{eylemler}</div> : <SayfaBasi baslik="Okutarak sayım" aciklama="Kör sayım · önce göz, sonra lot ya da malzeme okut" sag={eylemler} />}
      <Kart>
        <KodOkuyucu sik okundu={okundu} bekliyor={cozuluyor} komut={komut} ipucu="Okuyucu alan seçmeden de çalışır. Komut kartıyla kaydet, geri al ve miktar yaz." />
        <div className={`tc-stok-is ${sonuc ? SONUC_SINIFI[sonuc.ton] : ''}`} role="status" aria-live="polite">
          <Simge ad={sonuc ? SONUC_SIMGESI[sonuc.ton] : 'scan'} />
          <div>
            <strong>{sonuc?.baslik ?? 'Göz etiketini okut'}</strong>
            <span>{sonuc?.alt ?? 'Sayım gözle başlar.'}</span>
          </div>
        </div>
        {eksik > 0 && <p className="tc-stok-not">{eksik} satırın miktarı yazılmadı; kayıt için gerekli.</p>}
      </Kart>
      {durum.gozler.slice().reverse().map((g) => {
        const acik = g.konumId === durum.acik;
        const bos = okutulmayanlar(g).length;
        return (
          <Kart key={g.konumId} baslik={g.kod} simge="target" sag={<Rozet ton={acik ? 'uyari' : 'bilgi'}>{acik ? 'Sayılıyor' : 'Okutuldu'}</Rozet>}>
            {g.satirlar.length === 0
              ? <p className="tc-stok-not">Bu gözde henüz okutma yok.</p>
              : (
                <ul className="tc-stok-sayim-satirlar">
                  {g.satirlar.map((s, i) => (
                    <li key={`${s.malzemeId}-${s.partiId ?? ''}`}>
                      <div className="tc-stok-ad"><strong>{s.malzemeAd ?? `Kart ${s.malzemeId}`}</strong><span>{s.partiEtiketi ? `Parti ${s.partiEtiketi}` : 'Parti bilinmiyor'}</span></div>
                      <span className="tc-stok-sayim-adet">
                        <Dugme simge="minus" aria-label={`Bir azalt ${s.malzemeAd ?? ''}`} disabled={s.elle} onClick={() => setDurum(miktarDegistir(durum, g.konumId, i, String(Math.max(0, Number(s.miktar || '0') - 1))))} />
                        <input className="tc-alan-kutu" inputMode="decimal" aria-label={`Sayılan ${s.malzemeAd ?? s.malzemeId}`} placeholder={s.birim ?? ''} value={s.miktar}
                          onChange={(o) => setDurum(miktarDegistir(durum, g.konumId, i, o.target.value))} />
                        <Dugme simge="plus" aria-label={`Bir artır ${s.malzemeAd ?? ''}`} disabled={s.elle} onClick={() => setDurum(miktarDegistir(durum, g.konumId, i, String(Number(s.miktar || '0') + 1)))} />
                        <span className="tc-stok-not">{s.birim ?? ''}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            {bos > 0 && !acik && <p className="tc-stok-not tc-stok-sayim-uyari"><Simge ad="alert" />Sistemde olup okutulmayan {bos} satır var; kaydedince 0 sayılır.</p>}
          </Kart>
        );
      })}
      <Kart baslik="Son okutmalar" simge="clock" sag={<Dugme simge="back" onClick={geriAl} disabled={!onceki || cozuluyor}>Sonuncuyu geri al</Dugme>}>
        {son.length === 0
          ? <p className="tc-stok-not">Henüz okutma yok.</p>
          : <ul className="tc-stok-sayim-son">{son.map((k, i) => <li key={i} data-ton={k.ton}><span className="tc-stok-mono">{k.kod}</span> · {k.not}</li>)}</ul>}
      </Kart>
      <Pencere acik={aktarim !== null} kapat={() => setAktarim(null)} baslik="Hafızadan aktar" alt={<>
        <Dugme onClick={() => setAktarim(null)}>Vazgeç</Dugme>
        <Dugme tur="birincil" disabled={aktarimKodlari(aktarim ?? '').length === 0} onClick={() => void aktar(aktarim ?? '')}>Listeye ekle ({aktarimKodlari(aktarim ?? '').length})</Dugme>
      </>}>
        <ol className="tc-stok-liste">
          <li>Okuyucuyu bu bilgisayara bağla ve aşağıdaki alana tıkla.</li>
          <li>Okuyucuyla hafızayı aktaran barkodu ("Transmit Stored Data") okut; kodlar alana satır satır yazılır.</li>
          <li>Listeye ekle: kodlar okutuldukları sırayla eklenir, önce göz sonra o gözün etiketleri.</li>
        </ol>
        <CokSatir etiket="Aktarılan kodlar" rows={8} spellCheck={false} value={aktarim ?? ''} onChange={(o) => setAktarim(o.target.value)} data-ilk-odak />
      </Pencere>
      <OnayPenceresi acik={kayitOnayi} baslik="Okutulmayan satırlar" onayMetni="Kaydet" onayla={() => void kaydet()} vazgec={() => setKayitOnayi(false)}>
        <p>Sayılan gözlerde sistemde olup okutulmayan {okutulmayan} satır var. Kaydedince bunlar 0 sayılır; eşiği aşan fark onaya gider.</p>
        <p className="tc-stok-not">Komut kartından Evet ya da Vazgeç de okutulabilir.</p>
      </OnayPenceresi>
    </section>
  );
}
