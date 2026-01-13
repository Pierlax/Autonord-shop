export type Money = {
  amount: string;
  currencyCode: string;
};

export type Image = {
  url: string;
  altText: string;
  width: number;
  height: number;
};

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable: number;
  sku: string;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  price: Money;
  compareAtPrice?: Money;
  image?: Image;
};

export type Product = {
  id: string;
  handle: string;
  availableForSale: boolean;
  title: string;
  description: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  totalInventory: number;
  options: {
    id: string;
    name: string;
    values: string[];
  }[];
  priceRange: {
    maxVariantPrice: Money;
    minVariantPrice: Money;
  };
  variants: {
    edges: {
      node: ProductVariant;
    }[];
  };
  featuredImage: Image;
  images: {
    edges: {
      node: Image;
    }[];
  };
  seo: {
    title: string;
    description: string;
  };
  tags: string[];
  updatedAt: string;
};

export type Collection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  path: string;
  updatedAt: string;
};

export type Cart = {
  id: string;
  checkoutUrl: string;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    totalTaxAmount: Money;
  };
  lines: {
    edges: {
      node: {
        id: string;
        quantity: number;
        merchandise: {
          id: string;
          title: string;
          product: {
            title: string;
            handle: string;
          };
        };
      };
    }[];
  };
  totalQuantity: number;
};
