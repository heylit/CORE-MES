import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KonuTuru, Toplanti, ToplantiAcGovdesi, ToplantiTuru } from '#paylasilan/sozlesme/toplantilar.ts';
import {
  GUNDEM_EN_COK, KATILIMCI_EN_COK, KONU_TUR_ADLARI, KONU_TURLERI, TOPLANTI_TUR_ADLARI, TOPLANTI_TURLERI,
} from '#paylasilan/sozlesme/toplanti-sabitleri.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, FormPenceresi, Girdi, IsaretKutusu, KayitSecici, KisiSecici, Secim, type SeciliKayit } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useForm } from '../../ortak/veri/form.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { anOlustur, saati, tarihi } from './gosterim.ts';

interface Katilimci { kisiId: number; ad: string; zorunlu: boolean }
interface Degerler {
  baslik: string;
  tur: ToplantiTuru;
  tarih: string;
  baslangic: string;
  bitis: string;
  yer: string;
  konuTuru: KonuTuru;
  konu: SeciliKayit | null;
  katilimcilar: Katilimci[];
  gundem: string[];
  epostaGonder: boolean;
}

const TUR_SECENEKLERI = TOPLANTI_TURLERI.map((t) => ({ deger: t, baslik: TOPLANTI_TUR_ADLARI[t] }));
const KONU_SECENEKLERI = KONU_TURLERI.map((t) => ({ deger: t, baslik: KONU_TUR_ADLARI[t] }));

function ilkDegerler(t: Toplanti | null): Degerler {
  if (t === null) {
    return {
      baslik: '', tur: 'uretim', tarih: tesisGunu(Date.now()), baslangic: '09:00', bitis: '09:30', yer: '', konuTuru: 'serbest', konu: null,
      katilimcilar: [], gundem: [], epostaGonder: true,
    };
  }
  return {
    baslik: t.baslik, tur: t.tur, tarih: tarihi(t.baslangic), baslangic: saati(t.baslangic), bitis: saati(t.bitis), yer: t.yer ?? '',
    konuTuru: t.konuTuru, konu: t.konu === null ? null : { id: t.konu.id, kod: t.konu.no ?? '', ad: t.konu.ad ?? t.konu.no ?? '' },
    katilimcilar: t.katilimcilar.map((k) => ({ kisiId: k.kisiId, ad: k.ad, zorunlu: k.zorunlu })), gundem: [...t.gundem], epostaGonder: true,
  };
}

function govde(d: Degerler): ToplantiAcGovdesi {
  return {
    baslik: d.baslik, tur: d.tur, baslangic: anOlustur(d.tarih, d.baslangic), bitis: anOlustur(d.tarih, d.bitis), yer: d.yer,
    konu: d.konuTuru === 'serbest' || d.konu === null ? { tur: 'serbest' } : { tur: d.konuTuru, id: d.konu.id },
    katilimcilar: d.katilimcilar.map((k) => ({ kisiId: k.kisiId, zorunlu: k.zorunlu })),
    gundem: d.gundem.map((g) => g.trim()).filter((g) => g !== ''), epostaGonder: d.epostaGonder,
  };
}

function dogrula(d: Degerler): Record<string, string> {
  const h: Record<string, string> = {};
  if (d.baslik.trim() === '') h.baslik = 'Başlık zorunlu.';
  if (d.tarih === '') h.tarih = 'Tarih zorunlu.';
  if (d.bitis <= d.baslangic) h.bitis = 'Bitiş başlangıçtan sonra olmalı.';
  if (d.konuTuru !== 'serbest' && d.konu === null) h.konu = `${KONU_TUR_ADLARI[d.konuTuru]} seçin ya da serbest konu seçin.`;
  return h;
}

// Sunucu alanları formun alanlarına düşer: zaman alanları saat girdilerine, konu seçiciye.
const alanEsle = (alan: string): string | null => {
  if (alan === 'baslangic' || alan === 'bitis' || alan === 'baslik' || alan === 'yer' || alan === 'tur') return alan;
  if (alan.startsWith('konu')) return 'konu';
  if (alan.startsWith('katilimcilar')) return 'katilimcilar';
  if (alan.startsWith('gundem')) return 'gundem';
  return null;
};

