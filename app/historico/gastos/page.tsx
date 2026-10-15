import type { Metadata } from "next";
import { GastosView } from "@/components/screens/HistoricoView";

export const metadata: Metadata = { title: "Gastos" };

export default function Page() {
  return <GastosView />;
}
