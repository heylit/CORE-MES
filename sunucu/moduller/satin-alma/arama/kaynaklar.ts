import type { Db } from '#cekirdek/db.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import type { TalepDurumu } from '#paylasilan/sozlesme/satin-alma.ts';
import { firmaAdlari } from '../../musteri-tedarikci/disari.ts';
import { alimAra, talepAra } from './sorgular.ts';

// Satın Alma Merkezi'nin durum adları (istemci merkez/constants.ts STATUSES): sonuç açılan ekranla aynı adı yazar.
const DURUM_ADI: Record<TalepDurumu, string> = {
  taslak: 'Satın almada', teklif_isteniyor: 'Teklif toplanıyor', degerlendirme: 'Değerlendirme', onayda: 'Onay',
  siparis_verildi: 'Sipariş verildi', teslim_alindi: 'Teslim alındı', iptal: 'İptal',
};
const MERKEZ: readonly Islem[] = ['satin-alma.oku', 'satin-alma.yaz'];
const ONAY: Islem = 'satin-alma.onayla';
const TALEP_EDEN: Islem = 'satin-alma.talep-ac';

// Talep ayrıntısı Merkez'dedir: okuyan ya da yazan Talepler'de, yalnız onaylayan Onaylar'da açar (Talepler maddesi ona kapalı).
// Yalnız talep açan kişi Merkez'i görmez; kendi taleplerini bulur, sonuç Taleplerim listesini açar.
type Gorunum = 'merkez' | 'onay' | 'kendi';
const gorunum = (islemler: readonly Islem[]): Gorunum =>
  MERKEZ.some((i) => islemler.includes(i)) ? 'merkez' : islemler.includes(ONAY) ? 'onay' : 'kendi';
const talepYolu = (g: Gorunum, talepId: string, bolum: string | null): KayitAramaSonucu['yol'] =>
  g === 'kendi' ? '/taleplerim?bolum=liste'
    : `${g === 'merkez' ? '/satin-alma/talepler' : '/satin-alma/onaylar'}?talep=${talepId}${bolum === null ? '' : `&bolum=${bolum}`}`;

// Genel aramanın (1233) satın alma kaynakları (1237). Çekirdek yetkiyi `yetki` ile süzer; daha dar görünüm burada.
export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [
  {
    tur: 'talep',
    yetki: ['satin-alma.oku', 'satin-alma.yaz', ONAY, TALEP_EDEN],
    ara: async (db, istek) => {
      const g = gorunum(istek.kullanici.islemler);
      const satirlar = await talepAra(db, istek, g === 'kendi' ? istek.kullanici.id : null);
      return satirlar.map((t) => ({ anahtar: t.id, baslik: t.no, aciklama: `${t.baslik} · ${DURUM_ADI[t.durum]}`, yol: talepYolu(g, t.id, null) }));
    },
  },
  {
    // Sipariş talebin Sipariş adımında durur; fiyat ve tutar sonuçta yoktur.
    tur: 'alim',
    yetki: ['satin-alma.oku', 'satin-alma.yaz', ONAY],
    ara: async (db, istek) => {
      const g = gorunum(istek.kullanici.islemler);
      const satirlar = await alimAra(db, istek);
      const adlar = await firmaAdlari(db, [...new Set(satirlar.flatMap((s) => (s.firmaId === null ? [] : [s.firmaId])))]);
      return satirlar.map((s) => {
        const tedarikci = s.firmaId === null ? s.tedarikciAdi || null : (adlar.get(s.firmaId) ?? (s.tedarikciAdi || null));
        const baslik = s.no ?? (s.siparisNo || s.talepNo);
        const logo = s.no !== null && s.siparisNo !== '' ? s.siparisNo : null;
        return {
          anahtar: String(s.id),
          baslik,
          aciklama: [tedarikci, logo, `Talep ${s.talepNo}`].filter((p) => p !== null).join(' · '),
          yol: talepYolu(g, s.talepId, g === 'merkez' ? 'order' : null),
        };
      });
    },
  },
];
