import type { Metadata } from "next";
import { ComprasView } from "@/components/screens/HistoricoView";

export const metadata: Metadata = { title: "Histórico" };

export default function Page() {
  return <ComprasView />;
}
