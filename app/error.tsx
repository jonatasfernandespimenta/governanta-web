"use client";

// Erro inesperado numa tela: mostra a mensagem (para eu saber o que quebrou) e deixa tentar de novo.

import { useEffect } from "react";
import { EmptyState } from "@/components/ui";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="page">
      <EmptyState
        icon="error"
        title="Esta tela deu erro"
        actions={
          <button type="button" className="btn btn-primary btn-md" onClick={() => retry()}>
            Tentar de novo
          </button>
        }
      >
        <code>{error.message || error.digest || "erro desconhecido"}</code>
      </EmptyState>
    </div>
  );
}
