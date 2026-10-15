import type { Metadata } from "next";
import { ListaView } from "@/components/screens/ListaView";

export const metadata: Metadata = { title: "Lista" };

export default function Page() {
  return <ListaView />;
}
