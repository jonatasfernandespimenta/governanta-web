import type { Metadata } from "next";
import { Suspense } from "react";
import { PrecosView } from "@/components/screens/PrecosView";

export const metadata: Metadata = { title: "Preços" };

export default function Page({ params }: PageProps<"/produto/[id]/precos">) {
  return <Suspense fallback={null}>{params.then(({ id }) => <PrecosView id={id} />)}</Suspense>;
}
