'use client';

import Image from 'next/image';
import { useState } from 'react';

interface BlogCoverImageProps {
  src: string;
  alt: string;
  priority?: boolean;
}

export function BlogCoverImage({ src, alt, priority = false }: BlogCoverImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  
  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      className="object-cover"
      priority={priority}
      onError={() => setImgSrc('/placeholder-blog.jpg')}
    />
  );
}
