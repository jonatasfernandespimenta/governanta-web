import type { Metadata } from "next";
import { ConfiguracoesView } from "@/components/screens/ConfiguracoesView";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return <ConfiguracoesView />;
}
