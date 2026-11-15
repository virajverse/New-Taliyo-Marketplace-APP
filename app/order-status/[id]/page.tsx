import { redirect } from 'next/navigation';

export default async function OrderStatusRedirectPage({
  params,
}: {
  params: Promise<{ id?: string }>;
}) {
  const resolved = await params;
  if (resolved?.id) {
    redirect(`/orders/${resolved.id}`);
  }
  redirect('/orders');
}
