import type { Metadata } from "next";
import { EscanearView } from "@/components/screens/EscanearView";

export const metadata: Metadata = { title: "Escanear nota" };

export default function Page() {
  return <EscanearView />;
}
