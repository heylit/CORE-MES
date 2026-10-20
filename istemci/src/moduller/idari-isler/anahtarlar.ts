// Yazma sonrası modül önekiyle geçersiz kılınır: pano, Bugün ve Taleplerim aynı talebi gösterir.
export const anahtarlar = {
  hepsi: ['idari-isler'] as const,
  bugun: ['idari-isler', 'bugun'] as const,
  pano: ['idari-isler', 'pano'] as const,
  taleplerim: (sorgu: object) => ['idari-isler', 'taleplerim', sorgu] as const,
  sonYerler: ['idari-isler', 'son-yerler'] as const,
  kisiler: ['idari-isler', 'kisi-secenekleri'] as const,
  kontroller: ['idari-isler', 'kontroller'] as const,
  kayitlar: (id: number) => ['idari-isler', 'kontroller', id, 'kayitlar'] as const,
  firmalar: (ara: string) => ['idari-isler', 'firma-secenekleri', ara] as const,
  yemek: (tarih: string) => ['idari-isler', 'yemek', tarih] as const,
  araclar: ['idari-isler', 'araclar'] as const,
  aracGorevleri: ['idari-isler', 'arac-gorevleri'] as const,
  masraflar: (aracId: number) => ['idari-isler', 'araclar', aracId, 'masraflar'] as const,
  aracTaleplerim: ['idari-isler', 'arac-taleplerim'] as const,
  demirbaslar: ['idari-isler', 'demirbaslar'] as const,
  zimmetGecmisi: (id: number) => ['idari-isler', 'demirbaslar', id, 'zimmetler'] as const,
};
