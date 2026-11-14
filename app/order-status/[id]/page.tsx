'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function OrderStatusRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/orders/${id}`);
    } else {
      router.replace('/orders');
    }
  }, [id, router]);

  return (
    <div className="min-h-screen bg-[#07070d] text-white flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
        <p className="text-xs text-purple-200/70 font-medium">
          Loading order status...
        </p>
      </div>
    </div>
  );
}
