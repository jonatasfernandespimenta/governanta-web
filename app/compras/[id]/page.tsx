import type { Metadata } from "next";
import { Suspense } from "react";
import { CompraView } from "@/components/screens/CompraView";

export const metadata: Metadata = { title: "Compra" };

export default function Page({ params }: PageProps<"/compras/[id]">) {
  return <Suspense fallback={null}>{params.then(({ id }) => <CompraView id={id} />)}</Suspense>;
}
