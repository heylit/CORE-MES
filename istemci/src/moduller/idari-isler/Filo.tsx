import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Arac, AracCevabi, AracDurumu, AracEkleGovdesi, AracTuru, AraclarCevabi, Sahiplik,
} from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  ARAC_DURUMLARI, ARAC_DURUMU, ARAC_TURLERI, ARAC_TURU, SAHIPLIK, SAHIPLIKLER, SINIR, aracAdi, kmMetni, tarihMetni, uyariMetni,
} from './gorunum.ts';
import { MasrafPenceresi } from './Masraflar.tsx';
import { useIslemVar, useKorumaliGonderim, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

// Filo araç kartı (172 a): plaka, sahiplik, durum, km, bakım, muayene ve sigorta; yaklaşan ve geçen tarih ile bakım km'si uyarı şeridinde.
// Görev talebi "Araç görevleri"nde; masraf satırdaki düğmeyle açılan pencerede.
export function Filo() {
  const yazar = useIslemVar('idari-isler.filo-yaz');
  const [form, formYaz] = useState<{ arac: Arac | null } | null>(null);
  const [masraf, masrafYaz] = useState<Arac | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.araclar, queryFn: () => api.get<AraclarCevabi>('/idari-isler/araclar') });
  const araclar = liste.data?.araclar ?? [];
  const uyarili = araclar.filter((a) => a.uyarilar.length > 0);

  return (
    <section className="tc-ii">
      <Kart
        baslik="Filo"
        sag={(
          <span className="tc-ii-dugmeler">
            {yazar && <Dugme tur="birincil" simge="plus" onClick={() => formYaz({ arac: null })}>Araç ekle</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void liste.refetch(); }} yukleniyor={liste.isFetching} />
          </span>
        )}
      >
        {uyarili.length > 0 && (
          <p className="tc-ii-uyari" role="status">
            <Simge ad="alert" />
            <span>
              {uyarili.map((a, i) => (
                <span key={a.id}>{i > 0 && ' · '}<strong className="mono">{a.plaka}</strong> {a.uyarilar.map(uyariMetni).join(', ')}</span>
              ))}
            </span>
          </p>
        )}
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Araçlar alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : liste.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : araclar.length === 0 ? (
          <DurumKutusu durum="bos" mesaj="Kayıtlı araç yok." />
        ) : (
          <div className="tc-ii-kaydir">
            <table className="tc-ii-tablo tc-ii-filo">
              <thead>
                <tr>
                  <th scope="col">Plaka</th><th scope="col">Araç</th><th scope="col">Sahiplik</th><th scope="col">Durum</th><th scope="col">Km</th>
                  <th scope="col">Sonraki bakım</th><th scope="col">Muayene</th><th scope="col">Sigorta</th><th scope="col">Sevkiyatta</th>
                  <th scope="col"><span className="tc-gizli-etiket">Masraf</span></th>
                </tr>
              </thead>
              <tbody>
                {araclar.map((a) => (
                  <tr key={a.id} data-uyari={a.uyarilar.some((u) => u.gecti) ? 'gecti' : a.uyarilar.length > 0 ? 'yakin' : undefined}>
                    <td className="mono">
                      {yazar
                        ? <button type="button" className="tc-ii-bag" onClick={() => formYaz({ arac: a })}>{a.plaka}</button>
                        : a.plaka}
                    </td>
                    <td>{aracAdi(a)}</td>
                    <td>{SAHIPLIK[a.sahiplik]}</td>
                    <td><Rozet ton={ARAC_DURUMU[a.durum].ton}>{ARAC_DURUMU[a.durum].etiket}</Rozet></td>
                    <td className="mono">{kmMetni(a.km)}</td>
                    <td className="mono">{kmMetni(a.sonrakiBakimKm)}</td>
                    <td className="mono">{a.muayeneTarihi === null ? '—' : tarihMetni(a.muayeneTarihi)}</td>
                    <td className="mono">{a.sigortaTarihi === null ? '—' : tarihMetni(a.sigortaTarihi)}</td>
                    <td>{a.sevkiyatta ? 'Evet' : 'Hayır'}</td>
                    <td><Dugme simge="lira" aria-label={`${a.plaka} masrafları`} onClick={() => masrafYaz(a)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tc-ii-soluk">Muayene ve sigorta 30 gün kala, bakım 1.000 km kala uyarır. Görev talepleri "Araç görevleri"nde; masraflar satırdaki TL düğmesinde.</p>
      </Kart>
      {form !== null && <AracFormu arac={form.arac} kapat={() => formYaz(null)} />}
      {masraf !== null && <MasrafPenceresi arac={masraf} kapat={() => masrafYaz(null)} />}
    </section>
  );
}

const TURLER = ARAC_TURLERI.map((t) => ({ deger: t, baslik: ARAC_TURU[t] }));
const DURUMLAR = ARAC_DURUMLARI.map((d) => ({ deger: d, baslik: ARAC_DURUMU[d].etiket }));
const KM = /^\d{1,7}$/;
const kmSayi = (m: string): number | null => (m.trim() === '' ? null : Number(m.trim()));

function AracFormu({ arac, kapat }: { arac: Arac | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const gonderim = useKorumaliGonderim();
  const { bildir } = useBildirim();
  const [plaka, plakaYaz] = useState(arac?.plaka ?? '');
  const [tur, turYaz] = useState<AracTuru>(arac?.tur ?? 'binek');
  const [markaModel, markaModelYaz] = useState(arac?.markaModel ?? '');
  const [sahiplik, sahiplikYaz] = useState<Sahiplik>(arac?.sahiplik ?? 'sirket');
  const [durum, durumYaz] = useState<AracDurumu>(arac?.durum ?? 'musait');
  const [km, kmYaz] = useState(arac?.km === null || arac === null ? '' : String(arac.km));
  const [bakimKm, bakimKmYaz] = useState(arac?.sonrakiBakimKm === null || arac === null ? '' : String(arac.sonrakiBakimKm));
  const [muayene, muayeneYaz] = useState(arac?.muayeneTarihi ?? '');
  const [sigorta, sigortaYaz] = useState(arac?.sigortaTarihi ?? '');
  const [sevkiyatta, sevkiyattaYaz] = useState(arac?.sevkiyatta ?? false);
  const [aciklama, aciklamaYaz] = useState(arac?.aciklama ?? '');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);

  const eksik = [
    ...(plaka.trim() === '' ? ['plaka'] : []),
    ...(km.trim() !== '' && !KM.test(km.trim()) ? ['km'] : []),
    ...(bakimKm.trim() !== '' && !KM.test(bakimKm.trim()) ? ['sonraki bakım km'] : []),
  ];

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    const govde: AracEkleGovdesi = {
      plaka: plaka.trim(), tur, sahiplik, durum, km: kmSayi(km), sonrakiBakimKm: kmSayi(bakimKm),
      muayeneTarihi: muayene === '' ? null : muayene, sigortaTarihi: sigorta === '' ? null : sigorta, sevkiyatta,
      markaModel: markaModel.trim() === '' ? null : markaModel.trim(), aciklama: aciklama.trim() === '' ? null : aciklama.trim(),
    };
    try {
      const sonuc = arac === null
        ? await gonderim<AracCevabi>('/idari-isler/araclar/ekle', govde)
        : await api.post<AracCevabi>(`/idari-isler/araclar/${arac.id}/guncelle`, { surum: arac.surum, ...govde });
      bildir('tamam', `${sonuc.arac.plaka} ${arac === null ? 'eklendi' : 'güncellendi'}`);
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Kaydedilemedi'));
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      bekliyorYaz(false);
    }
  };

  return (
    <Pencere acik kapat={kapat} baslik={arac === null ? 'Araç ekle' : `${arac.plaka} düzenle`} tur="yan"
      alt={(
        <span className="tc-ii-dugmeler">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={eksik.length > 0} yukleniyor={bekliyor} onClick={() => void gonder()}>Kaydet</Dugme>
        </span>
      )}
    >
      <div className="tc-ii-yigin">
        <div className="tc-ii-iki">
          <Girdi etiket="Plaka" required maxLength={SINIR.plaka} placeholder="34 ABC 123" value={plaka} onChange={(o) => plakaYaz(o.target.value)} />
          <Secim etiket="Tür" value={tur} secenekler={TURLER} onChange={(o) => turYaz(o.target.value as AracTuru)} />
        </div>
        <Girdi etiket="Marka ve model (isteğe bağlı)" maxLength={SINIR.markaModel} value={markaModel} onChange={(o) => markaModelYaz(o.target.value)} />
        <div className="tc-ii-secimler" role="radiogroup" aria-label="Sahiplik">
          {SAHIPLIKLER.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sahiplik === s} className="tc-ii-secim" onClick={() => sahiplikYaz(s)}>
              {SAHIPLIK[s]}
            </button>
          ))}
        </div>
        <Secim etiket="Durum" value={durum} secenekler={DURUMLAR} onChange={(o) => durumYaz(o.target.value as AracDurumu)} />
        <div className="tc-ii-iki">
          <Girdi etiket="Km" inputMode="numeric" value={km} onChange={(o) => kmYaz(o.target.value)} ipucu={arac?.km != null ? 'Geriye yazılmaz' : undefined} />
          <Girdi etiket="Sonraki bakım km" inputMode="numeric" value={bakimKm} onChange={(o) => bakimKmYaz(o.target.value)} />
        </div>
        <div className="tc-ii-iki">
          <Girdi etiket="Muayene bitişi" type="date" value={muayene} onChange={(o) => muayeneYaz(o.target.value)} />
          <Girdi etiket="Sigorta bitişi" type="date" value={sigorta} onChange={(o) => sigortaYaz(o.target.value)} />
        </div>
        <IsaretKutusu etiket="Sevkiyatta kullanılır" checked={sevkiyatta} onChange={(o) => sevkiyattaYaz(o.target.checked)} />
        <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={SINIR.not} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
        {eksik.length > 0 && <p className="tc-ii-soluk">Eksik: {eksik.join(', ')}</p>}
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