// Yeni toplantı ve değiştirme aynı formdur (Seçenek 2, onay a). E-posta seçeneği yalnız davet e-postası giderken görünür.
export function ToplantiFormu({ toplanti, eposta, kapat, kaydedildi }: {
  toplanti: Toplanti | null; eposta: boolean; kapat: () => void; kaydedildi: (t: Toplanti) => void;
}) {
  const istemci = useQueryClient();
  const [istekKimligi] = useState(yeniIstekKimligi);
  const [yeniMadde, yeniMaddeYaz] = useState('');
  const form = useForm<Degerler, Toplanti>({
    ilk: ilkDegerler(toplanti),
    dogrula,
    alanEsle,
    hataIletisi: 'Toplantı kaydedilemedi',
    kaydet: async (d) => {
      const g = govde(d);
      const cevap = toplanti === null
        ? await tekrarKorumaliGonder((deneme) => api.post<Toplanti>('/toplantilar', g, deneme), { istekKimligi })
        : await api.put<Toplanti>(`/toplantilar/${String(toplanti.id)}`, { ...g, surum: toplanti.surum });
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      return cevap;
    },
    basarili: (t) => { kaydedildi(t); },
  });
  const d = form.degerler;
  const katilimciYaz = (liste: Katilimci[]) => { form.degistir({ katilimcilar: liste }); };
  const gundemYaz = (liste: string[]) => { form.degistir({ gundem: liste }); };
  const tasi = (i: number, yon: -1 | 1) => {
    const liste = [...d.gundem];
    const [m] = liste.splice(i, 1);
    if (m !== undefined) liste.splice(i + yon, 0, m);
    gundemYaz(liste);
  };
  const maddeEkle = () => {
    if (yeniMadde.trim() === '' || d.gundem.length >= GUNDEM_EN_COK) return;
    gundemYaz([...d.gundem, yeniMadde.trim()]);
    yeniMaddeYaz('');
  };

  return (
    <FormPenceresi
      acik kapat={kapat} form={form} baslik={toplanti === null ? 'Yeni toplantı' : 'Toplantıyı değiştir'}
      kaydetMetni={toplanti === null ? 'Kaydet ve davet et' : 'Kaydet'}
    >
      <div className="tc-form-tam"><Girdi etiket="Başlık" required maxLength={200} {...form.alan('baslik')} /></div>
      <Girdi etiket="Tarih" type="date" required value={d.tarih} hata={form.hata('tarih')} onChange={(e) => form.degistir({ tarih: e.target.value })} />
      <div className="tc-top-saatler">
        <Girdi etiket="Başlangıç" type="time" required value={d.baslangic} hata={form.hata('baslangic')} onChange={(e) => form.degistir({ baslangic: e.target.value })} />
        <Girdi etiket="Bitiş" type="time" required value={d.bitis} hata={form.hata('bitis')} onChange={(e) => form.degistir({ bitis: e.target.value })} />
      </div>
      <Secim etiket="Tür" value={d.tur} secenekler={TUR_SECENEKLERI} hata={form.hata('tur')} onChange={(e) => form.degistir({ tur: e.target.value as ToplantiTuru })} />
      <Girdi etiket="Yer" maxLength={120} {...form.alan('yer')} />
      <Secim
        etiket="Konu" value={d.konuTuru} secenekler={KONU_SECENEKLERI}
        onChange={(e) => form.degistir({ konuTuru: e.target.value as KonuTuru, konu: null })}
      />
      {d.konuTuru !== 'serbest' ? (
        <KayitSecici
          etiket={KONU_TUR_ADLARI[d.konuTuru]} deger={d.konu} yol="/toplantilar/konu-ara" suzgec={{ tur: d.konuTuru }}
          simge={d.konuTuru === 'proje' ? 'kanban' : d.konuTuru === 'firma' ? 'building' : 'file'}
          sec={(k) => form.degistir({ konu: k === null ? null : { id: k.id, kod: k.kod, ad: k.ad } })}
        />
      ) : <p className="tc-top-ipucu">Serbest konuda bağlı kayıt yoktur; konu başlıktır.</p>}
      {form.hata('konu') !== undefined && <p className="tc-top-hata" role="alert">{form.hata('konu')}</p>}

      <fieldset className="tc-form-tam tc-top-kume">
        <legend>Katılımcılar ({d.katilimcilar.length})</legend>
        {d.katilimcilar.length > 0 && (
          <ul className="tc-top-satirlar">
            {d.katilimcilar.map((k) => (
              <li key={k.kisiId}>
                <span className="tc-top-ad">{k.ad}</span>
                <span className="tc-top-grup" role="group" aria-label={`${k.ad} katılımı`}>
                  <Dugme aria-pressed={k.zorunlu} onClick={() => katilimciYaz(d.katilimcilar.map((x) => (x.kisiId === k.kisiId ? { ...x, zorunlu: true } : x)))}>Zorunlu</Dugme>
                  <Dugme aria-pressed={!k.zorunlu} onClick={() => katilimciYaz(d.katilimcilar.map((x) => (x.kisiId === k.kisiId ? { ...x, zorunlu: false } : x)))}>Bilgi için</Dugme>
                  <Dugme simge="x" aria-label={`${k.ad} kaldır`} onClick={() => katilimciYaz(d.katilimcilar.filter((x) => x.kisiId !== k.kisiId))} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {d.katilimcilar.length < KATILIMCI_EN_COK && (
          <KisiSecici
            etiket="Kişi ekle" deger={null} yerTutucu="Kişi ara"
            sec={(k) => { if (k !== null && !d.katilimcilar.some((x) => x.kisiId === k.id)) katilimciYaz([...d.katilimcilar, { kisiId: k.id, ad: k.ad, zorunlu: true }]); }}
          />
        )}
        {form.hata('katilimcilar') !== undefined && <p className="tc-top-hata" role="alert">{form.hata('katilimcilar')}</p>}
      </fieldset>

      <fieldset className="tc-form-tam tc-top-kume">
        <legend>Gündem</legend>
        {d.gundem.length > 0 && (
          <ol className="tc-top-satirlar">
            {d.gundem.map((g, i) => (
              <li key={`${String(i)}-${g}`}>
                <span className="tc-top-ad">{g}</span>
                <span className="tc-top-grup">
                  <Dugme simge="up" aria-label="Yukarı" disabled={i === 0} onClick={() => tasi(i, -1)} />
                  <Dugme simge="down" aria-label="Aşağı" disabled={i === d.gundem.length - 1} onClick={() => tasi(i, 1)} />
                  <Dugme simge="x" aria-label="Maddeyi kaldır" onClick={() => gundemYaz(d.gundem.filter((_, j) => j !== i))} />
                </span>
              </li>
            ))}
          </ol>
        )}
        {d.gundem.length < GUNDEM_EN_COK && (
          <div className="tc-top-ekle">
            <Girdi
              etiket="Yeni madde" maxLength={300} value={yeniMadde} onChange={(e) => yeniMaddeYaz(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); maddeEkle(); } }}
            />
            <Dugme simge="plus" onClick={maddeEkle} disabled={yeniMadde.trim() === ''}>Madde ekle</Dugme>
          </div>
        )}
        {form.hata('gundem') !== undefined && <p className="tc-top-hata" role="alert">{form.hata('gundem')}</p>}
      </fieldset>

      {eposta && (
        <div className="tc-form-tam">
          <IsaretKutusu etiket="Katılımcılara e-posta daveti de gitsin" checked={d.epostaGonder} onChange={(e) => form.degistir({ epostaGonder: e.target.checked })} />
        </div>
      )}
      <p className="tc-form-tam tc-top-ipucu">Toplantı tek günlüktür. Katılımcılara uygulama içi bildirim gider; düzenleyen kendisi almaz.</p>
    </FormPenceresi>
  );
}
