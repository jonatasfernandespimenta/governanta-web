import type { Metadata } from "next";
import { Suspense } from "react";
import { DietaRevisaoView } from "@/components/screens/DietaRevisaoView";

export const metadata: Metadata = { title: "Revisar dieta" };

export default function Page({ params }: PageProps<"/dieta/[id]/revisar">) {
  return <Suspense fallback={null}>{params.then(({ id }) => <DietaRevisaoView id={id} />)}</Suspense>;
}
