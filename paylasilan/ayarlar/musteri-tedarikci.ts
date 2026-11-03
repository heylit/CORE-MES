import type { AyarTanimi } from '../ayar-tanimi.ts';

const ACIKLAMA = 'Kodu boş bırakılan yeni firmaya verilir; elle yazılan kod ve var olan kodlar değişmez.';

// Kod türe göre verilir; "ikisi" türü müşteri sayacından alır. Fason tedarikçi tedarikçi sayacındadır.
export const MUSTERI_TEDARIKCI_AYARLARI = {
  'musteri-tedarikci.musteri-kodu': {
    modul: 'musteri-tedarikci', tur: 'numara', varsayilan: 'MUS-{SAYAC:4}', alanlar: [], baslik: 'Müşteri kodu', aciklama: ACIKLAMA,
  },
  'musteri-tedarikci.tedarikci-kodu': {
    modul: 'musteri-tedarikci', tur: 'numara', varsayilan: 'TED-{SAYAC:4}', alanlar: [], baslik: 'Tedarikçi kodu', aciklama: ACIKLAMA,
  },
} as const satisfies Record<string, AyarTanimi>;
