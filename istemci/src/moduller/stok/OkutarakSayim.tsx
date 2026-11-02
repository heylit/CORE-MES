import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KodCozCevabi, SayimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { okutmaDuzelt } from '#paylasilan/kod-sozlugu.ts';
import { CokSatir, DurumKutusu, Dugme, Kart, KodOkuyucu, OnayPenceresi, Pencere, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
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
export function OkutarakSayim() {
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
  if (!sayabilir) return <DurumKutusu durum="hata" mesaj="Sayım için stok sayım yetkisi gerekir." />;

  // Okutmalar sırayla çözülür: göz okutmasının sonucu bir sonraki etiketin hangi göze yazılacağını belirler.
  const cozVeUygula = async (ham: string): Promise<OkutmaSonucu> => {
    const kod = okutmaDuzelt(ham.trim());
    let r: { durum: SayimDurumu; sonuc: OkutmaSonucu };
    try {
      const c = await api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod)}`);
      r = okutmaUygula(durumRef.current, kod, c);
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

  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Okutarak sayım" alt="Kör sayım · önce göz, sonra lot ya da malzeme okut" sag={<>
        <Dugme simge="list" onClick={() => setAktarim('')} disabled={cozuluyor}>Hafızadan aktar</Dugme>
        <Dugme simge="x" onClick={vazgec} disabled={durum.gozler.length === 0 || kaydediliyor}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" onClick={kaydetBas} yukleniyor={kaydediliyor} disabled={durum.gozler.length === 0 || eksik > 0 || cozuluyor}>
          {durum.gozler.length ? `Sayımı kaydet (${durum.gozler.length} göz)` : 'Sayımı kaydet'}
        </Dugme>
      </>} />
      <Kart>
        <KodOkuyucu sik okundu={okundu} bekliyor={cozuluyor} ipucu="Okuyucu alan seçmeden de çalışır." />
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
      </OnayPenceresi>
    </section>
  );
}
