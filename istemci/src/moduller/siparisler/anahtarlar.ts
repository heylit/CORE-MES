// Yazma sonrası liste önekiyle geçersiz kılınır; ayrıntı yazma cevabından yerine konur.
export const anahtarlar = {
  siparisListeleri: ['siparisler', 'siparis', 'liste'] as const,
  siparisListe: (sorgu: object) => ['siparisler', 'siparis', 'liste', sorgu] as const,
  siparis: (id: number) => ['siparisler', 'siparis', 'ayrinti', id] as const,
  siparisDuzenle: (id: number) => ['siparisler', 'siparis', 'duzenle', id] as const,
  teklifDuzenle: (id: number) => ['siparisler', 'teklif', 'duzenle', id] as const,
  teklifListeleri: ['siparisler', 'teklif', 'liste'] as const,
  teklifListe: (sorgu: object) => ['siparisler', 'teklif', 'liste', sorgu] as const,
  teklif: (id: number) => ['siparisler', 'teklif', 'ayrinti', id] as const,
  // Projeler modülünün verisi; sipariş ayrıntısında yalnız okunur.
  siparisProjeleri: (id: number) => ['siparisler', 'siparis', 'projeler', id] as const,
  // Plan modülünün elle çarpanı (195 a); sipariş ayrıntısında okunur ve yazılır.
  siparisCarpani: (id: number) => ['siparisler', 'siparis', 'carpan', id] as const,
  siparisBandi: (id: number) => ['siparisler', 'siparis', 'bant', id] as const,
  firmaSecimi: (ara: string) => ['siparisler', 'firma-secimi', ara] as const,
  malzemeArama: (metin: string) => ['siparisler', 'malzeme-arama', metin] as const,
};
