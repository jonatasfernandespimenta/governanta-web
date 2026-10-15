import type { Metadata } from "next";
import { Suspense } from "react";
import { ProdutoView } from "@/components/screens/ProdutoView";

export const metadata: Metadata = { title: "Produto" };

export default function Page({ params }: PageProps<"/produto/[id]">) {
  return <Suspense fallback={null}>{params.then(({ id }) => <ProdutoView id={id} />)}</Suspense>;
}
