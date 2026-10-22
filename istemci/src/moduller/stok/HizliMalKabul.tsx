import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { AcikSiparisSatirlariCevabi, AmbalajTuru, KodCozCevabi, MalKabulCevabi, MalKabulGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AMBALAJ_KATALOGU } from './ambalaj.ts';
import { AmbalajIkonu } from './AmbalajIkonu.tsx';
import { AMBALAJ_TURLERI, birimliMiktar, lotluMu, LOT_IPUCU, miktarGirdisi } from './gorunum.ts';
import { hataMetni, korumaliPost, useStokKomutu } from './ortak.tsx';

// Okutarak mal kabul (soru 91 a): satın alma teslimi yalnız açık sipariş satırıyla yazılır, sipariş teslimi de işlensin; siparişi
// olmayan mal "diğer" girişidir. Ambalaj seçimi (Otomatik ya da tip), miktar; aktif konum varsa oraya, yoksa "rafı okut" bekleyen
// girişi açılır: önerilen göz gösterilir, sıradaki konum okutması girişi o göze yazar (Vazgeç ile iptal).
type AmbalajSecimi = 'oto' | AmbalajTuru;
export const SIPARISSIZ = 'siparissiz';
export interface BekleyenGiris {
  malzemeId: number; ad: string; miktar: string; parti: string; ambalaj: AmbalajSecimi; ambalajSayisi: string;
  // null: siparişsiz, "diğer" girişi.
  siparisSatirId: number | null;
}
type OkunanMalzeme = Extract<KodCozCevabi, { tur: 'malzeme' }>['ozet'];

// Lot etiketi kopya önerisi ambalaj sayısıdır; girilmediyse tek etiket.
export const kopyaSayisi = (sayi: string): number => (Number(sayi) > 0 ? Math.min(99, Math.trunc(Number(sayi))) : 1);
export function kabulGovdesi(b: BekleyenGiris, konumId: number | null): MalKabulGovdesi {
  return {
    tur: b.siparisSatirId === null ? 'diger' : 'satin_alma',
    satirlar: [{
      malzemeId: b.malzemeId, miktar: miktarGirdisi(b.miktar), ...(konumId ? { konumId } : {}), parti: b.parti ? { tedarikciPartiNo: b.parti } : null,
      ...(b.siparisSatirId === null ? {} : { siparisSatirId: b.siparisSatirId }),
      ...(b.ambalaj === 'oto' ? {} : { ambalaj: { tur: b.ambalaj, olcu: AMBALAJ_KATALOGU[b.ambalaj].varsayilan, adet: b.ambalajSayisi ? Number(b.ambalajSayisi) : null } }),
    }],
  };
}

