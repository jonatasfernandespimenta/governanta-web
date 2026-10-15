import type { Metadata } from "next";
import { Suspense } from "react";
import { RevisaoView } from "@/components/screens/RevisaoView";

export const metadata: Metadata = { title: "Revisar compra" };

export default function Page({ params }: PageProps<"/compras/[id]/revisar">) {
  return <Suspense fallback={null}>{params.then(({ id }) => <RevisaoView id={id} />)}</Suspense>;
}
