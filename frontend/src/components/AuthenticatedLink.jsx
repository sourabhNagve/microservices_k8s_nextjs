'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function AuthenticatedLink({ href, children, className, onClick, ...props }) {
  const { isAuthenticated } = useAuth();  // ✅ from context — in sync with React state
  const router = useRouter();

  const handleClick = (e) => {
    // ✅ isAuthenticated is a boolean — no () needed
    if (!isAuthenticated) {
      e.preventDefault();
      const returnUrl = encodeURIComponent(href);
      router.push(`/auth/signin?returnUrl=${returnUrl}`);
      return;
    }
    if (onClick) onClick(e);
  };

  return (
    <Link href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}