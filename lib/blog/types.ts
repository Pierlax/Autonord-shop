export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  date: string;
  author: {
    name: string;
    avatar: string;
  };
  category: string;
  tags: string[];
  readingTime: number;
  featured?: boolean;
  relatedProducts?: string[]; // Product handles for linking
}

export interface BlogCategory {
  slug: string;
  name: string;
  description: string;
  icon: string;
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: 'prezzi',
    name: 'Prezzi e Costi',
    description: 'Guide trasparenti sui costi reali di attrezzature e progetti',
    icon: 'euro',
  },
  {
    slug: 'problemi',
    name: 'Problemi e Soluzioni',
    description: 'Come risolvere i problemi più comuni con i tuoi utensili',
    icon: 'wrench',
  },
  {
    slug: 'confronti',
    name: 'Confronti',
    description: 'Comparazioni imparziali tra brand e prodotti',
    icon: 'scale',
  },
  {
    slug: 'recensioni',
    name: 'Recensioni',
    description: 'Le nostre recensioni oneste sui migliori prodotti',
    icon: 'star',
  },
  {
    slug: 'guide',
    name: 'Guide Pratiche',
    description: 'Tutorial e guide per professionisti',
    icon: 'book',
  },
];
