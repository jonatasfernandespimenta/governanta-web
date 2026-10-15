import type { Metadata } from "next";
import { PrevisoesView } from "@/components/screens/PrevisoesView";

export const metadata: Metadata = { title: "Previsões" };

export default function Page() {
  return <PrevisoesView />;
}