// Okutulan kartın açık satırları; hizmet satırı (fason dönüşü) ayrıntılı ekrandadır. Tek satır varsa seçili gelir, hiç yoksa siparişsiz.
function SiparisSecimi({ malzemeId, secim, sec }: { malzemeId: number; secim: string; sec: (deger: string) => void }) {
  const a = useQuery({ queryKey: anahtarlar.liste('acik-siparis-satirlari', {}), queryFn: () => api.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari') });
  const satirlar = (a.data?.satirlar ?? []).filter((x) => x.malzemeId === malzemeId && x.malzemeTur !== 'hizmet');
  const tek = satirlar.length === 1 ? String(satirlar[0]!.id) : satirlar.length === 0 ? SIPARISSIZ : '';
  const yuklendi = a.isSuccess;
  useEffect(() => { if (yuklendi && secim === '' && tek !== '') sec(tek); }, [yuklendi, secim, tek, sec]);
  if (a.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (a.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(a.error)} yenile={() => { void a.refetch(); }} />;
  return (
    <>
      <Secim etiket="Sipariş" value={secim} onChange={(e) => sec(e.target.value)} required
        secenekler={[
          ...(satirlar.length > 1 ? [{ deger: '', baslik: 'Sipariş satırını seçin' }] : []),
          ...satirlar.map((x) => ({ deger: String(x.id), baslik: `${x.siparisNo || x.talepNo} · ${x.tedarikciAdi} · kalan ${birimliMiktar(x.kalanMiktar, x.birim)}` })),
          { deger: SIPARISSIZ, baslik: 'Siparişsiz: diğer giriş' },
        ]} />
      {satirlar.length === 0 && <p className="tc-stok-not">Bu malzemenin açık siparişi yok; diğer giriş olarak alınır.</p>}
    </>
  );
}

export function HizliMalKabul({ malzeme, konumId, bekleyenAc, bitti }: { malzeme: OkunanMalzeme; konumId: number | null; bekleyenAc: (b: BekleyenGiris) => void; bitti: (belgeId: number, ambalajSayisi: number) => void }) {
  const [miktar, setMiktar] = useState('');
  const [parti, setParti] = useState('');
  const [ambalaj, setAmbalaj] = useState<AmbalajSecimi>('oto');
  const [sayi, setSayi] = useState('');
  const [siparis, setSiparis] = useState('');
  const ad = malzeme.ad ?? malzeme.kod;
  const { komut, onayPenceresi } = useStokKomutu((g: MalKabulGovdesi) => korumaliPost<MalKabulCevabi>('/stok/mal-kabul', g).then((c) => { bitti(c.belge.id, kopyaSayisi(sayi)); return c; }), `Mal kabul edildi: ${ad}`);
  const giris = (): BekleyenGiris => ({ malzemeId: malzeme.id, ad, miktar, parti, ambalaj, ambalajSayisi: sayi, siparisSatirId: siparis === SIPARISSIZ ? null : Number(siparis) });
  const secildi = siparis !== '';
  return (
    <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); if (secildi) komut.mutate(kabulGovdesi(giris(), konumId)); }}>
      <SiparisSecimi malzemeId={malzeme.id} secim={siparis} sec={setSiparis} />
      <div className="tc-stok-ambalajlar" role="group" aria-label="Ambalaj">
        <button type="button" className="tc-stok-ambalaj" aria-pressed={ambalaj === 'oto'} onClick={() => setAmbalaj('oto')}><AmbalajIkonu tur="oto" /><strong>Otomatik</strong><span>Malzemenin kayıtlı ambalajı</span></button>
        {AMBALAJ_TURLERI.map((t) => <button key={t} type="button" className="tc-stok-ambalaj" aria-pressed={ambalaj === t} onClick={() => setAmbalaj(t)}><AmbalajIkonu tur={t} /><strong>{AMBALAJ_KATALOGU[t].ad}</strong><span>{AMBALAJ_KATALOGU[t].olculer.find((o) => o.kod === AMBALAJ_KATALOGU[t].varsayilan)?.ad}</span></button>)}
      </div>
      <div className="tc-stok-iki">
        <Girdi etiket="Sayılan miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required autoFocus />
        {ambalaj !== 'oto' && <Girdi etiket="Ambalaj sayısı" inputMode="numeric" value={sayi} onChange={(e) => setSayi(e.target.value)} />}
        {malzeme.tur !== 'demirbas' && <Girdi etiket="Tedarikçi parti no" value={parti} onChange={(e) => setParti(e.target.value)} {...(lotluMu(malzeme.tur) ? { ipucu: LOT_IPUCU } : {})} />}
      </div>
      <div className="tc-stok-eylem">
        <Dugme tur="birincil" type="submit" yukleniyor={komut.isPending} disabled={!secildi}>{konumId ? 'Aktif konuma teslim al' : 'Mal kabul alanına teslim al'}</Dugme>
        {!konumId && <Dugme tur="ikincil" simge="scan" disabled={!miktar || !secildi} onClick={() => bekleyenAc(giris())}>Rafı okut</Dugme>}
        <Link to="/stok/mal-kabul"><Dugme>Ayrıntılı mal kabul</Dugme></Link>
      </div>
      {onayPenceresi}
    </form>
  );
}
