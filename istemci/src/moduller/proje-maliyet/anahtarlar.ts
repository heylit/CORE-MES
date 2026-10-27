export const anahtarlar = {
  maliyet: (projeId: number) => ['proje-maliyet', projeId] as const,
  gorevler: (projeId: number) => ['proje-maliyet', 'gorevler', projeId] as const,
  masrafSecenekleri: (ara: string) => ['proje-maliyet', 'masraf-secenekleri', ara] as const,
};
